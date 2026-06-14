const CACHE_NAME = 'recipe-pwa-cache-v1';
const urlsToCache = [
  'recipe.html',
  'recipe_manifest.json',
  'assets/recipe_icon_192.png',
  'assets/recipe_icon_512.png',
  'assets/default_recipe.jpg'
];

// インストール時にアプリシェルをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// アクティベート時に古いキャッシュをクリーンアップ
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// フェッチ処理
self.addEventListener('fetch', event => {
  // GAS APIや外部のGoogle Drive APIなどへのリクエストはキャッシュしない（ネットワーク優先、フロント側でIndexedDB制御）
  if (
    event.request.url.includes('script.google.com') ||
    event.request.url.includes('googleusercontent.com') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュに存在すればそれを返し、なければネットワークから取得
        if (response) {
          return response;
        }
        return fetch(event.request).then(networkResponse => {
          // 取得したリソースを動的にキャッシュ（アセット類）
          // httpまたはhttpsスキームのみキャッシュに保存する（拡張機能などchrome-extensionスキーム対策）
          if (networkResponse && networkResponse.status === 200 && (event.request.url.startsWith('http://') || event.request.url.startsWith('https://'))) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(err => {
          console.error('[Service Worker] Fetch failed:', err);
          // 代替画像を返すなどの処理（必要に応じて）
          if (event.request.url.includes('default_recipe')) {
            return caches.match('assets/default_recipe.jpg');
          }
        });
      })
  );
});
