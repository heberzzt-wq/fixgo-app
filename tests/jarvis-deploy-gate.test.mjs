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

test("isolated V94 branch is authorized only for explicit Hosting-only scope", () => {
    const isolated = {
        ...valid,
        ref: "refs/heads/v94-media-v4n-negative-claims"
    };

    const blocked = evaluateDeployGate(isolated);
    assert.equal(blocked.ok, false);
    assert.deepEqual(blocked.failures, ["ISOLATED_BRANCH_HOSTING_ONLY_REQUIRED"]);
    assert.equal(blocked.hostingOnlyRequired, true);

    const hosting = evaluateDeployGate({
        ...isolated,
        hostingOnly: true
    });
    assert.equal(hosting.ok, true);
    assert.equal(hosting.status, "SOVEREIGN_DEPLOY_AUTHORIZED");
    assert.equal(hosting.deploymentScope, "hosting");
    assert.equal(hosting.envelope.hostingOnly, true);
});

test("Hosting-only flag never authorizes an unrelated feature branch", () => {
    const result = evaluateDeployGate({
        ...valid,
        ref: "refs/heads/feature/not-authorized",
        hostingOnly: true
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, ["DEPLOY_BRANCH_NOT_ALLOWED"]);
});
