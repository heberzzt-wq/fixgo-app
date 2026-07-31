/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ENRUTADOR MAESTRO (CORE ROUTER)
 * ======================================================================================
 * Archivo: app-panel.js
 * Versión: 5.18.17 (AUTH GUARD + CHRONOLOGICAL B2C EVIDENCE)
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

console.log(" 🚀 GESTIAPREMIUM 5.18.17: AUTH GUARD + CHRONOLOGICAL B2C EVIDENCE ACTIVATED.");

// 1. Importamos los submódulos especializados desde los nuevos archivos
import { iniciarPanelAdmin } from "./panel-admin.js";
import { iniciarPanelTecnico as iniciarPanelTecnicoBase } from "./panel-tecnico.js";
import { iniciarPanelCliente as iniciarPanelClienteBase } from "./panel-cliente.js";
import { instalarLlegadaSeguraB2C } from "./b2c-arrival-integration.js";
import { instalarNotificacionLlegadaClienteB2C } from "./b2c-client-arrival-notification.js";
import { instalarControlAusenciaTecnicoB2C } from "./b2c-technician-no-show.js";
import { instalarPuenteTiempoAutoritativoB2C } from "./b2c-authoritative-timer-bridge.js";
import { instalarCapturaConsentidaTecnicoB2C } from "./b2c-consented-capture-bridge.js";
import { instalarEvidenciaDisputaLlegadaClienteB2C } from "./b2c-client-arrival-dispute-evidence.js";
import { instalarRecuperacionUIDisputaClienteB2C } from "./b2c-client-dispute-ui-recovery.js";
import { instalarVideoReforzadoB2C } from "./b2c-reinforced-video-bridge.js";
import { instalarGuardiaEvidenciaTrabajoB2C } from "./b2c-secure-work-evidence-guard.js";
import { instalarGuardiaDiagnosticoPreCotizacionB2C } from "./b2c-prequote-diagnostic-guard.js";
import { instalarGuardiaInicioTrabajoB2C } from "./b2c-start-work-evidence-guard.js";
import { instalarPuenteCronologiaCierreTrabajoB2C } from "./b2c-work-close-chronology-bridge.js";

/**
 * Inicializa el panel técnico legacy y agrega puentes B2C independientes:
 * - llegada robusta con GPS y fotografía sellada;
 * - evidencia de ausencia o negativa de acceso después de cinco minutos;
 * - reloj autoritativo servidor para impedir adelantar el plazo desde el teléfono;
 * - captura fotográfica asistida 3-2-1 después de consentimiento explícito;
 * - video opcional de 4 segundos sin audio para incidencias reforzadas;
 * - diagnóstico inicial sellado antes de abrir el cotizador;
 * - work_before capturado al iniciar la reparación, incluso si el cliente cambia el estado;
 * - work_after y firma válida capturados únicamente durante el cierre.
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
 * - aviso de llegada, evidencia visible, temporizador, acuse y disputa;
 * - reloj servidor convertido a la zona del servicio;
 * - GPS y foto 3-2-1 para la disputa “el técnico no está aquí”;
 * - fallback sin cámara marcado como evidencia débil para revisión;
 * - video opcional de 4 segundos sin audio como evidencia reforzada.
 */
function iniciarPanelCliente(user) {
    const resultado = iniciarPanelClienteBase(user);
    instalarNotificacionLlegadaClienteB2C(user);
    instalarPuenteTiempoAutoritativoB2C({
        user,
        actorRole: "cliente"
    });
    instalarEvidenciaDisputaLlegadaClienteB2C(user);
    instalarRecuperacionUIDisputaClienteB2C();
    instalarVideoReforzadoB2C({
        user,
        actorRole: "cliente"
    });
    return resultado;
}

// 2. Exportamos las funciones para que app-main.js y tus HTML las puedan invocar
// El resto de la aplicación conserva el mismo contrato público.
export {
    iniciarPanelAdmin,
    iniciarPanelTecnico,
    iniciarPanelCliente
};