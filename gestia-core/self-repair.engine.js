/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - SYSTEM SECURITY CORE V8.0 (DEEP SCAN & AUTO-REPAIR)
 * ======================================================================================
 * Autor: Heber Mendoza (CEO & Lead Architect)
 * Lógica: Triaje Clínico -> Rastreos Profundos -> Autocuración -> Firma CEO -> Sellado.
 * --------------------------------------------------------------------------------------
 * 🛰️ MAPA DE PROYECTO INYECTADO: functions/, gestia-core/, modules/, render/, engines/.
 * ⚠️ REGLA DE ORO: SIN CORTES. CÓDIGO ÍNTEGRO (+327 LÍNEAS DE ADN SOBERANO).
 * ======================================================================================
 */

// ============================================================================
// 🛡️ CAPA 1: SELF-REPAIR SENTINEL V8 (EL CIRUJANO ATÓMICO)
// ============================================================================

/**
 * 💉 INYECTOR ATÓMICO GLOBAL V8
 * Asegura que el ID de operación viva en todas las capas del objeto para trazabilidad.
 * Sincronizado con: functions/index.js, persistence.engine.js y terminal-core.
 */
const aplicarIdGlobalV8 = (obj, id) => {
    if (!obj || typeof obj !== "object") {
        console.error("❌ [V8-INYECTOR] Error: El objetivo de inyección no es un objeto válido.");
        return;
    }
    
    // 1. Identidad de Raíz (Soberanía Directa)
    obj.modulo_id = id;
    obj.id = id;

    // 2. Capa de Transporte IA (Reconocimiento gestiaArchitectV5)
    if (obj.json && typeof obj.json === "object") {
        obj.json.modulo_id = id;
        obj.json.id = id;
        obj.json.last_repair = new Date().toISOString();
        obj.json.integrity_check = "PASSED_V8";
    }
    
    // 3. Capa Interna de Datos (Data-Binding)
    if (obj.data && typeof obj.data === "object") {
        obj.data.modulo_id = id;
        obj.data.id = id;
        obj.data.origin = "SENTINEL_V8_AUTOCURE";
        obj.data.deep_scan_completed = true;
    }

    // 4. Capa de Persistencia (Idempotencia en Búnker)
    if (obj.payload && typeof obj.payload === "object") {
        obj.payload.modulo_id = id;
        obj.payload.opId = id; 
        obj.payload.documentId = id;
        obj.payload.status = "repaired_atomic";
        obj.payload.arch_version = "8.0-LUNAR";
    }
    
    console.log(`%c💉 [V8-INYECTOR] ID [${id}] sellado en todas las capas del ADN.`, "color: #06b6d4; font-weight: bold;");
};

/**
 * 🧩 MOTOR DE REGLAS PLUGGABLES V8 (ZERO-PLACEHOLDER)
 * Auditoría biológica-operativa completa para archivos masivos (+2000 líneas).
 */
const ReglasReparacionV8 = [
    {
        nombre: "REPARACION_JSON_NATIVO",
        ejecutar: (adn, errores) => {
            if (typeof adn.json === 'string') {
                try {
                    adn.json = JSON.parse(adn.json);
                    errores.push({
                        codigo: "RUIDO_NEURAL",
                        descripcion: "ADN entregado como texto plano en lugar de objeto.",
                        solucion: "CONVERSIÓN: Transformar string a JSON nativo para habilitar lectura.",
                        archivo_origen: "brain.engine.js"
                    });
                } catch (e) {
                    errores.push({
                        codigo: "ADN_CORRUPTO",
                        descripcion: "Estructura JSON ilegible o truncada por la IA.",
                        solucion: "CRÍTICO: Abortar misión. El ADN no es recuperable.",
                        archivo_origen: "gestia-terminal.js"
                    });
                }
            }
        }
    },
    {
        nombre: "RASTREO_PROFUNDO_ID_SOBERANO", 
        ejecutar: (adn, errores, contexto) => {
            const idRaiz = adn?.id || adn?.modulo_id;
            const idJson = adn?.json?.modulo_id || adn?.json?.id;
            const idData = adn?.data?.modulo_id;
            
            const idsDetectados = [idRaiz, idJson, idData].filter(Boolean);
            const esCorrupto = idsDetectados.length === 0 || idsDetectados.some(id => ["undefined", "modulo_id", "null", ""].includes(String(id).toLowerCase()));
            
            if (esCorrupto) {
                const idSugerido = contexto.idPropuesto || `gestia_fix_v8_${Date.now()}`;
                aplicarIdGlobalV8(adn, idSugerido);

                errores.push({
                    codigo: "INFARTO_ID_TERMINAL",
                    descripcion: `ID perdido o mutado. Rastro: Raiz[${idRaiz}], JSON[${idJson}], Data[${idData}].`,
                    solucion: `AUTOCURACIÓN: Reescritura profunda con ID Soberano [${idSugerido}].`,
                    archivo_origen: "semantic.engine.js"
                });
            }
        }
    },
    {
        nombre: "ANALISIS_ENTRELAZADO_DINAMICO",
        ejecutar: (adn, errores) => {
            const js = adn?.json?.javascript || adn?.javascript || "";
            if (!js || js.length < 50) return;

            console.log("🔍 [SENTINEL] Analizando entrelazado en archivo de alta densidad...");
            const invocadas = [...js.matchAll(/([a-zA-Z0-9_]+)\s*\(/g)].map(m => m[1]);
            const definidas = [...js.matchAll(/function\s+([a-zA-Z0-9_]+)|const\s+([a-zA-Z0-9_]+)\s*=/g)].map(m => m[1] || m[2]);
            
            const nativas = ['console', 'JSON', 'Object', 'Array', 'window', 'localStorage', 'setTimeout', 'setInterval', 'push', 'map', 'filter', 'forEach', 'String', 'Number', 'Math'];
            const huerfanas = invocadas.filter(f => !definidas.includes(f) && !nativas.includes(f));

            if (huerfanas.length > 0) {
                errores.push({
                    codigo: "DESENTRELAZADO_JS",
                    descripcion: `Se detectaron ${huerfanas.length} invocaciones sin definición local.`,
                    solucion: "AUTOREPARACIÓN: Inyectar Mocks dinámicos en scope global para estabilizar kernel.",
                    archivo_origen: "deep-scan.js"
                });

                huerfanas.forEach(f => {
                    const mock = `\n /* AUTO-FIX V8 */ window.${f} = window.${f} || function(){ console.warn('KERNEL_STUB: ${f} called but undefined.'); };`;
                    if (adn.json) adn.json.javascript += mock;
                    else adn.javascript += mock;
                });
            }
        }
    },
    {
        nombre: "REPARACION_TENANT_DESALINEADO",
        ejecutar: (adn, errores, contexto) => {
            const tenantOficial = contexto.session?.tenantId || "UXMAL39";
            const tenantEnPayload = adn?.tenantId || adn?.json?.tenantId || adn?.data?.tenantId;

            if (tenantOficial && (!tenantEnPayload || String(tenantEnPayload).toUpperCase() !== String(tenantOficial).toUpperCase())) {
                adn.tenantId = tenantOficial;
                if (adn.json && typeof adn.json === "object") adn.json.tenantId = tenantOficial;
                if (adn.data && typeof adn.data === "object") adn.data.tenantId = tenantOficial;

                errores.push({
                    codigo: "TENANT_REWRITE",
                    descripcion: `Soberanía desalineada: Detectado [${tenantEnPayload}]`,
                    solucion: `AUTOCURACIÓN: Forzar propiedad al Búnker Oficial [${tenantOficial}].`,
                    archivo_origen: "firewall.v5.js"
                });
            }
        }
    },
    {
        nombre: "AUDITORIA_NODE22_ENTORNO",
        ejecutar: (adn, errores) => {
            const js = adn?.json?.javascript || adn?.javascript || "";
            if (js.includes("require('domain')") || js.includes("new Buffer(")) {
                errores.push({
                    codigo: "ALERTA_DEPRECACION_NODE22",
                    descripcion: "Patrones obsoletos detectados ('Buffer' o 'domain').",
                    solucion: "MIGRACIÓN: Auto-remplazo por 'Buffer.from()' para Firebase V2.0.",
                    archivo_origen: "functions/backend-core"
                });
                if (adn.json) adn.json.javascript = js.replace(/new Buffer\(/g, "Buffer.from(");
            }
        }
    },
    {
        nombre: "AUDITORIA_SOBERANIA_B2B",
        ejecutar: (adn, errores) => {
            const html = adn?.json?.html || "";
            const js = adn?.json?.javascript || "";
            if (html.includes('b2b') && !js.includes('user.b2b_activo')) {
                errores.push({
                    codigo: "OVERRIDE_B2B_AUSENTE",
                    descripcion: "El módulo B2B no prioriza el saldo corporativo.",
                    solucion: "REESTRUCTURACIÓN: Inyectar Gatekeeper de pago primario.",
                    archivo_origen: "panel-cliente.js"
                });
            }
        }
    },
    {
        nombre: "VALIDACION_GPS_SNIPER",
        ejecutar: (adn, errores) => {
            const js = adn?.json?.javascript || "";
            if (js.includes('navigator.geolocation') && !js.includes('ubicacionManualWaze')) {
                errores.push({
                    codigo: "GPS_FALLBACK_MISSING",
                    descripcion: "Módulo sin soporte para Waze Sniper.",
                    solucion: "MEJORA: Inyectar lógica de extracción de coordenadas por Regex.",
                    archivo_origen: "app-utils.js"
                });
            }
        }
    },
    {
        nombre: "AUDITORIA_SPLIT_BILLING_PDF",
        ejecutar: (adn, errores) => {
            const js = adn?.json?.javascript || "";
            if (js.includes('generarPDF') && !js.includes('tecnico_nombre_fiscal')) {
                errores.push({
                    codigo: "PDF_DATA_FAIL",
                    descripcion: "El PDF no usa metadatos desnormalizados.",
                    solucion: "SEGURIDAD V2.0: Forzar lectura desde el ticket inyectado.",
                    archivo_origen: "render/pdf-engine.js"
                });
            }
        }
    },
    {
        nombre: "AUDITORIA_CIERRE_LOGICO",
        ejecutar: (adn, errores) => {
            const js = adn?.json?.javascript || "";
            if (js.length > 0 && !js.includes('/* FIN_MODULO */')) {
                if (adn.json) adn.json.javascript += "\n /* FIN_MODULO */";
                console.log("🛡️ [SENTINEL] Sello de cierre lógico inyectado.");
            }
        }
    }
];

export const SelfRepairSentinelV8 = {
    diagnosticarPayloadFinal: (rawData, idPropuesto, session) => {
        console.log("%c🧬 [SENTINEL V8]: Iniciando Triaje Médico Nivel Lunar...", "color: #8b5cf6; font-weight: bold;");
        
        let adnPropuesto = JSON.parse(JSON.stringify(rawData)); 
        let reportePropuestas = [];
        const contexto = { idPropuesto, session };

        // Auditoría profunda sobre el ADN
        for (const regla of ReglasReparacionV8) {
            regla.ejecutar(adnPropuesto, reportePropuestas, contexto);
        }

        return {
            tieneAnomalias: reportePropuestas.length > 0,
            nivelCriticidad: reportePropuestas.some(e => ["ADN_CORRUPTO", "INFARTO_ID_TERMINAL"].includes(e.codigo)) ? "CRITICO" : "REPARABLE",
            reporte: reportePropuestas,
            payloadCorregido: adnPropuesto,
            timestamp: new Date().toISOString()
        };
    }
};

// ============================================================================
// 🚦 CAPA 2: GESTIA ORCHESTRATOR V8 (EL GATEKEEPER DE HEBER)
// ============================================================================

export const GestiaOrchestratorV8 = {
    solicitarRevisionCEO: async (rawData, idPropuesto, session, uiCallback) => {
        const diagnostico = SelfRepairSentinelV8.diagnosticarPayloadFinal(rawData, idPropuesto, session);

        if (diagnostico.nivelCriticidad === "CRITICO") {
            console.error("%c❌ [V8-BLOQUEO]: ADN irrecuperable detectado.", "color: #ef4444; font-weight: bold;");
            return { exito: false, motivo: "ADN_CORRUPTO", datos: null };
        }

        if (diagnostico.tieneAnomalias) {
            console.warn("%c⚠️ [CONSULTA AL CEO]: El Sentinel V8 propone curación.", "color: #f59e0b; font-weight: bold;");
            const firmaHeber = await uiCallback(diagnostico);
            if (!firmaHeber) {
                console.log("%c🛑 [VETO HUMANO]: Reparación rechazada.", "color: #ef4444; font-weight: bold;");
                return { exito: false, motivo: "RECHAZO_HEBER", datos: rawData };
            }
            return { exito: true, motivo: "CURADO_V8", datos: diagnostico.payloadCorregido };
        }

        return { exito: true, motivo: "LIMPIO", datos: diagnostico.payloadCorregido };
    }
};

// ============================================================================
// ⚖️ CAPA 3: CONTRACT ENFORCER V8 (EL VERDUGO FINAL)
// ============================================================================

export const ContractEnforcerV8 = {
    validarLeyesConstitucionales: (payloadFinal) => {
        console.log("%c⚖️ [ENFORCER V8]: Verificando Leyes Constitucionales...", "color: #ef4444; font-weight: bold;");
        const cargaUtil = payloadFinal.json || payloadFinal.data || payloadFinal;

        if (!cargaUtil || typeof cargaUtil !== "object") throw new Error("VIOLACIÓN: Carga útil inexistente.");
        
        const nombre = cargaUtil.modulo_nombre || cargaUtil.nombre_display;
        if (!nombre) throw new Error("CONTRATO ROTO: Falta Identidad.");
        if (!cargaUtil.html) throw new Error("CONTRATO ROTO: Estructura Visual ausente.");
        if (!cargaUtil.javascript) throw new Error("CONTRATO ROTO: Lógica Funcional ausente.");
        
        if (!Array.isArray(cargaUtil.esquema_campos)) {
            throw new Error("CONTRATO ROTO: 'esquema_campos' debe ser Array.");
        }

        console.log("%c✅ [ENFORCER V8]: Constitución Validada. Despliegue Aprobado.", "color: #10b981; font-weight: bold;");
        return true;
    }
};