import { createHash } from "node:crypto";

export const JARVIS_DEPLOY_GATE_VERSION = "1.1.0-isolated-hosting-scope";
export const JARVIS_ISOLATED_HOSTING_REF = "refs/heads/v94-media-v4n-negative-claims";

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
    const hostingOnly = input.hostingOnly === true;
    const failures = [];

    const standardBranch =
        ref === "refs/heads/v5.9-polish" ||
        ref === "refs/heads/main";
    const isolatedHostingBranch =
        ref === JARVIS_ISOLATED_HOSTING_REF;

    if (actor !== "heberzzt-wq") failures.push("SOVEREIGN_ACTOR_MISMATCH");
    if (eventName !== "push") failures.push("DEPLOY_EVENT_NOT_PUSH");
    if (!standardBranch && !isolatedHostingBranch) failures.push("DEPLOY_BRANCH_NOT_ALLOWED");
    if (isolatedHostingBranch && !hostingOnly) failures.push("ISOLATED_BRANCH_HOSTING_ONLY_REQUIRED");
    if (!isHexSha(commitSha)) failures.push("DEPLOY_COMMIT_SHA_INVALID");
    if (projectId !== "fixgo-44e4d") failures.push("DEPLOY_PROJECT_MISMATCH");
    if (input.ciPassed !== true) failures.push("DEPLOY_CI_NOT_VERIFIED");

    const envelope = {
        actor,
        eventName,
        ref,
        commitSha,
        projectId,
        ciPassed: input.ciPassed === true,
        hostingOnly
    };
    const fingerprint = createHash("sha256")
        .update(JSON.stringify(envelope))
        .digest("hex");

    return {
        ok: failures.length === 0,
        status: failures.length === 0 ? "SOVEREIGN_DEPLOY_AUTHORIZED" : "SOVEREIGN_DEPLOY_BLOCKED",
        version: JARVIS_DEPLOY_GATE_VERSION,
        authorityId: failures.includes("SOVEREIGN_ACTOR_MISMATCH") ? null : "HEBERTO_MENDOZA",
        controllerId: "GITHUB_ACTIONS_CI",
        fingerprint,
        envelope,
        failures,
        deploymentScope: hostingOnly ? "hosting" : "default",
        hostingOnlyRequired: isolatedHostingBranch,
        singleCommit: true,
        testsRequired: true,
        selfAuthorizationAllowed: false
    };
}
