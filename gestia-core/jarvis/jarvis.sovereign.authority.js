const VERSION = "1.0.0-sovereign-authority";
const DEFAULT_AUTHORITY_ID = "HEBERTO_MENDOZA";
const DEFAULT_CONTROLLER_ID = "CODEX_SIA7";

function cleanText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
    return value;
}

export function createAuthorityEnvelope(input = {}) {
    const objectiveId = cleanText(input.objectiveId);
    const instruction = cleanText(input.instruction);

    if (!objectiveId) throw new Error("OBJECTIVE_ID_REQUIRED");
    if (!instruction) throw new Error("INSTRUCTION_REQUIRED");

    const authorityId = cleanText(input.authorityId) || DEFAULT_AUTHORITY_ID;
    const controllerId = cleanText(input.controllerId) || DEFAULT_CONTROLLER_ID;

    return deepFreeze({
        version: VERSION,
        objectiveId,
        authorityId,
        controllerId,
        instruction,
        issuedAt: Number.isFinite(input.issuedAt) ? input.issuedAt : Date.now(),
        approvalChain: [authorityId, controllerId],
        policy: {
            memoryMayAdvise: true,
            memoryMayReplaceInstruction: false,
            patchPreviewMayReplaceInstruction: false,
            subordinateMayChangeObjective: false,
            subordinateMayApproveWrite: false,
            subordinateMayCommit: false,
            subordinateMayPush: false,
            subordinateMayDeploy: false,
            failClosedOnAuthorityMismatch: true
        }
    });
}

export function validateAuthorityTransition(current, candidate = {}) {
    if (!current || typeof current !== "object") {
        return { ok: false, allowed: false, reason: "CURRENT_AUTHORITY_REQUIRED" };
    }

    const candidateObjectiveId = cleanText(candidate.objectiveId);
    const candidateAuthorityId = cleanText(candidate.authorityId);
    const candidateControllerId = cleanText(candidate.controllerId);

    if (candidateObjectiveId && candidateObjectiveId !== current.objectiveId) {
        return { ok: false, allowed: false, reason: "OBJECTIVE_REPLACEMENT_BLOCKED" };
    }

    if (candidateAuthorityId && candidateAuthorityId !== current.authorityId) {
        return { ok: false, allowed: false, reason: "AUTHORITY_REPLACEMENT_BLOCKED" };
    }

    if (candidateControllerId && candidateControllerId !== current.controllerId) {
        return { ok: false, allowed: false, reason: "CONTROLLER_REPLACEMENT_BLOCKED" };
    }

    if (candidate.source === "memory" || candidate.source === "patch_preview") {
        const candidateInstruction = cleanText(candidate.instruction);
        if (candidateInstruction && candidateInstruction !== current.instruction) {
            return {
                ok: false,
                allowed: false,
                reason: "ADVISORY_SOURCE_CANNOT_REPLACE_INSTRUCTION"
            };
        }
    }

    return {
        ok: true,
        allowed: true,
        reason: "AUTHORITY_CHAIN_PRESERVED",
        envelope: current
    };
}

export function authorizeSubordinateAction(envelope, input = {}) {
    const transition = validateAuthorityTransition(envelope, input);
    if (!transition.allowed) return transition;

    const action = cleanText(input.action).toLowerCase();
    const restricted = new Set([
        "approve_write",
        "commit",
        "push",
        "deploy",
        "change_objective"
    ]);

    if (restricted.has(action) && cleanText(input.actorId) !== envelope.controllerId) {
        return {
            ok: false,
            allowed: false,
            reason: "SOVEREIGN_ACTION_REQUIRES_CODEX_SIA7"
        };
    }

    return {
        ok: true,
        allowed: true,
        reason: "SUBORDINATE_ACTION_ALLOWED",
        envelope
    };
}

export function describeSovereignAuthority() {
    return {
        ok: true,
        engine: "jarvis_sovereign_authority",
        version: VERSION,
        authorityId: DEFAULT_AUTHORITY_ID,
        controllerId: DEFAULT_CONTROLLER_ID,
        guarantees: [
            "objective_identity_is_immutable_for_subordinates",
            "memory_is_advisory_only",
            "patch_preview_is_advisory_only",
            "write_commit_push_deploy_require_codex_sia7",
            "authority_mismatch_fails_closed"
        ]
    };
}
