/**
 * ======================================================
 * FIXGO CORE - SERVICE WORKER v1.1 (PWA/APK BLINDADO + PUSH ENGINE)
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

// ======================================================================================
// 🔔 MOTOR DE NOTIFICACIONES PUSH (INYECCIÓN PARA V5.18.1)
// Permite recibir alertas incluso si la app está en segundo plano o minimizada
// ======================================================================================

// 4. ESCUCHA DE NOTIFICACIONES PUSH 
self.addEventListener('push', (event) => {
    // Si viene payload, lo leemos. Si no, ponemos un mensaje por defecto.
    const data = event.data ? event.data.json() : { titulo: 'FixGo', cuerpo: 'Tienes una nueva alerta en el panel.' };
    
    const options = {
        body: data.cuerpo,
        icon: 'icono-192.png', // Asegúrate de tener este icono en tu carpeta raíz
        badge: 'icono-192.png', // Icono pequeño que sale en la barra superior de Android
        vibrate: [200, 100, 200, 100, 200], // Patrón de vibración táctico
        requireInteraction: true // La notificación se queda en pantalla hasta que el usuario la toque
    };

    event.waitUntil(
        self.registration.showNotification(data.titulo, options)
    );
});

// 5. ACCIÓN AL TOCAR LA NOTIFICACIÓN (Abre o enfoca la app)
self.addEventListener('notificationclick', (event) => {
    event.notification.close(); // Cierra el pop-up de la notificación
    
    // Enfoca la pestaña de la app si ya está abierta en el navegador/PWA
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then( windowClients => {
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if (client.url.includes('/') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Si estaba totalmente cerrada, la vuelve a abrir
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
