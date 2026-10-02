import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { StringDecoder } from "node:string_decoder";

// Keep this transport local and do not follow redirects.
// The AbortSignal represents caller cancellation/disconnection only; local semantic
// inference has no artificial execution deadline.
export async function fetchLocalSemanticResponse(url, { method, headers, body, signal, onFrame }) {
    const target = new URL(url);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
        !["http:", "https:"].includes(target.protocol)) {
        throw new Error("LOCAL_SEMANTIC_ENDPOINT_MUST_BE_LOOPBACK");
    }
    if (!signal) throw new Error("LOCAL_SEMANTIC_CANCELLATION_SIGNAL_REQUIRED");
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
            const streaming = typeof onFrame === "function" && response.statusCode >= 200 && response.statusCode < 300;
            const decoder = new StringDecoder("utf8");
            let pending = "", content = "", finalFrame = null;
            const accept = line => {
                if (!line.trim()) return;
                const frame = JSON.parse(line);
                if (frame.error) throw new Error(String(frame.error));
                content += String(frame.message?.content || "");
                if (frame.done === true) finalFrame = frame;
                onFrame(frame, { generatedChars: content.length });
            };
            response.on("error", reject);
            response.on("data", chunk => {
                bytes += chunk.length;
                if (bytes > 2 * 1024 * 1024) {
                    const error = new Error("LOCAL_SEMANTIC_RESPONSE_TOO_LARGE");
                    reject(error);
                    request.destroy(error);
                    return;
                }
                if (!streaming) chunks.push(chunk);
                else try {
                    pending += decoder.write(chunk);
                    let end;
                    while ((end = pending.indexOf("\n")) >= 0) {
                        accept(pending.slice(0, end));
                        pending = pending.slice(end + 1);
                    }
                } catch (error) { reject(error); request.destroy(error); }
            });
            response.on("end", () => {
                if (!response.complete) return reject(new Error("LOCAL_SEMANTIC_RESPONSE_INCOMPLETE"));
                let raw;
                try {
                    if (streaming) {
                        accept(pending + decoder.end());
                        if (!finalFrame) throw new Error("LOCAL_SEMANTIC_STREAM_INCOMPLETE");
                        raw = JSON.stringify({ ...finalFrame, message: { ...finalFrame.message, content } });
                    } else raw = Buffer.concat(chunks).toString("utf8");
                } catch (error) { reject(error); return; }
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
        // Local Jarvis semantic work has no artificial execution deadline.
        // Closing the request can still abort it, but planner/response duration
        // is owned by the local model rather than a timer.
        const noDeadline = true;
        const budgetMs = null;
        const controller = new AbortController();
        const startedAt = Date.now();
        const documentStage = operation === "respond" &&
            ["document_initial", "document_segment", "document_repair", "spreadsheet_initial", "spreadsheet_repair"].includes(body.semanticStage);
        let stage = documentStage ? body.semanticStage : operation === "respond" ? "final_response" : "planning";
        const recoveryAttempt = documentStage && Number.isInteger(body.recoveryAttempt)
            ? Math.max(0, Math.min(6, body.recoveryAttempt)) : 0;
        let heartbeat;
        let generatedChars = 0;
        const send = frame => {
            if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(frame) + "\n");
        };
        const progress = () => send({ type: "progress", stage, recoveryAttempt, generatedChars, elapsedMs: Date.now() - startedAt, budgetMs, noDeadline });
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
                onProgress: nextStage => {
                    if (typeof nextStage === "string") stage = nextStage;
                    else if (documentStage && nextStage?.stage === body.semanticStage) {
                        generatedChars = Math.max(generatedChars, Number(nextStage.generatedChars) || 0);
                    }
                    if (streaming) progress();
                }
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
