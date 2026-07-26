const CACHE_NAME = 'spa-manager-v49';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './js/main.js',
  './js/storage.js',
  './js/calculator.js',
  './js/maintenance.js',
  './js/charts.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Installation : mise en cache initiale des ressources
self.addEventListener('install', event => { 
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', event => { 
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    ); 
});

// Interception des requêtes : Réseau en priorité avec fallback sur le cache
self.addEventListener('fetch', event => { 
    // Ne pas intercepter les requêtes non-GET
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Si la réponse est valide, mettre à jour le cache
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Fallback sur le cache en mode hors-ligne
                return caches.match(event.request);
            })
    ); 
});