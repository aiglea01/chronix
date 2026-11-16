import { escapeHtml as h, pad, plusDays, toInputDateTime } from '../dates.js';
import { colors, validRecord } from '../model.js';
import { button } from './calendar.js';

const options = (items, selected) => items.map(([id, name]) =>
  `<option value="${h(id)}" ${id === selected ? 'selected' : ''}>${h(name)}</option>`).join('');
const field = (label, name, value, max, required = false) =>
  `<label>${label}<input name="${name}" value="${h(value)}" maxlength="${max}" ${required ? 'required' : ''}></label>`;
const area = (label, name, value, max) =>
  `<label>${label}<textarea name="${name}" maxlength="${max}" rows="4">${h(value)}</textarea></label>`;

function eventFields(record, day, hour, calendars) {
  const allDay = record?.allDay ?? false;
  const time = `${day}T${pad(hour)}:00`;
  const end = hour === 23 ? `${plusDays(day, 1)}T00:00` : `${day}T${pad(hour + 1)}:00`;
  return `${field('Título', 'title', record?.title, 120, true)}
    <label>Calendario<select name="calendarId">${options(calendars.map(item => [item.id, item.title]), record?.calendarId ?? 'personal')}</select></label>
    <label class="checkbox"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''}>Todo el día</label>
    <div class="form-row">
      <label>Inicio<input name="start" type="${allDay ? 'date' : 'datetime-local'}" value="${record ? (allDay ? record.start : toInputDateTime(record.start)) : time}" required></label>
      <label data-end-label>${allDay ? 'Último día' : 'Fin'}<input name="end" type="${allDay ? 'date' : 'datetime-local'}" value="${record ? (allDay ? plusDays(record.end, -1) : toInputDateTime(record.end)) : end}" required></label>
    </div>
    ${field('Ubicación', 'location', record?.location, 250)}
    ${area('Descripción', 'description', record?.description, 5000)}`;
}

export function editor({ type, record, day, hour, calendars }) {
  const names = { event: 'evento', note: 'nota', calendar: 'calendario' };
  const end = type === 'note' ? 'Nueva' : 'Nuevo';
  const label = record ? 'Editar' : end;
  const fields = {
    event: () => eventFields(record, day, hour, calendars),
    note: () => `${field('Título', 'title', record?.title, 120)}${area('Contenido', 'body', record?.body, 20000)}
      <label class="checkbox"><input type="checkbox" name="pinned" ${record?.pinned ? 'checked' : ''}>Fijar nota</label>`,
    calendar: () => `${field('Nombre', 'title', record?.title, 80, true)}
      <label>Color<select name="color">${options(Object.entries(colors), record?.color ?? 'violet')}</select></label>`
  };
  return `<form data-form="${type}">
    <header class="modal-header"><h2 id="modal-title">${label} ${names[type]}</h2>${button('close', 'close', 'Cerrar')}</header>
    <div class="form-fields">${fields[type]()}</div>
    <p class="form-error" role="alert"></p>
    <footer class="modal-footer">${record && record.id !== 'personal' ? '<button type="button" class="button danger" data-action="delete">Eliminar</button>' : ''}
      <button class="button secondary" type="button" data-action="close">Cancelar</button>
      <button class="button primary" type="submit">Guardar</button>
    </footer>
  </form>`;
}

export function switchDates(form) {
  const { start, end, allDay } = form.elements;
  const startValue = start.value;
  const endValue = end.value;
  const label = form.querySelector('[data-end-label]').firstChild;
  if (allDay.checked) {
    start.type = end.type = 'date';
    start.value = startValue.slice(0, 10);
    end.value = endValue.endsWith('T00:00') ? plusDays(endValue.slice(0, 10), -1) : endValue.slice(0, 10);
    label.textContent = 'Último día';
  } else {
    start.type = end.type = 'datetime-local';
    start.value = startValue ? startValue + 'T09:00' : '';
    end.value = endValue ? endValue + 'T10:00' : '';
    label.textContent = 'Fin';
  }
}

export function formRecord(form, previous) {
  const type = form.dataset.form;
  const data = new FormData(form);
  const value = name => String(data.get(name) ?? '').trim();
  const common = { type, id: previous?.id ?? crypto.randomUUID(), title: value('title') };
  let record;
  if (type === 'calendar') record = { ...common, color: value('color') };
  if (type === 'note') record = { ...common, body: value('body'), pinned: data.has('pinned'), updated: new Date().toISOString() };
  if (type === 'event') {
    const allDay = data.has('allDay');
    const toIso = (input, original) => {
      if (original && !previous.allDay && input === toInputDateTime(original)) return original;
      const converted = new Date(input);
      if (!Number.isFinite(+converted) || toInputDateTime(converted) !== input) throw new Error('La hora elegida no existe en tu zona horaria.');
      return converted.toISOString();
    };
    record = {
      ...common, allDay, calendarId: value('calendarId'), description: value('description'), location: value('location'),
      start: allDay ? value('start') : toIso(value('start'), previous?.start),
      end: allDay ? plusDays(value('end'), 1) : toIso(value('end'), previous?.end)
    };
  }
  if (!validRecord(record)) throw new Error(type === 'event' ? 'Revisa el título y que el fin sea posterior al inicio.' : 'Escribe un nombre o contenido para guardar.');
  return record;
}

export function googleEvent(record, when) {
  const url = record.url && /^https:\/\/calendar\.google\.com\//.test(record.url) ? record.url : '';
  return `<div class="modal-header"><h2 id="modal-title">${h(record.title)}</h2>${button('close', 'close', 'Cerrar')}</div>
    <div class="form-fields imported-event"><span class="badge">Google Calendar · solo lectura</span>
    <p>${h(when)}</p>${record.location ? `<p>${h(record.location)}</p>` : ''}${record.description ? `<p>${h(record.description)}</p>` : ''}</div>
    ${url ? `<footer class="modal-footer"><a class="button primary" target="_blank" rel="noopener noreferrer" href="${h(url)}">Abrir en Google Calendar</a></footer>` : ''}`;
}
