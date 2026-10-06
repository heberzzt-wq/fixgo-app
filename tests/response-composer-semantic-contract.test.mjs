import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { composeEvidenceGroundedConversation } from "../gestia-core/jarvis/jarvis.conversation.composer.js";

function responsiveConversationFixture(manyFindings = false) {
    return ["before", "after"].map(phase => ({ name: "browser.inspect", observation: { ok: true,
        interfaceEvidence: { source: "RENDERED_DOM_LAYOUT_REPLAY", url: "https://runtime.test/gestia-terminal.html",
            phase, stateFingerprint: "a".repeat(64), sourceRevision: (phase === "before" ? "b" : "c").repeat(64),
            viewports: [[360, 800], [390, 844], [768, 1024], [1024, 768], [1280, 800], [1920, 1080]].map(([width, height]) => ({
                viewport: { width, height }, horizontalOverflow: false,
                elements: Array.from({ length: 40 }, (_, index) => ({ selector: `#control-${index}`, tag: "button", text: "Control",
                    display: "flex", visibility: "visible", fontSize: "16px", rect: [0, index * 44, 44, 44], interactive: true })),
                findings: phase === "after" && !manyFindings ? [] : Array.from({ length: manyFindings ? 40 : 1 }, (_, index) => ({
                    id: `clipping:${index}`, selector: `#control-${index}`, kind: "inaccessible_clipping", classification: "defect",
                    severity: "medium", certainty: "high", summary: `Control ${index} recortado en el límite observado.`,
                    impact: "El control queda parcialmente fuera del área visible.", evidence: { rect: [0, index * 44, 44, 44], excessPixels: 3 },
                    suggestedCorrection: "Revisar el ancho mínimo del contenedor.", verification: "Repetir medición con el mismo estado y viewport."
                })),
                hiddenStates: phase === "after" ? [{ selector: "#tray", hiddenAttribute: true, display: "none", rendered: false, rect: [0, 0, 0, 0] }] : []
            })) }
    } }));
}

test("responsive conversation bounds its briefing while retaining every viewport, phase and involved geometry", async () => {
    const evidenceItems = responsiveConversationFixture();
    let sent;
    const result = await composeEvidenceGroundedConversation({ instruction: "Explica las medidas antes y después sin afirmar publicación.", evidenceItems,
        executeConversation: async (_prompt, options) => { sent = options; return { ok: true, message: "Se midieron seis tamaños; interacción y publicación siguen pendientes." }; } });
    assert.equal(result.ok, true);
    assert.ok(sent.responseBriefing.length <= 11000, `briefing has ${sent.responseBriefing.length} characters`);
    const pages = JSON.parse(sent.responseBriefing).measuredInterfaceEvidence;
    assert.equal(pages.length, 2);
    for (const [index, page] of pages.entries()) {
        const original = evidenceItems[index].observation.interfaceEvidence;
        assert.equal(page.phase, original.phase);
        assert.equal(page.stateFingerprint, original.stateFingerprint);
        assert.equal(page.sourceRevision, original.sourceRevision);
        assert.deepEqual(page.viewports.map(item => item.viewport), original.viewports.map(item => item.viewport));
        assert.equal(page.screenshotInspected, false);
        assert.equal(page.interactionVerified, false);
        assert.ok(page.viewports.every(item => item.findingCounts.total === (index === 0 ? 1 : 0)));
        assert.ok(page.viewports.every(item => item.elements.some(element => element.selector === "#control-0" && element.rect[2] === 44)));
    }
    assert.ok(pages[0].viewports.every(item => item.findings[0]?.kind === "inaccessible_clipping"));
});

test("responsive conversation marks omitted findings explicitly instead of turning truncation into a clean audit", async () => {
    let sent;
    await composeEvidenceGroundedConversation({ instruction: "Explica los hallazgos medidos.", evidenceItems: responsiveConversationFixture(true),
        executeConversation: async (_prompt, options) => { sent = options; return { ok: true, message: "La medición contiene defectos; este resumen muestra sólo una parte." }; } });
    assert.ok(sent.responseBriefing.length <= 11000, `briefing has ${sent.responseBriefing.length} characters`);
    const briefing = JSON.parse(sent.responseBriefing);
    assert.equal(briefing.evidenceTextTruncated, true);
    for (const page of briefing.measuredInterfaceEvidence) for (const viewport of page.viewports) {
        assert.equal(viewport.findingCounts.defect, 40);
        assert.equal(viewport.findingCounts.total, 40);
        assert.equal(viewport.omittedFindings, 40 - viewport.findings.length);
        assert.ok(viewport.omittedFindings > 0);
        assert.ok(viewport.findings.length > 0, "Each viewport must retain measured findings when the summary budget permits");
    }
});

if (!globalThis.window) {
    globalThis.window = {};
}

const {
    ResponseComposer,
    __test
} = await import(
    "../gestia-core/response.composer.js?semantic-contract-test"
);

test("tool observation separates technical execution from objective satisfaction", () => {
    const observation = ResponseComposer.composeToolObservation(
        "marketing.plan",
        {
            ok: true,
            status: "MARKETING_INPUT_REQUIRED",
            readyForProduction: false,
            campaign: null,
            missingInputs: ["audience", "offer"]
        }
    );

    assert.equal(observation.ok, true);
    assert.equal(observation.executionOk, true);
    assert.equal(observation.objectiveSatisfied, false);
    assert.equal(observation.status, "MARKETING_INPUT_REQUIRED");
    assert.equal(observation.requiresInput, true);
    assert.equal(observation.blocked, true);
    assert.equal(observation.retryable, false);
    assert.deepEqual(observation.missingInputs, ["audience", "offer"]);
});

test("agent tool result keeps an input-required observation semantically blocked", () => {
    const observation = ResponseComposer.composeToolObservation(
        "marketing.plan",
        {
            ok: true,
            status: "MARKETING_INPUT_REQUIRED",
            missingInputs: ["audience"]
        }
    );
    const result = ResponseComposer.composeAgentToolResult({
        analysisId: "analysis-input-required",
        toolCalls: [{ name: "marketing.plan", args: {} }],
        observations: [observation]
    });

    assert.equal(result.ok, true);
    assert.equal(result.executionOk, true);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.status, "MARKETING_INPUT_REQUIRED");
    assert.equal(result.requiresInput, true);
    assert.equal(result.blocked, true);
    assert.deepEqual(result.data.semantic.missingInputs, ["audience"]);
    assert.match(result.text, /necesita información/i);
    assert.match(result.text, /audience/i);
    assert.equal(result.data.semanticSummary, result.text);
});

test("conversational Jarvis response stays visible instead of generic success summary", () => {
    const message = "¡Hola! Estoy bien, gracias. ¿Y tú? ¿Cómo estás?";
    const observation = ResponseComposer.composeToolObservation(
        "conversation.respond",
        {
            ok: true,
            status: "SEMANTIC_RESPONSE_READY",
            message
        }
    );
    const response = ResponseComposer.composeJarvis(
        message,
        {
            status: "SEMANTIC_RESPONSE_READY"
        },
        {
            tool: "conversation.respond"
        }
    );
    const result = ResponseComposer.composeAgentToolResult({
        observations: [observation],
        response
    });

    assert.equal(result.text, message);
    assert.equal(result.report, message);
    assert.notEqual(result.text, "Estado: SUCCESS");
});

test("conversation tool lifts nested message even through generic success envelope", () => {
    const message = "Qué onda pariente, todo bien por acá.";
    const observation = ResponseComposer.composeToolObservation(
        "conversation.respond",
        {
            ok: true,
            status: "SEMANTIC_RESPONSE_READY",
            message
        }
    );
    const response = ResponseComposer.success(
        {
            ok: true,
            status: "SEMANTIC_RESPONSE_READY",
            message
        },
        {
            type: "TOOL_RESULT",
            tool: "conversation.respond"
        }
    );
    const result = ResponseComposer.composeAgentToolResult({
        observations: [observation],
        response,
        meta: {
            tool: "conversation.respond"
        }
    });

    assert.equal(result.text, message);
    assert.equal(result.report, message);
});

test("terminal consumes top-level AGENT_TOOL_RESULT observations for conversational replies", () => {
    const terminal = fs.readFileSync(
        path.join(process.cwd(), "gestia-terminal.html"),
        "utf8"
    );

    assert.match(
        terminal,
        /coreResult\s*\|\|\s*\{\};/
    );
    assert.match(
        terminal,
        /getObservationToolName\(item, index\) === "conversation\.respond"/
    );
    assert.match(
        terminal,
        /activeWorkTracker\?\.dismiss\?\.\(\)/
    );
    assert.match(
        terminal,
        /window\.renderJarvisResponse\?\.\(\s*"Jarvis",\s*conversationText/
    );
});

test("approval requirement remains visible in the composed agent envelope", () => {
    const observation = ResponseComposer.composeToolObservation(
        "page.create",
        {
            ok: true,
            status: "PENDING_APPROVAL",
            requiresApproval: true
        }
    );
    const result = ResponseComposer.composeAgentToolResult({
        observations: [observation]
    });

    assert.equal(result.executionOk, true);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.status, "PENDING_APPROVAL");
    assert.equal(result.requiresApproval, true);
    assert.equal(result.blocked, true);
    assert.equal(result.retryable, false);
    assert.match(result.report, /necesita aprobación/i);
});

test("degraded success is successful but remains explicitly degraded", () => {
    const observation = ResponseComposer.composeToolObservation(
        "web.research",
        {
            ok: true,
            status: "GROUNDED_LOCAL_FALLBACK",
            cloudError: "SEMANTIC_CLOUD_TIMEOUT"
        }
    );
    const result = ResponseComposer.composeAgentToolResult({
        observations: [observation]
    });

    assert.equal(result.ok, true);
    assert.equal(result.objectiveSatisfied, true);
    assert.equal(result.status, "GROUNDED_LOCAL_FALLBACK");
    assert.equal(result.degraded, true);
    assert.equal(result.blocked, false);
    assert.match(result.text, /modo degradado/i);
});

test("technical failure stays retryable without pretending objective completion", () => {
    const semantic = __test.normalizeToolSemantics({
        ok: false,
        status: "TOOL_FAILED"
    });

    assert.equal(semantic.executionOk, false);
    assert.equal(semantic.objectiveSatisfied, false);
    assert.equal(semantic.blocked, false);
    assert.equal(semantic.retryable, true);
});

test("failure status overrides an incorrect ok true flag", () => {
    const semantic = __test.normalizeToolSemantics({
        ok: true,
        status: "TOOL_FAILED"
    });

    assert.equal(semantic.ok, false);
    assert.equal(semantic.executionOk, false);
    assert.equal(semantic.objectiveSatisfied, false);
    assert.equal(semantic.retryable, true);
    assert.equal(__test.shouldHaltToolSequence(semantic), true);
});

test("runtime wrapper lifts nested semantic status without losing raw data", async () => {
    const rawData = {
        ok: true,
        status: "MARKETING_INPUT_REQUIRED",
        readyForProduction: false,
        campaign: null,
        missingInputs: ["audience", "offer"]
    };
    const runtime = {
        async execute() {
            return {
                ok: true,
                success: true,
                status: "COMPLETED",
                data: rawData,
                executionId: "runtime-semantic-test"
            };
        }
    };

    assert.equal(__test.installSemanticRuntimeEnvelope(runtime), true);
    assert.equal(__test.installSemanticRuntimeEnvelope(runtime), true);

    const result = await runtime.execute("marketing.plan", {}, {});

    assert.equal(result.ok, true);
    assert.equal(result.executionOk, true);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.status, "MARKETING_INPUT_REQUIRED");
    assert.equal(result.requiresInput, true);
    assert.equal(result.blocked, true);
    assert.equal(result.data, rawData);
    assert.equal(runtime.__semanticEnvelopeInstalled, true);
});

test("runtime wrapper preserves top-level failure over successful nested data", () => {
    const result = __test.semanticRuntimeEnvelope({
        ok: false,
        status: "TOOL_FAILED",
        data: {
            ok: true,
            status: "COMPLETED",
            output: "stale.txt"
        }
    });

    assert.equal(result.ok, false);
    assert.equal(result.executionOk, false);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.status, "TOOL_FAILED");
    assert.equal(result.retryable, true);
});

test("bridge sequence guard stops dependent calls after semantic input block", async () => {
    const executed = [];
    const bridge = {
        async executeAndCompose(name) {
            executed.push(name);
            return name === "marketing.plan"
                ? {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: false,
                    status: "MARKETING_INPUT_REQUIRED",
                    requiresInput: true,
                    blocked: true,
                    missingInputs: ["audience"]
                }
                : {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "SUCCESS"
                };
        }
    };

    assert.equal(__test.installSemanticBridgeGuard(bridge), true);
    assert.equal(__test.installSemanticBridgeGuard(bridge), true);

    const results = await bridge.executeMany([
        { name: "web.research", args: {} },
        { name: "marketing.plan", args: {} },
        { name: "page.plan", args: {} },
        { name: "image.plan", args: {} },
        { name: "reel.plan", args: {} }
    ]);

    assert.deepEqual(executed, ["web.research", "marketing.plan"]);
    assert.equal(results.length, 2);
    assert.equal(results[1].requiresInput, true);
    assert.equal(bridge.__semanticSequenceGuardInstalled, true);
});

test("bridge guard reconciles semantic state into tool memory", async () => {
    const memoryEntry = {
        tool: "marketing.plan",
        ok: true,
        status: "SUCCESS"
    };
    globalThis.window.__JARVIS_TOOL_MEMORY__ = {
        version: "7.0.0",
        maxEntries: 25,
        entries: [memoryEntry],
        last: memoryEntry
    };
    const bridge = {
        async executeAndCompose() {
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: false,
                status: "MARKETING_INPUT_REQUIRED",
                requiresInput: true,
                blocked: true,
                missingInputs: ["audience", "offer"]
            };
        }
    };

    __test.installSemanticBridgeGuard(bridge);
    const result = await bridge.executeAndCompose(
        "marketing.plan",
        {},
        {}
    );

    assert.equal(result.objectiveSatisfied, false);
    assert.equal(memoryEntry.ok, true);
    assert.equal(memoryEntry.executionOk, true);
    assert.equal(memoryEntry.objectiveSatisfied, false);
    assert.equal(memoryEntry.status, "MARKETING_INPUT_REQUIRED");
    assert.equal(memoryEntry.requiresInput, true);
    assert.equal(memoryEntry.blocked, true);
    assert.deepEqual(memoryEntry.missingInputs, ["audience", "offer"]);
});


test("repo audit fails closed when scan contains zero file evidence", () => {
    const result = ResponseComposer.composeRepoAuditResult({
        rawInput: "audita el repo",
        scan: {
            ok: true,
            status: "REPO_AUDIT_READY",
            total: 0,
            files: [],
            modules: []
        },
        source: { tool: "repo.audit" }
    });

    assert.equal(result.ok, false);
    assert.equal(result.executionOk, false);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.error.code, "REPO_AUDIT_EMPTY_EVIDENCE");
    assert.equal(result.error.context.totalFiles, 0);
});

test("repo audit only reports completion when file evidence exists", () => {
    const result = ResponseComposer.composeRepoAuditResult({
        rawInput: "audita el repo",
        scan: {
            ok: true,
            status: "REPO_AUDIT_READY",
            total: 2,
            files: [
                { file: "gestia-core/gestia-core.js", module: "core" },
                { file: "gestia-core/tools.runtime.js", module: "runtime" }
            ],
            modules: [{ name: "core" }, { name: "runtime" }]
        },
        source: { tool: "repo.audit" }
    });

    assert.equal(result.ok, true);
    assert.match(result.text, /2 archivos/);
});
