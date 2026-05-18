/* =====================================================================================
   GESTIA REPO HUB V1
   Sovereign Repo Federation Layer
===================================================================================== */

/* =====================================================================================
   REPO COGNITION
===================================================================================== */

export {

    bootstrapRepoCognition,
    buildRepoCognitionIndex,
    buildRepoDependencyGraph,
    scanRepo,
    analyzeRepoImpact,
    findRepoFile,
    findRepoDependents,
    loadRepoContext

}

from "../gestia-terminal.js";

/* =====================================================================================
   PATCH GOVERNANCE
===================================================================================== */

export {

    generatePatch,
    applyPatch,
    createRepoSnapshot

}

from "../gestia-terminal.js";

/* =====================================================================================
   SAFE GOVERNANCE
===================================================================================== */

export {

    isSafeEditZone,
    canModifyRepoFile

}

from "../gestia-terminal.js";

console.log(
    "🧠 [REPO_HUB] ONLINE"
);