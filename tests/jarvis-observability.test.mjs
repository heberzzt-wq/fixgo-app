import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendObservation, buildObservabilitySnapshot } from "../jarvis-observability.js";

test("observability aggregates functional outcomes instead of module imports", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-observability-"));
    appendObservation({ root, operation: "/write", httpStatus: 400, latencyMs: 12, request: { caseId: "CASE-1", objectiveId: "OBJ-1", authorityId: "HEBERTO_MENDOZA" }, result: { ok: false, status: "WRITE_BLOCKED", error: "SNAPSHOT_MISMATCH" } });
    appendObservation({ root, operation: "/write/authorize", httpStatus: 200, latencyMs: 8, request: { caseId: "CASE-1", objectiveId: "OBJ-1", approvedBy: "HEBERTO_MENDOZA" }, result: { ok: true, status: "WRITE_AUTHORIZED_ONCE" } });
    appendObservation({ root, operation: "/write", httpStatus: 200, latencyMs: 20, request: { caseId: "CASE-1", objectiveId: "OBJ-1" }, result: { ok: true, status: "WRITE_COMPLETED_VERIFIED" } });
    appendObservation({ root, operation: "/page/create", httpStatus: 200, latencyMs: 25, request: { caseId: "CASE-1" }, result: { ok: true, status: "PAGE_ARTIFACT_CREATED_VERIFIED", provider: "jarvis", artifact: { artifactId: "ART-1", type: "landing", bytes: 7000 } } });
    const snapshot = buildObservabilitySnapshot({ root });
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.evidenceOnly, true);
    assert.equal(snapshot.counts.total, 4);
    assert.equal(snapshot.counts.writeBlocked, 1);
    assert.equal(snapshot.counts.writeAuthorized, 1);
    assert.equal(snapshot.counts.approvalConsumed, 1);
    assert.equal(snapshot.counts.pagesCreated, 1);
    assert.equal(snapshot.counts.failed, 1);
    assert.equal(snapshot.counts.successful, 3);
    assert.equal(snapshot.averageLatencyMs, 16);
    assert.equal(snapshot.latestTest.artifactId, "ART-1");
    assert.equal(snapshot.errors[0].error, "SNAPSHOT_MISMATCH");
});

test("observability is exposed through one read-only Jarvis tool", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
    assert.match(bridge, /app\.post\("\/observability\/snapshot"/);
    assert.match(bridge, /appendObservation\(/);
    assert.match(actuator, /name: "system\.observability"/);
    assert.match(actuator, /mutates: false/);
});
