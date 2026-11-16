import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { configFromEnv } from '../server/index.js';
import { openDatabase } from '../server/db.js';
import { backupDatabase } from '../scripts/backup.mjs';

const valid = { NODE_ENV: 'production', APP_URL: 'https://server.example.com',
  GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', TOKEN_KEY: Buffer.alloc(32, 1).toString('base64') };

test('producción exige OAuth y HTTPS y rechaza puertos inválidos', () => {
  assert.throws(() => configFromEnv({ NODE_ENV: 'production' }), /Producción/);
  assert.throws(() => configFromEnv({ ...valid, APP_URL: 'http://localhost:3000' }), /Producción/);
  assert.equal(configFromEnv(valid).enabled, true);
  for (const port of ['-1', '0', '65536', '1.5', 'oops']) assert.throws(() => configFromEnv({ PORT: port }), /PORT/);
});

test('la copia consistente recupera datos confirmados que todavía están en WAL', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'chronix-backup-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = openDatabase(join(directory, 'live.sqlite'));
  t.after(() => store.db.close());
  store.db.exec('PRAGMA wal_autocheckpoint=0');
  const user = { id: '42', name: 'Test', email: 'test@example.invalid' };
  store.saveUser(user);
  const record = { id: 'backup-note', type: 'note', title: 'Persistente', body: '', pinned: false, updated: '2026-11-16T00:00:00.000Z' };
  store.apply(user.id, [{ id: record.id, record, mutation: 'backup-change' }]);
  const output = await backupDatabase(join(directory, 'live.sqlite'), join(directory, 'backups'));
  const restored = new DatabaseSync(output, { readOnly: true });
  try {
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(JSON.parse(restored.prepare('SELECT payload FROM records WHERE id=?').get(record.id).payload), record);
    assert.equal(restored.prepare('SELECT count(*) AS n FROM mutations').get().n, 1);
    if (process.platform !== 'win32') assert.equal(statSync(output).mode & 0o777, 0o600);
  } finally { restored.close(); }
});

test('configurador valida el callback, protege los secretos y conserva la clave de cifrado', t => {
  const directory = mkdtempSync(join(tmpdir(), 'chronix-config-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const input = join(directory, 'client_secret.json');
  const output = join(directory, 'chronix.env');
  const web = { client_id: 'test.apps.googleusercontent.com', client_secret: 'test-only-secret', redirect_uris: ['https://server.example.com/auth/google/callback'] };
  writeFileSync(input, JSON.stringify({ web }));
  const invoke = () => spawnSync(process.execPath, ['scripts/configure-google.mjs', '--credentials', input,
    '--url', 'https://server.example.com', '--owner', 'test@example.invalid', '--output', output], { encoding: 'utf8' });
  let result = invoke();
  assert.equal(result.status, 0, result.stderr);
  const first = parseEnv(readFileSync(output, 'utf8'));
  assert.equal(configFromEnv(first).enabled, true);
  assert.equal(result.stdout.includes(web.client_secret), false);
  assert.equal(result.stdout.includes(first.TOKEN_KEY), false);
  if (process.platform !== 'win32') assert.equal(statSync(output).mode & 0o777, 0o600);
  result = invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(parseEnv(readFileSync(output, 'utf8')).TOKEN_KEY, first.TOKEN_KEY);
  web.redirect_uris = ['http://localhost:3000/auth/google/callback'];
  writeFileSync(input, JSON.stringify({ web }));
  assert.equal(invoke().status, 1);
  assert.equal(parseEnv(readFileSync(output, 'utf8')).TOKEN_KEY, first.TOKEN_KEY);
});
