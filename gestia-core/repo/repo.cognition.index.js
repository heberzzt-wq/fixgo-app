/* =========================================================
   SOVEREIGN REPO COGNITION INDEX V1
========================================================= */

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