const C = 'qt-v10';
const A = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => e.waitUntil(
  caches.open(C).then(c => c.addAll(A)).then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

// Ưu tiên mạng để cập nhật nhanh, mất mạng thì dùng bản đã lưu
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const h = new URL(e.request.url).hostname;
  if (h !== self.location.hostname && h !== 'cdn.jsdelivr.net') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(C).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
