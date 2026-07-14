import assert from "node:assert/strict";
import { test } from "node:test";

import { createPersistentCaseLedger } from "../gestia-core/jarvis/jarvis.case.ledger.js";

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
}

test("persistent case ledger keeps objective and original instruction immutable across reloads", () => {
    const storage = memoryStorage();
    const firstRuntime = createPersistentCaseLedger({ storage });
    const created = firstRuntime.create({ authorityId: "HEBERTO_MENDOZA", domain: "pdf_editing" });
    const bound = firstRuntime.bindInstruction(created.caseId, "Aplica 10% de descuento antes del IVA");
    firstRuntime.bindInstruction(created.caseId, "Ahora conserva también la vigencia");

    const recoveredRuntime = createPersistentCaseLedger({ storage });
    const recovered = recoveredRuntime.active();
    assert.equal(recovered.caseId, created.caseId);
    assert.equal(recovered.objectiveId, created.objectiveId);
    assert.equal(recovered.originalInstruction, bound.originalInstruction);
    assert.equal(recovered.originalInstruction, "Aplica 10% de descuento antes del IVA");
    assert.equal(recovered.events.at(-1).type, "FOLLOWUP_INSTRUCTION_RECORDED");
});

test("persistent case ledger accepts only hashed user evidence and deduplicates it", () => {
    const ledger = createPersistentCaseLedger({ storage: memoryStorage() });
    const record = ledger.create({ domain: "landing" });
    assert.throws(() => ledger.recordAttachment(record.caseId, { output: ".jarvis-artifacts/uploads/a.png" }), /VERIFIED_ATTACHMENT_REQUIRED/);
    const attachment = {
        name: "obra.png",
        mimeType: "image/png",
        bytes: 2048,
        output: ".jarvis-artifacts/uploads/obra.png",
        sha256: "a".repeat(64)
    };
    ledger.recordAttachment(record.caseId, attachment);
    const updated = ledger.recordAttachment(record.caseId, attachment);
    assert.equal(updated.attachments.length, 1);
    assert.equal(updated.attachments[0].source, "USER_ATTACHMENT");
    assert.equal(updated.attachments[0].objectiveId, record.objectiveId);
});
