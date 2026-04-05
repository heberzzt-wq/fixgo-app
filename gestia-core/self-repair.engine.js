/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - SYSTEM SECURITY CORE V7.01 (NIVEL LUNAR - FUSIÓN TOTAL)
 * ======================================================================================
 * Autor: Heber Mendoza (CEO & Lead Architect)
 * Lógica: Triaje Clínico -> Rastreos Profundos -> Autocuración -> Firma CEO -> Sellado.
 * --------------------------------------------------------------------------------------
 * 🛰️ MAPA DE PROYECTO INYECTADO: functions/, gestia-core/, modules/, render/, engines/.
 * ⚠️ REGLA DE ORO: SIN CORTES. CÓDIGO ÍNTEGRO (+289 LÍNEAS DE ADN PURO).
 * ======================================================================================
 */

// ============================================================================
// 🛡️ CAPA 1: SELF-REPAIR SENTINEL V7.01 (EL CIRUJANO JEFE)
// ============================================================================

/**
 * 💉 INYECTOR ATÓMICO GLOBAL
 * Asegura que el ID de operación viva en todas las capas del objeto para trazabilidad.
 * Sincronizado con: functions/index.js y persistence.engine.js
 */
const aplicarIdGlobalV7 = (obj, id) => {
    if (!obj || typeof obj !== "object") return;
    
    // 1. Identidad de Raíz (Soberanía Directa)
    obj.modulo_id = id;
    obj.id = id;

    // 2. Capa de Transporte IA (Para reconocimiento de gestiaArchitectV5)
    if (obj.json && typeof obj.json === "object") {
        obj.json.modulo_id = id;
        obj.json.id = id;
    }
    
    // 3. Capa Interna de Datos (Data-Binding)
    if (obj.data && typeof obj.data === "object") {
        obj.data.modulo_id = id;
        obj.data.id = id;
    }

    // 4. Capa de Persistencia (Idempotencia en Búnker)
    if (obj.payload && typeof obj.payload === "object") {
        obj.payload.modulo_id = id;
        obj.payload.opId = id; 
        obj.payload.documentId = id;
    }
    
    console.log(`%c💉 [V7-INYECTOR] ID [${id}] sellado en todas las capas del ADN.`, "color: #06b6d4; font-weight: bold;");
};

/**
 * 🧩 MOTOR DE REGLAS PLUGGABLES V7.01
 * Auditoría biológica-operativa completa: De Node 22 a la Caseta de Jonathan.
 */
const ReglasReparacionV7 = [
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
        nombre: "RASTREO_PROFUNDO_ID_CORRUPTO", // LÍQUIDO DE CONTRASTE V7
        ejecutar: (adn, errores, contexto) => {
            const idRaiz = adn?.id || adn?.modulo_id;
            const idJson = adn?.json?.modulo_id || adn?.json?.id;
            const idData = adn?.data?.modulo_id;
            
            const idsDetectados = [idRaiz, idJson, idData].filter(Boolean);
            const esCorrupto = idsDetectados.length === 0 || idsDetectados.some(id => ["undefined", "modulo_id", "null", ""].includes(String(id).toLowerCase()));
            
            if (esCorrupto) {
                const idSugerido = contexto.idPropuesto || `fix_mod_v7_${Date.now()}`;
                aplicarIdGlobalV7(adn, idSugerido);

                errores.push({
                    codigo: "INFARTO_ID_TERMINAL",
                    descripcion: `ID perdido o mutado. Rastro detectado: Raiz[${idRaiz}], JSON[${idJson}], Data[${idData}].`,
                    solucion: `AUTOCURACIÓN: Reescritura profunda con ID Soberano [${idSugerido}].`,
                    archivo_origen: "semantic.engine.js"
                });
            }
        }
    },
    {
        nombre: "REPARACION_TENANT_DESALINEADO",
        ejecutar: (adn, errores, contexto) => {
            const tenantOficial = contexto.session?.tenantId || localStorage.getItem('gestia_tenant_id') || "UXMAL39";
            const tenantEnPayload = adn?.tenantId || adn?.json?.tenantId || adn?.data?.tenantId;

            if (tenantOficial && (!tenantEnPayload || String(tenantEnPayload).toLowerCase() !== String(tenantOficial).toLowerCase())) {
                adn.tenantId = tenantOficial;
                if (adn.json && typeof adn.json === "object") adn.json.tenantId = tenantOficial;
                if (adn.data && typeof adn.data === "object") adn.data.tenantId = tenantOficial;

                errores.push({
                    codigo: "TENANT_REWRITE",
                    descripcion: `Soberanía ausente o desalineada: [${tenantEnPayload || 'undefined'}]`,
                    solucion: `AUTOCURACIÓN: Forzar propiedad al Búnker Oficial [${tenantOficial}].`,
                    archivo_origen: "firewall.v5.js"
                });
            }
        }
    },
    {
        nombre: "REPARACION_METADATA_FALTANTE",
        ejecutar: (adn, errores, contexto) => {
            const json = adn.json || adn.data || adn;
            const nombreActual = json.modulo_nombre || json.nombre_display;

            if (!nombreActual || String(nombreActual).trim() === "") {
                const nombreSugerido = "Módulo Gestia_" + (contexto.idPropuesto?.replace('modulo_', '') || "Dynamic_v7");
                if (adn.json && typeof adn.json === "object") adn.json.modulo_nombre = nombreSugerido;
                else adn.modulo_nombre = nombreSugerido;

                errores.push({
                    codigo: "NOMBRE_AUSENTE",
                    descripcion: "Módulo sin nombre técnico asignado.",
                    solucion: `AUTOCURACIÓN: Asignar nombre [${nombreSugerido}] para cumplir contrato.`,
                    archivo_origen: "gestia-render.js"
                });
            }
        }
    },
    {
        nombre: "AUDITORIA_NODE22_ENTORNO", // REINTEGRADO V6.5 -> V7
        ejecutar: (adn, errores) => {
            const codigoJS = adn?.json?.javascript || adn?.javascript || "";
            if (codigoJS.includes("require('domain')") || codigoJS.includes("new Buffer(")) {
                errores.push({
                    codigo: "ALERTA_DEPRECACION_NODE22",
                    descripcion: "Patrones obsoletos detectados ('Buffer' antiguo o 'domain').",
                    solucion: "MIGRACIÓN: Actualizar a 'Buffer.from()' para compatibilidad con Firebase V2.0.",
                    archivo_origen: "functions/backend-core"
                });
            }
        }
    },
    {
        nombre: "ANALISIS_ENTRELAZADO_DEPENDENCIAS", // REINTEGRADO V6.5 -> V7
        ejecutar: (adn, errores) => {
            const dependencias = adn?.json?.dependencias || [];
            const codigoHTML = adn?.json?.html || "";
            if (codigoHTML.includes("stripe") && !dependencias.includes("gestia-payments")) {
                errores.push({
                    codigo: "RIESGO_ENTRELAZADO_ROTO",
                    descripcion: "UI de pagos detectada pero sin enlace al módulo de dependencias.",
                    solucion: "INYECCIÓN: Agregar 'gestia-payments' al manifiesto para habilitar Split Billing.",
                    archivo_origen: "modules/config"
                });
                if (adn.json) adn.json.dependencias = [...(adn.json.dependencias || []), "gestia-payments"];
            }
        }
    },
    {
        nombre: "AUDITORIA_CASETA_JONATHAN", // CÉLULA B2C V7
        ejecutar: (adn, errores) => {
            const js = adn?.json?.javascript || "";
            if (adn.modulo_id?.includes('tecnico') && !js.includes('placasTech')) {
                errores.push({
                    codigo: "BLOQUEO_LOGISTICA_CASETA",
                    descripcion: "Falta validación de placas para acceso a residenciales (Filtro Jonathan).",
                    solucion: "INYECCIÓN: Obligar captura de placas antes de activar 'En Camino'.",
                    archivo_origen: "panel-tecnico.js"
                });
            }
        }
    },
    {
        nombre: "AUDITORIA_SOBERANIA_B2B", // CÉLULA B2B V7
        ejecutar: (adn, errores) => {
            const js = adn?.json?.javascript || "";
            if (adn.modulo_id?.includes('cliente') && !js.includes('user.b2b_activo')) {
                errores.push({
                    codigo: "OVERRIDE_B2B_AUSENTE",
                    descripcion: "El módulo de cliente no prioriza el saldo virtual corporativo (Override Jorge).",
                    solucion: "REESTRUCTURACIÓN: Posicionar el flujo B2B como Gatekeeper de pago primario.",
                    archivo_origen: "panel-cliente.js"
                });
            }
        }
    },
    {
        nombre: "VALIDACION_GPS_SNIPER", // CÉLULA GEOGRÁFICA V7
        ejecutar: (adn, errores) => {
            const js = adn?.json?.javascript || "";
            if (js.includes('navigator.geolocation') && !js.includes('ubicacionManualWaze')) {
                errores.push({
                    codigo: "GPS_FALLBACK_MISSING",
                    descripcion: "Módulo de ubicación sin soporte para Waze Sniper (Override Manual).",
                    solucion: "MEJORA: Inyectar lógica de extracción de coordenadas por Regex.",
                    archivo_origen: "app-utils.js"
                });
            }
        }
    },
    {
        nombre: "AUDITORIA_SPLIT_BILLING_PDF", // CÉLULA FISCAL V7
        ejecutar: (adn, errores) => {
            const js = adn?.json?.javascript || "";
            if (js.includes('generarPDF') && !js.includes('tecnico_nombre_fiscal')) {
                errores.push({
                    codigo: "PDF_DATA_DESNORMALIZED_FAIL",
                    descripcion: "El PDF intenta leer de 'users' en lugar de usar metadatos inyectados en el ticket.",
                    solucion: "SEGURIDAD V2.0: Forzar lectura de datos fiscales desnormalizados desde el ticket.",
                    archivo_origen: "render/pdf-engine.js"
                });
            }
        }
    }
];

export const SelfRepairSentinelV7 = {
    diagnosticarPayloadFinal: (rawData, idPropuesto, session) => {
        console.log("%c🧬 [SENTINEL V7.01]: Iniciando Triaje Médico Nivel Lunar...", "color: #8b5cf6; font-weight: bold;");
        
        let adnPropuesto = JSON.parse(JSON.stringify(rawData)); 
        let reportePropuestas = [];
        const contexto = { idPropuesto, session };

        // Auditoría por capas sobre el mapa total del proyecto
        for (const regla of ReglasReparacionV7) {
            regla.ejecutar(adnPropuesto, reportePropuestas, contexto);
        }

        return {
            tieneAnomalias: reportePropuestas.length > 0,
            nivelCriticidad: reportePropuestas.some(e => ["ADN_CORRUPTO", "BLOQUEO_LOGISTICA_CASETA"].includes(e.codigo)) ? "CRITICO" : "REPARABLE_BAJO_AUTORIZACION",
            reporte: reportePropuestas,
            payloadCorregido: adnPropuesto,
            timestamp: new Date().toISOString()
        };
    }
};

// ============================================================================
// 🚦 CAPA 2: GESTIA ORCHESTRATOR V7 (EL GATEKEEPER DE HEBER)
// ============================================================================

export const GestiaOrchestratorV7 = {
    /**
     * El Guardián del Búnker: Solo Heber autoriza la inyección final tras el diagnóstico.
     */
    solicitarRevisionCEO: async (rawData, idPropuesto, session, uiCallback) => {
        const diagnostico = SelfRepairSentinelV7.diagnosticarPayloadFinal(rawData, idPropuesto, session);

        if (diagnostico.nivelCriticidad === "CRITICO") {
            console.error("%c❌ [V7-BLOQUEO]: ADN irrecuperable o falla de seguridad masiva.", "color: #ef4444; font-weight: bold;");
            return { exito: false, motivo: "ADN_CORRUPTO", datos: null };
        }

        if (diagnostico.tieneAnomalias) {
            console.warn("%c⚠️ [CONSULTA AL CEO]: El Sentinel propone curación de ADN.", "color: #f59e0b; font-weight: bold;");
            
            // Pausa el despliegue y espera la firma digital de Heber en la UI V7
            const firmaHeber = await uiCallback(diagnostico);
            
            if (!firmaHeber) {
                console.log("%c🛑 [VETO HUMANO]: Reparación rechazada por el Architect.", "color: #ef4444; font-weight: bold;");
                return { exito: false, motivo: "RECHAZO_HEBER", datos: rawData };
            }
            
            console.log("%c✅ [SELLADO AUTORIZADO]: Inyectando ADN curado en producción.", "color: #10b981; font-weight: bold;");
            return { exito: true, motivo: "CURADO_V7", datos: diagnostico.payloadCorregido };
        }

        console.log("%c🟢 [SISTEMA PURO]: No se detectaron anomalías en el ADN.", "color: #10b981;");
        return { exito: true, motivo: "LIMPIO", datos: diagnostico.payloadCorregido };
    }
};

// ============================================================================
// ⚖️ CAPA 3: CONTRACT ENFORCER V7 (EL VERDUGO FINAL)
// ============================================================================

export const ContractEnforcerV7 = {
    validarLeyesConstitucionales: (payloadFinal) => {
        console.log("%c⚖️ [ENFORCER V7.01]: Verificando Leyes de la Constitución...", "color: #ef4444; font-weight: bold;");

        const cargaUtil = payloadFinal.json || payloadFinal.data || payloadFinal;

        if (!cargaUtil || typeof cargaUtil !== "object") {
            throw new Error("VIOLACIÓN: Carga útil inexistente o corrupta.");
        }

        // LEYES NO NEGOCIABLES (B2B/B2C COMPLIANCE)
        const nombre = cargaUtil.modulo_nombre || cargaUtil.nombre_display;
        if (!nombre) throw new Error("CONTRATO ROTO: Falta Identidad (modulo_nombre).");
        
        if (!cargaUtil.html) throw new Error("CONTRATO ROTO: Estructura Visual (HTML) ausente.");
        
        if (!cargaUtil.javascript) throw new Error("CONTRATO ROTO: Lógica Funcional (JS) ausente.");
        
        if (!Array.isArray(cargaUtil.esquema_campos)) {
            throw new Error("CONTRATO ROTO: 'esquema_campos' debe ser Array.");
        }

        // CONTROL DE CALIDAD DE MARCADO
        if (cargaUtil.html.length < 100 || !cargaUtil.html.includes('id=')) {
            console.warn("⚠️ [ENFORCER] Alerta de baja calidad en marcado HTML. Revisar renderizado.");
        }

        console.log("%c✅ [ENFORCER V7.01]: Constitución Validada. Despliegue Aprobado.", "color: #10b981; font-weight: bold;");
        return true;
    }
};