import assert from "node:assert/strict";
import { test } from "node:test";

import {
    authorizeSubordinateAction,
    createAuthorityEnvelope,
    describeSovereignAuthority,
    validateAuthorityTransition
} from "../gestia-core/jarvis/jarvis.sovereign.authority.js";

function envelope() {
    return createAuthorityEnvelope({
        objectiveId: "OBJ-41.43.3",
        instruction: "Analizar el repo sin generar plan"
    });
}

test("authority envelope seals objective and approval chain", () => {
    const current = envelope();

    assert.equal(current.authorityId, "HEBERTO_MENDOZA");
    assert.equal(current.controllerId, "CODEX_SIA7");
    assert.deepEqual(current.approvalChain, ["HEBERTO_MENDOZA", "CODEX_SIA7"]);
    assert.equal(Object.isFrozen(current), true);
    assert.equal(current.policy.memoryMayReplaceInstruction, false);
    assert.equal(current.policy.patchPreviewMayReplaceInstruction, false);
});

test("memory and patch preview cannot replace current instruction", () => {
    const current = envelope();

    for (const source of ["memory", "patch_preview"]) {
        const result = validateAuthorityTransition(current, {
            source,
            instruction: "Generar un plan distinto"
        });

        assert.equal(result.allowed, false);
        assert.equal(result.reason, "ADVISORY_SOURCE_CANNOT_REPLACE_INSTRUCTION");
    }
});

test("subordinate cannot replace objective or authority", () => {
    const current = envelope();

    assert.equal(
        validateAuthorityTransition(current, { objectiveId: "OBJ-OTHER" }).reason,
        "OBJECTIVE_REPLACEMENT_BLOCKED"
    );

    assert.equal(
        validateAuthorityTransition(current, { authorityId: "OTHER_OWNER" }).reason,
        "AUTHORITY_REPLACEMENT_BLOCKED"
    );
});

test("only Codex SIA7 can authorize sovereign actions", () => {
    const current = envelope();

    const blocked = authorizeSubordinateAction(current, {
        actorId: "MARKETING_AGENT",
        action: "deploy"
    });

    const allowed = authorizeSubordinateAction(current, {
        actorId: "CODEX_SIA7",
        action: "deploy"
    });

    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, "SOVEREIGN_ACTION_REQUIRES_CODEX_SIA7");
    assert.equal(allowed.allowed, true);
});

test("authority descriptor exposes fail-closed guarantees", () => {
    const description = describeSovereignAuthority();

    assert.equal(description.version, "1.0.0-sovereign-authority");
    assert.ok(description.guarantees.includes("authority_mismatch_fails_closed"));
});
