/* =====================================================================================
   JARVIS INTENT RUNTIME V7
   Conversational understanding layer for Gestia / FixGo.

   Goal:
   - Understand natural Spanish/Spanglish operator commands.
   - Preserve conversational context for "eso", "lo mismo", "otra vez".
   - Avoid fake certainty: return needsClarification when target/action is missing.
===================================================================================== */

const VERSION = "7.0.0-conversational";

const ACTIONS = [
    {
        intent: "REPAIR",
        canonical: "repair",
        score: 0.96,
        patterns: [
            /\b(repara|reparar|arregla|arreglar|corrige|corregir|soluciona|fix|parcha|parchar)\b/i,
            /\b(no sirve|falla|fallando|truena|trono|se cayo|se rompio|atorado|bloquea|bloqueado)\b/i
        ]
    },
    {
        intent: "ANALYZE",
        canonical: "analyze",
        score: 0.92,
        patterns: [
            /\b(analiza|analizar|audita|auditar|revisa|revisar|checa|checar|escanea|scanner|scan|mira|verifica)\b/i
        ]
    },
    {
        intent: "CREATE",
        canonical: "create",
        score: 0.9,
        patterns: [
            /\b(crea|crear|genera|generar|arma|armar|haz|hacer|nuevo|nueva)\b/i
        ]
    },
    {
        intent: "UPDATE",
        canonical: "update",
        score: 0.88,
        patterns: [
            /\b(actualiza|actualizar|modifica|modificar|cambia|cambiar|ajusta|ajustar|sube|baja)\b/i
        ]
    },
    {
        intent: "OPEN",
        canonical: "open",
        score: 0.86,
        patterns: [
            /\b(abre|abrir|muestra|mostrar|muestrame|ver)\b/i
        ]
    }
];

const ENTITY_HINTS = [
    ["MARKETING", /\b(marketing|marca|campana|publicidad|contenido|redes sociales|flyer|flayer|reel|tiktok|instagram|landing|pagina web)\b/i],
    ["TECHNICIANS", /\b(tecnico|tecnicos|jonathan|personal)\b/i],
    ["PAYMENTS", /\b(pago|pagos|cobro|cobros|stripe|factura|facturas)\b/i],
    ["AUTH", /\b(auth|login|sesion|logout|acceso|usuario|usuarios)\b/i],
    ["TERMINAL", /\b(terminal|consola|logs|console)\b/i],
    ["RUNTIME", /\b(runtime|rutyme|rutime|latencia|latency|kernel|boot)\b/i],
    ["REPOSITORY", /\b(repo|repositorio|archivo|modulo|codigo|js|html|css|json)\b/i],
    ["JARVIS", /\b(jarvis|sia7|asistente)\b/i],
    ["SYSTEM", /\b(sistema|core|estado|salud|todo)\b/i]
];

const SOCIAL_INTENTS = [
    ["GREETING", /\b(hola|buenos dias|buenas tardes|buenas noches|que onda|q onda|hey)\b/i],
    ["APPROVAL", /\b(arre|dale|va|perfecto|jalo|ahuevo|ahuevos|chingon|simon)\b/i],
    ["THANKS", /\b(gracias|thanks|te agradezco)\b/i],
    ["FAREWELL", /\b(adios|bye|nos vemos|camara|sobres)\b/i]
];

const REFERENCE_RE = /\b(eso|esa|ese|lo mismo|mismo|otra vez|de nuevo|repitelo|repite|sigue|seguimos)\b/i;
const FILE_RE = /(?:\.\/|\/)?([a-z0-9_\-/]+?\.(?:js|html|css|json|txt|md))/i;
const NUMBER_RE = /\b(\d+(?:\.\d+)?)\b/;

const ISSUE_HINTS = [
    ["runtime_latency", /\b(runtime|rutyme|rutime|runtim)\b[\s_-]*(latencia|latenci|latency|delay)\b/i],
    ["empty_write_content", /\b(empty_write_content|contenido vacio|escritura vacia|write empty)\b/i],
    ["syntax_error", /\b(sintaxis|syntax|parse error|unexpected token)\b/i],
    ["cache_service_worker", /\b(cache|sw|service worker|service-worker)\b/i],
    ["terminal_runtime", /\b(terminal|consola|logs|boot)\b/i]
];

const MARKETING_ASSETS = [
    ["landing_page", /\b(landing|pagina web|sitio web|web\s+(para|de)\s+(nuestra\s+)?empresa|pagina\s+(para|de)\s+(nuestra\s+)?empresa)\b/i],
    ["flyer", /\b(flyer|flayer|volante|poster|post)\b/i],
    ["editable_photo", /\b(foto|imagen|editable|mockup)\b/i],
    ["reel", /\b(reel|video corto|short|tiktok|tik tok|historia|story)\b/i],
    ["campaign", /\b(marketing|campana|publicidad|anuncio|ads|contenido|redes sociales)\b/i]
];

const MARKETING_CHANNELS = [
    ["tiktok", /\b(tiktok|tik tok)\b/i],
    ["instagram", /\b(instagram|insta|ig)\b/i],
    ["facebook", /\b(facebook|fb)\b/i],
    ["whatsapp", /\b(whatsapp|wa)\b/i],
    ["web", /\b(landing|pagina web|sitio web|web\s+(para|de)\s+(nuestra\s+)?empresa|pagina\s+(para|de)\s+(nuestra\s+)?empresa)\b/i]
];

const PLAN_TYPE_BY_INTENT = {
    MARKETING: "MARKETING_PLAN",
    ANALYZE: "ANALYZE",
    REPAIR: "REPAIR",
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    OPEN: "OPEN"
};

function state() {
    const root =
        typeof globalThis !== "undefined"
            ? globalThis
            : {};

    root.__JARVIS_INTENT_RUNTIME_V7__ ||= {
        version: VERSION,
        lastAction: null,
        lastIntent: null,
        lastEntity: null,
        lastTarget: null,
        lastFile: null,
        lastValue: null,
        lastIssue: null,
        lastMarketing: null,
        lastRaw: null,
        history: []
    };

    return root.__JARVIS_INTENT_RUNTIME_V7__;
}

function normalize(text = "") {
    return String(text)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function detectAction(raw = "", normalized = normalize(raw)) {
    for (const item of ACTIONS) {
        if (item.patterns.some(pattern => pattern.test(normalized))) {
            return item;
        }
    }

    return null;
}

function detectEntity(normalized = "") {
    for (const [entity, pattern] of ENTITY_HINTS) {
        if (pattern.test(normalized)) return entity;
    }

    return null;
}

function detectSocial(normalized = "") {
    for (const [intent, pattern] of SOCIAL_INTENTS) {
        if (pattern.test(normalized)) return intent;
    }

    return null;
}

function extractTarget(raw = "", normalized = normalize(raw)) {
    const fileMatch = raw.match(FILE_RE);
    const valueMatch = normalized.match(NUMBER_RE);

    if (fileMatch) {
        return {
            target: fileMatch[1],
            file: fileMatch[1],
            value: valueMatch?.[1] || null,
            source: "file"
        };
    }

    const quoted = raw.match(/["'`]([^"'`]+)["'`]/);
    if (quoted?.[1]) {
        return {
            target: quoted[1].trim(),
            file: null,
            value: valueMatch?.[1] || null,
            source: "quoted"
        };
    }

    return {
        target: null,
        file: null,
        value: valueMatch?.[1] || null,
        source: "none"
    };
}

function resolveReference(result, normalized) {
    const memory = state();

    if (!REFERENCE_RE.test(normalized)) {
        return result;
    }

    result.referencesContext = true;

    const shouldInheritAction =
        !result.action ||
        (
            result.action === "create" &&
            /\bhaz\b/i.test(normalized) &&
            !result.target &&
            !result.file
        );

    if (memory.lastAction && shouldInheritAction) {
        result.action = memory.lastAction;
        result.intent = memory.lastIntent;
        result.inheritedAction = true;
    }

    if (!result.entity && memory.lastEntity) {
        result.entity = memory.lastEntity;
        result.inheritedEntity = true;
    }

    if (!result.target && memory.lastTarget) {
        result.target = memory.lastTarget;
        result.inheritedTarget = true;
    }

    if (!result.file && memory.lastFile) {
        result.file = memory.lastFile;
        result.inheritedFile = true;
    }

    if (!result.value && memory.lastValue) {
        result.value = memory.lastValue;
        result.inheritedValue = true;
    }

    if (!result.issue && memory.lastIssue) {
        result.issue = memory.lastIssue;
        result.inheritedIssue = true;
    }

    if (!result.marketing && memory.lastMarketing && result.intent === "MARKETING") {
        result.marketing = {
            ...memory.lastMarketing
        };
        result.inheritedMarketing = true;
    }

    return result;
}

function buildClarification(result) {
    const actionLabels = {
        analyze: "analizar",
        repair: "reparar",
        create: "crear",
        update: "actualizar",
        marketing: "crear marketing",
        open: "abrir"
    };

    if (!result.action && !result.socialIntent) {
        return "Te sigo, pero necesito la accion: analizar, reparar, crear, marketing, actualizar o abrir.";
    }

    if (
        result.action &&
        ["REPAIR", "UPDATE", "CREATE", "ANALYZE"].includes(result.intent) &&
        !result.target &&
        !result.entity
    ) {
        return `Va. Dime el archivo, modulo o area sobre la que quieres ${actionLabels[result.action] || result.action}.`;
    }

    return null;
}

function buildCommand(result) {
    if (!result.action) return null;

    const entityOrTarget =
        result.file ||
        result.target ||
        (result.entity ? result.entity.toLowerCase() : "system");

    return `${result.action}::${entityOrTarget}`;
}

function detectIssue(normalized = "") {
    for (const [issue, pattern] of ISSUE_HINTS) {
        if (pattern.test(normalized)) return issue;
    }

    return null;
}

function detectMarketing(normalized = "") {
    const assets =
        MARKETING_ASSETS
            .filter(([, pattern]) => pattern.test(normalized))
            .map(([asset]) => asset);

    const channels =
        MARKETING_CHANNELS
            .filter(([, pattern]) => pattern.test(normalized))
            .map(([channel]) => channel);

    const uniqueAssets =
        [...new Set(assets)];

    const uniqueChannels =
        [...new Set(channels)];

    const explicit =
        uniqueAssets.length > 0 ||
        uniqueChannels.length > 0 ||
        /\b(marketing|marca|campana|publicidad|contenido|redes sociales)\b/i.test(normalized);

    if (!explicit) {
        return null;
    }

    return {
        intent: "MARKETING",
        action: "marketing",
        entity: "MARKETING",
        primaryAsset:
            uniqueAssets[0] || "campaign",
        assets:
            uniqueAssets.length ? uniqueAssets : ["campaign"],
        channels:
            uniqueChannels,
        editable:
            true,
        requiresHumanApproval:
            true
    };
}

function resolvePlanType(result) {
    if (!result.intent) return "UNKNOWN";

    if (result.intent === "MARKETING") {
        return "MARKETING_PLAN";
    }

    if (result.intent === "REPAIR" && result.file) {
        return result.entity === "RUNTIME" || result.issue === "runtime_latency"
            ? "REPAIR_RUNTIME"
            : "REPAIR_FILE";
    }

    if (result.intent === "ANALYZE" && result.file) {
        return result.entity === "RUNTIME"
            ? "ANALYZE_RUNTIME"
            : "ANALYZE_FILE";
    }

    if (result.intent === "CREATE" && result.file) return "CODE_WRITE";
    if (result.intent === "UPDATE" && result.file) return "CODE_WRITE";

    return PLAN_TYPE_BY_INTENT[result.intent] || result.intent || "UNKNOWN";
}

function buildGoal(result) {
    const actionLabels = {
        analyze: "Analizar",
        repair: "Reparar",
        create: "Crear",
        update: "Actualizar",
        marketing: "Crear marketing",
        open: "Abrir"
    };

    const verb = actionLabels[result.action] || "Procesar";
    const target =
        result.marketing?.primaryAsset ||
        result.file ||
        result.target ||
        (result.entity ? result.entity.toLowerCase() : "system");
    const value = result.value ? ` con valor ${result.value}` : "";
    const issue = result.issue ? ` (${result.issue})` : "";

    return `${verb} ${target}${value}${issue}`.trim();
}

function buildMarketingDeliverables(marketing = {}) {
    const assets =
        marketing?.assets?.length
            ? marketing.assets
            : ["campaign"];

    return assets.map(asset => {
        if (asset === "landing_page") {
            return {
                type: "landing_page",
                format: "html/css/js",
                editable: true
            };
        }

        if (asset === "flyer") {
            return {
                type: "flyer",
                format: "editable_image_brief",
                editable: true,
                sizes: ["1080x1350", "1080x1080", "1080x1920"]
            };
        }

        if (asset === "editable_photo") {
            return {
                type: "photo_edit",
                format: "image_prompt_and_layers",
                editable: true
            };
        }

        if (asset === "reel") {
            return {
                type: "short_video",
                format: "script_shotlist_caption",
                editable: true,
                durationSeconds: 30
            };
        }

        return {
            type: "campaign_calendar",
            format: "weekly_plan",
            editable: true
        };
    });
}

function buildPlanner(result) {
    const planType = resolvePlanType(result);
    const target =
        result.marketing?.primaryAsset ||
        result.file ||
        result.target ||
        (result.entity ? result.entity.toLowerCase() : "system");
    const repoAware =
        !!result.file ||
        result.entity === "REPOSITORY" ||
        result.entity === "RUNTIME";

    const repairHints =
        result.intent === "REPAIR"
            ? {
                issue: result.issue || "generic_repair",
                requestedValue: result.value,
                targetFile: result.file || null,
                source: "jarvis_intent_runtime_v7"
            }
            : null;

    const marketingPlan =
        result.intent === "MARKETING"
            ? {
                source: "jarvis_intent_runtime_v7",
                primaryAsset:
                    result.marketing?.primaryAsset || "campaign",
                assets:
                    result.marketing?.assets || ["campaign"],
                channels:
                    result.marketing?.channels || [],
                editable:
                    true,
                requiresHumanApproval:
                    true,
                deliverables:
                    buildMarketingDeliverables(result.marketing),
                creativeBrief: {
                    brand:
                        "FixGo / GestiaPremium",
                    voice:
                        "confiable, directo, operativo y premium",
                    callToAction:
                        result.marketing?.channels?.includes("whatsapp")
                            ? "Agenda por WhatsApp"
                            : "Solicita una demo"
                }
            }
            : null;

    return {
        source: "jarvis_intent_runtime_v7",
        version: VERSION,
        planType,
        stepType: planType,
        intent: result.intent,
        action: result.action,
        goal: buildGoal(result),
        objective: buildGoal(result),
        entity: result.entity,
        target,
        targetFile: result.file || null,
        file: result.file || null,
        value: result.value,
        issue: result.issue,
        confidence: result.confidence,
        needsClarification: result.needsClarification,
        clarification: result.clarification,
        repoAware,
        marketing:
            marketingPlan,
        repairHints,
        execution: {
            mode: "AI_SUPERVISED",
            safe: true,
            requiresApproval: ["REPAIR", "UPDATE", "CREATE", "MARKETING"].includes(result.intent),
            requiresPatch: result.intent === "REPAIR",
            writeMode:
                result.intent === "REPAIR"
                    ? "PATCH_REQUIRED"
                    : result.intent === "MARKETING"
                        ? "MARKETING_ASSET_PLAN"
                        : "READ_OR_PLAN"
        },
        memory: {
            referencesContext: !!result.referencesContext,
            inheritedAction: !!result.inheritedAction,
            inheritedEntity: !!result.inheritedEntity,
            inheritedTarget: !!result.inheritedTarget,
            inheritedFile: !!result.inheritedFile,
            inheritedValue: !!result.inheritedValue,
            inheritedIssue: !!result.inheritedIssue,
            inheritedMarketing: !!result.inheritedMarketing
        }
    };
}

function remember(result) {
    if (result.socialIntent && !result.action) return;
    if (result.needsClarification) return;

    const memory = state();
    memory.lastAction = result.action || memory.lastAction;
    memory.lastIntent = result.intent || memory.lastIntent;
    memory.lastEntity = result.entity || memory.lastEntity;
    memory.lastTarget = result.target || memory.lastTarget;
    memory.lastFile = result.file || memory.lastFile;
    memory.lastValue = result.value || memory.lastValue;
    memory.lastIssue = result.issue || memory.lastIssue;
    memory.lastMarketing = result.marketing || memory.lastMarketing;
    memory.lastRaw = result.raw;
    memory.history.push({
        at: Date.now(),
        raw: result.raw,
        intent: result.intent,
        entity: result.entity,
        target: result.target,
        file: result.file,
        value: result.value,
        issue: result.issue,
        marketing: result.marketing,
        confidence: result.confidence
    });

    if (memory.history.length > 50) {
        memory.history.shift();
    }
}

export function understandIntentV7(raw = "") {
    const original = String(raw || "");
    const normalized = normalize(original);
    const action = detectAction(original, normalized);
    const entity = detectEntity(normalized);
    const socialIntent = detectSocial(normalized);
    const targetInfo = extractTarget(original, normalized);
    const marketing = detectMarketing(normalized);

    let result = {
        ok: true,
        engine: "jarvis_intent_runtime_v7",
        version: VERSION,
        raw: original,
        normalized,
        intent: marketing?.intent || action?.intent || null,
        action: marketing?.action || action?.canonical || null,
        entity: marketing?.entity || entity,
        target: marketing?.primaryAsset || targetInfo.target,
        file: targetInfo.file,
        value: targetInfo.value,
        issue: detectIssue(normalized),
        marketing,
        socialIntent,
        confidence: marketing ? 0.94 : action?.score || (socialIntent ? 0.82 : 0.45),
        needsClarification: false,
        clarification: null,
        command: null,
        source: targetInfo.source,
        planner: null,
        execution: null,
        repairHints: null
    };

    result = resolveReference(result, normalized);

    if (!result.entity && result.file) {
        result.entity = "REPOSITORY";
        result.confidence = Math.min(0.98, result.confidence + 0.04);
    }

    if (result.referencesContext) {
        result.confidence = Math.max(0.55, result.confidence - 0.08);
    }

    result.clarification = buildClarification(result);
    result.needsClarification = !!result.clarification;
    result.command = result.needsClarification ? null : buildCommand(result);
    result.planner = buildPlanner(result);
    result.execution = result.planner.execution;
    result.repairHints = result.planner.repairHints;

    remember(result);

    return result;
}

export function toLegacyCommandV7(raw = "") {
    return understandIntentV7(raw).command;
}

export function resetIntentRuntimeV7() {
    const memory = state();
    memory.lastAction = null;
    memory.lastIntent = null;
    memory.lastEntity = null;
    memory.lastTarget = null;
    memory.lastFile = null;
    memory.lastValue = null;
    memory.lastIssue = null;
    memory.lastMarketing = null;
    memory.lastRaw = null;
    memory.history = [];
    return memory;
}

const root =
    typeof globalThis !== "undefined"
        ? globalThis
        : {};

root.JarvisIntentRuntimeV7 = {
    version: VERSION,
    understand: understandIntentV7,
    toCommand: toLegacyCommandV7,
    reset: resetIntentRuntimeV7,
    dump: state
};

console.log("🧠 [JARVIS_INTENT_RUNTIME_V7] ONLINE", VERSION);
