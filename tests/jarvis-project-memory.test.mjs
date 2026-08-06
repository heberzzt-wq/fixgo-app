import test from "node:test";
import assert from "node:assert/strict";
import { createProjectMemory } from "../gestia-core/jarvis/jarvis.project.memory.js";

class Storage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
    key(index) { return [...this.values.keys()][index] ?? null; }
    get length() { return this.values.size; }
}

const identity = { userId: "owner-a", workspaceId: "fixgo", projectId: "hmh", conversationId: "c-1" };

test("persists scoped memories and mission state across fresh instances", () => {
    const storage = new Storage();
    const first = createProjectMemory({ storage, identity });
    const stored = first.remember({ type: "TECHNICAL_RESULT", subject: "marketing", content: "Plan de 25 secciones creado", missionId: "m-1" });
    first.missionStorage.setItem("mission:m-1", JSON.stringify({ status: "WAITING_FOR_INPUT" }));
    const rebuilt = createProjectMemory({ storage, identity });
    assert.equal(rebuilt.query({ types: ["TECHNICAL_RESULT"] })[0].id, stored.record.id);
    assert.match(rebuilt.missionStorage.getItem("mission:m-1"), /WAITING_FOR_INPUT/);
});

test("isolates users and projects", () => {
    const storage = new Storage();
    createProjectMemory({ storage, identity }).remember({ type: "FACT_CONFIRMED", subject: "market", content: "Cancún" });
    assert.equal(createProjectMemory({ storage, identity: { ...identity, userId: "owner-b" } }).query().length, 0);
    assert.equal(createProjectMemory({ storage, identity: { ...identity, projectId: "adjunto" } }).query().length, 0);
});

test("isolates mission snapshots by conversation and manual data from E2E runs", () => {
    const storage = new Storage();
    const manual = createProjectMemory({ storage, identity, namespace: "manual" });
    const otherConversation = createProjectMemory({ storage, identity: { ...identity, conversationId: "c-2" }, namespace: "manual" });
    const e2e = createProjectMemory({ storage, identity, namespace: "e2e", runId: "run-17" });
    manual.missionStorage.setItem("pending", "manual-mission");
    e2e.remember({ type: "MISSION_STATE", subject: "marketing", content: "fixture residual", missionId: "fixture-mission" });
    assert.equal(otherConversation.missionStorage.getItem("pending"), null);
    assert.equal(manual.query().length, 0);
    assert.equal(e2e.query()[0].dataClass, "E2E_FIXTURE");
    assert.notEqual(manual.missionKey, otherConversation.missionKey);
});

test("only an E2E namespace can clean its own fixtures", () => {
    const storage = new Storage();
    const manual = createProjectMemory({ storage, identity, namespace: "manual" });
    const e2e = createProjectMemory({ storage, identity, namespace: "e2e", runId: "cleanup" });
    manual.remember({ type: "FACT_CONFIRMED", subject: "real", content: "Manual real memory" });
    e2e.remember({ type: "FACT_CONFIRMED", subject: "fixture", content: "E2E fixture" });
    e2e.missionStorage.setItem("pending", "fixture-mission");
    assert.equal(manual.clearTestData().status, "MEMORY_TEST_CLEANUP_FORBIDDEN");
    assert.equal(e2e.clearTestData().status, "MEMORY_E2E_DATA_CLEARED");
    assert.equal(createProjectMemory({ storage, identity, namespace: "manual" }).query().length, 1);
    assert.equal(createProjectMemory({ storage, identity, namespace: "e2e", runId: "cleanup" }).query().length, 0);
});

test("deduplicates, supersedes, corrects, forgets, and rejects secrets", () => {
    const memory = createProjectMemory({ storage: new Storage(), identity });
    const first = memory.remember({ type: "DECISION_ACTIVE", subject: "channel", content: "Usar Meta Ads" });
    assert.equal(memory.remember({ type: "DECISION_ACTIVE", subject: "channel", content: "Usar Meta Ads" }).status, "MEMORY_DEDUPED");
    memory.remember({ type: "DECISION_ACTIVE", subject: "channel", content: "Priorizar Google Ads", supersedes: first.record.id });
    assert.equal(memory.query({ types: ["DECISION_ACTIVE"] }).length, 1);
    const correction = memory.correct(memory.query()[0].id, "Priorizar WhatsApp");
    assert.equal(correction.record.type, "CORRECTION");
    assert.equal(memory.forget(correction.record.id).status, "MEMORY_FORGOTTEN");
    assert.equal(memory.remember({ type: "FACT_CONFIRMED", content: "api_key=super-secret-value" }).status, "MEMORY_SECRET_REJECTED");
});
