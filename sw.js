/**
 * ======================================================
 * FIXGO CORE - SERVICE WORKER v1.2 (FCM PUSH ENGINE)
 * ======================================================
 */
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const CACHE_NAME = 'fixgo-premium-cache-v1';
const urlsToCache = ['/', '/manifest.json'];

// INICIALIZAR FIREBASE EN SEGUNDO PLANO (Reemplaza con TUS credenciales de firebase.js)
firebase.initializeApp({
  apiKey: "TU_API_KEY",
  authDomain: "TU_AUTH_DOMAIN",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_STORAGE_BUCKET",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID"
});

const messaging = firebase.messaging();

// 1. RECEPTOR DE NOTIFICACIONES EN SEGUNDO PLANO
messaging.onBackgroundMessage((payload) => {
  console.log('[FixGo SW] Recibido Push en Segundo Plano:', payload);
  
  const notificationTitle = payload.notification.title || '¡NUEVA SOLICITUD FIXGO!';
  const notificationOptions = {
    body: payload.notification.body || 'Tienes un nuevo servicio pendiente.',
    icon: '/icono-192.png',
    badge: '/icono-192.png',
    vibrate: [200, 100, 200, 100, 200], // Patrón táctico
    requireInteraction: true,
    data: payload.data // Datos extra (como el ID del servicio)
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 2. ACCIÓN AL TOCAR LA NOTIFICACIÓN
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); 
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then( windowClients => {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.includes('/') && 'focus' in client) {
          return client.focus(); // Trae la app al frente
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/'); // Abre la app si estaba cerrada
      }
    })
  );
});

// 3. CACHÉ Y ESTRATEGIA DE RED (Mantenemos tu blindaje anterior)
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(name => { if (name !== CACHE_NAME) return caches.delete(name); })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('firestore') || event.request.url.includes('storage')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
