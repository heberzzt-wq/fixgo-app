/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - ENRUTADOR MAESTRO (CORE ROUTER)
 * ======================================================================================
 * Archivo: app-panel.js
 * Versión: 5.18.6 (MODULARIZADO - STRIPE DUAL RADAR & SMART SETTLEMENT)
 * Autor: Heber (CEO & Lead Architect)
 * Fecha: Febrero 2026
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LÓGICA.
 * Descripción: Semáforo ultraligero que conecta los paneles de Admin, Técnico y Cliente.
 * ======================================================================================
 */

// Inicializa el Sistema Nervioso Compartido (Audio Unlocker y Utilidades Globales)
import "./app-utils.js";

console.log(" 🚀 GESTIAPREMIUM 5.18.6: STRIPE DUAL RADAR + SMART SETTLEMENT ACTIVATED (ARQUITECTURA MODULAR).");

// 1. Importamos los submódulos especializados desde los nuevos archivos
import { iniciarPanelAdmin } from "./panel-admin.js";
import { iniciarPanelTecnico } from "./panel-tecnico.js";
import { iniciarPanelCliente } from "./panel-cliente.js";

// 2. Exportamos las funciones para que app-main.js y tus HTML las puedan invocar
// Magia pura: El resto de tu aplicación seguirá funcionando como si nada hubiera cambiado.
export {
    iniciarPanelAdmin,
    iniciarPanelTecnico,
    iniciarPanelCliente
};

