import { fullDate, pad } from '../dates.js';

export function face() {
  const ticks = Array.from({ length: 60 }, (_, idx) => {
    const major = idx % 5 === 0;
    return `<line class="${major ? 'major' : ''}" x1="100" x2="100" y1="9" y2="${major ? 18 : 13}" transform="rotate(${idx * 6} 100 100)"/>`;
  }).join('');
  const numbers = Array.from({ length: 12 }, (_, idx) => {
    const angle = idx * Math.PI / 6;
    return `<text x="${100 + Math.sin(angle) * 67}" y="${100 - Math.cos(angle) * 67}">${idx || 12}</text>`;
  }).join('');
  return `<svg class="clock-face" viewBox="0 0 200 200" aria-hidden="true">
    <circle class="clock-rim" cx="100" cy="100" r="98"/>
    <g class="clock-ticks">${ticks}</g><g class="clock-numbers">${numbers}</g>
    <path class="clock-hand hour" data-hand="hour" d="M100 107V59"/>
    <path class="clock-hand minute" data-hand="minute" d="M100 110V37"/>
    <path class="clock-hand second" data-hand="second" d="M100 116V22"/>
    <circle class="clock-hub" cx="100" cy="100" r="3.8"/>
  </svg>`;
}

export function digital(withDate = false) {
  return `<div class="digital-clock"><time data-clock-time></time><span data-clock-seconds></span></div>${withDate ? '<p class="clock-date" data-clock-date></p>' : ''}`;
}

export function tick(now = new Date()) {
  const [hours, minutes, seconds] = [now.getHours(), now.getMinutes(), now.getSeconds()];
  const rotation = { hour: hours * 30 + minutes / 2, minute: minutes * 6 + seconds / 10, second: seconds * 6 };
  document.querySelectorAll('[data-hand]').forEach(hand => hand.setAttribute('transform', `rotate(${rotation[hand.dataset.hand]} 100 100)`));
  document.querySelectorAll('[data-clock-time]').forEach(time => {
    time.textContent = `${pad(hours)}:${pad(minutes)}`;
    time.dateTime = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  });
  document.querySelectorAll('[data-clock-seconds]').forEach(item => { item.textContent = pad(seconds); });
  document.querySelectorAll('[data-clock-date]').forEach(item => { item.textContent = fullDate(now); });
}
