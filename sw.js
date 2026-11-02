/* ENAPP service worker
 * 目标：装到主屏幕后完全离线可用。
 * 页面走「先读缓存、后台更新」，内容库走「先看网络、失败再读缓存」。
 *
 * 注意：这里没有图标、没有任何额外文件。少一个文件就少一种上传出错的可能，
 * 而且缓存是逐个文件进行的——某个文件 404 不会把整个安装搞挂。
 */

const VERSION = 'enapp-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 内容库：网络优先，改了能立刻生效；断网时用缓存
  if (url.pathname.endsWith('content.js')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // 页面跳转：缓存优先，保证离线永远打得开
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html')
        .then((r) => r || fetch(req))
        .catch(() => fetch(req))
    );
    return;
  }

  // 其余静态资源：缓存优先，后台静默更新
  e.respondWith(
    caches.match(req).then((cached) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
