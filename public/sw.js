/* خدمة التطبيق: تُخزّن ملفات الواجهة للتشغيل دون شبكة، وتطلب مزامنة عند عودة الاتصال. */
const CACHE = 'sijl-cache-v4';
const SCOPE = self.registration.scope;
const CORE = [
  SCOPE,
  SCOPE + 'index.html',
  SCOPE + 'manifest.webmanifest',
  SCOPE + 'icon.svg',
  SCOPE + 'icon-192.png',
  SCOPE + 'icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && new URL(request.url).origin === self.location.origin) {
    const copy = response.clone();
    const cache = await caches.open(CACHE);
    cache.put(request, copy).catch(() => undefined);
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE);
      cache.put(request, copy).catch(() => undefined);
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(' offline ', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

function notifyClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => clients.forEach((client) => client.postMessage({ type: 'SIJL_SYNC_NOW' })));
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sijl-outbox-sync') event.waitUntil(notifyClients());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SIJL_SYNC') event.waitUntil(notifyClients());
});
