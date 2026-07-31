/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ENRUTADOR MAESTRO (CORE ROUTER)
 * ======================================================================================
 * Archivo: app-panel.js
 * Versión: 5.18.13 (AUTH GUARD + B2C EVIDENCE FOR BOTH PARTIES)
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

console.log(" 🚀 GESTIAPREMIUM 5.18.13: AUTH GUARD + B2C EVIDENCE FOR BOTH PARTIES ACTIVATED.");

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

/**
 * Inicializa el panel técnico legacy y agrega puentes B2C independientes:
 * - llegada robusta con GPS y fotografía sellada;
 * - evidencia de ausencia o negativa de acceso después de cinco minutos;
 * - reloj autoritativo servidor para impedir adelantar el plazo desde el teléfono;
 * - captura asistida 3-2-1 después de consentimiento explícito.
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
    return resultado;
}

/**
 * Inicializa el panel cliente legacy y agrega:
 * - aviso de llegada, evidencia visible, temporizador, acuse y disputa;
 * - reloj servidor convertido a la zona del servicio;
 * - GPS y foto 3-2-1 para la disputa “el técnico no está aquí”;
 * - fallback sin cámara marcado como evidencia débil para revisión.
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
    return resultado;
}

// 2. Exportamos las funciones para que app-main.js y tus HTML las puedan invocar
// El resto de la aplicación conserva el mismo contrato público.
export {
    iniciarPanelAdmin,
    iniciarPanelTecnico,
    iniciarPanelCliente
};