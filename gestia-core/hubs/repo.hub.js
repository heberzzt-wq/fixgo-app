/* =====================================================================================
   GESTIA REPO HUB V2
   Compatibility facade. Live repository evidence is owned by JarvisLocalBridge/repo.graph.
===================================================================================== */

export const REPO_HUB_VERSION = "2.1.0-fail-closed-live-evidence";

export function describeRepoHub() {
    return {
        ok: true,
        hub: "repo",
        version: REPO_HUB_VERSION,
        authority: "live_repo_bridge",
        staticIndexRole: "metadata_only",
        capabilities: ["scan_repo", "impact_analysis", "patch_generation", "patch_application", "repo_cognition", "dependency_graph"]
    };
}

function invokeGlobal(name, args) {
    const fn = globalThis?.window?.[name];
    if (typeof fn !== "function") {
        return { ok: false, status: "REPO_RUNTIME_CAPABILITY_UNAVAILABLE", error: `${name.toUpperCase()}_UNAVAILABLE`, capability: name };
    }
    const result = fn(...args);
    return result === undefined
        ? { ok: false, status: "REPO_RUNTIME_EMPTY_RESULT", error: `${name.toUpperCase()}_EMPTY_RESULT`, capability: name }
        : result;
}

export const scanRepo = (...args) => invokeGlobal("scanRepo", args);
export const analyzeRepoImpact = (...args) => invokeGlobal("analyzeRepoImpact", args);
export const generatePatch = (...args) => invokeGlobal("generatePatch", args);
export const applyPatch = (...args) => invokeGlobal("applyPatch", args);
export const createRepoSnapshot = (...args) => invokeGlobal("createRepoSnapshot", args);
export const loadRepoContext = (...args) => invokeGlobal("loadRepoContext", args);
export const findRepoFile = (...args) => invokeGlobal("findRepoFile", args);
export const findRepoDependents = (...args) => invokeGlobal("findRepoDependents", args);
export const buildRepoCognitionIndex = (...args) => invokeGlobal("buildRepoCognitionIndex", args);
export const buildRepoDependencyGraph = (...args) => invokeGlobal("buildRepoDependencyGraph", args);
export const bootstrapRepoCognition = (...args) => invokeGlobal("bootstrapRepoCognition", args);
export const isSafeEditZone = (...args) => invokeGlobal("isSafeEditZone", args);
export const isSafeRepoPath = (...args) => invokeGlobal("isSafeRepoPath", args);
export const canModifyRepoFile = (...args) => invokeGlobal("canModifyRepoFile", args);

console.log("🧠 [REPO_HUB] ONLINE", REPO_HUB_VERSION);
