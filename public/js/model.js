export const colors = {
  violet: 'Lavanda',
  teal: 'Menta',
  orange: 'Ámbar',
  blue: 'Azul',
  pink: 'Rosa',
  gray: 'Gris'
};

const idFormat = /^[\w:.@%-]{1,180}$/;
const dayFormat = /^\d{4}-\d{2}-\d{2}$/;
const timeFormat = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const isDate = (value, format) => {
  if (typeof value !== 'string' || !format.test(value)) return false;
  const date = new Date(value);
  if (!Number.isFinite(+date)) return false;
  return format === dayFormat ? date.toISOString().slice(0, 10) === value : date.toISOString() === value;
};
const str = (value, max) => typeof value === 'string' && value.length <= max;
export const validId = value => typeof value === 'string' && idFormat.test(value);
export const validColor = value => Object.hasOwn(colors, value);

export const starterCalendars = [
  { id: 'personal', type: 'calendar', title: 'Personal', color: 'violet' },
  { id: 'universidad', type: 'calendar', title: 'Universidad', color: 'blue' },
  { id: 'trabajo', type: 'calendar', title: 'Trabajo', color: 'teal' }
];

export function validRecord(record) {
  if (!record || !validId(record.id)) return false;
  if (record.type === 'calendar') return str(record.title, 80) && record.title.trim() && validColor(record.color);
  if (record.type === 'note') return str(record.title, 120) && str(record.body, 20000)
    && Boolean(record.title.trim() || record.body.trim()) && typeof record.pinned === 'boolean'
    && isDate(record.updated, timeFormat);
  if (record.type !== 'event') return false;
  const format = record.allDay ? dayFormat : timeFormat;
  return str(record.title, 120) && record.title.trim() && str(record.description, 5000)
    && str(record.location, 250) && validId(record.calendarId) && typeof record.allDay === 'boolean'
    && isDate(record.start, format) && isDate(record.end, format) && record.start < record.end;
}

const ownFields = {
  calendar: ['title', 'color'],
  note: ['title', 'body', 'pinned', 'updated'],
  event: ['title', 'description', 'location', 'calendarId', 'allDay', 'start', 'end']
};

export function ownRecord(record) {
  if (!validRecord(record) || record.id.startsWith('g:') || (record.id === 'personal' && record.type !== 'calendar')) return null;
  const { id, type } = record;
  return { id, type, ...Object.fromEntries(ownFields[type].map(field => [field, record[field]])) };
}

export function backupChanges(backup, existing) {
  if (backup?.version !== 1 || !Array.isArray(backup.records)) throw new Error('El archivo no es una copia de Chronix.');
  const current = new Map(existing.map(record => [record.id, record]));
  const starters = new Map(starterCalendars.map(record => [record.id, record]));
  const imported = new Map();
  for (const record of backup.records) {
    const clean = ownRecord(record);
    if (!clean || imported.has(clean.id) || record.google || record.sample || record.deleted) {
      throw new Error('La copia contiene registros inválidos o duplicados.');
    }
    imported.set(clean.id, clean);
  }
  const changes = [...imported.values()].filter(record => {
    const previous = current.get(record.id);
    if (!previous) return true;
    const starter = starters.get(record.id);
    return starter && record.type === 'calendar' && previous.type === 'calendar'
      && previous.title === starter.title && previous.color === starter.color
      && (record.title !== previous.title || record.color !== previous.color);
  });
  return changes.sort((a, b) => Number(b.type === 'calendar') - Number(a.type === 'calendar'));
}

export function applyRecords(records, changes) {
  const byId = new Map(records.map(record => [record.id, record]));
  for (const { id, record } of changes) {
    if (record === null) byId.delete(id);
    else byId.set(id, record);
  }
  return [...byId.values()];
}
