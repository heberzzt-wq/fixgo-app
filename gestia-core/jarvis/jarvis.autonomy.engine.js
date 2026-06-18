/**
 * =====================================================================================
 * JARVIS AUTONOMY ENGINE v2.0
 * Technical learning memory for repo operations.
 *
 * Learns:
 * - why an operation failed or was blocked
 * - which file/stage/reason produced the incident
 * - what Jarvis should try or avoid next time
 *
 * It is intentionally local-first. In browser it persists in localStorage; in tests
 * or non-browser runtimes it falls back to globalThis memory.
 * =====================================================================================
 */

const VERSION = "2.0.0-failure-learning";
const STORAGE_KEY = "jarvis_autonomy_learning_v2";
const LEGACY_STORAGE_KEYS = [
    "jarvis_autonomy_learning_v1"
];
const MAX_PATTERNS = 80;
const MAX_EVENTS = 120;
const MAX_EXAMPLES = 6;

function root() {
    return typeof globalThis !== "undefined" ? globalThis : {};
}

function now() {
    return Date.now();
}

function createState() {
    return {
        version: VERSION,
        createdAt: now(),
        updatedAt: now(),
        events: [],
        patterns: {},
        stats: {
            recorded: 0,
            failures: 0,
            blocked: 0,
            successes: 0,
            recalls: 0
        }
    };
}

function readStorage() {
    try {
        const api = root().localStorage;
        if (!api) return null;

        const keys = [
            STORAGE_KEY,
            ...LEGACY_STORAGE_KEYS
        ];

        let raw = null;

        for (const key of keys) {
            raw = api.getItem(key);
            if (raw) break;
        }

        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;

        return parsed;
    } catch {
        return null;
    }
}

function writeStorage(state) {
    try {
        const api = root().localStorage;
        if (!api) return false;

        api.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch {
        return false;
    }
}

function state() {
    const globalRoot = root();

    if (!globalRoot.__JARVIS_AUTONOMY_LEARNING__) {
        globalRoot.__JARVIS_AUTONOMY_LEARNING__ =
            readStorage() ||
            createState();
    }

    const current = globalRoot.__JARVIS_AUTONOMY_LEARNING__;
    current.version = VERSION;
    current.events ||= [];
    current.patterns ||= {};
    current.stats ||= {
        recorded: 0,
        failures: 0,
        blocked: 0,
        successes: 0,
        recalls: 0
    };

    return current;
}

function persist(current = state()) {
    current.updatedAt = now();
    writeStorage(current);
    return current;
}

export function resetAutonomyLearning() {
    const next = createState();
    root().__JARVIS_AUTONOMY_LEARNING__ = next;
    persist(next);
    return next;
}

export function snapshotAutonomyLearning() {
    return structuredCloneSafe(state());
}

export function describeAutonomyLearning() {
    return {
        ok: true,
        engine: "jarvis_autonomy_engine",
        version:
            VERSION,
        storageKey:
            STORAGE_KEY,
        legacyStorageKeys:
            [...LEGACY_STORAGE_KEYS],
        capabilities: [
            "failure_pattern_learning",
            "blocked_operation_recall",
            "safe_zone_legacy_advisory",
            "bounded_local_memory",
            "next_action_recommendation"
        ],
        limits: {
            maxPatterns:
                MAX_PATTERNS,
            maxEvents:
                MAX_EVENTS,
            maxExamples:
                MAX_EXAMPLES
        }
    };
}

export function recordAutonomyEvent(input = {}) {
    const current = state();
    const event = normalizeEvent(input);
    const signature = buildSignature(event);
    const lesson = buildLesson(event);

    event.signature = signature;
    event.lesson = lesson;

    current.events.unshift(event);
    current.events = current.events.slice(0, MAX_EVENTS);
    current.stats.recorded += 1;

    if (event.status === "failed") current.stats.failures += 1;
    if (event.status === "blocked") current.stats.blocked += 1;
    if (event.status === "success") current.stats.successes += 1;

    const shouldLearn =
        event.status === "failed" ||
        event.status === "blocked" ||
        event.reason ||
        event.errorMessage;

    if (shouldLearn) {
        const existing =
            current.patterns[signature] ||
            {
                signature,
                firstSeenAt: event.at,
                lastSeenAt: event.at,
                count: 0,
                status: event.status,
                reason: event.reason,
                stage: event.stage,
                file: event.file,
                operation: event.operation,
                issue: event.issue,
                lesson,
                examples: []
            };

        existing.count += 1;
        existing.lastSeenAt = event.at;
        existing.status = event.status;
        existing.reason = event.reason || existing.reason;
        existing.stage = event.stage || existing.stage;
        existing.file = event.file || existing.file;
        existing.operation = event.operation || existing.operation;
        existing.issue = event.issue || existing.issue;
        existing.lesson = lesson || existing.lesson;
        existing.examples.unshift({
            at: event.at,
            file: event.file,
            stage: event.stage,
            reason: event.reason,
            errorMessage: event.errorMessage,
            scanRisk: event.scanRisk,
            flags: event.flags
        });
        existing.examples = existing.examples.slice(0, MAX_EXAMPLES);

        current.patterns[signature] = existing;
        prunePatterns(current);
    }

    persist(current);

    return {
        ok: true,
        engine: "jarvis_autonomy_engine",
        version: VERSION,
        learned: shouldLearn,
        signature,
        lesson,
        event
    };
}

export function recallAutonomyLessons(input = {}) {
    const current = state();
    const query = normalizeEvent({
        ...input,
        status: input.status || "query",
        stage: input.stage || "preflight"
    });

    const patterns =
        Object.values(current.patterns || {})
            .map(pattern => ({
                ...pattern,
                matchScore: scorePattern(pattern, query)
            }))
            .filter(pattern => pattern.matchScore > 0)
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, input.limit || 5);

    current.stats.recalls += 1;
    persist(current);

    return {
        ok: true,
        engine: "jarvis_autonomy_engine",
        version: VERSION,
        query,
        total: patterns.length,
        lessons: patterns.map(pattern => ({
            signature: pattern.signature,
            matchScore: pattern.matchScore,
            count: pattern.count,
            file: pattern.file,
            stage: pattern.stage,
            reason: pattern.reason,
            issue: pattern.issue,
            lesson: pattern.lesson,
            lastSeenAt: pattern.lastSeenAt
        }))
    };
}

function normalizeEvent(input = {}) {
    const error =
        input.error ||
        input.blocking_result ||
        input.blockingResult ||
        null;

    const scan =
        input.scan ||
        input.scannerReport ||
        input.report ||
        input.repoEvidence?.report ||
        null;

    const planner =
        input.planner ||
        input.plan?.planner ||
        input.context?.planner ||
        null;

    const file =
        normalizeFile(
            input.file ||
            input.targetFile ||
            input.target ||
            planner?.targetFile ||
            scan?.file ||
            input.context?.file ||
            ""
        );

    const reason =
        normalizeReason(
            input.reason ||
            error?.reason ||
            error?.error ||
            error?.code ||
            error?.status ||
            input.status ||
            ""
        );

    const errorMessage =
        String(
            input.errorMessage ||
            error?.message ||
            error?.error ||
            error?.reason ||
            ""
        ).slice(0, 500);

    const flags =
        Array.isArray(input.flags)
            ? input.flags
            : Array.isArray(scan?.flags)
                ? scan.flags
                : [];

    const findings =
        Array.isArray(scan?.findings)
            ? scan.findings.map(item => item.id).filter(Boolean)
            : [];

    return {
        at: now(),
        status: normalizeStatus(input.status || "unknown"),
        stage: normalizeToken(input.stage || input.phase || "unknown"),
        operation: normalizeToken(input.operation || input.type || planner?.planType || "unknown"),
        file,
        reason,
        issue: normalizeToken(input.issue || planner?.issue || ""),
        errorMessage,
        scanRisk: scan?.risk || null,
        flags,
        findings,
        operationId:
            input.operationId ||
            input.operation_id ||
            input.opId ||
            null,
        confidence:
            typeof input.confidence === "number"
                ? input.confidence
                : null,
        context: sanitizeContext(input.context || {})
    };
}

function normalizeStatus(value = "") {
    const text = normalizeToken(value);
    if (["failed", "error", "crash"].includes(text)) return "failed";
    if (["blocked", "denied", "rejected"].includes(text)) return "blocked";
    if (["success", "completed", "ok"].includes(text)) return "success";
    return text || "unknown";
}

function normalizeFile(value = "") {
    return String(value || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/\?.*$/, "")
        .replace(/#.*$/, "");
}

function normalizeReason(value = "") {
    return normalizeToken(value)
        .replace(/^error_/, "")
        .slice(0, 120);
}

function normalizeToken(value = "") {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function buildSignature(event = {}) {
    const parts = [
        event.reason || event.status || "unknown",
        event.stage || "unknown",
        event.operation || "unknown",
        event.issue || "",
        extensionOf(event.file),
        event.findings?.[0] || event.flags?.[0] || ""
    ];

    return hashString(parts.join("|"));
}

function extensionOf(file = "") {
    const match = String(file).match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "unknown";
}

function hashString(value = "") {
    let hash = 2166136261;
    const text = String(value);

    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return `learn_${(hash >>> 0).toString(16)}`;
}

function buildLesson(event = {}) {
    const reason = event.reason || "";
    const flags = event.flags || [];
    const findings = event.findings || [];

    if (reason.includes("empty") || findings.includes("EMPTY_SOURCE") || flags.includes("EMPTY_SOURCE")) {
        return {
            diagnosis: "empty_write_content",
            nextAction: "Regenerar contenido antes de escribir; no crear placeholders vacios.",
            avoid: "No llamar repoCommitWriteFile con content vacio.",
            confidence: 0.98
        };
    }

    if (reason.includes("syntax") || findings.includes("UNBALANCED_SYNTAX_DELIMITERS")) {
        return {
            diagnosis: "syntax_validation_failed",
            nextAction: "Ejecutar validacion parser y localizar linea/columna antes de reintentar.",
            avoid: "No repetir el mismo patch sin cambiar el contenido.",
            confidence: 0.9
        };
    }

    if (reason.includes("safe_zone") || reason.includes("unsafe_zone")) {
        return {
            diagnosis: "legacy_safe_zone_block",
            nextAction: "Tratar safe zone como preferencia, no bloqueo; revisar riesgo y generar diff.",
            avoid: "No bloquear archivos solo por no tener fixgo_safe_edit.",
            confidence: 0.92
        };
    }

    if (findings.includes("HARDCODED_SECRET_LITERAL")) {
        return {
            diagnosis: "hardcoded_secret",
            nextAction: "Mover secreto a entorno seguro o Secret Manager.",
            avoid: "No autoparchear secretos sin nombre de variable seguro.",
            confidence: 0.86
        };
    }

    if (findings.includes("LOWERCASE_DATE_NOW")) {
        return {
            diagnosis: "runtime_date_now_case",
            nextAction: "Aplicar reemplazo seguro date.now() -> Date.now().",
            avoid: "No dejar casing invalido en runtime JS.",
            confidence: 0.99
        };
    }

    return {
        diagnosis: event.reason || event.status || "unknown_failure",
        nextAction: "Comparar con evidencia previa, ajustar plan y reintentar solo con cambio verificable.",
        avoid: "No repetir la misma operacion sin modificar causa probable.",
        confidence: 0.65
    };
}

function scorePattern(pattern = {}, query = {}) {
    let score = 0;

    if (pattern.signature === buildSignature(query)) score += 10;
    if (pattern.reason && pattern.reason === query.reason) score += 5;
    if (pattern.file && query.file && pattern.file === query.file) score += 4;
    if (pattern.stage && pattern.stage === query.stage) score += 3;
    if (pattern.operation && pattern.operation === query.operation) score += 3;
    if (pattern.issue && pattern.issue === query.issue) score += 3;

    const extA = extensionOf(pattern.file || "");
    const extB = extensionOf(query.file || "");
    if (extA !== "unknown" && extA === extB) score += 1;

    return score;
}

function prunePatterns(current = state()) {
    const entries =
        Object.entries(current.patterns || {})
            .sort(([, a], [, b]) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0))
            .slice(0, MAX_PATTERNS);

    current.patterns = Object.fromEntries(entries);
}

function sanitizeContext(context = {}) {
    if (!context || typeof context !== "object") return {};

    return {
        source:
            typeof context.source === "string"
                ? context.source.slice(0, 80)
                : undefined,
        planner:
            context.planner
                ? {
                    planType: context.planner.planType,
                    targetFile: context.planner.targetFile,
                    issue: context.planner.issue
                }
                : undefined
    };
}

function structuredCloneSafe(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

const globalRoot = root();

globalRoot.JarvisAutonomyEngine = {
    version: VERSION,
    record: recordAutonomyEvent,
    recall: recallAutonomyLessons,
    reset: resetAutonomyLearning,
    snapshot: snapshotAutonomyLearning,
    describe: describeAutonomyLearning
};

console.log("🧠 [JARVIS_AUTONOMY_ENGINE] ONLINE", VERSION);
