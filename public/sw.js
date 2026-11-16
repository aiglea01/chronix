const CACHE = 'chronix-shell-v3';
const APP = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest', '/assets/chronix.svg', '/assets/chronix-192.png',
  '/assets/chronix-512.png', '/assets/chronix-maskable-512.png', '/js/app.js', '/js/store.js',
  '/js/icons.js', '/js/dates.js', '/js/model.js', '/js/views/calendar.js', '/js/views/clock.js',
  '/js/views/forms.js', '/js/views/shell.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('chronix-shell-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!APP.includes(url.pathname)) return;
  event.respondWith(fetch(request).then(async response => {
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(url.pathname, response.clone());
    }
    return response;
  }).catch(() => caches.match(url.pathname)));
});
