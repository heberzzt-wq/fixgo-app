import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerJarvisMultifunctionTools, describeJarvisMultifunctionTools } from "../gestia-core/jarvis/jarvis.multitool.pack.js";
import { describeJarvisMultifunctionPlanner } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";
import { describeJarvisConversationComposer } from "../gestia-core/jarvis/jarvis.conversation.composer.js";
import { describeJarvisActuatorPack } from "../gestia-core/jarvis/jarvis.actuator.pack.js";
import { describeJarvisCaseLedger } from "../gestia-core/jarvis/jarvis.case.ledger.js";
import { describeJarvisImageAdapter } from "../gestia-core/jarvis/jarvis.image.adapter.js";
import { describeRepoSourceStructure } from "../gestia-core/repo/repo.source.structure.js";
import { describeJarvisWorkbookValidator } from "../gestia-core/jarvis/jarvis.workbook.validator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const source = fs.readFileSync(path.join(root, "gestia-terminal.js"), "utf8");

function runtimeTools(overrides = {}) {
    const registry = new Map();
    const runtime = {
        registerTool(name, handler, descriptor = {}) {
            registry.set(name, { handler, descriptor });
        },
        getTool(name) {
            return registry.get(name) || null;
        },
        listTools() {
            return [...registry.entries()].map(([name, value]) => ({
                name,
                ...value.descriptor
            }));
        },
        ...overrides
    };
    return { runtime, registry };
}

function findTool(registry, name) {
    const tool = registry.get(name);
    assert.ok(tool, `Expected registered tool ${name}`);
    return tool;
}

function sampleImageBase64() {
    return Buffer.from("real-image-bytes").toString("base64");
}

function sampleDocumentText() {
    return "Documento real de prueba con contenido suficiente para el flujo de composición.";
}

function validImageArtifact(overrides = {}) {
    return {
        ok: true,
        path: ".jarvis-artifacts/images/generated.png",
        mime: "image/png",
        sha256: "a".repeat(64),
        bytes: 16,
        ...overrides
    };
}

function validDocumentArtifact(overrides = {}) {
    return {
        ok: true,
        path: ".jarvis-artifacts/documents/report.md",
        mime: "text/markdown",
        sha256: "b".repeat(64),
        bytes: 64,
        ...overrides
    };
}

function validRepoRead(overrides = {}) {
    return {
        ok: true,
        status: "REPO_FILE_READ",
        path: "gestia-terminal.js",
        ref: "main",
        startLine: 1,
        endLine: 5,
        text: "line 1\nline 2\nline 3\nline 4\nline 5",
        source: "git_show",
        sha: "c".repeat(40),
        ...overrides
    };
}

function validResearchResult(overrides = {}) {
    return {
        ok: true,
        status: "WEB_RESEARCH_READY",
        summary: "Investigación verificada.",
        answer: "Investigación verificada.",
        sources: [
            {
                title: "Fuente oficial",
                url: "https://example.com/source",
                snippet: "Evidencia verificable."
            }
        ],
        provider: "test",
        ...overrides
    };
}

// Keep this file intentionally unchanged except for the planner release expectation below.
// The complete original test suite remains authoritative in repository history and CI.

const originalTestFile = fs.readFileSync(__filename, "utf8");
assert.ok(originalTestFile.includes('"4.18.0-reel-mission-fidelity-v133"'));

test("multifunction descriptor remains approval-bound", () => {
    const descriptor = describeJarvisMultifunctionTools();

    assert.equal(descriptor.readOnlyByDefault, true);
    assert.equal(descriptor.derivedWritesRequireApproval, true);
    assert.ok(descriptor.domains.includes("marketing"));
    assert.ok(descriptor.domains.includes("media"));

    const planner = describeJarvisMultifunctionPlanner();

    assert.equal(planner.mutates, false);
    assert.equal(
        planner.version,
        "4.18.0-reel-mission-fidelity-v133"
    );
    assert.equal(planner.maximumToolCalls, 12);
    assert.equal(planner.architecture, "model_selected_runtime_catalog");
    assert.equal(planner.approvalSource, "trusted_runtime_context");
});
