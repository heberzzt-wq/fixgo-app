// Transport limits only. This module never classifies input or selects tools.
export const SEMANTIC_MAX_BUDGET_MS = 600000;

export function semanticPlanBudgetMs({ input = "", missionState, timeoutMs = 60000 } = {}) {
    const requested = Math.max(1, Number(timeoutMs) || 60000);
    if (!["CURRENT_TURN", "MISSION_CONTRACT", "COMPLETION_AUDIT", "GROUNDED_ARGUMENT_COMPLETION", "FINAL_RESPONSE"].includes(missionState?.phase)) return Math.min(requested, SEMANTIC_MAX_BUDGET_MS);
    // Local CPU baseline: ~14 prompt tokens/s. Account for the full input,
    // retrieval, prompt overhead and bounded output; never shorten the input.
    const inputBytes = new TextEncoder().encode(String(input)).length;
    const phaseFloor = missionState?.phase === "CURRENT_TURN" && !missionState?.conversationalGate ? 120000 : 60000;
    return Math.min(SEMANTIC_MAX_BUDGET_MS, Math.max(requested, phaseFloor, 30000 + inputBytes * 50));
}

export async function readSemanticStream(response, { onProgress = () => {}, onActivity = () => {} } = {}) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            onActivity();
            buffer += decoder.decode(value, { stream: true });
            if (buffer.length > 2 * 1024 * 1024) throw new Error("LOCAL_SEMANTIC_STREAM_TOO_LARGE");
            let end;
            while ((end = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, end).trim();
                buffer = buffer.slice(end + 1);
                if (!line) continue;
                const frame = JSON.parse(line);
                if (frame.type === "progress") onProgress(frame);
                else if (frame.type === "result") result = frame.result;
                else throw new Error("LOCAL_SEMANTIC_STREAM_INVALID_FRAME");
            }
        }
        if (buffer.trim() || !result || typeof result !== "object") {
            throw new Error("LOCAL_SEMANTIC_STREAM_INCOMPLETE");
        }
        return result;
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}

export function isSemanticTimeout(error = "") {
    return /TIMEOUT|TIMED_OUT|DEADLINE/i.test(String(error?.message || error));
}

export function semanticFailurePresentation(error = "") {
    const value = String(error);
    if (/JARVIS_RELAY_WORKSTATION_UNAVAILABLE|JARVIS_RELAY_LOCAL_HEALTH_REQUIRED/.test(value)) return {
        title: "La laptop no está enlazada",
        detail: "No hay un enlace privado activo. Mantén abierta la Terminal autorizada en la laptop. Esto no demuestra que Qwen esté apagado."
    };
    if (/JARVIS_RELAY_RESULT_UNCONFIRMED|JARVIS_RELAY_REQUEST_CANCELLED/.test(value)) return {
        title: "No se confirmó la respuesta",
        detail: "Se perdió la confirmación del enlace. La solicitud pudo haberse ejecutado; no se repetirá automáticamente."
    };
    if (/JARVIS_RELAY_OWNER_REQUIRED|JARVIS_RELAY_SUBMISSION_FAILED/.test(value)) return {
        title: "El enlace privado requiere autorización",
        detail: "La sesión o las reglas no autorizaron esta solicitud. No se utilizará otro modelo ni una conexión pública sin protección."
    };
    if (/JARVIS_RELAY_LOCAL_OPERATION_REQUIRED/.test(value)) return {
        title: "Esta operación requiere la laptop",
        detail: "El enlace de pruebas no permite escritura, publicación ni video remoto. La conversación y las consultas autorizadas sí usan el canal privado."
    };
    if (isSemanticTimeout(value)) return {
        title: "El análisis agotó su tiempo",
        detail: "La planificación no terminó dentro del tiempo disponible. Este error no demuestra que Jarvis esté desconectado."
    };
    if (/Failed to fetch|NetworkError|BRIDGE_REQUIRED|ECONNREFUSED/i.test(value)) return {
        title: "No se pudo contactar a Jarvis local",
        detail: "Falló la comunicación con el servicio local. La misión no se ejecutó."
    };
    return {
        title: "No se pudo completar el análisis",
        detail: "El núcleo local no devolvió un plan válido. La misión quedó detenida."
    };
}

// Transport-only policy shared by the browser and the existing workstation.
// The UID is a public identifier, never a password or a grant by itself.
export const JARVIS_PRIVATE_RELAY = Object.freeze({
    version: 1,
    projectId: "fixgo-44e4d",
    ownerUid: "nNhwy3Mx4pTvc8TZVh1tyTMFwhC2",
    collection: "jarvis_private_relay",
    maxBytes: 384 * 1024,
    heartbeatMs: 30000,
    offlineMs: 120000,
    queueMaxAgeMs: 300000,
    routes: Object.freeze([
        "/semantic/plan", "/semantic/respond", "/semantic/local/health",
        "/memory/append", "/memory/query", "/workstation/health",
        "/read", "/grep", "/repo/graph", "/repo/candidates",
        "/repo/resolve-target", "/repo/read-target", "/web/research"
    ])
});

export function relayTimestampMs(value) {
    return typeof value?.toMillis === "function" ? value.toMillis() :
        typeof value === "number" && Number.isFinite(value) ? value : NaN;
}

export function validateJarvisRelayRequest(request, { requestId, releaseId, now = Date.now() } = {}) {
    const policy = JARVIS_PRIVATE_RELAY;
    if (!request || typeof request !== "object" || request.schemaVersion !== policy.version ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId || "") ||
        request.requestId !== requestId || request.state !== "QUEUED") throw new Error("JARVIS_RELAY_ENVELOPE_INVALID");
    if (request.ownerUid !== policy.ownerUid) throw new Error("JARVIS_RELAY_OWNER_REQUIRED");
    if (!releaseId || request.releaseId !== releaseId) throw new Error("JARVIS_RELAY_RELEASE_MISMATCH");
    if (!policy.routes.includes(request.route)) throw new Error("JARVIS_RELAY_ROUTE_NOT_ALLOWED");
    const created = relayTimestampMs(request.createdAt), expires = relayTimestampMs(request.expiresAt);
    if (!Number.isFinite(created) || !Number.isFinite(expires) || created > now + 10000 ||
        created < now - policy.queueMaxAgeMs || expires <= now || expires > created + policy.queueMaxAgeMs + 10000) {
        throw new Error("JARVIS_RELAY_REQUEST_EXPIRED");
    }
    if (typeof request.body !== "string" || new TextEncoder().encode(request.body).length > policy.maxBytes) {
        throw new Error("JARVIS_RELAY_PAYLOAD_TOO_LARGE");
    }
    let payload;
    try { payload = JSON.parse(request.body); } catch { throw new Error("JARVIS_RELAY_PAYLOAD_INVALID"); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("JARVIS_RELAY_PAYLOAD_INVALID");
    if (request.route.startsWith("/memory/")) {
        if (payload.identity?.userId && payload.identity.userId !== policy.ownerUid) throw new Error("JARVIS_RELAY_MEMORY_OWNER_MISMATCH");
        payload.identity = { ...payload.identity, userId: policy.ownerUid };
        const records = payload.records || (payload.record ? [payload.record] : []);
        if (!Array.isArray(records) || records.some(record => record?.userId && record.userId !== policy.ownerUid)) {
            throw new Error("JARVIS_RELAY_MEMORY_OWNER_MISMATCH");
        }
    }
    return { route: request.route, payload, requestId, ownerUid: policy.ownerUid };
}

export function jarvisRelayPresenceIsLive(presence, releaseId, now = Date.now()) {
    const at = relayTimestampMs(presence?.heartbeatAt);
    return presence?.online === true && presence?.schemaVersion === JARVIS_PRIVATE_RELAY.version &&
        presence?.releaseId === releaseId && typeof presence.workerId === "string" && presence.workerId.length > 0 &&
        Number.isFinite(at) && at <= now + 10000 && now - at < JARVIS_PRIVATE_RELAY.offlineMs;
}
