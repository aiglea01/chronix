import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { asDay, dateKey, monthCells, onDay } from '../public/js/dates.js';
import { backupChanges, starterCalendars, validRecord } from '../public/js/model.js';
import { placeEvents } from '../public/js/views/calendar.js';
import { openDatabase } from '../server/db.js';
import { normalizeEvent } from '../server/google.js';
import { configFromEnv, createApp } from '../server/index.js';

const user = { id: '10001', name: 'Pruebas', email: 'test@example.invalid' };
const note = { id: 'note', type: 'note', title: 'Título', body: 'Texto', pinned: false, updated: '2026-11-15T00:00:00.000Z' };
const event = { id: 'event', type: 'event', calendarId: 'personal', title: 'Cita', description: '', location: '',
  allDay: true, start: '2026-11-10', end: '2026-11-12' };

test('calendario desde el lunes y fin exclusivo de día completo', () => {
  const cells = monthCells(asDay('2026-11-15'));
  assert.equal(dateKey(cells[0]), '2026-10-26');
  assert.equal(cells.length, 42);
  assert.equal(onDay(event, '2026-11-11'), true);
  assert.equal(onDay(event, '2026-11-12'), false);
  assert.ok(validRecord(event));
  assert.equal(Boolean(validRecord({ ...event, start: '2026-11-31' })), false);
});

test('asigna columnas separadas a los eventos simultáneos', () => {
  const local = time => new Date('2026-11-15T' + time).toISOString();
  const rows = placeEvents([
    { id: 'a', start: local('09:00'), end: local('11:00') },
    { id: 'b', start: local('10:00'), end: local('12:00') },
    { id: 'c', start: local('12:30'), end: local('13:00') }
  ], '2026-11-15');
  assert.deepEqual(rows.map(row => [row.column, row.columns]), [[0, 2], [1, 2], [0, 1]]);
});

test('Google conserva las fechas civiles y convierte las horas a UTC', () => {
  const entry = { id: 'xyz', start: { date: '2026-11-10' }, end: { date: '2026-11-12' } };
  assert.equal(normalizeEvent(entry, 'g:test').end, '2026-11-12');
  assert.equal(normalizeEvent({ ...entry, status: 'cancelled' }, 'g:test'), null);
  assert.equal(normalizeEvent({ id: 'abc', start: { dateTime: '2026-11-15T15:00:00+01:00' },
    end: { dateTime: '2026-11-15T16:00:00+01:00' } }, 'g:test').start, '2026-11-15T14:00:00.000Z');
});

test('migra una copia de Chronix por dependencias y conserva los cambios del destino', () => {
  const calendar = { id: 'custom', type: 'calendar', title: 'Estudio', color: 'blue' };
  const linkedEvent = { ...event, calendarId: calendar.id };
  const personal = { ...starterCalendars[0], color: 'orange' };
  const backup = { version: 1, records: [linkedEvent, calendar, note, personal] };
  const existing = [...starterCalendars, { ...note, title: 'Editada en destino' }];
  assert.deepEqual(backupChanges(backup, existing), [calendar, personal, linkedEvent]);
  assert.deepEqual(backupChanges(backup, [...backup.records]), []);
  assert.throws(() => backupChanges({ version: 1, records: [note, note] }, existing), /duplicados/);
  assert.throws(() => backupChanges({ version: 1, records: [{ ...event, google: true }] }, existing), /inválidos/);
});

test('SQLite aísla usuarios, deduplica reintentos y mueve los eventos al borrar su calendario', t => {
  const store = openDatabase(':memory:');
  t.after(() => store.db.close());
  store.saveUser(user);
  store.saveUser({ ...user, id: '20002' });
  store.apply(user.id, [{ id: note.id, mutation: 'first', record: note }]);
  store.apply(user.id, [{ id: note.id, mutation: 'second', record: { ...note, title: 'Editada' } }]);
  const retry = store.apply(user.id, [{ id: note.id, mutation: 'first', record: note }]);
  assert.equal(retry.find(item => item.id === note.id).title, 'Editada');
  assert.equal(store.apply('20002', []).some(item => item.id === note.id), false);
  store.apply(user.id, [{ id: event.id, mutation: 'third', record: { ...event, calendarId: 'trabajo' } }]);
  const current = store.apply(user.id, [{ id: 'trabajo', mutation: 'fourth', record: null }]);
  assert.equal(current.find(item => item.id === event.id).calendarId, 'personal');
  assert.equal(current.some(item => item.id === 'trabajo'), false);
});

function request(server, url, { method = 'GET', cookie, origin, data } = {}) {
  return new Promise(resolve => {
    const req = Readable.from(data ? [Buffer.from(JSON.stringify(data))] : []);
    Object.assign(req, { url, method, headers: { cookie, origin, ...(data && { 'content-type': 'application/json' }) } });
    const headers = {};
    const res = {
      setHeader(name, value) { headers[name.toLowerCase()] = value; },
      writeHead(status, values) { this.status = status; Object.assign(headers, values); this.headersSent = true; },
      end(body) { resolve({ status: this.status, headers, body: body ? JSON.parse(body) : undefined }); }
    };
    server.emit('request', req, res);
  });
}

test('flujo HTTP con Google simulado: login, vinculación, agenda y cambio de dispositivo', async t => {
  const origin = 'http://localhost:3000';
  const config = configFromEnv({ APP_URL: origin, GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test',
    TOKEN_KEY: Buffer.alloc(32, 3).toString('base64'), DB_PATH: ':memory:' });
  const { server, db } = createApp(config);
  t.after(() => db.close());
  let profile = user;
  const scope = 'https://www.googleapis.com/auth/calendar.readonly';
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (url.hostname === 'oauth2.googleapis.com') {
      const isRefresh = options.body.get('grant_type') === 'refresh_token';
      if (isRefresh) assert.equal(options.body.get('refresh_token'), 'refresh-token-test');
      else assert.ok(options.body.get('code_verifier'));
      return Response.json({ access_token: 'test-access', refresh_token: 'refresh-token-test', scope });
    }
    if (url.hostname === 'openidconnect.googleapis.com') return Response.json({ ...profile, sub: profile.id, email_verified: true });
    if (url.pathname.endsWith('/calendarList')) {
      assert.equal(options.headers.Authorization, 'Bearer test-access');
      return Response.json({ items: [{ id: 'class-calendar', summary: 'Universidad de prueba' }] });
    }
    if (url.pathname.endsWith('/events')) {
      assert.equal(url.searchParams.get('singleEvents'), 'true');
      return Response.json({ items: [{ id: 'class', summary: 'Clase', start: { date: '2026-11-15' }, end: { date: '2026-11-16' } }] });
    }
    throw new Error('Consulta inesperada ' + input);
  });

  async function authorize(mode, session = '', target = server) {
    const entry = await request(target, '/auth/google?mode=' + mode, { cookie: session });
    const params = new URL(entry.headers.Location).searchParams;
    const flow = entry.headers['Set-Cookie'][0].split(';')[0];
    const callback = '/auth/google/callback?code=test&state=' + params.get('state');
    if (mode === 'login') assert.equal(params.get('scope'), 'openid email profile');
    const missingCookie = await request(target, callback);
    assert.match(missingCookie.headers.Location, /auth=failed/);
    return request(target, callback, { cookie: [flow, session].join('; ') });
  }

  assert.equal((await request(server, '/api/sync', { method: 'POST', origin })).status, 401);
  const first = await authorize('login');
  assert.match(first.headers.Location, /auth=ok/);
  const cookie = first.headers['Set-Cookie'][1].split(';')[0];
  assert.equal((await request(server, '/api/session', { cookie })).body.user.id, user.id);
  const data = { owner: user.id, changes: [{ id: note.id, record: note, mutation: 'note-one' }] };
  assert.equal((await request(server, '/api/sync', { method: 'POST', cookie, origin: 'https://other.invalid', data })).status, 403);
  const saved = await request(server, '/api/sync', { method: 'POST', cookie, origin, data });
  assert.deepEqual(saved.body.records.find(item => item.id === note.id), note);

  profile = { id: '20002', name: 'Campus', email: 'student@example.invalid' };
  assert.match((await authorize('connect', cookie)).headers.Location, /auth=connected/);
  assert.notEqual(db.prepare('SELECT refresh FROM google_accounts').get().refresh, 'refresh-token-test');
  const googlePath = '/api/google?from=2026-11-01&to=2026-12-01';
  assert.equal((await request(server, googlePath, { cookie })).body.records.find(item => item.type === 'event').title, 'Clase');
  await request(server, '/api/accounts/' + profile.id, { method: 'DELETE', cookie, origin });
  assert.equal((await request(server, googlePath, { cookie })).body.records.length, 0);

  const separate = await authorize('login');
  const separateCookie = separate.headers['Set-Cookie'][1].split(';')[0];
  const ownData = await request(server, '/api/sync', { method: 'POST', cookie: separateCookie, origin, data: { owner: profile.id, changes: [] } });
  assert.equal(ownData.body.records.some(item => item.id === note.id), false);
  assert.equal((await request(server, '/api/sync', { method: 'POST', cookie: separateCookie, origin, data })).status, 409);

  const privateApp = createApp({ ...config, ownerEmail: user.email });
  t.after(() => privateApp.db.close());
  const denied = await authorize('login', '', privateApp.server);
  assert.match(denied.headers.Location, /auth=denied/);
  assert.equal(denied.headers['Set-Cookie'].length, 1);

  profile = user;
  const owner = await authorize('login', '', privateApp.server);
  const ownerCookie = owner.headers['Set-Cookie'][1].split(';')[0];
  profile = { id: '20002', name: 'Campus', email: 'student@example.invalid' };
  assert.match((await authorize('connect', ownerCookie, privateApp.server)).headers.Location, /auth=connected/);

  profile = user;
  const loginOnly = createApp({ ...config, calendarEnabled: false });
  t.after(() => loginOnly.db.close());
  const allowed = await authorize('login', '', loginOnly.server);
  const allowedCookie = allowed.headers['Set-Cookie'][1].split(';')[0];
  assert.equal((await request(loginOnly.server, '/api/session', { cookie: allowedCookie })).body.calendarEnabled, false);
  assert.equal((await request(loginOnly.server, '/auth/google?mode=connect', { cookie: allowedCookie })).status, 503);
  assert.equal((await request(loginOnly.server, googlePath, { cookie: allowedCookie })).status, 503);

  const second = await authorize('login');
  const secondCookie = second.headers['Set-Cookie'][1].split(';')[0];
  const pulled = await request(server, '/api/sync', { method: 'POST', cookie: secondCookie, origin, data: { owner: user.id, changes: [] } });
  assert.deepEqual(pulled.body.records.find(item => item.id === note.id), note);
});
