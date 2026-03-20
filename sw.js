/**
 * ======================================================
 * GESTIA PREMIUM - SERVICE WORKER v5.33 (SAFE IMPROVED)
 * Proyecto: fixgo-44e4d
 * Lead Architect: Heberto Mendoza
 * ======================================================
 */

// 1. IMPORTACIONES CRÍTICAS
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 🔥 Configuración de Caché
const CACHE_NAME = 'gestia-premium-cache-v3.4';

const urlsToCache = [
  '/',
  '/manifest.json',
  '/assets/icono-192.png',
  '/assets/icono-512.png'
];

// 2. INICIALIZAR FIREBASE
firebase.initializeApp({
  apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0",
  authDomain: "fixgo-44e4d.firebaseapp.com",
  projectId: "fixgo-44e4d",
  storageBucket: "fixgo-44e4d.firebasestorage.app",
  messagingSenderId: "1005526685116",
  appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
});

// Soporte seguro para navegadores
let messaging = null;

if (firebase.messaging.isSupported()) {
  messaging = firebase.messaging();
}

/**
 * RECEPTOR DE NOTIFICACIONES EN SEGUNDO PLANO
 */

if (messaging) {

  messaging.onBackgroundMessage((payload) => {

    console.log('[Gestia SW] Recibido Push en background:', payload);

    const notificationTitle =
      payload.notification?.title || '🚨 NUEVA ORDEN GESTIA';

    const notificationOptions = {

      body:
        payload.notification?.body ||
        'Atención: Tienes una nueva asignación pendiente.',

      icon: '/assets/icono-192.png',
      badge: '/assets/icono-192.png',

      vibrate: [500,110,500,110,450,110,200,110,170,40,450,110,200,110,170,40,500],

      // Anti duplicado por orden
      tag: payload.data?.orderId || 'gestia-urgent-alert',

      renotify: true,
      requireInteraction: true,

      priority: 'high',

      data: {
        url: payload.data?.url || '/',
        type: payload.data?.type || 'B2B_ORDER',
        orderId: payload.data?.orderId || null
      }

    };

    return self.registration.showNotification(
      notificationTitle,
      notificationOptions
    );

  });

}

// 3. ACCIÓN AL TOCAR LA NOTIFICACIÓN
self.addEventListener('notificationclick', (event) => {

  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(

    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(windowClients => {

      for (let i = 0; i < windowClients.length; i++) {

        let client = windowClients[i];

        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }

      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

    })

  );

});

// 4. CICLO DE VIDA: INSTALACIÓN
self.addEventListener('install', event => {

  console.log('[Gestia SW] Instalando nueva antena de radio...');

  self.skipWaiting();

  event.waitUntil(

    caches.open(CACHE_NAME).then(cache => {

      console.log('[Gestia SW] Asegurando archivos críticos en caché...');

      return cache.addAll(urlsToCache);

    })

  );

});

// 5. CICLO DE VIDA: ACTIVACIÓN
self.addEventListener('activate', event => {

  console.log('[Gestia SW] Antena Activa. Limpiando frecuencias antiguas...');

  event.waitUntil(

    caches.keys().then(cacheNames => {

      return Promise.all(

        cacheNames.map(name => {

          if (name !== CACHE_NAME) {

            console.log('[Gestia SW] Eliminando caché obsoleta:', name);

            return caches.delete(name);

          }

        })

      );

    })

  );

  self.clients.claim();

});

/**
 * ACTUALIZACIÓN FORZADA DEL SW
 */

self.addEventListener('message', (event) => {

  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }

});

/**
 * ESTRATEGIA DE RED: FETCH OPTIMIZADO
 */

self.addEventListener('fetch', event => {

  const url = event.request.url;

  // Ignorar Firebase / Google
  if (
    url.includes('gstatic.com') ||
    url.includes('googleapis.com')
  ) {
    return;
  }

  event.respondWith(

    fetch(event.request)

      .then(response => {

        // Guardar en caché dinámicamente
        const clone = response.clone();

        caches.open(CACHE_NAME)
          .then(cache => cache.put(event.request, clone));

        return response;

      })

      .catch(() => {

        return caches.match(event.request)
          .then(response => {

            return response || new Response(
              'Gestia: Modo Offline - Señal no disponible',
              {
                status: 404,
                statusText: 'Not Found'
              }
            );

          });

      })

  );

});
