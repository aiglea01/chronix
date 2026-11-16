import { asDay, dateKey, escapeHtml as h, fullDate, monthCells, monthTitle, onDay, pad, plusDays, timeLabel } from '../dates.js';
import { icon } from '../icons.js';

const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const eventTime = event => event.allDay ? 'Todo el día' : `${timeLabel(event.start)}–${timeLabel(event.end)}`;
export const button = (name, action, label, value = '') =>
  `<button type="button" class="icon-button" data-action="${action}" data-value="${h(value)}" aria-label="${label}" title="${label}">${icon(name)}</button>`;

export function monthGrid(ctx, compact = false) {
  const { month, day, events, tone, now } = ctx;
  return `<div class="month-grid ${compact ? 'compact' : 'expanded'}">
    ${weekdays.map(label => `<span class="weekday">${label}</span>`).join('')}
    ${monthCells(month, compact).map(date => {
      const key = dateKey(date);
      const records = events.filter(event => onDay(event, key));
      const classes = [date.getMonth() !== month.getMonth() ? 'adjacent' : '', key === day ? 'selected' : '', key === now ? 'current' : ''].join(' ');
      if (compact) {
        const dots = [...new Set(records.map(tone))].slice(0, 3).map(color => `<i class="dot tone-${color}"></i>`).join('');
        return `<button class="month-day ${classes}" data-action="pick" data-value="${key}" aria-pressed="${key === day}"
          aria-label="${fullDate(date)}, ${records.length} eventos"><span>${date.getDate()}</span><span class="day-dots">${dots}</span></button>`;
      }
      return `<div class="month-cell ${classes}">
        <button class="cell-day" data-action="pick" data-value="${key}" aria-pressed="${key === day}" aria-label="${fullDate(date)}">${date.getDate()}</button>
        ${records.slice(0, 3).map(event => `<button class="month-event tone-${tone(event)}" data-action="event" data-value="${h(event.id)}" title="${h(event.title)}">${event.allDay ? '' : `<small>${timeLabel(event.start)}</small> `}${h(event.title)}</button>`).join('')}
        ${records.length > 3 ? `<button class="more-events" data-action="show-day" data-value="${key}">+${records.length - 3} más</button>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

export function miniMonth(ctx) {
  return `<section class="panel month-panel">
    <header class="panel-header"><span class="panel-icon">${icon('calendar', 17)}</span><h2>Calendario</h2>
      ${button('arrow', 'nav', 'Abrir calendario', 'calendar')}
    </header>
    <div class="month-controls"><h3>${monthTitle(ctx.month)}</h3><div class="inline">
      ${button('left', 'month-step', 'Mes anterior', '-1')}${button('right', 'month-step', 'Mes siguiente', '1')}
    </div></div>
    ${monthGrid(ctx, true)}
  </section>`;
}

// Cada grupo de intervalos solapados comparte el mismo número de columnas.
export function placeEvents(events, day) {
  const startOfDay = asDay(day);
  const endOfDay = asDay(plusDays(day, 1));
  const minute = (iso, isEnd) => {
    const date = new Date(iso);
    if (date <= startOfDay) return 0;
    if (date >= endOfDay) return 1440;
    const m = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    return isEnd && m === 0 ? 1440 : m;
  };
  const items = events.map(event => {
    const start = minute(event.start, false);
    return { event, start, end: Math.min(1440, Math.max(start + 22, minute(event.end, true))) };
  }).sort((a, b) => a.start - b.start || b.end - a.end);
  let group = [];
  let occupied = [];
  const finish = () => {
    for (const item of group) item.columns = occupied.length;
    group = [];
    occupied = [];
  };
  for (const item of items) {
    if (occupied.every(end => end <= item.start)) finish();
    let column = occupied.findIndex(end => end <= item.start);
    if (column < 0) column = occupied.length;
    occupied[column] = item.end;
    item.column = column;
    group.push(item);
  }
  finish();
  return items;
}

export function agenda(ctx) {
  const records = ctx.events.filter(event => onDay(event, ctx.day));
  const allDay = records.filter(event => event.allDay);
  const timed = placeEvents(records.filter(event => !event.allDay), ctx.day);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const hourHeight = 52;
  return `<section class="panel agenda-panel">
    <header class="panel-header"><span class="panel-icon">${icon('calendar', 17)}</span><h2>Agenda diaria</h2>
      ${button('plus', 'event', 'Añadir evento')}
    </header>
    <div class="agenda-sub">
      <div><h3>${fullDate(asDay(ctx.day))}</h3><p>${records.length ? `${records.length} ${records.length === 1 ? 'evento' : 'eventos'}` : 'Sin eventos programados'}</p></div>
      <div class="inline">${button('left', 'day-step', 'Día anterior', '-1')}${button('right', 'day-step', 'Día siguiente', '1')}</div>
    </div>
    ${allDay.length ? `<div class="all-day"><span>Todo el día</span>${allDay.map(event => `<button class="month-event tone-${ctx.tone(event)}" data-action="event" data-value="${h(event.id)}">${h(event.title)}</button>`).join('')}</div>` : ''}
    <div class="timeline-scroll" data-scroll-hour="${timed.length ? Math.max(0, Math.floor(timed[0].start / 60) - 1) : Math.max(0, now.getHours() - 1)}"
      tabindex="0" role="region" aria-label="Eventos por hora">
      <div class="timeline" style="--hour:${hourHeight}px">
        ${Array.from({ length: 24 }, (_, hour) => `<div class="timeline-row"><span>${pad(hour)}:00</span>
          <button data-action="event-hour" data-value="${hour}" aria-label="Añadir evento a las ${pad(hour)}:00"></button></div>`).join('')}
        <div class="timeline-overlay">
          ${timed.map(({ event, start, end, column, columns }) => `<button class="time-event tone-${ctx.tone(event)}" data-action="event"
            data-value="${h(event.id)}" title="${h(event.title)} · ${eventTime(event)}"
            style="--top:${start / 60 * hourHeight}px;--height:${(end - start) / 60 * hourHeight}px;--left:${column / columns * 100}%;--width:${100 / columns}%">
            <strong>${h(event.title)}</strong><small>${eventTime(event)}</small></button>`).join('')}
          <div class="now-line" data-now-line style="top:${nowMinutes / 60 * hourHeight}px" ${ctx.now !== ctx.day ? 'hidden' : ''}></div>
        </div>
      </div>
    </div>
  </section>`;
}

export function calendarPage(ctx, view) {
  return `<div class="page-heading"><div><h1>Calendario</h1><p>${view === 'month' ? monthTitle(ctx.month) : fullDate(asDay(ctx.day))}</p></div>
    <div class="segmented" aria-label="Vista de calendario">
      ${['month', 'day'].map((mode, index) => `<button data-action="calendar-view" data-value="${mode}" aria-pressed="${view === mode}">${['Mes', 'Día'][index]}</button>`).join('')}
    </div></div>
    ${view === 'day' ? agenda(ctx) : `<section class="panel calendar-page">
      <div class="month-controls"><h2>${monthTitle(ctx.month)}</h2><div class="inline">
      <button class="button secondary small" data-action="today">Hoy</button>
      ${button('left', 'month-step', 'Mes anterior', '-1')}${button('right', 'month-step', 'Mes siguiente', '1')}</div></div>
      <div class="large-month-scroll">${monthGrid(ctx)}</div>
    </section><div class="calendar-selected">${agenda(ctx)}</div>`}`;
}
