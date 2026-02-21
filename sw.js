/**
 * ======================================================
 * FIXGO CORE - SERVICE WORKER v1.0 (PWA/APK BLINDADO)
 * ======================================================
 */
const CACHE_NAME = 'fixgo-premium-cache-v1';

// Archivos estáticos básicos para arranque (No cacheamos Firebase para proteger el tiempo real)
const urlsToCache = [
  '/',
  '/manifest.json'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('FixGo Service Worker: Caché abierto y listo.');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Limpieza de cachés antiguos al actualizar la app
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('FixGo Service Worker: Borrando caché antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estrategia "Network First" (Primero la red, luego la caché si falla la conexión)
// Vital para mantener el flujo de datos y el GPS de Firebase intactos.
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
