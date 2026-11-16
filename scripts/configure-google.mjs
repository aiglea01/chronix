import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { configFromEnv } from '../server/index.js';

// El JSON descargado de Google se lee del disco; los secretos nunca se imprimen.
try {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--credentials', '--url', '--owner', '--output', '--port'].includes(args[i]) || !args[i + 1]) {
      throw new Error('Uso: node scripts/configure-google.mjs --credentials /ruta/client_secret.json --url https://servidor --owner correo --output /ruta/chronix.env [--port 3000]');
    }
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.credentials || !options.url || !options.owner || !options.output) throw new Error('Faltan credentials, url, owner u output.');
  const output = resolve(options.output);
  const previous = existsSync(output) ? parseEnv(readFileSync(output, 'utf8')) : {};
  const credentials = JSON.parse(readFileSync(options.credentials, 'utf8')).web;
  if (!credentials?.client_id || !credentials?.client_secret) throw new Error('Se requiere un cliente OAuth de tipo Aplicación web.');
  const origin = new URL(options.url).origin;
  const callback = origin + '/auth/google/callback';
  if (!credentials.redirect_uris?.includes(callback)) throw new Error('Registra esta URI en Google y vuelve a descargar el JSON: ' + callback);
  const values = {
    NODE_ENV: 'production', HOST: '127.0.0.1', PORT: options.port || previous.PORT || '3000', APP_URL: options.url,
    DB_PATH: '/var/lib/chronix/chronix.sqlite', CHRONIX_OWNER_EMAIL: options.owner,
    GOOGLE_CALENDAR_ENABLED: 'true', GOOGLE_CLIENT_ID: credentials.client_id,
    GOOGLE_CLIENT_SECRET: credentials.client_secret,
    TOKEN_KEY: previous.TOKEN_KEY || randomBytes(32).toString('base64')
  };
  configFromEnv(values);
  const lines = Object.entries(values).map(([key, value]) => {
    if (/[\r\n\0"\\]/.test(value)) throw new Error('Valor no válido en ' + key);
    return key + '="' + value + '"';
  }).join('\n') + '\n';
  const temporary = output + '.' + randomBytes(6).toString('hex') + '.tmp';
  writeFileSync(temporary, lines, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, output);
  chmodSync(output, 0o600);
  console.log('Configuración guardada con permisos 0600. TOKEN_KEY conservada si ya existía.');
  console.log('Callback: ' + callback);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
