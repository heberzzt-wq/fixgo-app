/**
 * ======================================================
 * GESTIA PREMIUM - SERVICE WORKER v5.32 (STABLE ALARM)
 * Proyecto: fixgo-44e4d
 * Lead Architect: Heberto Mendoza
 * ======================================================
 */

// 1. IMPORTACIONES CRÍTICAS (Top-level absoluto para evitar NetworkError)
// Se eliminan bloques try/catch para asegurar evaluación sincrónica inmediata
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 🔥 Configuración de Caché: Forzamos actualización a v3.3 para limpiar registros corruptos
const CACHE_NAME = 'gestia-premium-cache-v3.3';
const urlsToCache = [
  '/', 
  '/manifest.json', 
  '/assets/icono-192.png',
  '/assets/icono-512.png'
];

// 2. INICIALIZAR FIREBASE (Credenciales Oficiales Gestia/FixGo)
// Usamos los datos exactos de tu proyecto fixgo-44e4d
firebase.initializeApp({
  apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0", 
  authDomain: "fixgo-44e4d.firebaseapp.com",
  projectId: "fixgo-44e4d",
  storageBucket: "fixgo-44e4d.firebasestorage.app",
  messagingSenderId: "1005526685116",
  appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
});

const messaging = firebase.messaging();

/**
 * RECEPTOR DE NOTIFICACIONES EN SEGUNDO PLANO
 * El "Radio de Guardia" para cuando el técnico tiene el móvil bloqueado.
 */
messaging.onBackgroundMessage((payload) => {
  console.log('[Gestia SW] Recibido Push en background:', payload);
  
  const notificationTitle = payload.notification.title || '🚨 NUEVA ORDEN GESTIA';
  const notificationOptions = {
    body: payload.notification.body || 'Atención: Tienes una nueva asignación pendiente.',
    icon: '/assets/icono-192.png',
    badge: '/assets/icono-192.png',
    
    // MEJORA DE ALARMA: Patrón agresivo para romper el silencio del técnico
    vibrate: [500, 110, 500, 110, 450, 110, 200, 110, 170, 40, 450, 110, 200, 110, 170, 40, 500],
    
    // Identificador único para evitar solapamiento y forzar re-notificación
    tag: 'gestia-urgent-alert',
    renotify: true,
    
    // Requiere que el usuario la descarte manualmente (no desaparece sola)
    requireInteraction: true,
    
    // Indicación de prioridad alta para el sistema operativo
    priority: 'high',
    
    data: {
      url: payload.data?.url || '/',
      type: payload.data?.type || 'B2B_ORDER'
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 3. ACCIÓN AL TOCAR LA NOTIFICACIÓN
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); 
  
  const targetUrl = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then( windowClients => {
      // Si ya hay una ventana abierta con la misma URL, la enfocamos
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no hay ventana operativa, abrimos una nueva en el despacho
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

// 5. CICLO DE VIDA: ACTIVACIÓN (LIMPIEZA)
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
  // Toma el control de los clientes de forma inmediata
  self.clients.claim();
});

/**
 * ESTRATEGIA DE RED: FETCH OPTIMIZADO
 * Evitamos capturar peticiones de Firebase/Google para que importScripts 
 * y las comunicaciones de FCM fluyan sin interferencia del Service Worker.
 */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Pasarela directa para servicios de Google/Firebase
  if (url.includes('gstatic.com') || url.includes('googleapis.com')) {
    return;
  }

  // Estrategia: Red primero -> Si falla, recurre a Caché
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request).then(response => {
        return response || new Response('Gestia: Modo Offline - Señal no disponible', {
          status: 404,
          statusText: 'Not Found'
        });
      });
    })
  );
});
