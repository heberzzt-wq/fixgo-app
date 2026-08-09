/* =====================================================
   GESTIA COGNITIVE KERNEL V2
   Sovereign Runtime Connector
===================================================== */

const GESTIA_KERNEL_VERSION =
    "2.0.0-cognitive-kernel";

const GESTIA_KERNEL_POLICY = {
    authority:
        "full_repo_private_owner",
    safeZone:
        "advisory",
    contract:
        "kernel_hub_authority_v2"
};

/* =====================================================
   EXECUTION HUB
===================================================== */

import * as execution
from "./hubs/execution.hub.js";

/* =====================================================
   ANALYSIS CONTRACT — delegated to the single Gestia semantic core
===================================================== */

const analysis = Object.freeze({
    describeAnalysisHub() {
        return {
            ok: true,
            status: "SEMANTIC_ANALYSIS_DELEGATED",
            authority: "gestia-core-single-semantic-brain",
            alternateBrain: false
        };
    }
});

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
        "V2",

    contractVersion:
        GESTIA_KERNEL_VERSION,

    policy:
        GESTIA_KERNEL_POLICY,

    status:
        "ONLINE",

    initializedAt:
        Date.now()
};

window.GestiaOS.describeKernel = function() {

    return {
        ok: true,
        kernel:
            "GestiaOS",
        version:
            GESTIA_KERNEL_VERSION,
        policy:
            GESTIA_KERNEL_POLICY,
        hubs: {
            execution:
                execution.describeExecutionHub?.() || null,
            analysis:
                analysis.describeAnalysisHub?.() || null,
            security:
                security.describeSecurityHub?.() || null,
            repo:
                repoHub.describeRepoHub?.() || null,
            authority:
                authority.describeAuthorityRegistry?.() || null
        }
    };
};

/* =====================================================
   AUTHORITY MODULE REGISTRATION
===================================================== */

try {

    window.GestiaAuthority
        ?.registerAuthorityModule?.({

        module:
            "gestia-core.semantic-analysis",

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
