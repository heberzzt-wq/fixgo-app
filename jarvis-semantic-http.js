import { semanticPlanBudgetMs } from "./gestia-core/jarvis/jarvis.semantic.transport.js";

// One request, one engine call. Heartbeats are transport liveness, not evidence
// that the model has completed any objective. Legacy JSON callers stay supported.
export function semanticPlanHandler(semanticEngine, { heartbeatMs = 5000 } = {}) {
    return async (req, res) => {
        const health = semanticEngine.describe();
        if (health.ok !== true) return res.status(503).json(health);
        const streaming = req.body?.streamProgress === true;
        const body = req.body || {};
        const budgetMs = streaming ? semanticPlanBudgetMs(body) : body.timeoutMs;
        const controller = new AbortController();
        const startedAt = Date.now();
        let stage = "planning";
        let heartbeat;
        const send = frame => {
            if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(frame) + "\n");
        };
        const progress = () => send({ type: "progress", stage, elapsedMs: Date.now() - startedAt, budgetMs });
        const close = () => controller.abort();
        res.once("close", close);
        if (streaming) {
            res.status(200).set({ "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
            res.flushHeaders();
            progress();
            heartbeat = setInterval(progress, heartbeatMs);
        }
        try {
            const result = await semanticEngine.plan({
                ...body, timeoutMs: budgetMs, signal: controller.signal,
                onProgress: nextStage => { stage = nextStage; if (streaming) progress(); }
            });
            const receipt = { ...result, localSemanticInferenceUsed: true, cloudSemanticInferenceUsed: false, fallbackAllowed: health.fallbackAllowed };
            if (streaming) send({ type: "result", result: receipt });
            else if (!res.destroyed) res.json(receipt);
        } catch (error) {
            const failure = {
                ok: false, status: "LOCAL_SEMANTIC_PLAN_FAILED", error: error?.message || String(error),
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
