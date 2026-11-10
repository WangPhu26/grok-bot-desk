/* sw.js — service worker: caches the app shell; shows push notifications.
   The FOMO link comes from the push payload (data.link) — never built here. */
var SHELL = ['./', './index.html', './app.css', './app.js', './chart.js', './manifest.json'];
var CACHE = 'grokbot-v1';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // Data JSON is always fresh from the network; the shell may come from cache.
  if (url.pathname.indexOf('/d/') !== -1) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    });
  }));
});

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data ? e.data.text() : '' }; }
  var title = data.title || 'Grok Bot';
  var options = {
    body: data.body || '',
    data: { link: data.link || null },
    actions: data.link ? [{ action: 'open-fomo', title: 'Open on FOMO' }] : []
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var link = e.notification.data && e.notification.data.link;
  if (!link) return;
  e.waitUntil(clients.openWindow(link));
});
