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
