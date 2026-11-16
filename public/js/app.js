import { asDay, dateKey, escapeHtml as h, fullDate, monthCells, plusDays, timeLabel, today } from './dates.js';
import { Store, read, write } from './store.js';
import { backupChanges, validColor } from './model.js';
import { button, calendarPage } from './views/calendar.js';
import { tick } from './views/clock.js';
import { editor, formRecord, googleEvent, switchDates } from './views/forms.js';
import { clocksPage, dashboard, noteCards, notesPage, presentation, settings, sidebar, themes, topbar } from './views/shell.js';

const shell = document.querySelector('#shell');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const store = new Store();
const pages = ['home', 'calendar', 'notes', 'clocks', 'settings'];
const route = () => pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
let page = route();
let lastToday = today();
let day = lastToday;
let month = asDay(day);
let calendarView = 'month';
let display = '';
let menu = false;
let noteSearch = '';
let edit = null;
let installPrompt;
let toastTimer;
const savedTheme = read('theme', '');
const legacyDark = read('dark', matchMedia('(prefers-color-scheme: dark)').matches);
let theme = Object.hasOwn(themes, savedTheme) ? savedTheme : legacyDark ? 'dark' : 'light';

function announce(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3800);
}

function context() {
  const records = store.records;
  const calendars = records.filter(item => item.type === 'calendar');
  const byId = new Map(calendars.map(item => [item.id, item]));
  const hidden = read('hidden.' + store.owner, []);
  const events = records.filter(record => record.type === 'event' && !hidden.includes(record.calendarId))
    .sort((first, second) => Number(second.allDay) - Number(first.allDay) || first.start.localeCompare(second.start));
  const notes = records.filter(item => item.type === 'note').sort((first, second) =>
    Number(second.pinned) - Number(first.pinned) || second.updated.localeCompare(first.updated));
  return { day, month, now: today(), calendars, hidden, events, notes,
    tone: event => validColor(byId.get(event.calendarId)?.color) ? byId.get(event.calendarId).color : 'gray' };
}

function filterNotes(notes) {
  const query = noteSearch.toLocaleLowerCase('es').trim();
  return notes.filter(note => (note.title + ' ' + note.body).toLocaleLowerCase('es').includes(query));
}

function render() {
  const ctx = context();
  const textarea = shell.querySelector('#quick-body');
  const scroll = shell.querySelector('.timeline-scroll');
  const oldDay = shell.dataset.day;
  const active = document.activeElement;
  const draft = textarea?.value;
  const searchFocused = active?.id === 'note-search';
  const writingQuick = active === textarea;
  const cursor = writingQuick ? textarea.selectionStart : null;
  const oldScroll = scroll?.scrollTop;
  const action = shell.contains(active) && active.dataset?.action ? active.dataset.action : '';
  const actionValue = active?.dataset?.value ?? '';
  const root = document.documentElement;
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue('--bg').trim();
  const views = {
    home: () => dashboard(ctx, ctx.notes),
    calendar: () => calendarPage(ctx, calendarView),
    notes: () => notesPage(filterNotes(ctx.notes)),
    clocks: clocksPage,
    settings: () => settings(store, Boolean(installPrompt), read('hideSamples', false),
      store.profile && store.guestRecords().length > 0, theme)
  };
  shell.innerHTML = display ? presentation(ctx, ctx.notes, display) : `
    <div class="app ${menu ? 'menu-open' : ''}">
      <button class="nav-backdrop" data-action="menu" aria-label="Cerrar navegación"></button>
      ${sidebar(ctx, page, store)}
      <div class="workspace">${topbar(page, theme)}<main class="page">${views[page]()}</main></div>
    </div>`;
  shell.dataset.day = day;
  const newScroll = shell.querySelector('.timeline-scroll');
  if (newScroll) newScroll.scrollTop = oldDay === day && oldScroll !== undefined ? oldScroll : Number(newScroll.dataset.scrollHour) * 52;
  const quick = shell.querySelector('#quick-body');
  if (quick && draft) quick.value = draft;
  if (writingQuick && quick) {
    quick.focus({ preventScroll: true });
    quick.setSelectionRange(cursor, cursor);
  }
  const search = shell.querySelector('#note-search');
  if (search) {
    search.value = noteSearch;
    if (searchFocused) search.focus({ preventScroll: true });
  }
  if (action && !modal.open) {
    [...shell.querySelectorAll('[data-action]')].find(item => item.dataset.action === action &&
      (item.dataset.value ?? '') === actionValue && item.getClientRects().length)?.focus({ preventScroll: true });
  }
  tick();
}

function go(next) {
  display = '';
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  page = next;
  menu = false;
  if (location.hash !== '#' + next) history.pushState(null, '', '#' + next);
  render();
  window.scrollTo(0, 0);
}

function chooseDay(key) {
  day = key;
  month = asDay(day);
  render();
  void refreshGoogle();
}

function openEditor(type, id, hour) {
  const record = id ? store.records.find(item => item.id === id && item.type === type) : null;
  if (id && !record) return;
  const calendars = context().calendars.filter(item => !item.google);
  edit = { type, record, day, hour: hour ?? 9, calendars };
  modal.innerHTML = record?.google ? googleEvent(record, record.allDay
    ? `${fullDate(asDay(record.start))} · Todo el día`
    : `${fullDate(new Date(record.start))} · ${timeLabel(record.start)}–${timeLabel(record.end)}`) : editor(edit);
  modal.showModal();
}

function deleteRecord() {
  const { record } = edit;
  const calendar = record.type === 'calendar';
  modal.innerHTML = `<div class="modal-header"><h2 id="modal-title">Confirmar eliminación</h2>${button('close', 'close', 'Cerrar')}</div>
    <div class="form-fields"><p>¿Eliminar «${h(record.title || 'Nota sin título')}»?</p>
    ${calendar ? '<p>Los eventos de este calendario pasarán a Personal.</p>' : ''}</div>
    <footer class="modal-footer"><button class="button secondary" data-action="undo-delete">Cancelar</button>
    <button class="button danger" data-action="delete-confirm">Eliminar</button></footer>`;
}

function commit(records, feedback) {
  try {
    store.mutate(records);
    render();
    announce(feedback);
    return true;
  } catch {
    announce('No se pudo guardar en este navegador.');
    return false;
  }
}

async function importBackup(file) {
  const owner = store.owner;
  if (file.size > 4_000_000) throw new Error('La copia supera los 4 MB.');
  const contents = await file.text();
  if (owner !== store.owner) throw new Error('La sesión cambió. Vuelve a seleccionar el archivo.');
  let backup;
  try { backup = JSON.parse(contents); }
  catch { throw new Error('El archivo debe contener una copia JSON de Chronix.'); }
  const changes = backupChanges(backup, store.state.records);
  if (changes.length) commit(changes, `Registros importados: ${changes.length}.`);
  else announce('La copia ya está en este espacio.');
}

async function refreshGoogle(force = false) {
  const cells = monthCells(month);
  const from = asDay(dateKey(cells[0])).toISOString();
  const to = asDay(plusDays(dateKey(cells.at(-1)), 1)).toISOString();
  const success = await store.refreshGoogle(from, to, force);
  if (force) announce(success ? 'Calendarios consultados.' : 'No se pudo actualizar Google Calendar.');
}

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    announce('Usa el modo de pantalla completa de tu navegador.');
  }
}

async function runAction(action, value) {
  switch (action) {
    case 'nav': go(value); break;
    case 'menu': menu = !menu; render(); break;
    case 'theme':
      if (Object.hasOwn(themes, value)) {
        theme = value;
        write('theme', theme);
        render();
      }
      break;
    case 'pick': chooseDay(value); break;
    case 'show-day': calendarView = 'day'; chooseDay(value); break;
    case 'today': chooseDay(today()); break;
    case 'day-step': chooseDay(plusDays(day, Number(value))); break;
    case 'month-step':
      month = new Date(month.getFullYear(), month.getMonth() + Number(value), 1);
      render();
      void refreshGoogle();
      break;
    case 'calendar-view': calendarView = value; render(); break;
    case 'filter': {
      const key = 'hidden.' + store.owner;
      const hidden = new Set(read(key, []));
      if (hidden.has(value)) hidden.delete(value);
      else hidden.add(value);
      write(key, [...hidden]);
      render();
      break;
    }
    case 'event': openEditor('event', value); break;
    case 'event-hour': openEditor('event', '', Number(value)); break;
    case 'note': openEditor('note', value); break;
    case 'calendar-edit': openEditor('calendar', value); break;
    case 'close': modal.close(); break;
    case 'delete': deleteRecord(); break;
    case 'undo-delete': modal.innerHTML = editor(edit); break;
    case 'delete-confirm': {
      const { record } = edit;
      const moved = record.type === 'calendar' ? store.state.records
        .filter(item => item.type === 'event' && item.calendarId === record.id)
        .map(item => ({ ...item, calendarId: 'personal' })) : [];
      if (record.sample) {
        write('removedSamples', [...read('removedSamples', []), record.id]);
      }
      if (commit([...moved, { id: record.id, deleted: true }], 'Eliminado.')) modal.close();
      break;
    }
    case 'present':
      display = 'dashboard';
      chooseDay(today());
      await fullscreen();
      break;
    case 'clock-present':
      display = value;
      render();
      await fullscreen();
      break;
    case 'clock-mode': display = value; render(); break;
    case 'fullscreen': await fullscreen(); break;
    case 'exit':
      display = '';
      render();
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      break;
    case 'samples': write('hideSamples', !read('hideSamples', false)); render(); break;
    case 'sync': await store.session(); await refreshGoogle(); break;
    case 'refresh-google': await refreshGoogle(true); break;
    case 'logout': {
      const response = await fetch('/api/logout', { method: 'POST' });
      if (!response.ok) throw new Error('No se pudo cerrar la sesión.');
      await store.session();
      break;
    }
    case 'disconnect': {
      const response = await fetch('/api/accounts/' + encodeURIComponent(value), { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo desconectar la cuenta.');
      store.google = { records: [], warnings: [] };
      write('google.' + store.owner, store.google);
      await store.session();
      await refreshGoogle();
      announce('Cuenta desconectada.');
      break;
    }
    case 'import': {
      const existing = new Set(store.state.records.map(record => record.id));
      const records = store.guestRecords().filter(record => !existing.has(record.id) || ['personal', 'universidad', 'trabajo'].includes(record.id));
      commit(records, 'Datos locales copiados a tu cuenta.');
      break;
    }
    case 'import-backup': shell.querySelector('#import-backup').click(); break;
    case 'export': {
      const output = new Blob([JSON.stringify({ version: 1, records: store.state.records }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(output);
      const anchor = Object.assign(document.createElement('a'), { href: url, download: `chronix-${today()}.json` });
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    case 'install':
      await installPrompt?.prompt();
      installPrompt = null;
      render();
      break;
  }
}

document.addEventListener('click', event => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  void runAction(control.dataset.action, control.dataset.value ?? '').catch(error => announce(error.message));
});

document.addEventListener('submit', event => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  if (form.dataset.form === 'quick') {
    const body = form.elements.body.value.trim();
    if (!body) { announce('Escribe algo para guardar la nota.'); return; }
    const record = { id: crypto.randomUUID(), type: 'note', title: '', body, pinned: false, updated: new Date().toISOString() };
    if (commit([record], 'Nota guardada.')) shell.querySelector('#quick-body').value = '';
    return;
  }
  try {
    if (commit([formRecord(form, edit.record)], 'Cambios guardados.')) modal.close();
  } catch (error) {
    form.querySelector('.form-error').textContent = error.message;
  }
});

document.addEventListener('change', event => {
  if (event.target.name === 'allDay') switchDates(event.target.form);
  if (event.target.id === 'import-backup') {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) void importBackup(file).catch(error => announce(error.message));
  }
});
document.addEventListener('input', event => {
  if (event.target.id !== 'note-search') return;
  noteSearch = event.target.value;
  shell.querySelector('#notes-list').innerHTML = noteCards(filterNotes(context().notes)) || '<p class="empty">No hay notas que coincidan.</p>';
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !modal.open && !document.fullscreenElement && display) void runAction('exit');
});
window.addEventListener('popstate', () => {
  page = route();
  menu = false;
  void runAction('exit');
});
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; render(); });
window.addEventListener('online', () => void initialize());
window.addEventListener('storage', event => {
  if (event.key === 'chronix.v1.theme') {
    const value = read('theme', '');
    if (Object.hasOwn(themes, value)) { theme = value; render(); }
  }
  if (event.key?.startsWith('chronix.v1.records.') || event.key === 'chronix.v1.profile') {
    store.profile = read('profile', null);
    store.load();
    render();
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) void initialize(); });

store.onChange = render;
store.onStatus = () => document.querySelectorAll('[data-sync-status]').forEach(item => { item.textContent = store.status; });
async function initialize() {
  try { await store.session(); await refreshGoogle(); }
  catch { if (store.profile) { store.status = 'Sin conexión'; store.onStatus(); } }
}

render();
const auth = new URLSearchParams(location.search).get('auth');
if (auth) {
  announce(({ ok: 'Cuenta autenticada.', connected: 'Cuenta de calendario conectada.', denied: 'Esta cuenta no tiene acceso a este espacio de Chronix.', consent: 'Google no concedió acceso al calendario.', failed: 'No se pudo completar el acceso con Google.' })[auth] ?? 'Ajustes de cuenta actualizados.');
  history.replaceState(null, '', location.pathname + '#settings');
  go('settings');
}
void initialize();
let pollCount = 0;
setInterval(() => {
  if (document.hidden) return;
  pollCount += 1;
  if (pollCount % 4 === 0) void initialize();
  else { void store.sync(); void refreshGoogle(); }
}, 15000);
setInterval(() => {
  const now = new Date();
  const key = dateKey(now);
  if (key !== lastToday) {
    if (day === lastToday) chooseDay(key);
    lastToday = key;
    render();
  }
  tick(now);
  const line = shell.querySelector('[data-now-line]');
  if (line) line.style.top = `${(now.getHours() * 60 + now.getMinutes()) / 60 * 52}px`;
}, 1000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
