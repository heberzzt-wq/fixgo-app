/**
 * ======================================================
 * GESTIA PREMIUM - SERVICE WORKER v1.5.0 (RESILIENCE & ALARM FIX)
 * Proyecto: fixgo-44e4d
 * Lead Architect: Heberto Mendoza
 * ======================================================
 */

// Intentamos cargar las librerías con un bloque try/catch para diagnóstico interno
try {
  importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');
} catch (e) {
  console.error('[Gestia SW] Error crítico cargando scripts de Firebase:', e);
}

// 🔥 Cambio: Versión 3.2 para forzar limpieza de la red
const CACHE_NAME = 'gestia-premium-cache-v3.2';
const urlsToCache = [
  '/', 
  '/manifest.json', 
  '/assets/icono-192.png',
  '/assets/icono-512.png'
];

// INICIALIZAR FIREBASE (Credenciales Oficiales Gestia/FixGo)
// Se verifica que firebase esté definido antes de iniciar para evitar el "Evaluation Failed"
if (typeof firebase !== 'undefined') {
  firebase.initializeApp({
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0", 
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.firebasestorage.app",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
  });

  const messaging = firebase.messaging();

  // 1. RECEPTOR DE NOTIFICACIONES EN SEGUNDO PLANO (Móvil bloqueado)
  messaging.onBackgroundMessage((payload) => {
    console.log('[Gestia SW] Recibido Push en background:', payload);
    
    const notificationTitle = payload.notification.title || '🚨 NUEVA ORDEN GESTIA';
    const notificationOptions = {
      body: payload.notification.body || 'Atención: Tienes una nueva asignación pendiente.',
      icon: '/assets/icono-192.png',
      badge: '/assets/icono-192.png',
      
      // 🔥 MEJORA PARA QUE EL MÓVIL "SUENE" Y REACCIONE:
      // Un patrón de vibración más largo y agresivo (Alarma)
      vibrate: [500, 110, 500, 110, 450, 110, 200, 110, 170, 40, 450, 110, 200, 110, 170, 40, 500],
      
      // Tag permite que si llegan 5 mensajes, el teléfono siga reaccionando (renotify)
      tag: 'gestia-urgent-alert',
      renotify: true,
      
      // Evita que la notificación desaparezca sola
      requireInteraction: true,
      
      // Prioridad máxima para el sistema operativo
      priority: 'high',
      
      data: {
        url: payload.data?.url || '/',
        type: payload.data?.type || 'B2B_ORDER'
      }
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
  });
}

// 2. ACCIÓN AL TOCAR LA NOTIFICACIÓN
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); 
  
  const targetUrl = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then( windowClients => {
      // Si ya hay una ventana abierta, la enfocamos y navegamos
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no hay ventana, abrimos una nueva
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 3. CACHÉ Y ESTRATEGIA DE RED
self.addEventListener('install', event => {
  // Fuerza a que el nuevo SW tome el control inmediatamente
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Gestia SW] Cacheando archivos base...');
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            console.log('[Gestia SW] Borrando caché vieja:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  // Toma el control de las pestañas abiertas inmediatamente
  self.clients.claim();
});

/**
 * 🔥 ESTRATEGIA DE FETCH OPTIMIZADA (V1.5):
 * Permite que los scripts de Firebase (gstatic) pasen por la red 
 * sin ser bloqueados por la lógica de origen local.
 */
self.addEventListener('fetch', event => {
  // Si es una petición a Firebase/Google, dejamos que la maneje el navegador normal
  if (event.request.url.includes('gstatic.com') || event.request.url.includes('googleapis.com')) {
    return;
  }

  // Para todo lo demás (assets locales), intentamos Red -> Caché
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then(response => {
        return response || new Response('Gestia: Modo Offline - Recurso no disponible', {
          status: 404,
          statusText: 'Not Found'
        });
      });
    })
  );
});
