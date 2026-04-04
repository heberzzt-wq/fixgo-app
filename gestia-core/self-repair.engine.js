/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - SYSTEM SECURITY CORE V6.5 (CIRUJANO EN JEFE + AUTONOMÍA SUPERVISADA)
 * ======================================================================================
 * Autor: Heber Mendoza (CEO & Lead Architect)
 * Lógica: Detección -> Rastreos Profundos -> Propuesta -> Autorización Humana -> Contrato Final.
 * --------------------------------------------------------------------------------------
 * ⚠️ REGLA DE ORO: SIN CORTES. CÓDIGO ÍNTEGRO.
 * 🛰️ MAPA DE PROYECTO INYECTADO: functions/, gestia-core/, modules/, render/, engines/.
 * ======================================================================================
 */

// ============================================================================
// 🛡️ CAPA 1: SELF-REPAIR SENTINEL (EL MÉDICO DE COMBATE ACTIVO)
// ============================================================================

/**
 * 💉 INYECTOR ATÓMICO: Asegura que el ID viva en todas las capas posibles.
 * Sincronizado con: functions/index.js -> internalCreateModule (V5.55)
 */
const aplicarIdGlobal = (obj, id) => {
    if (!obj || typeof obj !== "object") return;
    
    // 1. Identidad de Raíz
    obj.modulo_id = id;
    obj.id = id; // Redundancia para Audit Engine

    // 2. Capa de Transporte IA (Para que gestiaArchitectV5 lo reconozca)
    if (obj.json && typeof obj.json === "object") {
        obj.json.modulo_id = id;
        obj.json.id = id;
    }
    
    // Capa Interna de Datos
    if (obj.data && typeof obj.data === "object") {
        obj.data.modulo_id = id;
        obj.data.id = id;
    }

    // 3. Capa de Persistencia (Para persistence.engine.js)
    if (obj.payload && typeof obj.payload === "object") {
        obj.payload.modulo_id = id;
        obj.payload.opId = id; // Clave para idempotencia
        obj.payload.documentId = id;
    }
    
    console.log(`%c💉 [INYECTOR] ID [${id}] sellado en todas las capas del ADN.`, "color: #10b981; font-weight: bold;");
};

/**
 * 🧩 MOTOR DE REGLAS PLUGGABLES (V6.5 - CONOCIMIENTO CLÍNICO AVANZADO)
 * Cada regla audita, propone cura y mapea impacto.
 */
const ReglasReparacion = [
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
        nombre: "RASTREO_PROFUNDO_ID_CORRUPTO", // EL LÍQUIDO DE CONTRASTE
        ejecutar: (adn, errores, contexto) => {
            const idRaiz = adn?.id || adn?.modulo_id;
            const idJson = adn?.json?.modulo_id || adn?.json?.id;
            const idData = adn?.data?.modulo_id;
            
            // Evaluamos si en alguna capa el ID se perdió o mutó
            const idsDetectados = [idRaiz, idJson, idData].filter(Boolean);
            const esCorrupto = idsDetectados.length === 0 || idsDetectados.some(id => ["undefined", "modulo_id", "[modulo_id]", "null", ""].includes(String(id).toLowerCase()));
            
            if (esCorrupto) {
                const idSugerido = contexto.idPropuesto || `fix_mod_core_${Date.now()}`;
                
                // Aplicamos la cura
                aplicarIdGlobal(adn, idSugerido);

                errores.push({
                    codigo: "INFARTO_ID_TERMINAL",
                    descripcion: `ID perdido o mutado en el transporte. Rastro detectado: Raiz[${idRaiz}], JSON[${idJson}], Data[${idData}]. Esto truena la Terminal.`,
                    solucion: `AUTOCURACIÓN (LÍQUIDO DE CONTRASTE): Reescritura profunda con ID Soberano [${idSugerido}].`,
                    archivo_origen: "semantic.engine.js / functions/index.js"
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
                const nombreSugerido = "Módulo Gestia_" + (contexto.idPropuesto?.replace('modulo_', '') || "Dynamic_v6");
                
                if (adn.json && typeof adn.json === "object") adn.json.modulo_nombre = nombreSugerido;
                else adn.modulo_nombre = nombreSugerido;

                errores.push({
                    codigo: "NOMBRE_AUSENTE",
                    descripcion: "La IA no asignó un nombre al módulo (modulo_nombre vacío).",
                    solucion: `AUTOCURACIÓN: Asignar nombre técnico [${nombreSugerido}] para cumplir contrato.`,
                    archivo_origen: "gestia-render.js"
                });
            }
        }
    },
    {
        nombre: "AUDITORIA_NODE22_ENTORNO", // MEDICINA PREVENTIVA
        ejecutar: (adn, errores, contexto) => {
            const codigoJS = adn?.json?.javascript || adn?.javascript || "";
            
            // Detectar patrones que rompen en Node 22 o Firebase Functions V2
            if (codigoJS.includes("require('domain')") || codigoJS.includes("new Buffer(")) {
                errores.push({
                    codigo: "ALERTA_DEPRECACION_NODE22",
                    descripcion: "Se detectaron métodos obsoletos incompatibles con el salto a Node 22 ('Buffer' antiguo o 'domain').",
                    solucion: "PROPUESTA ESTRUCTURAL: Migrar 'new Buffer()' a 'Buffer.from()' para mantener compatibilidad con el motor V2.0.",
                    archivo_origen: "gestia-core / functions"
                });
            }
        }
    },
    {
        nombre: "ANALISIS_ENTRELAZADO_DEPENDENCIAS", // VISIÓN OMNISCIENTE
        ejecutar: (adn, errores, contexto) => {
            const dependencias = adn?.json?.dependencias || [];
            
            // Si el módulo intenta inyectar lógica de pagos y no declara el feature flag...
            const codigoHTML = adn?.json?.html || "";
            if (codigoHTML.includes("stripe") && !dependencias.includes("gestia-payments")) {
                errores.push({
                    codigo: "RIESGO_ENTRELAZADO_ROTO",
                    descripcion: "Se detectó UI de pagos (Stripe/Efectivo) pero falta enlazar el módulo en el mapa local.",
                    solucion: "INYECCIÓN DE DEPENDENCIA: Agregar 'gestia-payments' al manifiesto para no romper Split Billing.",
                    archivo_origen: "modules/ / engines/"
                });
                // Autocura preventiva del mapa
                if (adn.json && typeof adn.json === "object") {
                    adn.json.dependencias = [...(adn.json.dependencias || []), "gestia-payments"];
                }
            }
        }
    }
];

export const SelfRepairSentinel = {
    diagnosticarPayloadFinal: (rawData, idPropuesto, session) => {
        console.log("%c🧬 [SENTINEL V6.5]: Iniciando Triaje Médico y Escaneo de Entrañas...", "color: #8b5cf6; font-weight: bold;");
        
        // Deep Clone para no contaminar el original hasta la aprobación en el quirófano
        let adnPropuesto = JSON.parse(JSON.stringify(rawData)); 
        let reportePropuestas = [];
        const contexto = { idPropuesto, session };

        // Auditoría clínica completa
        for (const regla of ReglasReparacion) {
            regla.ejecutar(adnPropuesto, reportePropuestas, contexto);
        }

        return {
            tieneAnomalias: reportePropuestas.length > 0,
            nivelCriticidad: reportePropuestas.some(e => e.codigo === "ADN_CORRUPTO") ? "CRITICO" : "REPARABLE_BAJO_AUTORIZACION",
            reporte: reportePropuestas,
            payloadCorregido: adnPropuesto,
            timestamp: new Date().toISOString()
        };
    }
};

// ============================================================================
// 🚦 CAPA 2: GESTIA ORCHESTRATOR (EL GATEKEEPER HUMANO)
// ============================================================================

export const GestiaOrchestrator = {
    /**
     * El Guardián del Quirófano: Solo Heber autoriza la incisión final.
     */
    solicitarAprobacionDespliegue: async (rawData, idPropuesto, session, uiCallback) => {
        const diagnostico = SelfRepairSentinel.diagnosticarPayloadFinal(rawData, idPropuesto, session);

        if (diagnostico.nivelCriticidad === "CRITICO") {
            console.error("%c❌ [ABORTO DE EMERGENCIA]: El ADN está irrecuperable. Deteniendo flujo.", "color: #ef4444; font-weight: bold;");
            return { exito: false, motivo: "ADN_CORRUPTO", datos: null };
        }

        if (diagnostico.tieneAnomalias) {
            console.warn("%c⚠️ [ATENCIÓN CEO]: El Cirujano detectó anomalías y propone ajustes.", "color: #f59e0b; font-weight: bold;");
            console.table(diagnostico.reporte);
            
            // Pausa la ejecución y espera la firma de Heber en la UI
            const heberFirma = await uiCallback(diagnostico.reporte, diagnostico.payloadCorregido);
            
            if (!heberFirma) {
                console.log("%c🛑 [VETO HUMANO]: Reparación rechazada. Manteniendo código original.", "color: #ef4444;");
                return { exito: false, motivo: "RECHAZO_HUMANO", datos: rawData };
            }
            
            console.log("%c✅ [FIRMA ACEPTADA]: Inyectando curación al flujo principal.", "color: #10b981; font-weight: bold;");
            return { exito: true, motivo: "REPARACION_APROBADA", datos: diagnostico.payloadCorregido };
        }

        // Si llegó sano desde el principio
        console.log("%c🟢 [SISTEMA LIMPIO]: Código en perfecto estado. Pase libre.", "color: #10b981;");
        return { exito: true, motivo: "SIN_ANOMALIAS", datos: diagnostico.payloadCorregido };
    }
};

// ============================================================================
// 🛑 CAPA 3: CONTRACT ENFORCER (EL VERDUGO FINAL - V6.5)
// ============================================================================

export const ContractEnforcer = {
    validarConstitucionModulo: (payloadFinal) => {
        console.log("%c⚖️ [CONTRACT ENFORCER]: Verificando Leyes de la Constitución V6.5...", "color: #ef4444; font-weight: bold;");

        const cargaUtil = payloadFinal.json || payloadFinal.data || payloadFinal;

        if (!cargaUtil || typeof cargaUtil !== "object") {
            throw new Error("VIOLACIÓN DE CONTRATO: La carga útil está vacía o no es un objeto válido.");
        }

        // LEYES NO NEGOCIABLES 
        const nombre = cargaUtil.modulo_nombre || cargaUtil.nombre_display;
        if (!nombre) throw new Error("CONTRATO ROTO: Falta 'modulo_nombre' tras intento de reparación.");
        
        if (!cargaUtil.html) throw new Error("CONTRATO ROTO: El módulo no tiene estructura visual (HTML).");
        
        if (!cargaUtil.javascript) throw new Error("CONTRATO ROTO: El módulo no tiene lógica funcional (JS).");
        
        if (!Array.isArray(cargaUtil.esquema_campos)) {
            throw new Error("CONTRATO ROTO: 'esquema_campos' debe ser un Array (Modelo B2B/B2C).");
        }

        // Validación de sincronización con gestia-render.js
        if (!cargaUtil.html.includes('id="') && !cargaUtil.html.includes("class=")) {
            console.warn("⚠️ [ENFORCER] HTML detectado con baja calidad de marcado. Posible fallo en renderizado.");
        }

        console.log("%c✅ [CONTRACT ENFORCER]: Constitución Validada. Módulo 100% Aprobado para Despliegue.", "color: #10b981; font-weight: bold;");
        return true;
    }
};