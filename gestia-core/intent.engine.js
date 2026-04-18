/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - INTENT ENGINE V3.1 (THE ARCHITECT SOVEREIGN - PURGE ENABLED)
 * ======================================================================================
 * Identidad: El Córtex Prefrontal con Fluidez Humana, Discernimiento y Suavizado de Confianza.
 * Función: Interpretación determinista de ráfagas con razonamiento de tensión cognitiva.
 * REGLA 1: CÓDIGO COMPLETO. SIN COMPACTAR. NO PLACEHOLDERS.
 * --------------------------------------------------------------------------------------
 * INGENIERÍA DE GRADO SOBERANO (THE JARVIS OPERATIONAL MASTERPIECE):
 * 1. HUMAN-FLOW FLUIDITY: Resolución de referencias ("lo/ese") orientada a la recencia.
 * Jarvis apuesta por el último objeto del pulso global, priorizando la fluidez natural
 * del diálogo operativo, pero marcando la tensión mediante la bandera `_ambiguous`.
 * 2. CONFIDENCE SMOOTHING: Refinamiento del score de confianza (+0.05). Jarvis suaviza
 * la penalización si detecta que, aunque el comando es ambiguo, existe una
 * continuidad lógica (herencia), estabilizando el HUD en ráfagas de alta densidad.
 * 3. STRONG CONTINUITY INFERENCE: Inferencia de entidad blindada. Solo permitida si
 * el target es idéntico al último rastro de memoria, eliminando "alucinaciones" de tipo.
 * 4. HIERARCHICAL TARGET FALLBACK: Escalera de resolución: Memoria de Entidad ->
 * Global History -> Last Target -> Hard Fail. Protege la soberanía de Firestore.
 * 5. DEPTH-AWARE PAYLOAD PARSER: Extracción de JSON con aislamiento no-greedy total.
 * ======================================================================================
 */

const INTENT_MAP = {
    "purgar": "PURGE",
    "limpiar": "PURGE",
    "purge": "PURGE",
    "clear": "PURGE",
    "desactivar": "DEACTIVATE",
    "disable": "DEACTIVATE",
    "activar": "ACTIVATE",
    "enable": "ACTIVATE",
    "crear": "CREATE",
    "create": "CREATE",
    "add": "CREATE",
    "agregar": "CREATE",
    "borrar": "DELETE",
    "delete": "DELETE",
    "remove": "DELETE",
    "eliminar": "DELETE",
    "actualizar": "UPDATE",
    "update": "UPDATE",
    "set": "UPDATE",
    "reparar": "REPAIR",
    "fix": "REPAIR",
    "patch": "REPAIR"
};

const ENTITY_MAP = {
    "huerfanas": "ORPHAN",
    "basura": "ORPHAN",
    "orphans": "ORPHAN",
    "edificio": "BUILDING",
    "modulo": "MODULE",
    "module": "MODULE",
    "mod": "MODULE",
    "core": "CORE",
    "kernel": "CORE",
    "usuario": "USER",
    "user": "USER",
    "perfil": "USER",
    "tarea": "TASK",
    "task": "TASK",
    "sistema": "SYSTEM"
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

    if (rawLower === "create_building") {
        console.log("🔥 [DSL HIT] CREATE_BUILDING detectado");
        const payload = extraerPayload(cmd.raw);

        interpretedPlan.push({
            intent: "CREATE_BUILDING",
            entity: "BUILDING",
            target: payload.name || "edificio_default",
            payload: payload,
            confidence: 1,
            summary: `Creación de edificio '${payload.name || "default"}' (DSL + JSON)`
});
        return;
    }

    if (rawLower === "analyze") {

        console.log("🔥 [DSL HIT] ANALYZE detectado");

        interpretedPlan.push({
            intent: "ANALYZE",
            entity: "SYSTEM",
            target: null,
            confidence: 1,
            summary: "Análisis (DSL estructurado)"
        });

        console.log("🧠 [STRUCTURED_INTENT]", {
            intent: "ANALYZE",
            entity: "SYSTEM"
        });

        return;
    }

    if (rawLower === "repair") {
        interpretedPlan.push({
            intent: "REPAIR",
            entity: "SYSTEM",
            target: null,
            confidence: 1,
            summary: "Reparación (DSL estructurado)"
        });
        return;
    }

    if (rawLower === "update") {
        interpretedPlan.push({
            intent: "UPDATE",
            entity: "SYSTEM",
            target: null,
            confidence: 1,
            summary: "Actualización (DSL estructurado)"
        });
        return;
    }
}

// 👇 ESTO YA NO DA ERROR
        const tokens = rawLower.split(/\s+/);

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
        const finalIntent = action && entity ? `${action}_${entity}` : "UNKNOWN_INTENT";
        
        let reporteSIA7 = "";

        // ✅ FIX "FRIJOLITOS": En lugar de tronar violentamente, SIA7 dialoga como compa.
        if (finalIntent === "UNKNOWN_INTENT") {
            // Blindaje para palabras pegadas como "buenasnoches"
            const isSaludo = /\b(hola|buenos|buenas|buenasnoches|buenosdias|que tal|q tal|hey|arre|que onda|q onda|carnita asada)\b/i.test(rawLower);
            const isLlamado = /\b(jarvis|sia7|computadora|sistema)\b/i.test(rawLower);
            const isDespedida = /\b(adios|bye|hasta luego|nos vemos|chao|camara|sobres)\b/i.test(rawLower);
            
            if (isSaludo || isLlamado || isDespedida) {
                // 🧠 MATRIZ DE PERSONALIDAD SIA7 (Modo Compa / Carnita Asada)
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

                // Selección dinámica para evitar respuestas robóticas
                if (isDespedida) {
                    reporteSIA7 = respuestasDespedida[Math.floor(Math.random() * respuestasDespedida.length)];
                } else if (isSaludo) {
                    reporteSIA7 = respuestasSaludo[Math.floor(Math.random() * respuestasSaludo.length)];
                } else if (isLlamado) {
                    reporteSIA7 = respuestasLlamado[Math.floor(Math.random() * respuestasLlamado.length)];
                }
            } else {
                throw new Error(`INTENT_INVALID: Jarvis no le entiende a "${cmd.raw}". Tírala más clara, especifica acción y entidad.`);
            }
        } else {
            // Generación de narrativa para acciones válidas (Modo Relajado)
            const diccionarioAcciones = { "CREATE": "crear", "DELETE": "eliminar", "UPDATE": "actualizar", "REPAIR": "reparar", "ACTIVATE": "activar", "DEACTIVATE": "desactivar", "PURGE": "purgar" };
            const diccionarioEntidades = { "MODULE": "el módulo", "CORE": "el núcleo", "USER": "el usuario", "TASK": "la tarea", "SYSTEM": "el sistema", "ORPHAN": "la basura de memoria" };
            
            const verbo = diccionarioAcciones[action] || action;
            const sustantivo = diccionarioEntidades[entity] || entity;
            const objTarget = target || "un recurso dinámico";
            
            if (finalIntent === "PURGE_ORPHAN") {
                reporteSIA7 = "¡Cámara pariente! Procedo a limpiar el búnker. Voy a borrar todas las ráfagas huérfanas de la memoria local.";
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

    return interpretedPlan;
}

// Log de Estado Maestro del Día
console.log("%c🧠 [INTENT_ENGINE V3.1]: ARCHITECT SOVEREIGN 1000% OPERATIONAL", "color: #10b981; font-weight: bold; background: #064e3b; padding: 2px 10px; border-radius: 4px;");

/**
 * ======================================================================================
 * FIN DEL ARCHIVO - INGENIERÍA DEFINITIVA PARA GESTIAPREMIUM V3.1
 * ======================================================================================
 */