import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { JarvisAttachments } from "../modules/terminal/jarvis-attachments.js";
import {
    readCapabilityEvidence,
    recordCapabilityEvidence
} from "../gestia-core/jarvis/jarvis.capability.evidence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("multimodal composer exposes bounded upload capabilities", () => {
    const description = JarvisAttachments.describe();
    assert.equal(description.version, "2.3.0-complete-batch-fail-closed");
    assert.equal(description.transport, "chunked_progressive");
    assert.equal(description.maxFiles, 30);
    assert.equal(description.maxFileBytes, 250 * 1024 * 1024);
    assert.equal(description.maxTotalBytes, 500 * 1024 * 1024);
    assert.equal(description.chunkBytes, 2 * 1024 * 1024);
    assert.equal(description.concurrency, 3);
    assert.equal(description.recoverableCompletedArtifacts, true);
});

test("multimodal composer rejects incomplete selected batches", () => {
    const complete = JarvisAttachments.inspectAttachmentBatch([
        {
            id: "ready-1",
            name: "uno.png",
            status: "ready",
            output: ".jarvis-artifacts/uploads/uno.png"
        }
    ]);
    assert.equal(complete.ok, true);
    assert.equal(complete.status, "ATTACHMENT_BATCH_COMPLETE");
    assert.equal(complete.readyFiles, 1);

    const incomplete = JarvisAttachments.inspectAttachmentBatch([
        {
            id: "failed-1",
            name: "dos.png",
            status: "failed",
            output: null,
            error: "UPLOAD_FAILED"
        }
    ]);
    assert.equal(incomplete.ok, false);
    assert.equal(incomplete.status, "ATTACHMENT_BATCH_INCOMPLETE");
    assert.equal(incomplete.incompleteFiles, 1);
});

test("verified capability evidence survives independent forensic reads", () => {
    const recorded = recordCapabilityEvidence("test_capability", {
        ok: true,
        status: "VERIFIED",
        checkedAt: new Date().toISOString()
    });
    const restored = readCapabilityEvidence("test_capability");
    assert.equal(recorded.evidenceSource, "JARVIS_VERIFIED_TOOL_EXECUTION");
    assert.equal(restored?.ok, true);
    assert.equal(restored?.status, "VERIFIED");
});

test("terminal exposes a GPT-style plus menu, file input and artifact renderer", () => {
    const terminal = fs.readFileSync(path.resolve(__dirname, "../gestia-terminal.html"), "utf8");
    const attachments = fs.readFileSync(path.resolve(__dirname, "../modules/terminal/jarvis-attachments.js"), "utf8");

    assert.match(terminal, /data-testid="jarvis-attach-toggle"/);
    assert.match(terminal, /Añadir fotos y archivos/);
    assert.match(terminal, /Crear una imagen/);
    assert.match(terminal, /Búsqueda en Internet/);
    assert.match(terminal, /JarvisAttachments\.composePrompt/);
    assert.match(terminal, /renderArtifactsFromObservations/);
    assert.match(terminal, /renderPendingArtifacts/);
    assert.match(terminal, /Archivo recibido: \$\{sourceName\}; tipo \$\{mimeType\}/);
    assert.match(attachments, /\/upload/);
    assert.match(attachments, /\/upload\/start/);
    assert.match(attachments, /\/upload\/chunk/);
    assert.match(attachments, /\/upload\/complete/);
    assert.match(attachments, /\/upload\/cancel/);
    assert.match(attachments, /\/artifact\/read/);
    assert.match(attachments, /jarvis-artifact-download/);
    assert.match(attachments, /renderingOutputs: new Set\(\)/);
    assert.match(attachments, /renderedOutputs: new Set\(\)/);
    assert.match(attachments, /state\.renderingOutputs\.has\(output\)/);
    assert.match(attachments, /state\.renderedOutputs\.add\(output\)/);
    assert.match(attachments, /state\.renderingOutputs\.delete\(output\)/);
    assert.match(attachments, /currentMissionArtifactPayloads/);
    assert.match(attachments, /collectDirectArtifact/);
    assert.doesNotMatch(attachments, /collectArtifacts\(child/);
});

test("MPH campaign ships a responsive landing and a real browser video exporter", () => {
    const landing = fs.readFileSync(path.resolve(__dirname, "../mph.html"), "utf8");
    const reel = fs.readFileSync(path.resolve(__dirname, "../mph-reel.html"), "utf8");

    assert.match(landing, /Multiservicios Peninsulares HMH/);
    assert.match(landing, /multiserviciospeninsulareshmh\.com/);
    assert.match(landing, /@media\(max-width:800px\)/);
    assert.match(reel, /canvas\.captureStream\(30\)/);
    assert.match(reel, /new MediaRecorder/);
    assert.match(reel, /value="30000"/);
    assert.match(reel, /value="45000"/);
    assert.match(reel, /mph-reel-\$\{seconds\}s\.webm/);
    assert.match(reel, /crypto\.subtle\.digest\('SHA-256'/);
    assert.match(reel, /jarvis:reel-exported/);
    assert.match(reel, /recordCapabilityEvidence\("reel_video"/);
});

test("repo impact falls back to live bridge evidence for newly created files", () => {
    const runtime = fs.readFileSync(path.resolve(__dirname, "../gestia-core/tools.runtime.js"), "utf8");
    assert.match(runtime, /IMPACT_READY_LIVE/);
    assert.match(runtime, /jarvis_repo_impact_live_fallback_v7/);
    assert.match(runtime, /source: "live_repo_bridge"/);
});

test("repo reads provide bounded numbered source evidence for semantic composition", () => {
    const runtime = fs.readFileSync(path.resolve(__dirname, "../gestia-core/tools.runtime.js"), "utf8");
    const core = fs.readFileSync(path.resolve(__dirname, "../gestia-core/gestia-core.js"), "utf8");

    assert.match(runtime, /numberedSourceContent/);
    assert.match(runtime, /numberedContent/);
    assert.match(core, /buildMissionEvidenceEnvelope/);
    assert.match(core, /verifiedRead:/);
    assert.match(core, /const perItemBudget/);
    assert.match(core, /const payloadBudget/);
});
