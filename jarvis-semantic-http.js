import { semanticPlanBudgetMs } from "./gestia-core/jarvis/jarvis.semantic.transport.js";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

// Node fetch imposes its own 300 s headers/body deadlines. Ollama's non-streaming
// inference may need longer; the engine's bounded AbortSignal owns this deadline.
// Keep this transport local and do not follow redirects or retry accepted work.
export async function fetchLocalSemanticResponse(url, { method, headers, body, signal }) {
    const target = new URL(url);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
        !["http:", "https:"].includes(target.protocol)) {
        throw new Error("LOCAL_SEMANTIC_ENDPOINT_MUST_BE_LOOPBACK");
    }
    if (!signal) throw new Error("LOCAL_SEMANTIC_DEADLINE_REQUIRED");
    signal.throwIfAborted();
    return await new Promise((resolve, reject) => {
        const request = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, {
            method, headers, signal, agent: false
        }, response => {
            if (Number(response.headers["content-length"]) > 2 * 1024 * 1024) {
                const error = new Error("LOCAL_SEMANTIC_RESPONSE_TOO_LARGE");
                reject(error);
                response.destroy();
                request.destroy(error);
                return;
            }
            const chunks = [];
            let bytes = 0;
            response.on("error", reject);
            response.on("data", chunk => {
                bytes += chunk.length;
                if (bytes > 2 * 1024 * 1024) {
                    const error = new Error("LOCAL_SEMANTIC_RESPONSE_TOO_LARGE");
                    reject(error);
                    request.destroy(error);
                    return;
                }
                chunks.push(chunk);
            });
            response.on("end", () => {
                if (!response.complete) return reject(new Error("LOCAL_SEMANTIC_RESPONSE_INCOMPLETE"));
                const raw = Buffer.concat(chunks).toString("utf8");
                const status = response.statusCode || 0;
                resolve({ ok: status >= 200 && status < 300, status, text: async () => raw });
            });
        });
        request.on("error", reject);
        request.end(body);
    });
}

// One request, one engine call. Heartbeats are transport liveness, not evidence
// that the model has completed any objective. Legacy JSON callers stay supported.
export function semanticPlanHandler(semanticEngine, { heartbeatMs = 5000 } = {}) {
    return semanticRequestHandler(semanticEngine, { heartbeatMs, operation: "plan" });
}

export function semanticResponseHandler(semanticEngine, { heartbeatMs = 5000 } = {}) {
    return semanticRequestHandler(semanticEngine, { heartbeatMs, operation: "respond" });
}

function semanticRequestHandler(semanticEngine, { heartbeatMs, operation }) {
    return async (req, res) => {
        const health = semanticEngine.describe();
        if (health.ok !== true) return res.status(503).json(health);
        const streaming = req.body?.streamProgress === true;
        const body = req.body || {};
        const noDeadline = streaming && body?.noDeadline === true;
        const budgetInput = operation === "respond" ? { ...body, missionState: { phase: "FINAL_RESPONSE" } } : body;
        const budgetMs = noDeadline
            ? null
            : streaming
                ? semanticPlanBudgetMs(budgetInput)
                : body.timeoutMs;
        const controller = new AbortController();
        const startedAt = Date.now();
        let stage = operation === "respond" ? "final_response" : "planning";
        let heartbeat;
        const send = frame => {
            if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(frame) + "\n");
        };
        const progress = () => send({ type: "progress", stage, elapsedMs: Date.now() - startedAt, budgetMs, noDeadline });
        const close = () => controller.abort();
        res.once("close", close);
        if (streaming) {
            res.status(200).set({ "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
            res.flushHeaders();
            progress();
            heartbeat = setInterval(progress, heartbeatMs);
        }
        try {
            const result = await semanticEngine[operation]({
                ...body, timeoutMs: budgetMs, noDeadline, signal: controller.signal,
                onProgress: nextStage => { stage = nextStage; if (streaming) progress(); }
            });
            const receipt = { ...result, localSemanticInferenceUsed: true, cloudSemanticInferenceUsed: false, fallbackAllowed: health.fallbackAllowed };
            if (streaming) send({ type: "result", result: receipt });
            else if (!res.destroyed) res.json(receipt);
        } catch (error) {
            const failure = {
                ok: false, status: operation === "respond" ? "LOCAL_SEMANTIC_RESPONSE_FAILED" : "LOCAL_SEMANTIC_PLAN_FAILED", error: error?.message || String(error),
                evidence: error?.evidence || null, fallbackAllowed: health.fallbackAllowed,
                inferenceReceipt: semanticEngine.describe()
            };
            if (streaming) send({ type: "result", result: failure });
            else if (!res.destroyed) res.status(502).json(failure);
        } finally {
            clearInterval(heartbeat);
            res.removeListener("close", close);
            if (streaming && !res.destroyed) res.end();
        }
    };
}
