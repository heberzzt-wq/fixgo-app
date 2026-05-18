/* =====================================================
   GESTIA COGNITIVE KERNEL V1
   Sovereign Runtime Connector
===================================================== */

/* =====================================================
   EXECUTION HUB
===================================================== */

import * as execution
from "./hubs/execution.hub.js";

/* =====================================================
   ANALYSIS HUB
===================================================== */

import * as analysis
from "./hubs/analysis.hub.js";

/* =====================================================
   GLOBAL SOVEREIGN REGISTRY
===================================================== */

window.GestiaOS ||= {};

/* =====================================================
   EXECUTION CAPABILITIES
===================================================== */

window.GestiaOS.execution =
    execution;

    /* =====================================================
   ANALYSIS CAPABILITIES
===================================================== */

window.GestiaOS.analysis =
    analysis;

/* =====================================================
   RUNTIME MIRROR
===================================================== */

window.GestiaOS.runtime =
    window.GestiaRuntime || {};

/* =====================================================
   MEMORY MIRROR
===================================================== */

window.GestiaOS.memory =
    window.JarvisMemory || {};

/* =====================================================
   JARVIS MIRROR
===================================================== */

window.GestiaOS.jarvis =
    window.Jarvis || {};

/* =====================================================
   KERNEL STATUS
===================================================== */

window.GestiaOS.kernel = {

    version:
        "V1",

    status:
        "ONLINE",

    initializedAt:
        Date.now()
};

console.log(
    "🧠 [GESTIA_KERNEL] ONLINE",
    window.GestiaOS
);