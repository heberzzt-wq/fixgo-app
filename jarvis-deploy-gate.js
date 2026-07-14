import { createHash } from "node:crypto";

export const JARVIS_DEPLOY_GATE_VERSION = "1.0.0-sovereign-ci-receipt";

function clean(value) {
    return typeof value === "string" ? value.trim() : "";
}

function isHexSha(value) {
    if (value.length !== 40) return false;
    return Array.from(value.toLowerCase()).every(character => {
        const code = character.charCodeAt(0);
        return (code >= 48 && code <= 57) || (code >= 97 && code <= 102);
    });
}

export function evaluateDeployGate(input = {}) {
    const actor = clean(input.actor).toLowerCase();
    const eventName = clean(input.eventName);
    const ref = clean(input.ref);
    const commitSha = clean(input.commitSha).toLowerCase();
    const projectId = clean(input.projectId);
    const failures = [];

    if (actor !== "heberzzt-wq") failures.push("SOVEREIGN_ACTOR_MISMATCH");
    if (eventName !== "push") failures.push("DEPLOY_EVENT_NOT_PUSH");
    if (ref !== "refs/heads/v5.9-polish" && ref !== "refs/heads/main") failures.push("DEPLOY_BRANCH_NOT_ALLOWED");
    if (!isHexSha(commitSha)) failures.push("DEPLOY_COMMIT_SHA_INVALID");
    if (projectId !== "fixgo-44e4d") failures.push("DEPLOY_PROJECT_MISMATCH");
    if (input.ciPassed !== true) failures.push("DEPLOY_CI_NOT_VERIFIED");

    const envelope = { actor, eventName, ref, commitSha, projectId, ciPassed: input.ciPassed === true };
    const fingerprint = createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
    return {
        ok: failures.length === 0,
        status: failures.length === 0 ? "SOVEREIGN_DEPLOY_AUTHORIZED" : "SOVEREIGN_DEPLOY_BLOCKED",
        version: JARVIS_DEPLOY_GATE_VERSION,
        authorityId: failures.includes("SOVEREIGN_ACTOR_MISMATCH") ? null : "HEBERTO_MENDOZA",
        controllerId: "GITHUB_ACTIONS_CI",
        fingerprint,
        envelope,
        failures,
        singleCommit: true,
        testsRequired: true,
        selfAuthorizationAllowed: false
    };
}
