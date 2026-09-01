/** GestiaPremium canonical service worker. Scope: / */
self.addEventListener("notificationclick", event => {
    event.notification.close();
    const targetUrl = normalizeNotificationUrl(event.notification.data?.url);
    event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
        const pathname = new URL(targetUrl, self.location.origin).pathname;
        const current = windowClients.find(client => new URL(client.url).pathname === pathname);
        return current?.focus?.() || clients.openWindow?.(targetUrl);
    }));
});

importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js");

const RELEASE_SHA = new URL(self.location.href).searchParams.get("release_sha") || "UNPREPARED";
const CACHE_NAME = `gestia-premium-${RELEASE_SHA}`;
const NOTIFICATION_CACHE = `gestia-notifications-${RELEASE_SHA}`;
const STATIC_URLS = ["/", "/index.html", "/manifest.json", "/icono-192.png", "/icono-512.png"];

firebase.initializeApp({
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0",
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.firebasestorage.app",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
});

const messaging = firebase.messaging.isSupported() ? firebase.messaging() : null;

function normalizeNotificationUrl(rawUrl) {
    try {
        const url = new URL(typeof rawUrl === "string" && rawUrl ? rawUrl : "/", self.location.origin);
        if (url.origin !== self.location.origin) return "/";
        return `${url.pathname}${url.search}${url.hash}` || "/";
    } catch (_error) {
        return "/";
    }
}

function notificationIdentity(payload = {}) {
    const data = payload.data || {};
    return String(data.messageId || data.serviceId || data.orderId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 180);
}

async function claimNotification(identity) {
    if (!identity) return true;
    const cache = await caches.open(NOTIFICATION_CACHE);
    const key = new Request(`${self.location.origin}/__notification_dedupe__/${identity}`);
    if (await cache.match(key)) return false;
    await cache.put(key, new Response(new Date().toISOString(), { headers: { "Cache-Control": "no-store" } }));
    return true;
}

async function showCanonicalNotification(payload = {}) {
    const data = payload.data || payload.notification || {};
    const identity = notificationIdentity(payload);
    if (!(await claimNotification(identity))) return;
    await self.registration.showNotification(data.title || "Nueva orden Gestia", {
        body: data.body || data.mensaje || "Tienes una nueva orden disponible.",
        icon: "/icono-192.png",
        badge: "/icono-192.png",
        vibrate: [700, 180, 700, 180, 700, 180, 1200],
        silent: false,
        requireInteraction: true,
        renotify: false,
        tag: identity || "gestia-notification",
        data: {
            url: normalizeNotificationUrl(data.url),
            messageId: identity || null,
            serviceId: data.serviceId || null,
            eventType: data.eventType || null
        }
    });
}

if (messaging) messaging.onBackgroundMessage(payload => {
    // Los mensajes con notification los muestra FCM automáticamente en background.
    // Conservamos el handler canónico como respaldo para mensajes data-only históricos.
    if (payload?.notification) return undefined;
    return showCanonicalNotification(payload);
});

self.addEventListener("install", event => {
    self.skipWaiting();
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_URLS)));
});

self.addEventListener("activate", event => {
    event.waitUntil(Promise.all([
        caches.keys().then(names => Promise.all(names
            .filter(name => name.startsWith("gestia-") && ![CACHE_NAME, NOTIFICATION_CACHE].includes(name))
            .map(name => caches.delete(name)))),
        self.clients.claim()
    ]));
});

self.addEventListener("message", event => {
    if (event.data === "SKIP_WAITING") self.skipWaiting();
    if (event.data?.type === "GESTIA_RELEASE_IDENTITY") {
        event.ports?.[0]?.postMessage({ git_sha: RELEASE_SHA, cache_name: CACHE_NAME, scope: self.registration.scope });
    }
});

self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
    const isRuntime = event.request.destination === "document" ||
        event.request.destination === "script" ||
        event.request.destination === "worker" ||
        /\.(?:html|js|mjs)$/.test(url.pathname) ||
        url.pathname === "/release-manifest.json";
    event.respondWith(fetch(event.request, isRuntime ? { cache: "no-store" } : undefined)
        .then(response => {
            if (response.ok && !isRuntime) {
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone())).catch(() => {});
            }
            return response;
        })
        .catch(async () => (await caches.match(event.request)) || new Response(
            "Gestia: modo offline. Revisa tu conexión.",
            { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        )));
});
