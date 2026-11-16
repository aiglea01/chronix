import { DatabaseSync, backup } from 'node:sqlite';
import { chmodSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function backupDatabase(source, directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const output = resolve(directory, 'chronix-' + stamp + '-' + randomBytes(4).toString('hex') + '.sqlite');
  const temporary = output + '.tmp';
  const db = new DatabaseSync(resolve(source), { readOnly: true });
  try {
    await backup(db, temporary);
    chmodSync(temporary, 0o600);
    const check = new DatabaseSync(temporary, { readOnly: true });
    try {
      if (check.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Copia SQLite no válida.');
    } finally { check.close(); }
    renameSync(temporary, output);
    return output;
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  } finally { db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(await backupDatabase(process.env.DB_PATH || './data/chronix.sqlite', process.argv[2] || './backups'));
  } catch (error) {
    console.error('No se pudo crear la copia: ' + error.message);
    process.exitCode = 1;
  }
}
