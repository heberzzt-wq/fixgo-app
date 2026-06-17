/* =========================================================
   SOVEREIGN REPO COGNITION INDEX V1
========================================================= */


console.log(
    "🔥 REPO_COGNITION_BUILD_20260605"
);


window.__REPO_INDEX__ ||= {};

/* =========================================================
   REGISTER REPO NODE
========================================================= */

window.registerRepoNode =
function(node = {}) {

    try {

        if (!node.file) {

    throw new Error(
        "FILE_REQUIRED"
    );
}

const cognition = {

    runtimeRole:
        "sandbox_runtime",

    governance:
        node.governance ||

        "SUPERVISED_PATCH",

    mutationMode:
        node.mutationMode ||

        "SUPERVISED",

    criticality:
        node.critical

        ? 90

        : 20,

    hydrated:
        true
};

window.__REPO_INDEX__[
    node.file
] = {
            ...node,

            registeredAt:
                Date.now()
        };

        /* =========================================================
   SOVEREIGN KERNEL REGISTRY MOUNT
========================================================= */

window.GestiaRuntime ||= {};

window.GestiaRuntime.modules ||= {

    registry: {},

    mounted: {},

    lifecycle: {},

    telemetry: {}
};

window.GestiaRuntime
    .modules
    .registry[
        node.file
    ] = {

    ...node,

    cognition,

    registeredAt:
        Date.now(),

    runtimeMounted:
        false,

    lifecycle:
        "REGISTERED"
};

        /* =====================================================
   HYBRID COGNITION HYDRATION
===================================================== */

window.__REPO_COGNITION__ ||= {};

window.__REPO_COGNITION__[
    node.file
] = {

    file:
        node.file,

    module:
        node.module ||

        "unknown",

    cognition
};

/* =========================================================
   KERNEL MODULE REGISTRATION
========================================================= */

window.GestiaRuntime
    ?.registerModule?.(

        node.file,

        {

            type:
                node.type ||

                "runtime_node",

            governance:
                node.governance ||

                "SUPERVISED_PATCH",

            critical:
                node.critical ||

                false,

            cognition
        }
    );
        console.log(
            "🧠 [REPO_NODE_REGISTERED]",
            node.file
        );

        return {

            ok: true,

            file:
                node.file
        };
    }

    catch(error) {

        console.error(
            "❌ [REPO_NODE_REGISTER_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};

/* =========================================================
   GET REPO NODE
========================================================= */

window.getRepoNode =
function(file = "") {

    return (

        window.__REPO_INDEX__?.[
            file
        ] ||

        null
    );
};

/* =========================================================
   LIST REPO NODES
========================================================= */

window.listRepoNodes =
function() {

    return Object.keys(
        window.__REPO_INDEX__ || {}
    );
};

/* =========================================================
   REPO COGNITION READY
========================================================= */

console.log(
    "🧠 [REPO_COGNITION_INDEX] ONLINE"
);

/* =========================================================
   REGISTER SOVEREIGN SERVICE
========================================================= */

window.GestiaRuntime ||= {};

window.GestiaRuntime.services ||= {};

window.GestiaRuntime.services
    .repoCognition = {

    online:
        true,

    registry:
        "__REPO_INDEX__",

    cognition:
        "__REPO_COGNITION__",

    startedAt:
        Date.now()
};

/* =========================================================
   REGISTER COGNITIVE RUNTIME
========================================================= */

window.__COGNITIVE_RUNTIME__ ||= {

    registries: {}
};

window.__COGNITIVE_RUNTIME__
    .registries
    .repoCognition = true;

console.log(
    "🧠 [REPO_COGNITION_SERVICE] REGISTERED"
);


/* =========================================================
   FULL REPO HYDRATION PASS
========================================================= */

window.__FULL_REPO_STRUCTURE__ = [

    /* =====================================================
       GESTIA CORE
    ===================================================== */

    "audit.engine.js",
    "brain.engine.js",
    "cognitive.bootstrap.js",
    "core_auth_tenant_v1.js",
    "core_tenant_resolver_v2.js",
    "data-analyzer.engine.js",
    "firewall.engine.js",
    "gestia-core.js",
    "gestia.runtime.v7.js",
    "history.engine.js",
    "intent.engine.js",
    "intent.engine.v7.js",
    "jarvis-hud.js",
    "jarvis.kernel.js",
    "media.engine.js",
    "operations-executor.engine.js",
    "operations.engine.js",
    "persistence.engine.js",
    "plans.engine.js",
    "propose.engine.js",
    "self-repair.engine.js",
    "semantic.engine.js",

    /* =====================================================
       AUTHORITY / HUBS
    ===================================================== */

    "authority.registry.js",
    "analysis.hub.js",
    "execution.hub.js",
    "repo.hub.js",
    "security.hub.js",

    /* =====================================================
       JARVIS
    ===================================================== */

    "jarvis-nlu-bridge.js",
    "jarvis.autofix.engine.js",
    "jarvis.autopatch.engine.js",
    "jarvis.bridge.js",
    "jarvis.bridge.v4.js",
    "jarvis.business.engine.js",
    "jarvis.company.registry.js",
    "jarvis.conversation.engine.v7.js",
    "jarvis.context.memory.v6.js",
    "jarvis.dsl.js",
    "jarvis.firestore.engine.js",
    "jarvis.language.core.v5.js",
    "jarvis.memory.js",
    "jarvis.normalizer.js",
    "jarvis.orchestrator.js",
    "jarvis.patchdiff.engine.js",
    "jarvis.scanner.engine.js",
    "jarvis.snapshot.js",
    "jarvis.vision.engine.js",

    /* =====================================================
       REPO
    ===================================================== */

    "repo.cognition.index.js",

    /* =====================================================
       ROOT APP FILES
    ===================================================== */

    "admin.html",
    "alert-engine.js",
    "app-bi.js",
    "app-inquilino.html",
    "app-inquilino.js",
    "app-login.js",
    "app-main.js",
    "app-panel.js",
    "app-registro.js",
    "app-tecnico-b2b.js",
    "app-utils.js",

    "firebase.js",
    "fixgo-bridge.js",
    "fixgo-core-backend.js",
    "fixgo-modals.js",

    "gestia-modulo.html",
    "gestia-render.js",
    "gestia-terminal.html",
    "gestia-terminal.js",

    "gps-motor.js",

    "jarvis-fs-bridge.js",

    "modulo-b2b.js",
    "modulo-flotilla.html",
    "modulo-flotilla.js",

    "panel-admin.js",
    "panel-b2b-admin.html",
    "panel-b2b-admin.js",
    "panel-cliente.js",
    "panel-tecnico.js",

    "scheduler_predictivo.js",
    "scheduler_rutinas.js",

    "soporte-whatsapp.js",
    "sw.js",

    "terminal-chofer.html",
    "terminal-chofer.js",

    /* =====================================================
       HTML SURFACES
    ===================================================== */

    "b2b.html",
    "ceo.html",
    "cliente.html",
    "crm.html",
    "estres.html",
    "login.html",
    "manual.html",
    "politicas.html",
    "rastreo.html",
    "registro.html",
    "simulador.html",
    "tecnico-b2b.html",
    "tecnico.html",
    "visor-flota.html",

    /* =====================================================
       STRUCTURAL DIRECTORIES
    ===================================================== */

    "functions/",
    "modules/",
    "tests/",
    "assets/",
    "app/",
    "build/",
    "gradle/",
    "node_modules/"
];


/* =========================================================
   FULL REPO NODE REGISTRATION
========================================================= */

for (
    const file
    of window.__FULL_REPO_STRUCTURE__
) {

    window.registerRepoNode({

        file,

        module:
            "full_repo",

        type:
            "repo_runtime_node",

        governance:
            "SUPERVISED_PATCH",

        mutationMode:
            "SUPERVISED",

        critical:
            false
    });
}


/* =========================================================
   FULL REPO HYDRATION COMPLETE
========================================================= */

console.log(
    "🧠 [FULL_REPO_HYDRATED]",
    {

        total:
            window
                .__FULL_REPO_STRUCTURE__
                .length,

        registered:

            Object.keys(
                window
                    .__REPO_INDEX__ || {}
            ).length
    }
);

