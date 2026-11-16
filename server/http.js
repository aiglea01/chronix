import { createHash, randomBytes } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const randomToken = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('base64url');
export const cookieValue = (req, name) => (req.headers.cookie ?? '').split(';').map(part => part.trim())
  .find(part => part.startsWith(name + '='))?.slice(name.length + 1) ?? '';

export function cookie(name, value, maxAge, secure) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

export function redirect(res, location, cookies = []) {
  const headers = { Location: location, 'Cache-Control': 'no-store' };
  if (cookies.length) headers['Set-Cookie'] = cookies;
  res.writeHead(303, headers);
  res.end();
}

export async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw new HttpError(415, 'Se esperaba JSON.');
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > 1_300_000) {
      req.resume();
      throw new HttpError(413, 'Demasiados datos.');
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf-8')); }
  catch { throw new HttpError(400, 'JSON inválido.'); }
}

export async function upstream(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new HttpError(response.status, 'El proveedor no pudo completar la consulta.');
  return response.json();
}
