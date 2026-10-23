import { createHash } from "node:crypto";

export const JARVIS_DEPLOY_GATE_VERSION = "1.2.0-v142-manual-hosting";
export const JARVIS_ISOLATED_HOSTING_REF = "refs/heads/v94-media-v4n-negative-claims";
export const JARVIS_V142_MANUAL_REF = "refs/heads/v142-official";
export const JARVIS_V142_MANUAL_EVENT = "owner_manual_hosting";

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
    const v142Branch = ref === JARVIS_V142_MANUAL_REF;
    const isManualV142 = v142Branch && eventName === JARVIS_V142_MANUAL_EVENT;
    const manualApprovalSha = clean(input.manualApprovalSha).toLowerCase();
    const siteId = clean(input.siteId);

    if (actor !== "heberzzt-wq") failures.push("SOVEREIGN_ACTOR_MISMATCH");
    if (!isManualV142 && eventName !== "push") failures.push("DEPLOY_EVENT_NOT_PUSH");
    if (!standardBranch && !isolatedHostingBranch && !v142Branch) failures.push("DEPLOY_BRANCH_NOT_ALLOWED");
    if (v142Branch && !isManualV142) failures.push("V142_MANUAL_EVENT_REQUIRED");
    if (isolatedHostingBranch && !hostingOnly) failures.push("ISOLATED_BRANCH_HOSTING_ONLY_REQUIRED");
    if (v142Branch && !hostingOnly) failures.push("V142_HOSTING_ONLY_REQUIRED");
    if (v142Branch && siteId !== "fixgo-44e4d") failures.push("V142_EXACT_HOSTING_SITE_REQUIRED");
    if (v142Branch && (!isHexSha(manualApprovalSha) || manualApprovalSha !== commitSha)) failures.push("V142_EXACT_SHA_APPROVAL_REQUIRED");
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
        hostingOnly,
        ...(v142Branch ? {siteId,manualApprovalSha} : {})
    };
    const fingerprint = createHash("sha256")
        .update(JSON.stringify(envelope))
        .digest("hex");

    return {
        ok: failures.length === 0,
        status: failures.length === 0 ? "SOVEREIGN_DEPLOY_AUTHORIZED" : "SOVEREIGN_DEPLOY_BLOCKED",
        version: JARVIS_DEPLOY_GATE_VERSION,
        authorityId: failures.includes("SOVEREIGN_ACTOR_MISMATCH") ? null : "HEBERTO_MENDOZA",
        controllerId: v142Branch ? "GITHUB_CI_OWNER_MANUAL" : "GITHUB_ACTIONS_CI",
        fingerprint,
        envelope,
        failures,
        deploymentScope: hostingOnly ? "hosting" : "default",
        hostingOnlyRequired: isolatedHostingBranch || v142Branch,
        singleCommit: true,
        testsRequired: true,
        selfAuthorizationAllowed: false
    };
}
