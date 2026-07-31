/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ENRUTADOR MAESTRO (CORE ROUTER)
 * ======================================================================================
 * Archivo: app-panel.js
 * Versión: 5.18.24 (AUTHORITATIVE PAYMENT ROUTING + FINANCIAL GATE)
 * Autor: Heber (CEO & Lead Architect)
 * Fecha: Julio 2026
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LÓGICA.
 * Descripción: Semáforo ultraligero que conecta los paneles de Admin, Técnico y Cliente.
 * ======================================================================================
 */

// Inicializa el Sistema Nervioso Compartido (Audio Unlocker y Utilidades Globales)
import "./app-utils.js";

// Corrige la carrera donde el boot recrea el loader después de validar perfil y ruta.
import "./gestia-loader-race-guard.js";

// Comprime fotos B2C como Blob JPEG antes de Storage; Base64 queda solo para caché local.
import "./b2c-media-economy-guard.js";

// Redirige exclusivamente el endpoint Stripe histórico al API backend autoritativo.
import "./b2c-secure-payment-endpoint-redirect.js";

// Si fixgo-bridge.js no cargó, impide que el legacy simule pagos exitosos.
import "./b2c-stripe-fail-closed-stub.js";

// Debe registrarse antes de firma y cronología: bloquea cualquier cierre con revisión/hold.
import "./b2c-financial-execution-guard.js";

// Sustituye la firma Base64 del cierre legacy por URL, ruta y SHA-256 de Storage.
import "./b2c-signature-storage-bridge.js";

console.log(" 🚀 GESTIAPREMIUM 5.18.24: AUTHORITATIVE PAYMENTS + FINANCIAL GATE ACTIVATED.");

// 1. Importamos los submódulos especializados desde los nuevos archivos
import { iniciarPanelAdmin as iniciarPanelAdminBase } from "./panel-admin.js";
import { iniciarPanelTecnico as iniciarPanelTecnicoBase } from "./panel-tecnico.js";
import { iniciarPanelCliente as iniciarPanelClienteBase } from "./panel-cliente.js";
import { instalarLlegadaSeguraB2C } from "./b2c-arrival-integration.js";
import { instalarNotificacionLlegadaClienteB2C } from "./b2c-client-arrival-notification.js";
import { instalarControlAusenciaTecnicoB2C } from "./b2c-technician-no-show.js";
import { instalarPuenteTiempoAutoritativoB2C } from "./b2c-authoritative-timer-bridge.js";
import { instalarCapturaConsentidaTecnicoB2C } from "./b2c-consented-capture-bridge.js";
import { instalarVideoReforzadoB2C } from "./b2c-reinforced-video-bridge.js";
import { instalarGuardiaEvidenciaTrabajoB2C } from "./b2c-secure-work-evidence-guard.js";
import { instalarGuardiaDiagnosticoPreCotizacionB2C } from "./b2c-prequote-diagnostic-guard.js";
import { instalarGuardiaInicioTrabajoB2C } from "./b2c-start-work-evidence-guard.js";
import { instalarPuenteCronologiaCierreTrabajoB2C } from "./b2c-work-close-chronology-bridge.js";
import { instalarDisputaClienteConfinadaAlServicioB2C } from "./b2c-customer-dispute-service-scope.js";
import { instalarRevisionAdministrativaB2C } from "./b2c-admin-evidence-review.js";

/**
 * Inicializa el panel administrativo legacy y agrega:
 * - bandeja de llegada disputada o GPS alternativo;
 * - revisión de ausencia o negativa de acceso;
 * - revisión de diagnóstico y trabajo con fallback;
 * - auditoría append-only por folio;
 * - financial_hold obligatorio sin ejecutar cobros, liberaciones ni transferencias;
 * - visualización futura de crew_snapshot para cuadrillas autorizadas.
 */
function iniciarPanelAdmin(user) {
    const resultado = iniciarPanelAdminBase(user);
    instalarRevisionAdministrativaB2C(user);
    return resultado;
}

/**
 * Inicializa el panel técnico legacy y agrega puentes B2C independientes:
 * - llegada robusta con GPS y fotografía sellada;
 * - evidencia de ausencia o negativa de acceso después de cinco minutos;
 * - reloj autoritativo servidor para impedir adelantar el plazo desde el teléfono;
 * - captura fotográfica asistida 3-2-1 después de consentimiento explícito;
 * - video opcional de 4 segundos sin audio para incidencias reforzadas;
 * - diagnóstico inicial sellado antes de abrir el cotizador;
 * - work_before capturado al iniciar la reparación, incluso si el cliente cambia el estado;
 * - work_after y firma válida capturados únicamente durante el cierre;
 * - doble validación financiera antes de subir y antes de liquidar;
 * - fotografías redimensionadas y comprimidas antes de Storage, sin Base64 persistente;
 * - firma del cliente almacenada como PNG económico en Storage, nunca como data URL.
 */
function iniciarPanelTecnico(user) {
    const resultado = iniciarPanelTecnicoBase(user);
    instalarLlegadaSeguraB2C(user);
    instalarControlAusenciaTecnicoB2C(user);
    instalarPuenteTiempoAutoritativoB2C({
        user,
        actorRole: "tecnico"
    });
    instalarCapturaConsentidaTecnicoB2C(user);
    instalarVideoReforzadoB2C({
        user,
        actorRole: "tecnico"
    });
    instalarGuardiaDiagnosticoPreCotizacionB2C(user);
    instalarGuardiaInicioTrabajoB2C(user);

    // El guardia base conserva la compatibilidad legacy y expone su opener original.
    instalarGuardiaEvidenciaTrabajoB2C(user);

    // Este puente se instala encima y corrige la cronología: solo work_after al cierre.
    instalarPuenteCronologiaCierreTrabajoB2C(user);
    return resultado;
}

/**
 * Inicializa el panel cliente legacy y agrega:
 * - aviso de llegada, evidencia visible, temporizador y acuse;
 * - reloj servidor convertido a la zona del servicio;
 * - disputa con GPS y foto 3-2-1 confinada al mismo folio;
 * - deduplicación global diferida al backend para no exponer historiales de otros servicios;
 * - fallback sin cámara marcado como evidencia débil para revisión;
 * - fotografía de disputa comprimida antes de Storage, sin Base64 persistente;
 * - endpoint de pago histórico redirigido al API autoritativo;
 * - Stripe fail-closed si el bridge no está disponible.
 */
function iniciarPanelCliente(user) {
    const resultado = iniciarPanelClienteBase(user);
    instalarNotificacionLlegadaClienteB2C(user);
    instalarPuenteTiempoAutoritativoB2C({
        user,
        actorRole: "cliente"
    });
    instalarDisputaClienteConfinadaAlServicioB2C(user);
    return resultado;
}

// 2. Exportamos las funciones para que app-main.js y tus HTML las puedan invocar
// El resto de la aplicación conserva el mismo contrato público.
export {
    iniciarPanelAdmin,
    iniciarPanelTecnico,
    iniciarPanelCliente
};