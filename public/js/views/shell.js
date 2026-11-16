import { asDay, escapeHtml as h, fullDate } from '../dates.js';
import { icon } from '../icons.js';
import { agenda, button, miniMonth } from './calendar.js';
import { digital, face } from './clock.js';

const pages = {
  home: ['home', 'Panel diario'],
  calendar: ['calendar', 'Calendario'],
  notes: ['note', 'Notas'],
  clocks: ['clock', 'Relojes'],
  settings: ['settings', 'Ajustes']
};

export const themes = { light: 'Claro', dark: 'Oscuro', amoled: 'AMOLED' };

const nav = (key, current) => `<button class="nav-item ${current === key ? 'active' : ''}" data-action="nav" data-value="${key}"
  ${current === key ? 'aria-current="page"' : ''}>${icon(pages[key][0])}<span>${pages[key][1]}</span></button>`;

export function sidebar(ctx, page, store) {
  const calendar = item => `<div class="calendar-filter">
    <button class="filter-name" data-action="filter" data-value="${h(item.id)}" aria-pressed="${!ctx.hidden.includes(item.id)}">
      <span class="dot tone-${item.color}"></span><span>${h(item.title)}</span></button>
    ${item.google ? '' : button('more', 'calendar-edit', 'Editar calendario', item.id)}
  </div>`;
  return `<aside class="sidebar">
    <button class="brand" data-action="nav" data-value="home"><img src="/assets/chronix.svg" alt="" width="36" height="36"><span>Chronix</span></button>
    <div class="sidebar-main">
      <p class="nav-label">ESPACIO PERSONAL</p>
      <nav aria-label="Navegación principal">${['home', 'calendar', 'notes', 'clocks'].map(key => nav(key, page)).join('')}</nav>
      <div class="nav-label calendar-label"><span>MIS CALENDARIOS</span>${button('plus', 'calendar-edit', 'Crear calendario')}</div>
      <div>${ctx.calendars.filter(item => !item.google).map(calendar).join('')}</div>
      ${ctx.calendars.some(item => item.google) ? `<p class="nav-label">GOOGLE CALENDAR</p>
        <div>${ctx.calendars.filter(item => item.google).map(calendar).join('')}</div>` : ''}
    </div>
    <div class="sidebar-bottom">
      ${nav('settings', page)}
      <button class="account" data-action="nav" data-value="settings"><i>${store.profile ? h(store.profile.name[0]?.toUpperCase() ?? 'C') : icon('cloud', 18)}</i>
        <span><strong>${h(store.profile?.name ?? 'Mi espacio')}</strong><small data-sync-status>${h(store.status)}</small></span>${icon('down', 14)}</button>
    </div>
  </aside>`;
}

export function topbar(page, theme) {
  const nextTheme = { light: 'dark', dark: 'amoled', amoled: 'light' }[theme];
  const themeLabel = nextTheme === 'amoled' ? 'AMOLED' : themes[nextTheme].toLowerCase();
  return `<header class="topbar"><div class="breadcrumb">
    <span class="mobile-toggle">${button('menu', 'menu', 'Abrir navegación')}</span>
    <span class="crumb-home">Mi espacio</span><span class="crumb-divider">/</span><strong>${pages[page][1]}</strong></div>
    <div class="top-actions">
      ${button(nextTheme === 'light' ? 'sun' : 'moon', 'theme', 'Activar tema ' + themeLabel, nextTheme)}
      <button class="button secondary present-button" data-action="present" aria-label="Pantalla completa">${icon('expand', 16)}<span>Pantalla completa</span></button>
      <button class="button primary" data-action="event">${icon('plus', 17)}<span>Nuevo evento</span></button>
    </div></header>`;
}

export function noteCards(notes) {
  return notes.map(note => `<button class="note-card" data-action="note" data-value="${h(note.id)}">
    <span class="note-title"><strong>${h(note.title || 'Nota sin título')}</strong>${note.pinned ? icon('pin', 14) : ''}</span>
    ${note.body ? `<span class="note-preview">${h(note.body)}</span>` : ''}
  </button>`).join('');
}

function quickNotes(notes) {
  return `<section class="panel notes-panel">
    <header class="panel-header"><span class="panel-icon">${icon('note', 17)}</span><h2>Notas rápidas</h2>${button('plus', 'note', 'Nueva nota')}</header>
    <form class="quick-form" data-form="quick">
      <label class="sr-only" for="quick-body">Anotar algo rápido</label>
      <textarea id="quick-body" name="body" rows="3" maxlength="20000" placeholder="Escribe una nota rápida…" required></textarea>
      <button class="button secondary small" type="submit">${icon('plus', 15)} Guardar nota</button>
    </form>
    <div class="quick-list">${noteCards(notes.slice(0, 3))}</div>
  </section>`;
}

export function dashboard(ctx, notes, presenting = false) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone.replaceAll('_', ' ');
  return `${presenting ? '' : `<div class="page-heading home-heading">
      <div><h1>Panel diario</h1><p>Tu agenda de un vistazo.</p></div>
      <button class="today-pill" data-action="today">${icon('calendar', 16)} ${fullDate(asDay(ctx.now))}</button>
    </div>`}
    <div class="dashboard">
      <section class="panel clock-panel">
        <header class="panel-header"><span class="panel-icon">${icon('clock', 17)}</span><h2>Hora local</h2>${button('expand', 'clock-present', 'Ampliar reloj analógico', 'analog')}</header>
        <div class="clock-content">${face()}${digital(true)}</div>
        <div class="timezone">${icon('globe', 14)} ${h(timezone)}</div>
      </section>
      ${miniMonth(ctx)}${agenda(ctx)}${quickNotes(notes)}
    </div>`;
}

export function notesPage(notes) {
  return `<div class="page-heading"><div><h1>Notas</h1><p>Ideas, recordatorios y apuntes.</p></div>
      <button class="button primary" data-action="note">${icon('plus', 17)} Nueva nota</button></div>
    <label class="search-box">${icon('search')}<input id="note-search" type="search" placeholder="Buscar una nota" aria-label="Buscar una nota"></label>
    <div id="notes-list" class="notes-grid">${noteCards(notes) || '<p class="empty">Todavía no tienes notas.</p>'}</div>`;
}

export function clocksPage() {
  return `<div class="page-heading"><div><h1>Relojes</h1><p>La hora local en pantalla completa.</p></div></div>
    <div class="clock-choices">
      <button class="panel clock-choice" data-action="clock-present" data-value="analog">${face()}<span>Reloj analógico ${icon('expand')}</span></button>
      <button class="panel clock-choice" data-action="clock-present" data-value="digital">${digital()}<span>Reloj digital ${icon('expand')}</span></button>
    </div>`;
}

export function presentation(ctx, notes, mode) {
  return `<main class="presentation ${mode === 'dashboard' ? 'display-dashboard' : 'display-clock'}">
    <header class="presentation-bar"><button class="button secondary" data-action="exit">${icon('close', 17)} Salir</button>
      ${mode === 'dashboard' ? '' : `<div class="segmented"><button data-action="clock-mode" data-value="analog" aria-pressed="${mode === 'analog'}">Analógico</button>
      <button data-action="clock-mode" data-value="digital" aria-pressed="${mode === 'digital'}">Digital</button></div>`}
      <button class="button secondary" data-action="fullscreen">${icon('expand', 17)} Pantalla completa</button></header>
    ${mode === 'dashboard' ? dashboard(ctx, notes, true) : `<div class="standalone-clock ${mode}">
      ${mode === 'analog' ? face() : digital()}${mode === 'analog' ? digital(true) : '<p class="clock-date" data-clock-date></p>'}
    </div>`}
  </main>`;
}

export function settings(store, installable, hideSamples, showImport, theme) {
  const accounts = store.remote.accounts.map(account => `<div class="setting-row">
    <div><strong>${h(account.name)}</strong><small>${h(account.email)}</small></div>
    <button class="button secondary small" data-action="disconnect" data-value="${h(account.id)}">Desconectar</button></div>`).join('');
  return `<div class="page-heading"><div><h1>Ajustes</h1><p>Tu espacio, tus dispositivos y tus cuentas.</p></div></div>
    <div class="settings-stack">
      <section class="panel settings-panel"><h2>Cuenta y sincronización</h2>
        ${store.profile ? `<div class="setting-row"><div><strong>${h(store.profile.name)}</strong><small>${h(store.profile.email)}</small></div>
          <span class="badge" data-sync-status>${h(store.status)}</span></div>
          <div class="inline wrap"><button class="button secondary" data-action="sync">${icon('refresh', 16)} Sincronizar ahora</button>
          ${showImport ? '<button class="button secondary" data-action="import">Copiar datos locales</button>' : ''}
          <button class="button secondary" data-action="logout">Cerrar sesión</button></div>` : `
          <p>${store.remote.enabled ? 'Usa la misma cuenta de Google para sincronizar tus eventos, calendarios y notas entre dispositivos.' :
            'Tus cambios se guardan en este navegador. La sincronización se activa al configurar Google OAuth en el servidor.'}</p>
          ${store.remote.enabled ? '<a class="button primary" href="/auth/google?mode=login">Iniciar sesión con Google</a>' : ''}`}
      </section>
      ${store.profile ? `<section class="panel settings-panel"><h2>Google Calendar</h2>
        <p>${store.remote.calendarEnabled === false ? 'La conexión con Google Calendar está desactivada en esta instancia.' :
          'Consulta los calendarios personales e institucionales que tus cuentas tengan autorizados.'}</p>
        ${accounts}
        ${store.remote.calendarEnabled !== false ? `<div class="inline wrap"><a class="button secondary" href="/auth/google?mode=connect">${icon('plus', 16)} Conectar cuenta</a>
        ${accounts ? '<button class="button secondary" data-action="refresh-google">Actualizar calendarios</button>' : ''}</div>` : ''}
        ${store.google.warnings.map(warning => `<p class="warning">${h(warning)}</p>`).join('')}
      </section>` : ''}
      <section class="panel settings-panel"><h2>Aplicación</h2>
        ${store.remote.version ? `<p>Chronix ${h(store.remote.version)}</p>` : ''}
        <div class="setting-row appearance-row"><strong>Apariencia</strong>
          <div class="segmented" role="group" aria-label="Tema">
            ${Object.entries(themes).map(([id, label]) => `<button data-action="theme" data-value="${id}"
              aria-pressed="${theme === id}">${label}</button>`).join('')}
          </div>
        </div>
        <div class="setting-row"><div><strong>Instalar Chronix</strong><small>En iPhone o iPad, usa «Añadir a pantalla de inicio» en Safari.</small></div>
          ${installable ? '<button class="button secondary small" data-action="install">Instalar</button>' : ''}</div>
        ${!store.profile ? `<div class="setting-row"><div><strong>Datos de ejemplo</strong><small>Eventos y notas para explorar la app.</small></div>
          <button class="button secondary small" data-action="samples">${hideSamples ? 'Mostrar' : 'Ocultar'}</button></div>` : ''}
        <div class="setting-row"><div><strong>Copia de tus datos</strong><small>Exporta o importa tus calendarios, eventos y notas propios.</small></div>
          <div class="inline wrap">
            <button class="button secondary small" data-action="export">${icon('download', 15)} Exportar JSON</button>
            <button class="button secondary small" data-action="import-backup">Importar JSON</button>
            <input id="import-backup" type="file" accept=".json,application/json" hidden>
          </div></div>
      </section>
    </div>`;
}
