import test from "node:test";
import assert from "node:assert/strict";

import { evaluateDeployGate } from "../jarvis-deploy-gate.js";

const valid = {
    actor: "heberzzt-wq",
    eventName: "push",
    ref: "refs/heads/v5.9-polish",
    commitSha: "70378b26d94bd25077f660888622fe3f1f8c572a",
    projectId: "fixgo-44e4d",
    ciPassed: true
};

test("deploy gate binds Heberto, CI, branch, project and one exact commit", () => {
    const result = evaluateDeployGate(valid);
    assert.equal(result.ok, true);
    assert.equal(result.status, "SOVEREIGN_DEPLOY_AUTHORIZED");
    assert.equal(result.authorityId, "HEBERTO_MENDOZA");
    assert.equal(result.fingerprint.length, 64);
    assert.equal(result.selfAuthorizationAllowed, false);
    assert.equal(evaluateDeployGate(valid).fingerprint, result.fingerprint);
});

test("deploy gate fails closed for a different actor, branch, event, commit or missing CI", () => {
    const result = evaluateDeployGate({ ...valid, actor: "automation-bot", eventName: "workflow_dispatch", ref: "refs/heads/feature", commitSha: "bad", ciPassed: false });
    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, ["SOVEREIGN_ACTOR_MISMATCH", "DEPLOY_EVENT_NOT_PUSH", "DEPLOY_BRANCH_NOT_ALLOWED", "DEPLOY_COMMIT_SHA_INVALID", "DEPLOY_CI_NOT_VERIFIED"]);
});
