/**
 * ======================================================
 * GESTIA PREMIUM - SERVICE WORKER v5.34 (FCM HARDENED)
 * Proyecto: fixgo-44e4d
 * Lead Architect: Heberto Mendoza
 * ======================================================
 */

// 1. IMPORTACIONES CRÍTICAS
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 🔥 Configuración de Caché
const CACHE_NAME = 'gestia-premium-cache-v3.5';

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

// Soporte seguro
let messaging = null;

if (firebase.messaging.isSupported()) {
  messaging = firebase.messaging();
}

/**
 * ======================================================
 * FCM BACKGROUND ENGINE (V5.35 HARDENED)
 * Manejo robusto para payload notification + data
 * ======================================================
 */

if (messaging) {

  messaging.onBackgroundMessage((payload) => {

    console.log('[Gestia SW] Push FCM recibido:', payload);

    /**
     * Firebase puede enviar payload en dos formatos:
     * 
     * 1️⃣ notification (Firebase Console)
     * 2️⃣ data (Admin SDK / Cloud Functions)
     */

    const notificationPayload = payload.notification || payload.data || {};

    const title =
      notificationPayload.title ||
      "🚨 NUEVA ORDEN GESTIA";

    const body =
      notificationPayload.body ||
      notificationPayload.mensaje ||
      "Tienes una nueva orden asignada";

    const orderId =
      payload.data?.orderId ||
      notificationPayload.orderId ||
      null;

    const targetUrl =
      payload.data?.url ||
      notificationPayload.url ||
      '/';

    const options = {

      body: body,

      icon: '/assets/icono-192.png',
      badge: '/assets/icono-192.png',

      vibrate: [500,110,500,110,450,110],

      requireInteraction: true,
      renotify: true,

      tag: orderId || `gestia-${Date.now()}`,

      data: {
        url: targetUrl,
        orderId: orderId
      }

    };

    console.log('[Gestia SW] Mostrando notificación:', title);

    return self.registration.showNotification(title, options);

  });

}
/**
 * CAPTURA UNIVERSAL DE PUSH
 * (para pruebas de Firebase Console)
 */

self.addEventListener('push', (event) => {

  console.log('[Gestia SW] Evento PUSH detectado');

  let payload = {};

  try {
    payload = event.data.json();
  } catch (e) {
    payload = { notification: { title: "Gestia", body: "Nueva notificación" }};
  }

  const title =
    payload.notification?.title ||
    payload.data?.title ||
    "🚨 NUEVA ORDEN GESTIA";

  const options = {

    body:
      payload.notification?.body ||
      payload.data?.body ||
      "Tienes una nueva orden asignada",

    icon: '/assets/icono-192.png',
    badge: '/assets/icono-192.png',

    vibrate: [500,110,500,110,450,110],

    requireInteraction: true,
    renotify: true,

    tag: payload.data?.orderId || "gestia-alert",

    data: {
      url: payload.data?.url || '/',
      orderId: payload.data?.orderId || null
    }

  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );

});

// 3. CLICK EN NOTIFICACIÓN
self.addEventListener('notificationclick', (event) => {

  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(

    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(windowClients => {

      for (let client of windowClients) {

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

// 4. INSTALACIÓN
self.addEventListener('install', (event) => {

  console.log('[Gestia SW] Instalando...');

  self.skipWaiting();

  event.waitUntil(

    caches.open(CACHE_NAME).then(cache => {

      console.log('[Gestia SW] Cacheando archivos críticos');

      return cache.addAll(urlsToCache);

    })

  );

});

// 5. ACTIVACIÓN
self.addEventListener('activate', (event) => {

  console.log('[Gestia SW] Activado');

  event.waitUntil(

    caches.keys().then(cacheNames => {

      return Promise.all(

        cacheNames.map(name => {

          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }

        })

      );

    })

  );

  self.clients.claim();

});

/**
 * UPDATE FORZADO
 */

self.addEventListener('message', (event) => {

  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }

});

/**
 * FETCH
 */

self.addEventListener('fetch', (event) => {

  const url = event.request.url;

  if (
    url.includes('gstatic.com') ||
    url.includes('googleapis.com')
  ) {
    return;
  }

  event.respondWith(

    fetch(event.request)

      .then(response => {

        if (
          event.request.method === 'GET' &&
          response.status === 200
        ) {

          const clone = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, clone));

        }

        return response;

      })

      .catch(() => {

        return caches.match(event.request)
          .then(response => {

            return response || new Response(
              'Gestia: Modo Offline',
              { status: 404 }
            );

          });

      })

  );

});
