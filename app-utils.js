/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - UTILERÍAS COMPARTIDAS (SISTEMA NERVIOSO)
 * ======================================================================================
 * Archivo: app-utils.js
 * Descripción: Contiene las herramientas globales requeridas por todos los paneles.
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LOGICA.
 * ======================================================================================
 */

import { activarAlertas, alertaTecnico } from "./alert-engine.js";
import { getPlatformServiceWorkerRegistration } from "./platform-release.js";

/**
 * SANITIZADOR MAESTRO (PREVENCIÓN XSS)
 * Protege contra inyección de código en los innerHTML
 */
export const escaparHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/**
 * 🦈 SISTEMA ANTIFRAUDE MILITAR (SHARK MODE)
 * Fórmula de Haversine para calcular distancia en metros entre dos coordenadas GPS
 */
export function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radio de la Tierra en metros
    const rad = Math.PI / 180;
    const φ1 = lat1 * rad;
    const φ2 = lat2 * rad;
    const Δφ = (lat2 - lat1) * rad;
    const Δλ = (lon2 - lon1) * rad;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distancia en metros
}

/**
 * ACTIVADOR MAESTRO (UNLOCKER) + PERMISOS PUSH
 */
document.addEventListener('click', () => {
    activarAlertas().then(() => {
        console.log("🔊 GESTIAPREMIUM AUDIO ENGINE: Desbloqueado y listo (Modo Sintetizador).");
    });
}, { once: true });

export function sonarAlerta() {
    alertaTecnico();
}

/**
 * 🔔 MOTOR DE NOTIFICACIONES PUSH (CORRECCIÓN ANDROID V5.18.2)
 * Se usa ServiceWorkerRegistration para garantizar compatibilidad móvil local.
 */
export async function lanzarNotificacionPush(titulo, cuerpo, options = {}) {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        return { ok: false, reason: "NOTIFICATION_UNSUPPORTED" };
    }
    if (Notification.permission !== "granted") {
        return { ok: false, reason: `NOTIFICATION_PERMISSION_${Notification.permission.toUpperCase()}` };
    }
    try {
        const registration = await getPlatformServiceWorkerRegistration();
        if (!registration) return { ok: false, reason: "ACTIVE_RELEASE_SERVICE_WORKER_REQUIRED" };
        await registration.showNotification(titulo, {
            body: cuerpo,
            icon: "icono-192.png",
            badge: "icono-192.png",
            vibrate: [700, 180, 700, 180, 700, 180, 1200],
            silent: false,
            tag: options.messageId || options.serviceId || "alerta-fixgo-unica",
            renotify: true,
            requireInteraction: true
        });
        return { ok: true, reason: null };
    } catch (error) {
        console.error("Error al lanzar Push Nativo:", error);
        return { ok: false, reason: "NOTIFICATION_DISPLAY_FAILED" };
    }
}

export async function probarAlertaTecnicoLocal() {
    await activarAlertas();
    alertaTecnico();
    return lanzarNotificacionPush(
        "Prueba de alerta Gestia",
        "Si ves, escuchas o sientes esta alerta, el canal local de Android está operativo.",
        { messageId: `manual_notification_test_${Date.now()}` }
    );
}

const PLATFORM_NOTIFICATION_LEDGER = "gestia_platform_notification_events_v1";

function notificationEventId(event = {}) {
    const eventType = String(event.eventType || event.event_type || "").trim();
    const serviceId = String(event.serviceId || event.service_id || "").trim();
    const messageId = String(event.messageId || event.message_id || "").trim();
    return messageId || (eventType && serviceId ? `${eventType}_${serviceId}` : "");
}

export function procesarEventoNotificacion(event = {}, options = {}) {
    const eventId = notificationEventId(event);
    if (!eventId) return false;
    let seen = [];
    try {
        seen = JSON.parse(localStorage.getItem(PLATFORM_NOTIFICATION_LEDGER) || "[]");
    } catch {}
    if (seen.includes(eventId)) return false;
    try {
        localStorage.setItem(
            PLATFORM_NOTIFICATION_LEDGER,
            JSON.stringify([...seen, eventId].slice(-300))
        );
    } catch {}
    sonarAlerta();
    lanzarNotificacionPush(
        options.title || "Nueva solicitud disponible",
        options.body || "Tienes un servicio compatible con tu perfil operativo.",
        {
            messageId: eventId,
            serviceId: event.serviceId || event.service_id
        }
    );
    return true;
}

function prepararJsPdfParaImagenesRemotas(jspdfNamespace) {
    const JsPdf = jspdfNamespace?.jsPDF;
    if (!JsPdf?.prototype || JsPdf.prototype.__gestiaRemoteImageBridgeInstalled === true) {
        return jspdfNamespace;
    }

    const originalAddImage = JsPdf.prototype.addImage;
    const originalSave = JsPdf.prototype.save;
    if (typeof originalAddImage !== "function" || typeof originalSave !== "function") {
        return jspdfNamespace;
    }

    Object.defineProperty(JsPdf.prototype, "__gestiaRemoteImageBridgeInstalled", {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false
    });

    JsPdf.prototype.addImage = function(imageData, ...args) {
        if (typeof imageData === "string" && /^https?:\/\//i.test(imageData)) {
            const pending = urlABase64(imageData).then((convertedImage) => {
                if (!convertedImage) {
                    throw new Error("PDF_REMOTE_IMAGE_UNAVAILABLE");
                }
                return originalAddImage.call(this, convertedImage, ...args);
            });
            if (!Array.isArray(this.__gestiaPendingRemoteImages)) {
                Object.defineProperty(this, "__gestiaPendingRemoteImages", {
                    value: [],
                    configurable: true,
                    enumerable: false,
                    writable: true
                });
            }
            this.__gestiaPendingRemoteImages.push(pending);
            return this;
        }
        return originalAddImage.call(this, imageData, ...args);
    };

    JsPdf.prototype.save = function(...args) {
        const pending = Array.isArray(this.__gestiaPendingRemoteImages)
            ? this.__gestiaPendingRemoteImages.splice(0)
            : [];
        if (pending.length === 0) {
            return originalSave.apply(this, args);
        }
        return Promise.all(pending)
            .then(() => originalSave.apply(this, args))
            .catch((error) => {
                console.error("Error preparando imágenes remotas para PDF:", error);
                throw error;
            });
    };

    return jspdfNamespace;
}

// ======================================================================================
// 📄 CARGADOR DINÁMICO DE PDF (OPTIMIZACIÓN V5.7)
// ======================================================================================
export async function cargarLibreriaPDF() {
    if (window.jspdf) return prepararJsPdfParaImagenesRemotas(window.jspdf);
    
    return new Promise((resolve, reject) => {
        console.log(" 📄 Cargando librería PDF bajo demanda...");
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => {
            console.log(" 📄 Librería PDF cargada correctamente.");
            resolve(prepararJsPdfParaImagenesRemotas(window.jspdf));
        };
        script.onerror = () => reject("Error crítico cargando la librería PDF desde CDN.");
        document.head.appendChild(script);
    });
}

// 🔥 TRADUCTOR DE IMÁGENES PARA EL PDF (V5.17.2)
// Convierte URLs de Firebase en Base64 para que jsPDF pueda imprimirlas
export const urlABase64 = async (url) => {
    if (!url || url.includes('via.placeholder')) return null;
    if (url.startsWith('data:')) return url;
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) throw new Error(`PDF_IMAGE_HTTP_${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Error convirtiendo imagen para PDF:", e);
        return null;
    }
};
