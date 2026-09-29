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
