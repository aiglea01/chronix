import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Store, read, write } from '../public/js/store.js';

test('conserva las operaciones sin conexión y aplica una nota pendiente al resultado remoto', async t => {
  const map = new Map();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) }
  });
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
  });

  const profile = { id: '42', name: 'Cuenta de prueba', email: 'cuenta@example.invalid' };
  write('profile', profile);
  const store = new Store();
  const note = { id: 'note', type: 'note', title: 'Borrador', body: '', pinned: false, updated: '2026-11-15T00:00:00.000Z' };
  let connected = false;
  let serverRecords;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/sync');
    if (!connected) throw new TypeError('Sin red');
    const { owner, changes } = JSON.parse(options.body);
    assert.equal(owner, profile.id);
    serverRecords = changes.map(change => change.record);
    return Response.json({ records: serverRecords });
  });

  store.lock = true;
  store.mutate([note]);
  store.lock = false;
  await store.sync();
  assert.equal(read(store.key, {}).pending.length, 1);

  const reopened = new Store();
  assert.ok(reopened.records.some(record => record.id === note.id));
  connected = true;
  await reopened.sync();
  assert.deepEqual(serverRecords, [note]);
  assert.deepEqual(read(reopened.key, {}).pending, []);
  assert.equal(reopened.status, 'Sincronizado');
});

function memoryStore(t) {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    value: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  });
  write('profile', { id: '42' });
  const store = new Store();
  store.remote = { calendarEnabled: true, accounts: [{ id: '123' }] };
  return store;
}
const calendar = { id: 'g:calendar', type: 'calendar', title: 'Google', google: true };
const googleEvent = { id: 'g:deleted', type: 'event', calendarId: calendar.id, allDay: true,
  start: '2026-11-15', end: '2026-11-16', googleWindow: 'previous-overlapping-window' };

test('retira eventos eliminados de Google al refrescar una ventana solapada', async t => {
  const store = memoryStore(t);
  store.google = { records: [calendar, googleEvent], warnings: [] };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ complete: true,
    window: '2026-11-01T00:00:00.000Z/2026-12-01T00:00:00.000Z', records: [calendar], warnings: [] }));
  assert.equal(await store.refreshGoogle('2026-11-01', '2026-12-01'), true);
  assert.deepEqual(store.google.records, [calendar]);
});

test('conserva la agenda en caché ante errores parciales de Google', async t => {
  const store = memoryStore(t);
  store.google = { records: [calendar, googleEvent], warnings: [] };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ complete: false,
    window: 'window', records: [], warnings: ['Proveedor temporalmente no disponible'] }));
  await store.refreshGoogle('2026-11-01', '2026-12-01');
  assert.deepEqual(store.google.records, [calendar, googleEvent]);
  assert.equal(store.google.warnings.length, 1);
});

test('descarta una consulta de Google si se desconecta la cuenta antes de recibirla', async t => {
  const store = memoryStore(t);
  t.mock.method(globalThis, 'fetch', async () => {
    store.remote.accounts = [];
    return Response.json({ complete: true, window: 'window', records: [calendar, googleEvent], warnings: [] });
  });
  assert.equal(await store.refreshGoogle('2026-11-01', '2026-12-01'), false);
  assert.deepEqual(store.google.records, []);
});
