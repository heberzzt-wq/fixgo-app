/* =====================================================
   GESTIA EXECUTION HUB V1
   Sovereign Execution Capability Layer
===================================================== */

/* =====================================================
   EXECUTION FABRIC
===================================================== */

export {

    executeSteps,
    ejecutarCambios,
    simularCambios,
    consultarEstadoOperacion

}

from "../operations-executor.engine.js";

/* =====================================================
   SNAPSHOT FABRIC
===================================================== */

export {

    createSnapshot,
    restoreSnapshot

}

from "../jarvis.snapshot.js";

/* =====================================================
   PATCH FABRIC
===================================================== */

export {

    buildPatchDiff

}

from "../jarvis.patchdiff.engine.js";

export {

    buildAutoPatch

}

from "../jarvis.autopatch.engine.js";

export {

    buildAutoFix

}

from "../jarvis.autofix.engine.js";

console.log(
    "🧠 [EXECUTION_HUB] ONLINE"
);