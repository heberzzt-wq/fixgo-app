/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ENRUTADOR MAESTRO (CORE ROUTER)
 * ======================================================================================
 * Archivo: app-panel.js
 * Versión: 5.18.7 (B2C SECURE ARRIVAL BRIDGE)
 * Autor: Heber (CEO & Lead Architect)
 * Fecha: Julio 2026
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LÓGICA.
 * Descripción: Semáforo ultraligero que conecta los paneles de Admin, Técnico y Cliente.
 * ======================================================================================
 */

// Inicializa el Sistema Nervioso Compartido (Audio Unlocker y Utilidades Globales)
import "./app-utils.js";

console.log(" 🚀 GESTIAPREMIUM 5.18.7: B2C SECURE ARRIVAL BRIDGE ACTIVATED (ARQUITECTURA MODULAR).");

// 1. Importamos los submódulos especializados desde los nuevos archivos
import { iniciarPanelAdmin } from "./panel-admin.js";
import { iniciarPanelTecnico as iniciarPanelTecnicoBase } from "./panel-tecnico.js";
import { iniciarPanelCliente } from "./panel-cliente.js";
import { instalarLlegadaSeguraB2C } from "./b2c-arrival-integration.js";

/**
 * Inicializa el panel técnico legacy y sustituye únicamente el manejador global
 * de llegada por el flujo B2C robusto de GPS + fotografía sellada.
 */
function iniciarPanelTecnico(user) {
    const resultado = iniciarPanelTecnicoBase(user);
    instalarLlegadaSeguraB2C(user);
    return resultado;
}

// 2. Exportamos las funciones para que app-main.js y tus HTML las puedan invocar
// El resto de la aplicación conserva el mismo contrato público.
export {
    iniciarPanelAdmin,
    iniciarPanelTecnico,
    iniciarPanelCliente
};

