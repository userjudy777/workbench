/* 个人工作台 Service Worker — 离线兜底缓存 */
const CACHE = 'workbuddy-pwa-v2';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // API 请求不缓存（数据要新鲜），失败时也不做兜底
  if (url.pathname.startsWith('/api/')) return;

  // HTML 导航：网络优先，失败回退缓存（离线时仍能打开页面）
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 静态资源：缓存优先，后台更新
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetching = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetching;
    })
  );
});
