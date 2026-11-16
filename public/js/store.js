import { applyRecords, starterCalendars } from './model.js';
import { asDay, plusDays, today } from './dates.js';

const base = 'chronix.v1.';
export const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(base + key)) ?? fallback; }
  catch { return fallback; }
};
export const write = (key, value) => localStorage.setItem(base + key, JSON.stringify(value));

function examples() {
  const day = today();
  const event = (id, title, calendarId, start, end, offset = 0) => {
    const date = plusDays(day, offset);
    return {
      id: 'example-' + id, type: 'event', sample: true, title, calendarId,
      start: new Date(date + 'T' + start).toISOString(), end: new Date(date + 'T' + end).toISOString(),
      description: '', location: '', allDay: false
    };
  };
  const note = (id, title, body, pinned) => ({
    id: 'example-' + id, type: 'note', sample: true, title, body, pinned,
    updated: asDay(day).toISOString()
  });
  return [
    event('one', 'Planificar la semana', 'personal', '09:00', '10:00'),
    event('two', 'Entrega de proyecto', 'universidad', '11:00', '12:30'),
    event('three', 'Revisión de tareas', 'trabajo', '14:00', '15:00'),
    event('four', 'Bloque de estudio', 'universidad', '10:00', '11:00', 3),
    event('five', 'Revisar pendientes', 'personal', '14:00', '15:00', -3),
    event('six', 'Lecturas de la semana', 'trabajo', '10:00', '11:00', 6),
    note('ideas', 'Ideas para esta semana', 'Organizar las lecturas pendientes y reservar tiempo para el proyecto.', true),
    note('reminder', 'Recordatorio', 'Revisar las fechas de las próximas entregas.', false)
  ];
}

export class Store {
  constructor() {
    this.profile = read('profile', null);
    this.remote = { enabled: false, accounts: [] };
    this.status = this.profile ? 'Comprobando…' : 'Modo local';
    this.lock = false;
    this.providerLock = false;
    this.load();
  }

  get owner() { return this.profile?.id ?? 'guest'; }
  get key() { return 'records.' + this.owner; }

  load() {
    this.state = read(this.key, { records: starterCalendars, pending: [] });
    this.google = this.profile ? read('google.' + this.owner, { records: [], warnings: [] }) : { records: [], warnings: [] };
  }

  get records() {
    const sample = !this.profile && !read('hideSamples', false)
      ? examples().filter(record => !read('removedSamples', []).includes(record.id)
        && !this.state.records.some(item => item.id === record.id))
      : [];
    return [...this.state.records, ...sample, ...this.google.records];
  }

  mutate(records) {
    const current = read(this.key, this.state);
    const changes = records.map(record => record.deleted
      ? { id: record.id, record: null }
      : { id: record.id, record });
    const pending = this.profile
      ? [...current.pending, ...changes.map(change => ({ ...change, mutation: crypto.randomUUID() }))]
      : [];
    const next = { records: applyRecords(current.records, changes), pending };
    write(this.key, next);
    this.state = next;
    if (this.profile) {
      this.status = 'Cambios pendientes';
      void this.sync();
    }
  }

  guestRecords() {
    return read('records.guest', { records: starterCalendars }).records.filter(record =>
      !record.sample && !starterCalendars.some(calendar => JSON.stringify(calendar) === JSON.stringify(record)));
  }

  async session() {
    const response = await fetch('/api/session', { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Sesión no disponible');
    const session = await response.json();
    const changed = JSON.stringify(session) !== JSON.stringify(this.remote);
    const switched = (session.user?.id ?? null) !== (this.profile?.id ?? null);
    this.remote = session;
    if (switched) {
      this.profile = session.user;
      write('profile', this.profile);
      this.load();
    }
    const accountIds = session.calendarEnabled === false ? [] : session.accounts.map(account => account.id).sort();
    const cachedAccounts = read('google-accounts.' + this.owner, []);
    const changedAccounts = this.profile && JSON.stringify(accountIds) !== JSON.stringify(cachedAccounts);
    if (changedAccounts) {
      this.google = { records: [], warnings: [] };
      write('google.' + this.owner, this.google);
      write('google-accounts.' + this.owner, accountIds);
    }
    if (switched) this.status = this.profile ? 'Sincronizando…' : 'Modo local';
    if (changed || switched || changedAccounts) this.onChange?.();
    if (this.profile) await this.sync();
  }

  async sync() {
    if (!this.profile || this.lock) return;
    this.lock = true;
    const key = this.key;
    try {
      const { pending } = read(key, this.state);
      const batch = pending.slice(0, 50);
      const response = await fetch('/api/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: this.owner, changes: batch }),
        signal: AbortSignal.timeout(12000)
      });
      if (response.status === 401 || response.status === 409) {
        this.status = 'Vuelve a iniciar sesión';
        return;
      }
      if (!response.ok) throw new Error('Sincronización no disponible');
      const { records } = await response.json();
      if (key !== this.key) return;
      const sent = new Set(batch.map(change => change.mutation));
      const remaining = read(key, this.state).pending.filter(change => !sent.has(change.mutation));
      const next = { records: applyRecords(records, remaining), pending: remaining };
      this.status = remaining.length ? 'Cambios pendientes' : 'Sincronizado';
      if (JSON.stringify(next) !== JSON.stringify(this.state)) {
        write(key, next);
        this.state = next;
        this.onChange?.();
      }
      if (remaining.length) queueMicrotask(() => this.sync());
    } catch {
      this.status = navigator.onLine ? 'Sincronización pendiente' : 'Sin conexión';
    } finally {
      this.lock = false;
      this.onStatus?.();
    }
  }

  async refreshGoogle(from, to, force = false) {
    if (!this.profile || this.remote.calendarEnabled === false || !this.remote.accounts.length || this.providerLock) return false;
    const owner = this.owner;
    const accounts = this.remote.accounts.map(account => account.id).sort().join(',');
    this.providerLock = true;
    try {
      const search = new URLSearchParams({ from, to, ...(force && { refresh: '1' }) });
      const response = await fetch('/api/google?' + search, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) return false;
      const loaded = await response.json();
      if (owner !== this.owner || this.remote.calendarEnabled === false ||
          accounts !== this.remote.accounts.map(account => account.id).sort().join(',')) return false;
      const currentIds = new Set(loaded.records.map(item => item.id));
      // Google incluye un día de margen en ambos extremos. Una respuesta completa
      // sustituye también los eventos de ventanas solapadas, incluidos los borrados.
      const windowStart = new Date(new Date(from).getTime() - 86400000).toISOString();
      const windowEnd = new Date(new Date(to).getTime() + 86400000).toISOString();
      const overlaps = item => item.allDay
        ? item.start < windowEnd.slice(0, 10) && item.end > windowStart.slice(0, 10)
        : item.start < windowEnd && item.end > windowStart;
      const next = {
        warnings: loaded.warnings,
        records: [
          ...this.google.records.filter(item => !currentIds.has(item.id) && (loaded.complete === false ||
            (item.type === 'event' && !overlaps(item) && currentIds.has(item.calendarId)))),
          ...loaded.records.map(record => record.type === 'event' ? { ...record, googleWindow: loaded.window } : record)
        ]
      };
      // Conservar hasta cuatro ventanas adyacentes consultadas.
      const windows = [...new Set(next.records.map(item => item.googleWindow).filter(Boolean))].slice(-4);
      next.records = next.records.filter(item => item.type === 'calendar' || windows.includes(item.googleWindow));
      if (JSON.stringify(next) !== JSON.stringify(this.google)) {
        write('google.' + owner, next);
        this.google = next;
        this.onChange?.();
      }
      return true;
    } catch { return false; }
    finally { this.providerLock = false; }
  }
}
