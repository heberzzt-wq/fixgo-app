import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const JARVIS_OBSERVABILITY_VERSION = "1.0.0-functional-events";

function eventFile(root) {
    return path.resolve(root, ".jarvis-artifacts/.ledger/observability.jsonl");
}

function clean(value) {
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : "";
}

function classify(operation, status) {
    if (status === "WRITE_AUTHORIZED_ONCE") return "write_authorized";
    if (status === "WRITE_COMPLETED_VERIFIED") return "approval_consumed";
    if (status.includes("WRITE") && (status.includes("BLOCKED") || status.includes("MISMATCH") || status.includes("NOT_FOUND"))) return "write_blocked";
    if (operation.includes("/artifact")) return "artifact";
    if (operation.includes("/upload")) return "file_received";
    if (operation.includes("/document/pdf/edit")) return "pdf_edited";
    if (operation.includes("/reel")) return "reel_generated";
    if (operation.includes("/page")) return "page_created";
    if (operation.includes("/research")) return "web_research";
    if (operation.includes("/image")) return "image";
    if (operation.includes("/git")) return "git";
    return "operation";
}

export function appendObservation({ root, operation, httpStatus, latencyMs, request = {}, result = {} } = {}) {
    const resolvedRoot = path.resolve(root || process.cwd());
    const status = clean(result.status || result.error || "UNKNOWN");
    const record = {
        eventId: `OBS-${randomUUID()}`,
        version: JARVIS_OBSERVABILITY_VERSION,
        occurredAt: new Date().toISOString(),
        operation: clean(operation),
        category: classify(clean(operation), status),
        outcome: result.ok === true ? "SUCCESS" : Number(httpStatus) >= 400 ? "FAILED" : "UNKNOWN",
        httpStatus: Number(httpStatus) || null,
        status,
        latencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
        error: result.ok === true ? null : clean(result.error || result.message) || null,
        caseId: clean(request.caseId || result.caseId),
        objectiveId: clean(request.objectiveId || result.objectiveId),
        authority: clean(request.authorityId || request.approvedBy || result.approvedBy),
        provider: clean(result.provider || result.engine),
        model: clean(result.model),
        fallback: result.policy?.fallback === true || String(result.status || "").includes("FALLBACK"),
        artifactId: clean(result.artifact?.artifactId),
        artifactType: clean(result.artifact?.type),
        output: clean(result.output),
        bytes: Number(result.bytes || result.outputBytes || result.artifact?.bytes) || null,
        sourceCount: Number(result.sourceCount) || null,
        factCount: Array.isArray(result.facts) ? result.facts.length : Number(result.factCount) || null
    };
    const target = eventFile(resolvedRoot);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target) && fs.statSync(target).size > 10 * 1024 * 1024) {
        fs.renameSync(target, `${target}.1`);
    }
    fs.appendFileSync(target, `${JSON.stringify(record)}\n`, "utf8");
    return record;
}

export function readObservations({ root, limit = 500 } = {}) {
    const target = eventFile(path.resolve(root || process.cwd()));
    if (!fs.existsSync(target)) return [];
    const bounded = Math.max(1, Math.min(Number(limit) || 500, 2000));
    return fs.readFileSync(target, "utf8").split("\n").filter(Boolean).slice(-bounded).map(line => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean).reverse();
}

export function buildObservabilitySnapshot({ root, limit = 500 } = {}) {
    const events = readObservations({ root, limit });
    const counts = {
        total: events.length,
        successful: 0,
        failed: 0,
        writeBlocked: 0,
        writeAuthorized: 0,
        approvalConsumed: 0,
        artifacts: 0,
        webResearch: 0,
        filesReceived: 0,
        pdfEdited: 0,
        reelsGenerated: 0,
        pagesCreated: 0
    };
    const providerCounts = {};
    let totalLatency = 0;
    for (const event of events) {
        if (event.outcome === "SUCCESS") counts.successful += 1;
        if (event.outcome === "FAILED") counts.failed += 1;
        if (event.category === "write_blocked") counts.writeBlocked += 1;
        if (event.category === "write_authorized") counts.writeAuthorized += 1;
        if (event.category === "approval_consumed") counts.approvalConsumed += 1;
        if (event.category === "artifact") counts.artifacts += 1;
        if (event.category === "web_research") counts.webResearch += 1;
        if (event.category === "file_received") counts.filesReceived += 1;
        if (event.category === "pdf_edited") counts.pdfEdited += 1;
        if (event.category === "reel_generated") counts.reelsGenerated += 1;
        if (event.category === "page_created") counts.pagesCreated += 1;
        if (event.provider) providerCounts[event.provider] = Number(providerCounts[event.provider] || 0) + 1;
        totalLatency += Number(event.latencyMs || 0);
    }
    return {
        ok: true,
        status: events.length ? "OBSERVABILITY_EVIDENCE_AVAILABLE" : "OBSERVABILITY_AWAITING_FUNCTIONAL_EVENT",
        version: JARVIS_OBSERVABILITY_VERSION,
        evidenceOnly: true,
        counts,
        averageLatencyMs: events.length ? Math.round(totalLatency / events.length) : null,
        activeProviders: Object.entries(providerCounts).map(([provider, count]) => ({ provider, count })),
        latestTest: events[0] || null,
        errors: events.filter(event => event.outcome === "FAILED").slice(0, 20),
        traces: events.slice(0, 100)
    };
}
