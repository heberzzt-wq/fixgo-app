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

const cognition =

    classifyRepoFile(
        node
    );

window.__REPO_INDEX__[
    node.file
] = {
            ...node,

            registeredAt:
                Date.now()
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