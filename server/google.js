import { hash, HttpError, upstream } from './http.js';
import { validRecord } from '../public/js/model.js';

const endpoint = 'https://www.googleapis.com/calendar/v3';
const palette = ['violet', 'blue', 'teal', 'orange', 'pink', 'gray'];

async function list(path, params, access) {
  const rows = [];
  const pages = new Set();
  let nextPageToken;
  do {
    if (pages.size >= 40 || pages.has(nextPageToken)) throw new Error('Límite de paginación');
    pages.add(nextPageToken);
    const query = new URLSearchParams(params);
    if (nextPageToken) query.set('pageToken', nextPageToken);
    const page = await upstream(endpoint + path + '?' + query, { headers: { Authorization: 'Bearer ' + access } });
    rows.push(...(page.items ?? []));
    nextPageToken = page.nextPageToken;
  } while (nextPageToken);
  return rows;
}

export function normalizeEvent(item, calendarId) {
  const allDay = Boolean(item.start?.date);
  const instant = value => {
    const date = new Date(value);
    return Number.isFinite(+date) ? date.toISOString() : '';
  };
  const record = {
    id: 'g:' + hash(calendarId + '\n' + item.id), type: 'event', google: true, calendarId, allDay,
    start: allDay ? item.start.date : instant(item.start?.dateTime),
    end: allDay ? item.end?.date : instant(item.end?.dateTime),
    title: (item.summary || 'Ocupado').slice(0, 120), description: (item.description ?? '').slice(0, 5000),
    location: (item.location ?? '').slice(0, 250), url: item.htmlLink?.slice(0, 2000) ?? ''
  };
  return item.status !== 'cancelled' && validRecord(record) ? record : null;
}

async function inBatches(items, operation) {
  const results = [];
  for (let index = 0; index < items.length; index += 5) {
    results.push(...await Promise.all(items.slice(index, index + 5).map(operation)));
  }
  return results;
}

export function calendarReader(auth) {
  const cache = new Map();
  const flights = new Map();
  const ttl = 120000;

  async function accountRecords(owner, account, from, to, usedCalendars) {
    const access = await auth.accessToken(owner, account);
    const calendars = await list('/users/me/calendarList', { maxResults: '250' }, access);
    const warnings = [];
    const records = (await inBatches(calendars.filter(item => !item.deleted), async item => {
      // El mismo calendario compartido puede aparecer en varias cuentas.
      if (usedCalendars.has(item.id)) return [];
      const id = 'g:' + hash(item.id);
      const calendar = {
        id, type: 'calendar', title: (item.summaryOverride || item.summary || 'Calendario').slice(0, 80),
        color: palette[(Number(item.colorId) || 0) % palette.length], google: true
      };
      try {
        const events = await list('/calendars/' + encodeURIComponent(item.id) + '/events', {
          timeMin: from, timeMax: to, singleEvents: 'true', maxResults: '250'
        }, access);
        usedCalendars.add(item.id);
        return [calendar, ...events.map(event => normalizeEvent(event, id)).filter(Boolean)];
      } catch {
        warnings.push('No se pudieron consultar los eventos de «' + calendar.title + '».');
        return [calendar];
      }
    })).flat();
    return { records, warnings };
  }

  return async function readCalendar(owner, search) {
    const from = new Date(search.get('from') ?? NaN);
    const to = new Date(search.get('to') ?? NaN);
    if (!Number.isFinite(+from) || !Number.isFinite(+to) || to <= from || to - from > 50 * 86400000) {
      throw new HttpError(400, 'Ventana de fechas inválida.');
    }
    const window = from.toISOString() + '/' + to.toISOString();
    const accounts = auth.accounts(owner);
    const revision = accounts.map(account => account.revision).join();
    const key = owner + ':' + revision + ':' + window;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now() && (!search.has('refresh') || cached.expires > Date.now() + ttl - 10000)) {
      return cached.value;
    }
    if (!flights.has(key)) {
      flights.set(key, (async () => {
        const records = new Map();
        const warnings = new Set();
        const usedCalendars = new Set();
        for (const account of accounts) {
          try {
            const response = await accountRecords(owner, account, new Date(+from - 86400000).toISOString(),
              new Date(+to + 86400000).toISOString(), usedCalendars);
            for (const record of response.records) records.set(record.id, record);
            for (const warning of response.warnings) warnings.add(warning);
          } catch { warnings.add('Vuelve a conectar ' + account.email + ' si Google ha retirado el acceso.'); }
        }
        if (auth.accounts(owner).map(account => account.revision).join() !== revision) {
          throw new HttpError(409, 'Las conexiones de Google cambiaron durante la consulta.');
        }
        const value = { window, records: [...records.values()], warnings: [...warnings] };
        for (const [id, entry] of cache) if (entry.expires <= Date.now()) cache.delete(id);
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        cache.set(key, { value, expires: Date.now() + ttl });
        return value;
      })().finally(() => flights.delete(key)));
    }
    return flights.get(key);
  };
}
