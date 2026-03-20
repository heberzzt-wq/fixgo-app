/**
 * ======================================================
 * GESTIA PREMIUM - SERVICE WORKER v1.4.1 (ASSETS FIX)
 * Proyecto: fixgo-44e4d
 * Lead Architect: Heberto Mendoza
 * ======================================================
 */
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 🔥 Cambio: Versión actualizada para limpiar caché vieja
const CACHE_NAME = 'gestia-premium-cache-v3.1';
// 🔥 Cambio: Añadimos el icono en assets a la lista de cacheo
const urlsToCache = ['/', '/manifest.json', '/assets/icono-192.png'];

// INICIALIZAR FIREBASE (Credenciales Oficiales Gestia/FixGo)
firebase.initializeApp({
  apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0", 
  authDomain: "fixgo-44e4d.firebaseapp.com",
  projectId: "fixgo-44e4d",
  storageBucket: "fixgo-44e4d.firebasestorage.app",
  messagingSenderId: "1005526685116",
  appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
});

const messaging = firebase.messaging();

// 1. RECEPTOR DE NOTIFICACIONES EN SEGUNDO PLANO
messaging.onBackgroundMessage((payload) => {
  console.log('[Gestia SW] Recibido Push:', payload);
  
  const notificationTitle = payload.notification.title || '¡ALERTA GESTIA PREMIUM!';
  const notificationOptions = {
    body: payload.notification.body || 'Tienes un nuevo servicio pendiente.',
    // 🔥 Cambio: Apuntamos a la carpeta assets
    icon: '/assets/icono-192.png',
    badge: '/assets/icono-192.png',
    vibrate: [300, 100, 300, 100, 300], // Patrón de emergencia
    requireInteraction: true,
    data: payload.data 
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
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// 3. CACHÉ Y ESTRATEGIA DE RED
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

/**
 * 🔥 CORRECCIÓN CRÍTICA (V1.4):
 * Evita el error "Failed to convert value to 'Response'".
 */
self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith(self.location.origin)) {
    return; 
  }
  
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then(response => {
        return response || new Response('Sin conexión y sin caché', {
          status: 404,
          statusText: 'Not Found'
        });
      });
    })
  );
});
