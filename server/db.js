import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { starterCalendars } from '../public/js/model.js';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:' && process.platform !== 'win32') chmodSync(path, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oauth_flows (
      state TEXT PRIMARY KEY, binding TEXT NOT NULL, verifier TEXT NOT NULL, mode TEXT NOT NULL,
      session_id TEXT, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS google_accounts (
      owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, name TEXT NOT NULL,
      email TEXT NOT NULL, refresh TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY (owner, id)
    );
    CREATE TABLE IF NOT EXISTS records (
      owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY (owner, id)
    );
    CREATE TABLE IF NOT EXISTS mutations (
      owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, PRIMARY KEY (owner, id)
    );
  `);

  const addRecord = db.prepare('INSERT INTO records VALUES (?, ?, ?) ON CONFLICT (owner, id) DO UPDATE SET payload = excluded.payload');
  const deleteRecord = db.prepare('DELETE FROM records WHERE owner = ? AND id = ?');
  const listRecords = db.prepare('SELECT payload FROM records WHERE owner = ? ORDER BY id');
  const existingRecord = db.prepare('SELECT payload FROM records WHERE owner = ? AND id = ?');
  const newUser = db.prepare('INSERT INTO users VALUES (?, ?, ?) ON CONFLICT DO NOTHING');
  const updateUser = db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?');
  const addMutation = db.prepare('INSERT OR IGNORE INTO mutations VALUES (?, ?)');

  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function saveUser(user) {
    transaction(() => {
      const inserted = newUser.run(user.id, user.name, user.email);
      if (inserted.changes) {
        for (const record of starterCalendars) addRecord.run(user.id, record.id, JSON.stringify(record));
      } else updateUser.run(user.name, user.email, user.id);
    });
  }

  function apply(owner, changes) {
    return transaction(() => {
      for (const { id, mutation, record } of changes) {
        if (!addMutation.run(owner, mutation).changes) continue;
        if (record === null) {
          const deleted = existingRecord.get(owner, id);
          if (deleted && JSON.parse(deleted.payload).type === 'calendar') {
            for (const row of listRecords.all(owner)) {
              const event = JSON.parse(row.payload);
              if (event.type === 'event' && event.calendarId === id) {
                event.calendarId = 'personal';
                addRecord.run(owner, event.id, JSON.stringify(event));
              }
            }
          }
          deleteRecord.run(owner, id);
          continue;
        }
        if (record.type === 'event') {
          const calendar = existingRecord.get(owner, record.calendarId);
          if (!calendar || JSON.parse(calendar.payload).type !== 'calendar') record.calendarId = 'personal';
        }
        addRecord.run(owner, id, JSON.stringify(record));
      }
      return listRecords.all(owner).map(row => JSON.parse(row.payload));
    });
  }

  return { db, saveUser, apply };
}
