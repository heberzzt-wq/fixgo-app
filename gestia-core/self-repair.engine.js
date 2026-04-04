/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - SYSTEM SECURITY CORE V6.0 (NIVEL LUNAR)
 * ======================================================================================
 * Autor: Heber Mendoza (CEO & Lead Architect)
 * * ESTRUCTURA DE 2 CAPAS:
 * ENGINE 1: SELF-REPAIR SENTINEL (Médico de Combate - Reglas Pluggables)
 * ENGINE 2: STRICT CONTRACT ENFORCER (Cadenero Absoluto - Validación Semántica)
 * ======================================================================================
 */

// ============================================================================
// 🛡️ CAPA 1: SELF-REPAIR SENTINEL (EL MÉDICO DE COMBATE)
// ============================================================================

/**
 * 💉 INYECTOR ATÓMICO: Asegura que el ID viva en todas las capas posibles.
 */
const aplicarIdGlobal = (obj, id) => {
    if (!obj || typeof obj !== "object") return;
    obj.modulo_id = id;
    if (obj.json && typeof obj.json === "object") obj.json.modulo_id = id;
    if (obj.data && typeof obj.data === "object") obj.data.modulo_id = id;
    if (obj.payload && typeof obj.payload === "object") obj.payload.modulo_id = id;
};

/**
 * 🧩 MOTOR DE REGLAS PLUGGABLES (Escalabilidad Infinita)
 * Cada regla audita el ADN y propone soluciones si algo es reparable.
 */
const ReglasReparacion = [
    {
        nombre: "VALIDACION_JSON_NATIVO",
        ejecutar: (adn, errores) => {
            if (typeof adn.json === 'string') {
                try {
                    adn.json = JSON.parse(adn.json);
                    errores.push({
                        codigo: "RUIDO_NEURAL",
                        descripcion: "ADN entregado como string plano (texto).",
                        solucion: "Conversión a JSON nativo aprobada y ejecutada."
                    });
                } catch (e) {
                    errores.push({
                        codigo: "ADN_CORRUPTO",
                        descripcion: "Estructura JSON ilegible o truncada por la IA.",
                        solucion: "Abortar misión por riesgo estructural."
                    });
                }
            }
        }
    },
    {
        nombre: "VALIDACION_ID_SOBERANO",
        ejecutar: (adn, errores, contexto) => {
            const idActual = adn?.modulo_id || adn?.json?.modulo_id || adn?.data?.modulo_id;
            
            if (!idActual || ["undefined", "modulo_id", "[modulo_id]", "null"].includes(String(idActual))) {
                const idReparado = contexto.idPropuesto || `repair_mod_${Date.now()}`;
                aplicarIdGlobal(adn, idReparado);
                
                errores.push({
                    codigo: "FRACTURA_ID",
                    descripcion: `Identidad inválida, genérica o dispersa detectada: '${idActual}'`,
                    solucion: `Inyección Global de Identidad Activa: [${idReparado}]`
                });
            }
        }
    },
    {
        nombre: "VALIDACION_TENANT_AUTORIZADO",
        ejecutar: (adn, errores, contexto) => {
            const tenantOficial = contexto.session?.tenantId || localStorage.getItem('gestia_tenant_id');
            const tenantEnPayload = adn?.tenantId || adn?.json?.tenantId || adn?.data?.tenantId;

            if (tenantOficial && (!tenantEnPayload || String(tenantEnPayload).toLowerCase() !== String(tenantOficial).toLowerCase())) {
                // Inyectar en todas las capas
                adn.tenantId = tenantOficial;
                if (adn.json && typeof adn.json === "object") adn.json.tenantId = tenantOficial;
                if (adn.data && typeof adn.data === "object") adn.data.tenantId = tenantOficial;

                errores.push({
                    codigo: "TENANT_REWRITE",
                    descripcion: `Soberanía ausente o desalineada: [${tenantEnPayload || 'undefined'}]`,
                    solucion: `Forzado de Tenant a Búnker Oficial: [${tenantOficial}]`
                });
            }
        }
    }
];

export const SelfRepairSentinel = {
    /**
     * 🔍 DIAGNÓSTICO FORENSE PLUGGABLE: Encuentra fracturas y propone cura.
     */
    diagnosticarPayloadFinal: (rawData, idPropuesto, session) => {
        console.log("%c🧬 [SENTINEL V6.0]: Iniciando escaneo Pluggable de entrañas...", "color: #8b5cf6; font-weight: bold;");
        
        let adnPropuesto = structuredClone(rawData);
        let erroresDetectados = [];
        const contexto = { idPropuesto, session };

        // ⚡ Ejecución Dinámica del Firewall de Reglas
        for (const regla of ReglasReparacion) {
            regla.ejecutar(adnPropuesto, erroresDetectados, contexto);
        }

        return {
            tieneAnomalias: erroresDetectados.length > 0,
            nivelCriticidad: erroresDetectados.some(e => e.codigo === "ADN_CORRUPTO") ? "CRITICO" : "REPARABLE",
            reporte: erroresDetectados,
            payloadCorregido: adnPropuesto,
            timestamp: new Date().toISOString()
        };
    }
};

// ============================================================================
// 🛑 CAPA 2: CONTRACT ENFORCER (EL CADENERO ESTRICTO - V6.0)
// ============================================================================

export const ContractEnforcer = {
    /**
     * ⚖️ Evalúa la "Constitución" semántica del payload (La Regla de Oro).
     * No repara, no avisa, no negocia. Si falla, lanza un error fatal.
     */
    validarConstitucionModulo: (payloadFinal) => {
        console.log("%c⚖️ [CONTRACT ENFORCER]: Verificando Leyes de la Constitución V6.0...", "color: #ef4444; font-weight: bold;");

        // 1. Extraer la Carga Útil (Soporta múltiples capas según responda la IA)
        const cargaUtil = payloadFinal.json || payloadFinal.data || payloadFinal;

        if (!cargaUtil || typeof cargaUtil !== "object") {
            throw new Error("VIOLACIÓN DE CONTRATO (Sintaxis): La carga útil del módulo está vacía o no es un objeto válido.");
        }

        // 2. LEY DE IDENTIDAD VISUAL (Nombre del módulo)
        const nombre = cargaUtil.modulo_nombre || cargaUtil.nombre_display;
        if (!nombre || typeof nombre !== "string" || nombre.trim() === "") {
            throw new Error("VIOLACIÓN DE CONTRATO (Semántica): El módulo carece de 'modulo_nombre'. Imposible indexar en la plataforma.");
        }

        // 3. LEY DE ESTRUCTURA VISUAL (HTML)
        if (!cargaUtil.html || typeof cargaUtil.html !== "string" || cargaUtil.html.trim() === "") {
            throw new Error("VIOLACIÓN DE CONTRATO (Semántica): El módulo carece de estructura visual (La llave 'html' está vacía o ausente).");
        }

        // 4. LEY DE LÓGICA DE NEGOCIO (JavaScript)
        if (!cargaUtil.javascript || typeof cargaUtil.javascript !== "string" || cargaUtil.javascript.trim() === "") {
            throw new Error("VIOLACIÓN DE CONTRATO (Semántica): El módulo es un componente muerto (La llave 'javascript' está vacía o ausente).");
        }

        // 5. LEY DE ESQUEMA DE DATOS (El Modelo B2B de Firestore)
        const esquema = cargaUtil.esquema_campos;
        if (!esquema || !Array.isArray(esquema)) {
            throw new Error("VIOLACIÓN DE CONTRATO (Base de Datos): Falla crítica. 'esquema_campos' debe ser un Array (obligatorio, aunque esté vacío).");
        }

        // 6. VALIDACIÓN PROFUNDA DE ESQUEMA (Auditoría Forense de Campos)
        esquema.forEach((item, index) => {
            if (!item || typeof item !== "object") {
                throw new Error(`VIOLACIÓN DE CONTRATO (Esquema Corrupto): El elemento [${index}] de 'esquema_campos' no es un objeto.`);
            }
            if (!item.campo || !item.tipo) {
                throw new Error(`VIOLACIÓN DE CONTRATO (Esquema Corrupto): El campo [${index}] no tiene las llaves obligatorias 'campo' y/o 'tipo'.`);
            }
        });

        // 🛡️ SI LLEGA HASTA AQUÍ, LA IA NOS ENTREGÓ ORO PURO.
        console.log("%c✅ [CONTRACT ENFORCER]: Constitución Validada. El Módulo es digno del Búnker.", "color: #10b981; font-weight: bold;");
        return true;
    }
};