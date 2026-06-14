const CACHE_NAME = 'stock-list-pwa-cache-v1';
const urlsToCache = [
  'stock.html',
  'stock_manifest.json'
];

// インストール時にキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// フェッチ時にキャッシュから返す（またはネットワークから取得）
self.addEventListener('fetch', event => {
  // Google Apps Script や外部リソースへのリクエストはキャッシュしない
  if (event.request.url.includes('script.google.com') || event.request.url.includes('googleusercontent.com')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
