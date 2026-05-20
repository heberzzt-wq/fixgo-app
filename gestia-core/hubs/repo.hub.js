/* =====================================================================================
   GESTIA REPO HUB V1
   Sovereign Repo Federation Layer
===================================================================================== */

export const scanRepo =
    (...args) =>
        window.scanRepo?.(...args);

export const analyzeRepoImpact =
    (...args) =>
        window.analyzeRepoImpact?.(...args);

export const generatePatch =
    (...args) =>
        window.generatePatch?.(...args);

export const applyPatch =
    (...args) =>
        window.applyPatch?.(...args);

export const createRepoSnapshot =
    (...args) =>
        window.createRepoSnapshot?.(...args);

export const loadRepoContext =
    (...args) =>
        window.loadRepoContext?.(...args);

export const findRepoFile =
    (...args) =>
        window.findRepoFile?.(...args);

export const findRepoDependents =
    (...args) =>
        window.findRepoDependents?.(...args);

export const buildRepoCognitionIndex =
    (...args) =>
        window.buildRepoCognitionIndex?.(...args);

export const buildRepoDependencyGraph =
    (...args) =>
        window.buildRepoDependencyGraph?.(...args);

export const bootstrapRepoCognition =
    (...args) =>
        window.bootstrapRepoCognition?.(...args);

export const isSafeEditZone =
    (...args) =>
        window.isSafeEditZone?.(...args);

    export const isSafeRepoPath =
    (...args) =>
        window.isSafeRepoPath?.(...args);

export const canModifyRepoFile =
    (...args) =>
        window.canModifyRepoFile?.(...args);

console.log(
    "🧠 [REPO_HUB] ONLINE"
);