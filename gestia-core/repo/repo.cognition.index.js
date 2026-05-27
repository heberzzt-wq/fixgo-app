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

        window.__REPO_INDEX__[
            node.file
        ] = {

            ...node,

            registeredAt:
                Date.now()
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