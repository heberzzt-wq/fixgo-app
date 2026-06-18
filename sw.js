/**
 * ======================================================
 * GESTIA PREMIUM - SERVICE WORKER v6.2 (ULTRA-FORCE UNIFIED)
 * Proyecto: fixgo-44e4d
 * Lead Architect: Heberto Mendoza
 * REGLA 1: CÓDIGO COMPLETO - NO PLACEHOLDERS
 * ======================================================
 */

// 1. IMPORTACIONES CRÍTICAS
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 🔥 Configuración de Caché (Actualizado para forzar limpieza)
const CACHE_NAME = 'gestia-premium-cache-repair-engines-v2';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icono-192.png',
  '/icono-512.png'
];

// 2. INICIALIZAR FIREBASE
// Arqui, esta configuración dentro del SW es la que mata el error 401
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

function normalizeNotificationUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return './';
  }

  try {
    const url = new URL(rawUrl, self.location.origin);

    if (url.origin !== self.location.origin) {
      return './';
    }

    return `${url.pathname}${url.search}${url.hash}` || './';
  } catch (error) {
    return './';
  }
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

    const targetUrl = normalizeNotificationUrl(
      payload.data?.url ||
      notificationPayload.url ||
      './'
    );

    const options = {

      body: body,

      icon: '/icono-192.png',
      badge: '/icono-192.png',

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

    icon: '/icono-192.png',
    badge: '/icono-192.png',

    vibrate: [500,110,500,110,450,110],

    requireInteraction: true,
    renotify: true,

    tag: payload.data?.orderId || "gestia-alert",

    data: {
      url: normalizeNotificationUrl(payload.data?.url || './'),
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

  const targetUrl = normalizeNotificationUrl(event.notification.data?.url || './');

  event.waitUntil(

    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(windowClients => {

      for (let client of windowClients) {

        if (new URL(client.url).pathname === new URL(targetUrl, self.location.origin).pathname && 'focus' in client) {
          return client.focus();
        }

      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }

    })

  );

});

// 4. INSTALACIÓN (MUDANZA A FIREBASE)
self.addEventListener('install', (event) => {

  console.log('[Gestia SW] Instalando nuevo motor Firebase...');

  self.skipWaiting(); // Obliga al SW nuevo a tomar el mando

  event.waitUntil(

    caches.open(CACHE_NAME).then(cache => {

      console.log('[Gestia SW] Cacheando archivos críticos');

      return cache.addAll(urlsToCache);

    })

  );

});

// 5. ACTIVACIÓN (EXTERMINIO DE VERCEL)
self.addEventListener('activate', (event) => {

  console.log('[Gestia SW] Activado: Purgando todo el rastro de Vercel');

  event.waitUntil(

    caches.keys().then(cacheNames => {

      return Promise.all(

        cacheNames.map(name => {
          // Borra cualquier caché que no sea el actual de Firebase
          if (name !== CACHE_NAME) {
            console.log('[Gestia SW] Borrando caché antiguo:', name);
            return caches.delete(name);
          }
        })

      );

    })

  );

  self.clients.claim(); // Toma control de la PWA instalada inmediatamente

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
 * FETCH (Estrategia: Network-First con Bypass de Vercel)
 */

self.addEventListener('fetch', (event) => {

  const url = event.request.url;
  const requestURL =
    new URL(url);
  const requestPath =
    requestURL.pathname;
  const isRuntimeAsset =
    event.request.destination === 'document' ||
    event.request.destination === 'script' ||
    event.request.destination === 'worker' ||
    requestPath.endsWith('.html') ||
    requestPath.endsWith('.js') ||
    requestPath.endsWith('.mjs');

  // No intervenir en llamadas de sistema de Google
  if (
    url.includes('gstatic.com') ||
    url.includes('googleapis.com') ||
    url.includes('google-analytics')
  ) {
    return;
  }

  event.respondWith(

    fetch(event.request)

      .then(response => {

        // Si por alguna razón el navegador intenta ir a Vercel, entregamos el index de Firebase
        if (response.url.includes('vercel.app')) {
            console.log('[Gestia SW] Detectado rastro de Vercel, forzando Firebase');
            return caches.match('./index.html');
        }

        if (
  event.request.method === 'GET' &&
  response.status === 200 &&
  !isRuntimeAsset
) {

  const protocolo =
    requestURL.protocol;

  const protocoloPermitido = [

    'http:',
    'https:'

  ].includes(protocolo);

  if (protocoloPermitido) {

    const clone =
      response.clone();

    caches.open(CACHE_NAME)

      .then(cache => {

        return cache.put(
          event.request,
          clone
        );

      })

      .catch(cacheError => {

        console.warn(
          '[Gestia SW] Cache omitido:',
          cacheError?.message
        );

      });
  }
}
        return response;

      })

      .catch(() => {

        return caches.match(event.request)
          .then(response => {

            return response || new Response(
              'Gestia: Modo Offline - Revisa tu conexión',
              { 
                status: 404,
                headers: { 'Content-Type': 'text/plain' }
              }
            );

          });

      })

  );

});

/**
 * ======================================================
 * FIN DEL SERVICE WORKER
 * Gestia Premium V6.2 - Blindaje Firebase Activo
 * Lead Architect: Heberto Mendoza
 * ======================================================
 */
