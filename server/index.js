import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { googleAuth } from './auth.js';
import { openDatabase } from './db.js';
import { calendarReader } from './google.js';
import { body, HttpError, json } from './http.js';
import { ownRecord, validId } from '../public/js/model.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const publicRoot = fileURLToPath(new URL('../public', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png'
};

export function configFromEnv(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe estar entre 1 y 65535.');
  const url = new URL(env.APP_URL || 'http://localhost:' + port);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.href !== url.origin + '/' || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new Error('APP_URL debe ser un origen HTTPS o HTTP en localhost.');
  }
  const key = Buffer.from(env.TOKEN_KEY || '', 'base64');
  const enabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && key.length === 32);
  if (!enabled && (env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_SECRET || env.TOKEN_KEY)) {
    throw new Error('Completa GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y TOKEN_KEY (32 bytes en Base64).');
  }
  if (env.NODE_ENV === 'production' && (!enabled || !url.origin.startsWith('https://'))) {
    throw new Error('Producción requiere HTTPS y Google OAuth completo para sincronizar.');
  }
  const ownerEmail = env.CHRONIX_OWNER_EMAIL?.trim().toLowerCase() || '';
  if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    throw new Error('CHRONIX_OWNER_EMAIL debe ser una única dirección de correo.');
  }
  const calendarEnabled = env.GOOGLE_CALENDAR_ENABLED?.trim().toLowerCase() || 'true';
  if (calendarEnabled !== 'true' && calendarEnabled !== 'false') {
    throw new Error('GOOGLE_CALENDAR_ENABLED debe ser true o false.');
  }
  return {
    port, host: env.HOST || '127.0.0.1', origin: url.origin, secure: url.protocol === 'https:',
    clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, key, enabled, ownerEmail,
    calendarEnabled: calendarEnabled === 'true',
    dbPath: env.DB_PATH || './data/chronix.sqlite'
  };
}

function staticFile(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) throw new HttpError(405, 'Método no permitido.');
  const file = resolve(publicRoot, pathname === '/' ? 'index.html' : '.' + decodeURIComponent(pathname));
  const type = mime[extname(file)];
  if (!file.startsWith(publicRoot + sep) || !type) throw new HttpError(404, 'Página no encontrada.');
  const stat = statSync(file, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new HttpError(404, 'Página no encontrada.');
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

function checkedChanges(changes) {
  if (!Array.isArray(changes) || changes.length > 50) throw new HttpError(400, 'Lote inválido.');
  return changes.map(change => {
    if (!change || !validId(change.id) || change.id.startsWith('g:') || !validId(change.mutation)) {
      throw new HttpError(400, 'Identificadores inválidos.');
    }
    const { id, record, mutation } = change;
    if (id === 'personal' && record?.type !== 'calendar') throw new HttpError(400, 'Personal es un calendario base.');
    if (record === null) return { id, record, mutation };
    const clean = ownRecord(record);
    if (!clean || clean.id !== id) throw new HttpError(400, 'Registro inválido.');
    return { id, mutation, record: clean };
  });
}

export function createApp(config = configFromEnv()) {
  const store = openDatabase(config.dbPath);
  const auth = googleAuth(store.db, config);
  const readCalendar = calendarReader(auth);
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (config.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url, config.origin);
      const { pathname: path, searchParams: search } = url;
      if (req.method === 'GET' && path === '/healthz') {
        store.db.prepare('SELECT 1').get();
        return json(res, 200, { status: 'ok', version, syncEnabled: config.enabled });
      }
      if (req.method === 'GET' && path === '/auth/google') {
        return auth.begin(req, res, search.get('mode') === 'connect' ? 'connect' : 'login');
      }
      if (req.method === 'GET' && path === '/auth/google/callback') {
        return await auth.callback(req, res, search, store.saveUser);
      }
      if (!path.startsWith('/api/')) return staticFile(req, res, path);

      const user = auth.user(req);
      if (['POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method) && req.headers.origin !== config.origin) {
        throw new HttpError(403, 'Origen no autorizado.');
      }
      if (req.method === 'GET' && path === '/api/session') {
        const accounts = user ? auth.accounts(user.id).map(({ id, name, email }) => ({ id, name, email })) : [];
        return json(res, 200, { user, accounts, version, enabled: config.enabled, calendarEnabled: config.enabled && config.calendarEnabled !== false });
      }
      if (!user) throw new HttpError(401, 'Inicia sesión primero.');
      if (req.method === 'POST' && path === '/api/logout') {
        auth.logout(req, res);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/sync') {
        const request = await body(req);
        if (request?.owner !== user.id) throw new HttpError(409, 'La sesión cambió.');
        const records = store.apply(user.id, checkedChanges(request.changes));
        return json(res, 200, { records });
      }
      if (req.method === 'GET' && path === '/api/google') {
        if (config.calendarEnabled === false) throw new HttpError(503, 'Google Calendar está desactivado.');
        return json(res, 200, await readCalendar(user.id, search));
      }
      const account = path.match(/^\/api\/accounts\/(\d{1,128})$/);
      if (req.method === 'DELETE' && account) {
        auth.disconnect(user.id, account[1]);
        return json(res, 200, { ok: true });
      }
      throw new HttpError(404, 'Página no encontrada.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : error instanceof URIError ? 400 : 500;
      if (status >= 500 && !(error instanceof HttpError)) console.error(error.name, error.code ?? '');
      if (!res.headersSent) json(res, status, { error: status === 500 ? 'Error interno.' : error.message });
      else res.end();
    }
  });
  server.on('close', () => store.db.close());
  return { server, ...store };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  const config = configFromEnv();
  const { server } = createApp(config);
  server.listen(config.port, config.host, () => console.log('Chronix · ' + config.origin));
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 15000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
