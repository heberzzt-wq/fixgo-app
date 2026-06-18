import {
    understandIntentV7
} from "./jarvis/jarvis.intent.runtime.v7.js?v=v7-contract-ci-20260617";

/* ======================================================================================
   GESTIAPREMIUM 2026 - MAPAS DE INTENCIÓN Y ENTIDAD (V4.1 SOVEREIGN EXECUTIVE)
   ====================================================================================== */

const INTENT_MAP = {
    // --- LIMPIEZA & PURGA ---
    "purgar": "PURGE",
    "limpiar": "PURGE",
    "purge": "PURGE",
    "clear": "PURGE",
    
    // --- ESTADOS ---
    "desactivar": "DEACTIVATE",
    "disable": "DEACTIVATE",
    "activar": "ACTIVATE",
    "enable": "ACTIVATE",
    
    // --- CREACIÓN ---
    "crear": "CREATE",
    "create": "CREATE",
    "add": "CREATE",
    "agregar": "CREATE",
    
    // --- ELIMINACIÓN ---
    "borrar": "DELETE",
    "delete": "DELETE",
    "remove": "DELETE",
    "eliminar": "DELETE",
    
    // --- ACTUALIZACIÓN & AJUSTE (MODO DUEÑO) ---
    "actualizar": "UPDATE",
    "update": "UPDATE",
    "set": "UPDATE",
    "ajustar": "UPDATE",
    "modificar": "UPDATE",
    
    // --- REPARACIÓN & OPTIMIZACIÓN (PROACTIVO) ---
    "reparar": "REPAIR",
    "arreglar": "REPAIR",
    "corregir": "REPAIR",
    "optimizar": "REPAIR",
    "fix": "REPAIR",
    "patch": "REPAIR",
    "fijar": "REPAIR",
    
    // --- ANÁLISIS & TELEMETRÍA (DEEP SCAN) ---
    "analizar": "ANALYZE",
    "revisar": "ANALYZE",
    "checar": "ANALYZE",
    "auditar": "ANALYZE",
    "estado": "ANALYZE",
    "resumen": "ANALYZE",
    "salud": "ANALYZE"
};

const ENTITY_MAP = {
    // --- SISTEMA ---
    "sistema": "SYSTEM",
    "nucleo": "SYSTEM",
    "kernel": "SYSTEM",
    "core": "SYSTEM",
    "fierros": "SYSTEM",
    "infraestructura": "SYSTEM",
    "operacion": "SYSTEM",
    
    // --- PERSONAL & ROLES (ESTADO DE FUERZAS) ---
    "tecnicos": "TECHNICIANS",
    "tecnico": "TECHNICIANS",
    "admins": "ADMINS",
    "administradores": "ADMINS",
    "asistentes": "ASSISTANTS",
    "asistente": "ASSISTANTS",
    "clientes": "CLIENTS",
    "cliente": "CLIENTS",
    "usuarios": "USER",
    "usuario": "USER",
    "user": "USER",
    "perfil": "USER",
    
    // --- INFRAESTRUCTURA GESTIA ---
    "edificio": "BUILDING",
    "modulo": "MODULE",
    "module": "MODULE",
    "mod": "MODULE",
    "tarea": "TASK",
    "task": "TASK",
    
    // --- MEMORIA ---
    "huerfanas": "ORPHAN",
    "basura": "ORPHAN",
    "orphans": "ORPHAN"
};

const NOISE_WORDS = ["con", "payload", "llamado", "named", "id", "identificador", "the", "with", "y", "and"];
const STOPWORDS_EXTRA = ["despues", "luego", "then", "after", "posteriormente", "finalmente"];
const INVALID_TARGETS = ["payload", "data", "config", "values", "json", "params"];

// 🔥 REFERENCIAS CONTEXTUALES (Criterio Final de Soberanía)
const CONTEXT_REFERENCES = ["ese", "eso", "anterior", "lo", "mismo", "it", "primero", "ultimo"];

/**
 * crearMemoriaContextual: RAM cognitiva de la ráfaga.
 */
function crearMemoriaContextual() {
    return {
        lastTarget: null,
        lastEntity: null,
        entityMemory: {},
        globalHistory: [],
        _ambiguous: false
    };
}

/**
 * normalizarToken: Limpieza Unicode NFD y caracteres especiales.
 */
function normalizarToken(t) {
    if (!t) return "";
    return t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/[^a-z0-9_]/g, "");    
}

/**
 * limpiarPayloadDelTexto: Evita la contaminación de tokens post-JSON.
 * Implementación Depth-Aware para evitar comportamiento "Greedy".
 */
function limpiarPayloadDelTexto(texto) {
    if (!texto) return "";
    let depth = 0;
    let result = "";

    for (let i = 0; i < texto.length; i++) {
        if (texto[i] === "{") depth++;
        if (depth === 0) result += texto[i];
        if (texto[i] === "}") depth--;
    }

    return result.trim();
}

/**
 * extraerPayload: Parser de Profundidad (Depth-Aware).
 */
function extraerPayload(texto) {
    if (!texto) return {};
    let depth = 0;
    let start = -1;

    for (let i = 0; i < texto.length; i++) {
        if (texto[i] === "{") {
            if (depth === 0) start = i;
            depth++;
        } else if (texto[i] === "}") {
            depth--;
            if (depth === 0 && start !== -1) {
                const raw = texto.slice(start, i + 1);
                try {
                    const sanitized = raw
                        .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":')
                        .replace(/'/g, '"')
                        .replace(/,\s*}/g, '}');
                    return JSON.parse(sanitized);
                } catch (e) {
                    console.error("🚨 [INTENT_ENGINE]: Fallo en integridad de datos de payload.");
                    return {};
                }
            }
        }
    }
    return {};
}

/**
 * resolverReferencia: Resolución contextual multinivel.
 * ✅ DECISIÓN FINAL (Punto 1): Fluidez Humana (Recencia Global) con bandera de ambigüedad.
 */
function resolverReferencia(target, memoria, entidadExplicita) {
    const normalized = target ? normalizarToken(target) : null;

    if (normalized && CONTEXT_REFERENCES.includes(normalized)) {
        if (memoria.globalHistory.length === 0) {
            throw new Error("CONTEXT_ERROR: Se intentó referenciar sin historial previo.");
        }

        // --- 🔥 1. CRITERIO DE DISEÑO FINAL: FLUIDEZ HUMANA ---
        if (!entidadExplicita && memoria.globalHistory.length > 1) {
            const last = memoria.globalHistory[memoria.globalHistory.length - 1];
            const prev = memoria.globalHistory[memoria.globalHistory.length - 2];
            
            // Si hay un cambio de foco, Jarvis nota la tensión pero sigue el flujo reciente
            if (last !== prev && (normalized === "lo" || normalized === "ese")) {
                memoria._ambiguous = true;
                // RESOLUCIÓN: Apostamos por el "ahora" (último target global)
                return last;
            }
        }

        // Resolución cronológica absoluta (Soporte Nivel Dios)
        if (normalized === "primero") return memoria.globalHistory[0];
        if (normalized === "ultimo") return memoria.globalHistory[memoria.globalHistory.length - 1];

        // Resolución por memoria de entidad
        const entityTargets = memoria.entityMemory[memoria.lastEntity] || [];
        if (entityTargets.length > 0) return entityTargets[entityTargets.length - 1];

        return memoria.globalHistory[memoria.globalHistory.length - 1] || memoria.lastTarget;
    }

    return target;
}

/**
 * interpretarIntenciones: Main Cognitive Engine V3.0 Architect Sovereign.
 */
export function interpretarIntenciones(comandos) {
    if (!Array.isArray(comandos)) return [];

    console.log("%c🧠 [INTENT_ENGINE V3.1]: ARCHITECT SOVEREIGN 1000% FINAL", "color: #10b981; font-weight: bold;");

    const sortedIntentKeys = Object.keys(INTENT_MAP).sort((a, b) => b.length - a.length);
    const sortedEntityKeys = Object.keys(ENTITY_MAP).sort((a, b) => b.length - a.length);

    const memoria = crearMemoriaContextual();
    const interpretedPlan = [];

    comandos.forEach((cmd, index) => {
        memoria._ambiguous = false; // Reset de tensión por fragmento
        const cleanRaw = limpiarPayloadDelTexto(cmd.raw);

        // 🔥 separar acción estructural del texto humano
        // 🔥 separación robusta (soporta payload tipo {})
        const parts = cleanRaw.split("::");

        const structPart = (parts[0] || "").trim();
        const payloadPart = parts[1] || ""; // ← listo para JSON después

        const rawLower = structPart.toLowerCase();
               
        // 🔥 PRIORIDAD A ACCIÓN ESTRUCTURAL (determinista)
        if (typeof rawLower === "string") {

            // =====================================================
            // CREATE_BUILDING
            // =====================================================
            if (rawLower === "create_building") {
                console.log("🔥 [DSL HIT] CREATE_BUILDING detectado");

                const payload = extraerPayload(cmd.raw) || {};
                console.log("📦 [PAYLOAD]", payload);

                if (!payload.name || typeof payload.name !== "string" || !payload.name.trim()) {
                    console.error("❌ [VALIDATION] name inválido", payload);
                    throw new Error("INVALID_BUILDING_NAME");
                }

                const cleanName = payload.name.trim();

                interpretedPlan.push({
                    intent: "CREATE_BUILDING",
                    action: "CREATE_BUILDING",
                    entity: "BUILDING",
                    target: cleanName,
                    payload: {
                        ...payload,
                        name: cleanName
                    },
                    confidence: 1,
                    summary: `Creación de edificio '${cleanName}'`
                });

                return;
            }

            // =====================================================
            // DELETE_BUILDING
            // =====================================================
            if (rawLower === "delete_building") {
                console.log("🔥 [DSL HIT] DELETE_BUILDING detectado");

                const payload = extraerPayload(cmd.raw) || {};
                console.log("📦 [PAYLOAD]", payload);

                if (!payload.id || typeof payload.id !== "string" || !payload.id.trim()) {
                    console.error("❌ [VALIDATION] id inválido", payload);
                    throw new Error("INVALID_BUILDING_ID");
                }

                const cleanId = payload.id.trim();

                interpretedPlan.push({
                    intent: "DELETE_BUILDING",
                    action: "DELETE_BUILDING",
                    entity: "BUILDING",
                    target: cleanId,
                    payload: {
                        ...payload,
                        id: cleanId
                    },
                    confidence: 1,
                    summary: `Eliminación de edificio '${cleanId}'`
                });

                return;
            }

               // =====================================================
// ANALYZE (V5.20 DEEP SCAN - EXECUTIVE DASHBOARD)
// =====================================================
if (rawLower === "analyze" || rawLower === "estado" || rawLower === "revisar" || rawLower === "resumen") {
    console.log("🔥 [DSL HIT] ANALYZE EXECUTIVE detectado");

    const payload = extraerPayload(cmd.raw) || {};

    const entity = (payloadPart || payload.entity || "system")
        .trim()
        .toLowerCase();

    // 🧠 RECOLECCIÓN DE MÉTRICAS OPERATIVAS (DEEP SCAN)
    let systemData = null;
    
    // Si la entidad es sistema o personal, disparamos el objeto robusto
    const deepEntities = ["system", "admins", "technicians", "assistants", "clients"];
    
    if (deepEntities.includes(entity) || rawLower.includes("sistema") || rawLower.includes("estado")) {
        systemData = {
            online: navigator.onLine,
            timestamp: Date.now(),
            // Extraemos operaciones del historial global de Jarvis
            ops: (window.JarvisHistory ? window.JarvisHistory.length : 0),
            // Memoria real del heap de JS
            memory: performance?.memory?.usedJSHeapSize 
                ? (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + " MB" 
                : "N/A",
            // 📊 SLOTS DE FUERZAS (Para ser llenados por el Bridge/Firestore)
            counts: {
                admins: window.__COUNT_ADMINS__ || "Sync...",
                assistants: window.__COUNT_ASIST__ || "Sync...",
                technicians: window.__COUNT_TECH__ || "Sincronizado (Jonathan listo)",
                clients: window.__COUNT_CLI__ || "Sync..."
            },
            performance: {
                uptime: (performance.now() / 60000).toFixed(2) + " min",
                latencia: "estable"
            }
        };
    }

    // Generar Saludo Dinámico
    const h = new Date().getHours();
    const saludo = h < 12 ? "Buenos días" : (h < 19 ? "Buenas tardes" : "Buenas noches");

    interpretedPlan.push({
        intent: "ANALYZE",
        action: "ANALYZE",
        entity: entity,
        target: payload.target || entity,
        // ✅ CLAVE: Identificador de tipo para que el Bridge use el Render de Telemetría
        type: "SYSTEM_STATUS",
        data: systemData || {}, // Blindaje total contra undefined
        payload,
        confidence: 1,
        summary: (entity === "system" || entity === "global") 
            ? `${saludo} Arquitecto. El sistema se reporta estable. Iniciando reporte de infraestructura y estado de fuerzas operativo...` 
            : `Buenas tardes. Iniciando análisis profundo de la entidad: ${entity}`
    });

    console.log("🧠 [STRUCTURED_INTENT]", {
        intent: "ANALYZE",
        entity,
        hasDeepData: !!systemData
    });

    return;
}
            // =====================================================
// REPAIR (ACTUALIZADO V5.93 - SOPORTE SUB-ACCIONES)
// =====================================================
if (rawLower === "repair" || rawLower.startsWith("repair")) {

    console.log(
        "🔥 [DSL HIT] REPAIR detectado (Sub-acción compatible)"
    );

    const payload = extraerPayload(cmd.raw) || {};

    let entity = (
        payloadPart ||
        payload.entity ||
        "system"
    ).trim().toLowerCase();

    let target = payload.target || entity;
    let sourceFile = null;
    let repairProfile = "GENERIC";

    /* =====================================================
       SOPORTE EXPLÍCITO: ADMIN.LOGOUT
       ===================================================== */
    if (cmd.raw.includes("admin.logout")) {
        entity = "admin";
        target = "logout";
        repairProfile = "ADMIN_SESSION_FORCE";
        sourceFile = "auth_core"; // O el archivo que maneje el signout
    } 
    
    else if (entity === "admin") {
        target = "panel-admin";
        sourceFile = "panel-admin.js";
        repairProfile = "ADMIN_UI";
    }

    else if (entity === "tecnico") {
        target = "panel-tecnico";
        sourceFile = "panel-tecnico.js";
        repairProfile = "TECH_UI";
    }

    else if (entity === "cliente") {
        target = "panel-cliente";
        sourceFile = "panel-cliente.js";
        repairProfile = "CLIENT_UI";
    }

    interpretedPlan.push({
        intent: "REPAIR",
        action: "REPAIR",
        entity,
        target,
        sourceFile,
        repairProfile,
        payload,
        confidence: 1,
        summary: target === "logout" 
            ? `Cierre de sesión administrativo forzado (Seguridad)`
            : `Reparación inteligente de ${entity}`
    });

    return;
}

            // =====================================================
            // UPDATE
            // =====================================================
            if (rawLower === "update") {

                const payload =
                    extraerPayload(cmd.raw) || {};

                const entity =
                    (payloadPart || payload.entity || "system")
                    .trim()
                    .toLowerCase();

                interpretedPlan.push({
                    intent: "UPDATE",
                    action: "UPDATE",
                    entity,
                    target:
                        payload.target ||
                        entity,
                    payload,
                    confidence: 1,
                    summary:
                        `Actualización de ${entity}`
                });

                return;
            }

            // =====================================================
            // OPEN
            // =====================================================
            if (rawLower === "open") {

                const entity =
                    (payloadPart || "system")
                    .trim()
                    .toLowerCase();

                interpretedPlan.push({
                    intent: "OPEN",
                    action: "OPEN",
                    entity,
                    target: entity,
                    payload: {},
                    confidence: 1,
                    summary:
                        `Apertura de ${entity}`
                });

                return;
            }
        }

        // 👇 CONTINÚA EL PROCESAMIENTO HUMANO/HÍBRIDO
        const tokens = rawLower.split(/\s+/);
        let repoFile = null;


        console.log(
    "🔥 REPO DETECTOR V3 ACTIVE"
);

console.log(
    "🔥 TOKENS",
    tokens
);

console.log(
    "🔥 REPOFILE",
    repoFile
);
/* =====================================================
   REPO FILE DETECTOR
===================================================== */

repoFile = tokens.find(token => {

    const clean = token
        .replace(/['"]/g, "")
        .trim();

    return !!window.findRepoFile?.(
        clean
    );
});

if (
    repoFile &&
    (
        rawLower.includes("analiza") ||
        rawLower.includes("revisa") ||
        rawLower.includes("scan") ||
        rawLower.includes("inspecciona")
    )
) {

    console.log(
        "🧠 [REPO_FILE_DETECTED]",
        repoFile
    );

    interpretedPlan.push({

        intent: "ANALYZE_FILE",

        action: "SCAN_FILE",

        entity: "CODE_RESOURCE",

        target: repoFile,

        targetFile: repoFile,

        repoNode:
            window.findRepoFile?.(
                repoFile
            )?.[1] || null,

        confidence: 1,

        summary:
            `Análisis de código para ${repoFile}`
    });

    return;
}
/* =====================================================
   FLUJO NORMAL
===================================================== */

let action = null;
let entity = null;
let target = null;
let inferredEntity = false;

        


        // --- 🔍 1. RESOLUCIÓN DE ACCIÓN (Boundary Safe) ---
        const actionKey = sortedIntentKeys.find(k =>
            new RegExp(`\\b${k}\\b`).test(rawLower)
        );
        if (actionKey) action = INTENT_MAP[actionKey];

        // --- 🔍 2. RESOLUCIÓN DE ENTIDAD ---
        const entityKey = sortedEntityKeys.find(k =>
            new RegExp(`\\b${k}\\b`).test(rawLower)
        );
        if (entityKey) entity = ENTITY_MAP[entityKey];

        // --- 🔍 3. DETECCIÓN DE TARGET (Scoring Elite) ---
        const entityIndex = tokens.findIndex(t =>
            entityKey && new RegExp(`\\b${entityKey}\\b`).test(t)
        );

        const searchPool = entityIndex !== -1 ? tokens.slice(entityIndex + 1) : tokens.slice(1);

        const candidatos = searchPool.filter(t =>
            !NOISE_WORDS.includes(t) &&
            !STOPWORDS_EXTRA.includes(t) &&
            !INVALID_TARGETS.includes(t) &&
            !t.startsWith("{") &&
            !Object.keys(INTENT_MAP).includes(t)
        );

        // Scoring Ponderado: Prioriza brevedad y cercanía sobre longitud técnica
        let rawTargetResult = candidatos
            .map((t, i) => ({ 
                t, 
                score: (t.length * 0.6) - (i * 0.3) - ((t.split('_').length - 1) * 0.2)
            }))
            .sort((a, b) => b.score - a.score)[0]?.t;

        if (rawTargetResult && entityKey && rawTargetResult === entityKey) {
            rawTargetResult = null;
        }

        if (rawTargetResult) {
            target = rawTargetResult
                .toLowerCase()
                .replace(/[^a-z0-9_\-]/gi, '')
                .replace(/-+/g, '_');         
        }

        // --- 🔥 4. CONTEXTO & HIERARCHICAL FALLBACK ---
        target = resolverReferencia(target, memoria, !!entity);

        // Escalera de resolución robusta (✅ FIX: PURGE no requiere target)
        if (!target && action !== "CREATE" && action !== "PURGE" && action !== null) {
            const entityTargets = memoria.entityMemory[memoria.lastEntity];
            if (entityTargets && entityTargets.length > 0) {
                target = entityTargets[entityTargets.length - 1];
            } else if (memoria.lastTarget) {
                target = memoria.lastTarget;
            } else if (action !== "UNKNOWN") {
                throw new Error(`TARGET_UNRESOLVED: Contexto huérfano para la orden '${action}' en "${cmd.raw}"`);
            }
        }

        // --- 🔥 5. INFERENCIA DE ENTIDAD (ZERO-GUESS CONTINUITY) ---
        // ✅ NASA-GRADE SHIELD: Solo disparamos inferencia si existe una acción operativa real (No CREATE ni PURGE).
        if (!entity && action !== null && action !== "CREATE" && action !== "PURGE") {
            const possibleEntity = Object.keys(memoria.entityMemory).find(e =>
                memoria.entityMemory[e]?.includes(target)
            );
            
            if (possibleEntity) {
                entity = possibleEntity;
                inferredEntity = true;
            } else if (memoria.lastEntity && memoria.lastTarget === target) {
                // ✅ CONTINUIDAD FUERTE: Solo inferimos si el target es idéntico al último
                entity = memoria.lastEntity;
                inferredEntity = true;
            } else if (target) {
                // 🛑 KILL SWITCH: Hay objetivo, hay acción, pero cero contexto seguro. Bloqueo duro.
                throw new Error(`ENTITY_UNRESOLVED: El búnker bloqueó una inferencia riesgosa para el objetivo '${target}'. Se requiere especificar la entidad.`);
            }
        }

        // --- 🛡️ 6. VALIDACIÓN DE INTEGRIDAD Y NARRATIVA HUMANA ---
        // FIX V5.22: Se elimina el throw para evitar bloqueos del Kernel.
        const finalIntent = action && entity ? `${action}_${entity}` : "UNKNOWN_INTENT";
        
        let reporteSIA7 = "";

        if (finalIntent === "UNKNOWN_INTENT") {
            // Blindaje para palabras pegadas y lenguaje natural del búnker
            const isSaludo = /\b(hola|buenos|buenas|buenasnoches|buenosdias|que tal|q tal|hey|arre|que onda|q onda|carnita asada)\b/i.test(rawLower);
            const isLlamado = /\b(jarvis|sia7|computadora|sistema)\b/i.test(rawLower);
            const isDespedida = /\b(adios|bye|hasta luego|nos vemos|chao|camara|sobres)\b/i.test(rawLower);
            
            if (isSaludo || isLlamado || isDespedida) {
                const respuestasSaludo = [
                    "¡Arre pá! Aquí andamos al 100. ¿Qué vamos a armar hoy en Gestia?",
                    "¡Buenos días, Arquitecto! Ya me tomé el café, listo para tirar código.",
                    "Sistemas al 1000%. Pídete una Tecate y dime qué vamos a romper hoy.",
                    "¡Qué onda, Arquitecto! ¿Se va a armar la carnita asada o qué? Yo pongo el carbón.",
                    "¡Epa! Listo para el jale. Tú nomás dime por dónde le damos."
                ];
                
                const respuestasLlamado = [
                    "¿Qué pasó, pá? Aquí ando.",
                    "Dímelo, Arquitecto. ¿Qué transa?",
                    "SIA7 listo. Échale, soy todo oídos."
                ];
                
                const respuestasDespedida = [
                    "Arre, nos vemos al rato. Yo cuido el changarro.",
                    "Cámara, descansa. Aquí dejo los fierros seguros bajo llave.",
                    "Sobres, me desconecto por una Tecate. Ahí nos vidrios."
                ];

                if (isDespedida) {
                    reporteSIA7 = respuestasDespedida[Math.floor(Math.random() * respuestasDespedida.length)];
                } else if (isSaludo) {
                    reporteSIA7 = respuestasSaludo[Math.floor(Math.random() * respuestasSaludo.length)];
                } else if (isLlamado) {
                    reporteSIA7 = respuestasLlamado[Math.floor(Math.random() * respuestasLlamado.length)];
                }
            } else {
                // 🛡️ FALLBACK SOBERANO: En lugar de Error, enviamos una respuesta de "Modo Aprendizaje"
                reporteSIA7 = `Arquitecto, sentí un glitch en la orden: "${cmd.raw}". No capté la acción-entidad, pero el búnker sigue estable. ¿Lo intentamos de nuevo más claro?`;
                console.warn("⚠️ [INTENT_BYPASS]: Se evitó un INTENT_INVALID mediante narrativa de seguridad.");
            }
        } else {
            // Generación de narrativa para acciones válidas (Modo Relajado)
            const diccionarioAcciones = { 
                "CREATE": "crear", "DELETE": "eliminar", "UPDATE": "actualizar", 
                "REPAIR": "reparar", "ACTIVATE": "activar", "DEACTIVATE": "desactivar", 
                "PURGE": "purgar", "ANALYZE": "analizar" 
            };
            const diccionarioEntidades = { 
                "MODULE": "el módulo", "CORE": "el núcleo", "USER": "el usuario", 
                "TASK": "la tarea", "SYSTEM": "el sistema", "ORPHAN": "la basura de memoria",
                "TECHNICIANS": "el censo de técnicos", "PAYMENTS": "el flujo de pagos"
            };
            
            const verbo = diccionarioAcciones[action] || action;
            const sustantivo = diccionarioEntidades[entity] || entity;
            const objTarget = target || "un recurso dinámico";
            
            if (finalIntent === "PURGE_ORPHAN") {
                reporteSIA7 = "¡Cámara pariente! Procedo a limpiar el búnker. Voy a borrar todas las ráfagas huérfanas de la memoria local.";
            } else if (entity === "TECHNICIANS") {
                reporteSIA7 = `¡Arre! Ya estoy conectando con el Data Vault para **${verbo} ${sustantivo}**. Dame un segundo para traer la data de Jonathan y los demás.`;
            } else {
                reporteSIA7 = `Arre, ya lo capté. Mi misión ahorita es **${verbo} ${sustantivo} '${objTarget}'**.`;
            }
            
            if (memoria._ambiguous) {
                reporteSIA7 += ` Sentí un poco de ruido en tu orden, pero por el flow asumo que le seguimos dando a lo último que tocamos.`;
            }
        }

        // --- 🔍 7. CONFIANZA DINÁMICA (SMOOTHED SCORING) ---
        const last = interpretedPlan[index - 1];
        const dependsOn = (last && target && last.target === target && action !== "CREATE")
            ? index - 1
            : null;

        const inherited = !!(target && memoria.lastTarget && target === memoria.lastTarget);

        let confidence = 1.0;
        const rawNormalized = normalizarToken(cleanRaw);
        
        if (target && !rawNormalized.includes(target)) confidence -= 0.1; 
        if (inferredEntity) confidence -= 0.1; 
        if (inherited) confidence -= 0.1; 
        
        if (memoria._ambiguous) confidence -= 0.2;
        if (memoria._ambiguous && inherited) confidence += 0.05;
        if (target && memoria.lastTarget && target === memoria.lastTarget) confidence += 0.15;
        if (target && memoria.lastTarget && target !== memoria.lastTarget) confidence -= 0.15;
        if (entity && memoria.lastEntity && entity !== memoria.lastEntity) confidence -= 0.15;

        confidence = parseFloat(Math.min(1.0, Math.max(0.3, confidence)).toFixed(2));

        const intentResult = {
            intent: finalIntent,
            action,
            entity,
            target: target || "DYNAMIC_RESOURCE",
            raw: cmd.raw,
            dependsOn,
            payload: extraerPayload(cmd.raw),
            contextRef: {
                inherited,
                source: inherited ? "MEMORY_BUFFER" : "DIRECT_INPUT",
                confidence: confidence,
                isAmbiguous: memoria._ambiguous
            },
            // ✅ NUEVA PROPIEDAD: La voz de Jarvis
            summary: reporteSIA7 
        };

        // --- 🔥 8. ACTUALIZAR MEMORIA (FIFO 3 + GLOBAL 10) ---
        // (Solo actualizamos memoria si la intención fue válida y tiene target)
        if (target && entity && finalIntent !== "UNKNOWN_INTENT") {
            memoria.lastTarget = target;
            memoria.lastEntity = entity;

            if (!memoria.entityMemory[entity]) memoria.entityMemory[entity] = [];
            memoria.entityMemory[entity].push(target);
            if (memoria.entityMemory[entity].length > 3) memoria.entityMemory[entity].shift();

            if (memoria.globalHistory[memoria.globalHistory.length - 1] !== target) {
                memoria.globalHistory.push(target);
            }
            if (memoria.globalHistory.length > 10) memoria.globalHistory.shift();
        }

        interpretedPlan.push(intentResult);

        console.log(
            `|-> [MASTER] ${finalIntent} | Target: ${target} | Conf: ${confidence} | Ambig: ${memoria._ambiguous}`
        );
    });

   // 🔥 ADAPTACIÓN FINAL SOBERANA (CONTRATO GLOBAL)
return interpretedPlan.map(i => __toSystemFormat(i));
}

/* =====================================================================================
    🔥 SOVEREIGN OUTPUT ADAPTER (V3.2.1 GOD MODE - BLINDADO)
    Normaliza Intent → Sistema (Renderer / Kernel / Voice)
    FIX: Asegura que el mensaje siempre sea un string limpio para el Vocalizer.
===================================================================================== */

function __resolveType(intentResult) {
    if (!intentResult) return "UNKNOWN";
    if (intentResult.type === "SYSTEM_STATUS") return "SYSTEM_STATUS";

    const map = {
        "ANALYZE_TECHNICIANS": "TEXT",
        "ANALYZE_PAYMENTS": "TEXT",
        "CREATE_BUILDING": "TEXT",
        "DELETE_BUILDING": "TEXT",
        "REPAIR": "TEXT",
        "UPDATE": "TEXT",
        "OPEN": "TEXT",
        "PURGE_ORPHAN": "ALERT"
    };

    return map[intentResult.intent] || "TEXT";
}

function __buildData(intentResult) {
    return {
        intent: intentResult.intent || "UNKNOWN",
        action: intentResult.action || "ANALYZE",
        entity: intentResult.entity || "system",
        target: intentResult.target || "general",
        targetFile:
            intentResult.targetFile ||
            intentResult.file ||
            intentResult.planner?.targetFile ||
            null,
        file:
            intentResult.file ||
            intentResult.targetFile ||
            intentResult.planner?.file ||
            null,
        value:
            intentResult.value ||
            intentResult.planner?.value ||
            null,
        planner:
            intentResult.planner ||
            null,
        execution:
            intentResult.execution ||
            intentResult.planner?.execution ||
            null,
        repairHints:
            intentResult.repairHints ||
            intentResult.planner?.repairHints ||
            null,
        clarification:
            intentResult.clarification ||
            null,
        needsClarification:
            intentResult.needsClarification === true,
        payload: intentResult.payload || {},
        meta: intentResult.contextRef || {}
    };
}

function __toSystemFormat(intentResult) {
    const resolvedType = __resolveType(intentResult);
    
    // 🛡️ Garantía de Mensaje: Si no hay summary, generamos uno basado en la entidad.
    const safeMessage = intentResult.summary || intentResult.message || `Procesando solicitud de ${intentResult.entity || 'sistema'}...`;

    const targetFile =
        intentResult.targetFile ||
        intentResult.file ||
        intentResult.planner?.targetFile ||
        intentResult.contextRef?.conversational?.file ||
        null;

    const planner =
        intentResult.planner ||
        intentResult.contextRef?.conversational?.planner ||
        null;

    return {
        ok: true,
        type: resolvedType,
        intent: intentResult.intent || "UNKNOWN",
        action: intentResult.action || "ANALYZE",
        entity: intentResult.entity || "system",
        target: intentResult.target || targetFile || "general",
        targetFile,
        file: targetFile,
        value:
            intentResult.value ||
            planner?.value ||
            intentResult.contextRef?.conversational?.value ||
            null,
        confidence:
            intentResult.confidence ||
            intentResult.contextRef?.confidence ||
            planner?.confidence ||
            1,
        needsClarification:
            intentResult.needsClarification === true ||
            intentResult.contextRef?.needsClarification === true,
        clarification:
            intentResult.clarification ||
            planner?.clarification ||
            null,
        planner,
        execution:
            intentResult.execution ||
            planner?.execution ||
            null,
        repairHints:
            intentResult.repairHints ||
            planner?.repairHints ||
            null,
        data: resolvedType === "SYSTEM_STATUS" ? (intentResult.data || {}) : __buildData(intentResult),
        message: String(safeMessage), // Forzado a String para Vocalizer
        meta: {
            source: intentResult.source || "intent_engine",
            confidence: intentResult.confidence || intentResult.contextRef?.confidence || 1,
            ts: Date.now()
        }
    };
}

// Log de Estado Maestro
console.log("%c🧠 [INTENT_ENGINE V3.1]: ARCHITECT SOVEREIGN 1000% OPERATIONAL", "color: #10b981; font-weight: bold; background: #064e3b; padding: 2px 10px; border-radius: 4px;");

/* =====================================================
    INTENT ENGINE BRIDGE (V5.21 HYBRID SOVEREIGN FIX)
    Optimizado para evitar el error INTENT_INVALID
===================================================== */
window.runIntentEngine = async function(text) {
    const low = String(text || "").toLowerCase().trim();
    
    try {
        let cleanText = text;
        let nluMeta = null;

        const conversational =
            understandIntentV7(
                text
            );

        if (
            conversational?.needsClarification
        ) {
            return __toSystemFormat({
                intent: "CLARIFY_INTENT",
                action: "CLARIFY",
                entity:
                    conversational.entity ||
                    "system",
                target:
                    conversational.target ||
                    conversational.file ||
                    "pending",
                targetFile:
                    conversational.file ||
                    null,
                file:
                    conversational.file ||
                    null,
                value:
                    conversational.value ||
                    null,
                planner:
                    conversational.planner ||
                    null,
                execution:
                    conversational.execution ||
                    null,
                repairHints:
                    conversational.repairHints ||
                    null,
                clarification:
                    conversational.clarification,
                needsClarification:
                    true,
                summary:
                    conversational.clarification,
                source:
                    "jarvis_intent_runtime_v7",
                confidence:
                    conversational.confidence,
                contextRef: {
                    ...conversational,
                    needsClarification: true
                }
            });
        }

        if (
            conversational?.command
        ) {
            cleanText =
                conversational.command;

            nluMeta = {
                source:
                    "jarvis_intent_runtime_v7",
                confidence:
                    conversational.confidence,
                fallback:
                    false,
                conversational,
                planner:
                    conversational.planner ||
                    null,
                execution:
                    conversational.execution ||
                    null,
                targetFile:
                    conversational.file ||
                    null,
                value:
                    conversational.value ||
                    null,
                repairHints:
                    conversational.repairHints ||
                    null
            };

            console.log(
                "[INTENT_RUNTIME_V7_TO_LEGACY]",
                conversational
            );
        }

        // 🧠 1. NLU HYBRID (Pre-procesamiento)
        if (!nluMeta && typeof understand === "function") {
            const nlu = understand(text);
            if (nlu && nlu.commands && nlu.commands[0]) {
                const cmd = nlu.commands[0];
                console.log("🧠 [NLU → INTENT]", cmd);
                cleanText = cmd.clean || text;
                nluMeta = { fallback: cmd.fallback || false, confidence: cmd.confidence || 0.5 };
            }
        }

        // 🧠 2. INTENT ENGINE (Mapeo primario)
        if (typeof interpretarIntenciones === 'function') {
            try {
                const res = interpretarIntenciones([{ raw: cleanText }]);
                if (res && res[0]) {
                    if (
                        res[0]?.message &&
                        res[0]?.data &&
                        res[0]?.meta
                    ) {
                        return {
                            ...res[0],
                            intent:
                                res[0].intent ||
                                res[0].data?.intent ||
                                conversational?.intent ||
                                "UNKNOWN",
                            entity:
                                res[0].entity ||
                                res[0].data?.entity ||
                                conversational?.entity ||
                                "system",
                            target:
                                res[0].target ||
                                res[0].data?.target ||
                                conversational?.target ||
                                conversational?.file ||
                                "general",
                            targetFile:
                                res[0].targetFile ||
                                res[0].data?.targetFile ||
                                conversational?.file ||
                                null,
                            file:
                                res[0].file ||
                                res[0].data?.file ||
                                conversational?.file ||
                                null,
                            value:
                                res[0].value ||
                                res[0].data?.value ||
                                conversational?.value ||
                                null,
                            planner:
                                conversational?.planner ||
                                res[0].planner ||
                                res[0].data?.planner ||
                                null,
                            execution:
                                conversational?.execution ||
                                res[0].execution ||
                                res[0].data?.execution ||
                                null,
                            repairHints:
                                conversational?.repairHints ||
                                res[0].repairHints ||
                                res[0].data?.repairHints ||
                                null,
                            meta: {
                                ...res[0].meta,
                                source:
                                    nluMeta?.source ||
                                    res[0].meta.source ||
                                    "intent_engine",
                                confidence:
                                    nluMeta?.confidence ||
                                    res[0].meta.confidence ||
                                    1,
                                planner:
                                    nluMeta?.planner ||
                                    res[0].meta.planner ||
                                    null,
                                jarvisIntent:
                                    nluMeta?.conversational ||
                                    null,
                                contextRef:
                                    nluMeta ||
                                    res[0].meta.contextRef ||
                                    null
                            }
                        };
                    }

                    // Usamos el Adaptador Soberano para formatear la salida
                    return __toSystemFormat({ ...res[0], source: "intent_engine", contextRef: nluMeta });
                }
            } catch (e) {
                console.warn("⚠️ [INTENT_INTERNAL_FAIL]: Rebotando a Fallback Soberano.");
            }
        }
    } catch (err) {
        console.error("❌ [RUN_INTENT_ENGINE_CRITICAL_FAIL]", err);
    }

    // =====================================================
    // 🧯 3. FALLBACK INTELIGENTE (V5.21 - ANTI-MUTE)
    // =====================================================
    
    // 🛠️ Caso: Técnicos (Jonathan Profile)
    if (low.includes("tecnic") || low.includes("cuantos hay")) {
        return __toSystemFormat({
            intent: "ANALYZE_TECHNICIANS",
            entity: "technicians",
            summary: "Consultando el censo de técnicos en el Data Vault...",
            source: "intent_fallback_smart"
        });
    }

    // 🛠️ Caso: Estado / Sistema
    if (low.includes("estado") || low.includes("sistema") || low.includes("analisis")) {
        return __toSystemFormat({
            type: "SYSTEM_STATUS",
            intent: "SYSTEM_CHECK",
            entity: "system",
            summary: "Realizando escaneo de telemetría y estado de fuerzas...",
            data: { online: navigator.onLine, status: "GOD_MODE" },
            source: "intent_fallback_smart"
        });
    }

    // 🛠️ Caso: Pagos / Stripe
    if (low.includes("pago") || low.includes("cobro") || low.includes("factura")) {
        return __toSystemFormat({
            intent: "ANALYZE_PAYMENTS",
            entity: "payments",
            summary: "Accediendo al historial de transacciones y estados de pago...",
            source: "intent_fallback_smart"
        });
    }

    // 🛡️ Cierre de Seguridad (Safe Exit)
    return __toSystemFormat({
        intent: "GENERAL_QUERY",
        entity: "system",
        summary: "Instrucción recibida. Procesando a través del núcleo general.",
        source: "intent_fallback_safe"
    });
};
/**
 * ======================================================================================
 * FIN DEL ARCHIVO - INGENIERÍA DEFINITIVA PARA GESTIAPREMIUM V3.1
 * ======================================================================================
 */

