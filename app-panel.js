/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ENRUTADOR MAESTRO (CORE ROUTER)
 * ======================================================================================
 * Archivo: app-panel.js
 * Versión: 5.18.9 (B2C ARRIVAL + CLIENT ACK + NO-SHOW EVIDENCE)
 * Autor: Heber (CEO & Lead Architect)
 * Fecha: Julio 2026
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LÓGICA.
 * Descripción: Semáforo ultraligero que conecta los paneles de Admin, Técnico y Cliente.
 * ======================================================================================
 */

// Inicializa el Sistema Nervioso Compartido (Audio Unlocker y Utilidades Globales)
import "./app-utils.js";

console.log(" 🚀 GESTIAPREMIUM 5.18.9: B2C ARRIVAL + CLIENT ACK + NO-SHOW EVIDENCE ACTIVATED.");

// 1. Importamos los submódulos especializados desde los nuevos archivos
import { iniciarPanelAdmin } from "./panel-admin.js";
import { iniciarPanelTecnico as iniciarPanelTecnicoBase } from "./panel-tecnico.js";
import { iniciarPanelCliente as iniciarPanelClienteBase } from "./panel-cliente.js";
import { instalarLlegadaSeguraB2C } from "./b2c-arrival-integration.js";
import { instalarNotificacionLlegadaClienteB2C } from "./b2c-client-arrival-notification.js";
import { instalarControlAusenciaTecnicoB2C } from "./b2c-technician-no-show.js";

/**
 * Inicializa el panel técnico legacy y agrega dos puentes B2C independientes:
 * - llegada robusta con GPS y fotografía sellada;
 * - evidencia de ausencia o negativa de acceso después de cinco minutos.
 */
function iniciarPanelTecnico(user) {
    const resultado = iniciarPanelTecnicoBase(user);
    instalarLlegadaSeguraB2C(user);
    instalarControlAusenciaTecnicoB2C(user);
    return resultado;
}

/**
 * Inicializa el panel cliente legacy y agrega el aviso de llegada con evidencia,
 * temporizador visual, acuse y disputa de ubicación.
 */
function iniciarPanelCliente(user) {
    const resultado = iniciarPanelClienteBase(user);
    instalarNotificacionLlegadaClienteB2C(user);
    return resultado;
}

// 2. Exportamos las funciones para que app-main.js y tus HTML las puedan invocar
// El resto de la aplicación conserva el mismo contrato público.
export {
    iniciarPanelAdmin,
    iniciarPanelTecnico,
    iniciarPanelCliente
};
