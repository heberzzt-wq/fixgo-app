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
   SECURITY HUB
===================================================== */

import * as security
from "./hubs/security.hub.js";


import * as repoHub
from "./hubs/repo.hub.js";

/* =====================================================
   AUTHORITY REGISTRY
===================================================== */

import * as authority
from "./authority/authority.registry.js";

/* =====================================================
   GLOBAL SOVEREIGN REGISTRY
===================================================== */

window.GestiaOS ||= {};

/* =====================================================
   REPO AUTHORITY HUB
===================================================== */

window.GestiaOS.repo =
    repoHub;

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
   SECURITY CAPABILITIES
===================================================== */

window.GestiaOS.security =
    security;


    /* =====================================================
   AUTHORITY CAPABILITIES
===================================================== */

window.GestiaOS.authority =
    authority;

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

/* =====================================================
   AUTHORITY MODULE REGISTRATION
===================================================== */

try {

    window.GestiaAuthority
        ?.registerAuthorityModule?.({

        module:
            "analysis.hub",

        scopes: [

            "semantic.read",
            "runtime.read",
            "cognition.analysis"
        ]
    });

    window.GestiaAuthority
        ?.registerAuthorityModule?.({

        module:
            "execution.hub",

        scopes: [

            "runtime.write",
            "operations.execute",
            "patch.simulation"
        ]
    });

    window.GestiaAuthority
        ?.registerAuthorityModule?.({

        module:
            "security.hub",

        scopes: [

            "security.audit",
            "security.validate",
            "history.verify"
        ]
    });

    window.GestiaAuthority
        ?.registerAuthorityModule?.({

        module:
            "repo.hub",

        scopes: [

            "repo.scan",
            "repo.patch",
            "repo.snapshot"
        ]
    });

}

catch(error) {

    console.warn(
        "⚠️ [AUTHORITY_MODULE_BOOT_FAIL]",
        error
    );
}

console.log(
    "🧠 [GESTIA_KERNEL] ONLINE",
    window.GestiaOS
);