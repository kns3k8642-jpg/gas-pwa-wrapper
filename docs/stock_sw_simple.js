// 簡易版 Service Worker (PWA要件を満たすためのダミー)
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  // キャッシュ処理なしで、ネットワークリクエストをそのまま通過させる
  event.respondWith(fetch(event.request));
});
