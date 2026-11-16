const localDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' });
const displayMonth = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const shortTime = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const upper = value => value ? value[0].toLocaleUpperCase('es') + value.slice(1) : '';
export const pad = n => String(n).padStart(2, '0');
export const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const asDay = key => new Date(`${key}T00:00:00`);
export const today = () => dateKey(new Date());
export const fullDate = date => upper(localDate.format(date));
export const monthTitle = date => upper(displayMonth.format(date));
export const timeLabel = value => shortTime.format(new Date(value));
export const plusDays = (day, by) => {
  const date = asDay(day);
  date.setDate(date.getDate() + by);
  return dateKey(date);
};
export function monthCells(month, compact = false) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const count = compact ? Math.ceil((offset + daysInMonth) / 7) * 7 : 42;
  return Array.from({ length: count }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 - offset + i));
}
export function onDay(event, day) {
  if (event.allDay) return event.start <= day && day < event.end;
  return new Date(event.start) < asDay(plusDays(day, 1)) && new Date(event.end) > asDay(day);
}
export function toInputDateTime(iso) {
  const date = new Date(iso);
  return `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function escapeHtml(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, chr => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[chr]);
}
