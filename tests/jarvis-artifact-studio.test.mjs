import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findArtifact, listArtifacts, registerArtifact } from "../jarvis-artifact-studio.js";

test("artifact studio registers complete immutable metadata and versions a lineage", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-artifact-studio-"));
    const output = ".jarvis-artifacts/reports/audit.json";
    const file = path.join(root, output);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ score: 88 }));
    const first = registerArtifact({ root, output, metadata: {
        caseId: "CASE-1", objectiveId: "OBJ-1", type: "report", origin: "system.forensics",
        provider: "jarvis", mimeType: "application/json", approvalRequired: false,
        approved: true, approvedBy: "HEBERTO_MENDOZA", editable: true, preview: true,
        downloadable: true, publishable: false, deploymentStatus: "NOT_DEPLOYED"
    } });
    fs.writeFileSync(file, JSON.stringify({ score: 91 }));
    const second = registerArtifact({ root, output, metadata: {
        caseId: "CASE-1", objectiveId: "OBJ-1", type: "report", origin: "system.forensics",
        provider: "jarvis", mimeType: "application/json", editable: true, preview: true
    } });
    assert.match(first.artifactId, /^ART-/);
    assert.equal(first.version, 1);
    assert.equal(second.version, 2);
    assert.notEqual(first.sha256, second.sha256);
    assert.equal(first.caseId, "CASE-1");
    assert.equal(first.objectiveId, "OBJ-1");
    assert.equal(first.approval.approvedBy, "HEBERTO_MENDOZA");
    assert.equal(first.downloadable, true);
    assert.equal(first.deploymentStatus, "NOT_DEPLOYED");
    assert.equal(listArtifacts({ root, caseId: "CASE-1" }).length, 2);
    assert.equal(findArtifact({ root, artifactId: second.artifactId }).version, 2);
});

test("artifact studio rejects files outside its private artifact root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-artifact-block-"));
    fs.writeFileSync(path.join(root, "outside.txt"), "blocked");
    assert.throws(() => registerArtifact({ root, output: "outside.txt" }), /ARTIFACT_OUTPUT_REQUIRED/);
});

test("artifact studio is exposed as read-only Jarvis inventory tools", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
    assert.match(bridge, /app\.post\("\/artifact\/list"/);
    assert.match(bridge, /app\.post\("\/artifact\/json\/create"/);
    assert.match(bridge, /registerArtifact\(/);
    assert.match(actuator, /name: "artifact\.list"/);
    assert.match(actuator, /name: "artifact\.read"/);
    assert.match(actuator, /name: "artifact\.createJson"/);
});
