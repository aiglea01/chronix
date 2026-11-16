import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { cookie, cookieValue, hash, HttpError, randomToken, redirect, upstream } from './http.js';

const AUTHORIZATION = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const USER_INFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const IDENTITY = 'openid email profile';
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const FLOW_COOKIE = 'chronix_flow';
const SESSION_COOKIE = 'chronix_session';

export function googleAuth(db, config) {
  const info = db.prepare(`SELECT users.* FROM users JOIN sessions ON users.id = sessions.owner
    WHERE sessions.id = ? AND sessions.expires > ?`);
  const saveSession = db.prepare('INSERT INTO sessions VALUES (?, ?, ?)');
  const removeSession = db.prepare('DELETE FROM sessions WHERE id = ?');
  const clearSessions = db.prepare('DELETE FROM sessions WHERE expires <= ?');
  const clearFlows = db.prepare('DELETE FROM oauth_flows WHERE expires <= ?');
  const addFlow = db.prepare('INSERT INTO oauth_flows VALUES (?, ?, ?, ?, ?, ?)');
  const takeFlow = db.prepare('DELETE FROM oauth_flows WHERE state = ? AND binding = ? AND expires > ? RETURNING *');
  const getAccounts = db.prepare('SELECT id, name, email, refresh, revision FROM google_accounts WHERE owner = ? ORDER BY email');
  const addAccount = db.prepare(`INSERT INTO google_accounts VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (owner, id) DO UPDATE SET name=excluded.name, email=excluded.email, refresh=excluded.refresh, revision=excluded.revision`);
  const deleteAccount = db.prepare('DELETE FROM google_accounts WHERE owner = ? AND id = ?');
  const redirectUri = config.origin + '/auth/google/callback';
  const sessionId = req => hash(cookieValue(req, SESSION_COOKIE));
  const allowed = email => !config.ownerEmail || email.toLowerCase() === config.ownerEmail;
  const user = req => {
    const profile = info.get(sessionId(req), Date.now());
    return profile && allowed(profile.email) ? profile : null;
  };
  const accounts = owner => getAccounts.all(owner);

  function encrypt(value, owner, id) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', config.key, nonce);
    cipher.setAAD(Buffer.from(owner + ':' + id));
    return Buffer.concat([nonce, cipher.update(value, 'utf-8'), cipher.final(), cipher.getAuthTag()]).toString('base64url');
  }

  function decrypt(value, owner, id) {
    const data = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', config.key, data.subarray(0, 12));
    cipher.setAAD(Buffer.from(owner + ':' + id));
    cipher.setAuthTag(data.subarray(-16));
    return Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString('utf-8');
  }

  function token(params) {
    return upstream(TOKEN, { method: 'POST', body: new URLSearchParams({
      ...params, client_id: config.clientId, client_secret: config.clientSecret
    }) });
  }

  function begin(req, res, mode) {
    if (!config.enabled) throw new HttpError(503, 'Configura Google OAuth para usar esta función.');
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Navegación no autorizada.');
    const owner = user(req);
    if (mode === 'connect' && !owner) throw new HttpError(401, 'Inicia sesión primero.');
    if (mode === 'connect' && config.calendarEnabled === false) throw new HttpError(503, 'Google Calendar está desactivado.');
    const state = randomToken();
    const verifier = randomToken();
    const binding = randomToken();
    clearFlows.run(Date.now());
    clearSessions.run(Date.now());
    addFlow.run(hash(state), hash(binding), verifier, mode, owner ? sessionId(req) : null, Date.now() + 600000);
    const query = new URLSearchParams({
      client_id: config.clientId, redirect_uri: redirectUri, response_type: 'code',
      scope: mode === 'connect' ? IDENTITY + ' ' + CALENDAR_SCOPE : IDENTITY,
      state, code_challenge: hash(verifier), code_challenge_method: 'S256',
      prompt: mode === 'connect' ? 'select_account consent' : 'select_account'
    });
    if (mode === 'connect') query.set('access_type', 'offline');
    redirect(res, AUTHORIZATION + '?' + query, [cookie(FLOW_COOKIE, binding, 600, config.secure)]);
  }

  async function callback(req, res, search, saveUser) {
    const clear = cookie(FLOW_COOKIE, '', 0, config.secure);
    const finish = (result, cookies = []) => redirect(res, '/?auth=' + result + '#settings', [clear, ...cookies]);
    if (!config.enabled || !search.get('state')) return finish('failed');
    const flow = takeFlow.get(hash(search.get('state')), hash(cookieValue(req, FLOW_COOKIE)), Date.now());
    if (!flow || !search.get('code')) return finish('failed');
    if (flow.mode === 'connect' && config.calendarEnabled === false) return finish('failed');
    try {
      const previous = user(req);
      if (flow.mode === 'connect' && (!previous || flow.session_id !== sessionId(req))) return finish('failed');
      const tokens = await token({
        grant_type: 'authorization_code', code: search.get('code'), redirect_uri: redirectUri, code_verifier: flow.verifier
      });
      if (typeof tokens.access_token !== 'string') return finish('failed');
      const profile = await upstream(USER_INFO, { headers: { Authorization: 'Bearer ' + tokens.access_token } });
      if (typeof profile.sub !== 'string' || !/^\d{1,128}$/.test(profile.sub) || profile.email_verified !== true || typeof profile.email !== 'string') return finish('failed');
      const account = { id: profile.sub, email: profile.email, name: profile.name || profile.email };
      if (flow.mode === 'connect') {
        if (!user(req) || !tokens.scope?.split(' ').includes(CALENDAR_SCOPE)) return finish('consent');
        const saved = accounts(previous.id).find(item => item.id === account.id);
        const refresh = tokens.refresh_token ? encrypt(tokens.refresh_token, previous.id, account.id) : saved?.refresh;
        if (!refresh) return finish('consent');
        addAccount.run(previous.id, account.id, account.name, account.email, refresh, randomToken());
        return finish('connected');
      }

      if (!allowed(account.email)) return finish('denied');
      saveUser(account);
      removeSession.run(sessionId(req));
      const session = randomToken();
      saveSession.run(hash(session), account.id, Date.now() + SESSION_SECONDS * 1000);
      return finish('ok', [cookie(SESSION_COOKIE, session, SESSION_SECONDS, config.secure)]);
    } catch {
      return finish('failed');
    }
  }

  async function accessToken(owner, account) {
    const result = await token({ grant_type: 'refresh_token', refresh_token: decrypt(account.refresh, owner, account.id) });
    if (typeof result.access_token !== 'string') throw new Error('Falta el token de acceso');
    return result.access_token;
  }

  function logout(req, res) {
    removeSession.run(sessionId(req));
    res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0, config.secure));
  }

  return { begin, callback, user, accounts, accessToken, logout, disconnect: (owner, id) => deleteAccount.run(owner, id) };
}
