/* =====================================================
   GESTIA EXECUTION HUB V2
   Sovereign Execution Capability Layer
===================================================== */

export const EXECUTION_HUB_VERSION = "2.0.0-execution-contract";

export function describeExecutionHub() {

    return {
        ok: true,
        hub: "execution",
        version:
            EXECUTION_HUB_VERSION,
        capabilities: [
            "operations_executor_v17_bridge",
            "snapshot",
            "patch_diff",
            "autopatch_v2",
            "autofix_v2"
        ]
    };
}

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

from "../jarvis/jarvis.snapshot.js";

/* =====================================================
   PATCH FABRIC
===================================================== */

export {

    buildPatchDiff

}

from "../jarvis/jarvis.patchdiff.engine.js";

export {

    buildAutoPatch

}

from "../jarvis/jarvis.autopatch.engine.js";

export {

    buildAutoFix

}

from "../jarvis/jarvis.autofix.engine.js";

console.log(
    "🧠 [EXECUTION_HUB] ONLINE"
);
