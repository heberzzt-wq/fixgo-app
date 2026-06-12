
/* =====================================================================================
   JARVIS COGNITION ENGINE V1
===================================================================================== */

(function(global) {

    const CognitionEngine = {

        version:
            "V1_SEMANTIC_RUNTIME",

        analyze(input = "") {

            const text =
                String(input)
                    .toLowerCase()
                    .trim();

            const cognition = {

                original:
                    input,

                timestamp:
                    Date.now(),

                intent:
                    "UNKNOWN",

                domain:
                    "general",

                target:
                    null,

                expectedOutput:
                    "generic",

                cognitionLayer:
                    "semantic_runtime",

                confidence:
                    0.5
            };

            /* =====================================================
   REPO SEARCH INTENT
===================================================== */

if (

    text.startsWith("buscar ") ||

    text.startsWith("search ") ||

    text.startsWith("find ")

) {

    cognition.intent =
        "REPO_SEARCH";

    cognition.domain =
        "repository";

    cognition.target =

        text
            .replace(/^buscar\s+/i, "")
            .replace(/^search\s+/i, "")
            .replace(/^find\s+/i, "");

    cognition.expectedOutput =
        "repo_search_results";

    cognition.confidence =
        0.99;

    return cognition;
}

/* =====================================================
   FILE CREATION
===================================================== */

if (

    /\bcrear archivo\b/i.test(text) ||
    /\bgenerar archivo\b/i.test(text) ||
    /\bnuevo archivo\b/i.test(text) ||
    /\bescribir archivo\b/i.test(text)

) {

    cognition.intent =
        "CODE_WRITE";

    cognition.domain =
        "repository";

    cognition.expectedOutput =
        "file_write";

    cognition.cognitionLayer =
        "repo_write";

    cognition.confidence =
        0.98;

    const fileMatch =
        text.match(
            /([a-z0-9\-_]+\.(txt|js|html|css|json))/i
        );

    if (fileMatch) {

        cognition.target =
            fileMatch[1];
    }

    return cognition;
}
/* =====================================================
   REPOSITORY SURGEON INTENTS
===================================================== */

const removeIntent =

    /\belimina\b/i.test(text) ||
    /\bborra\b/i.test(text) ||
    /\bquita\b/i.test(text) ||
    /\bremueve\b/i.test(text) ||
    /\bsuprime\b/i.test(text);

if (removeIntent) {

    cognition.intent =
        "FUNCTION_REMOVE";

    cognition.domain =
        "repository";

    cognition.expectedOutput =
        "repo_patch";

    cognition.cognitionLayer =
        "repo_surgeon";

    cognition.confidence =
        0.95;

    const targetMatch =
        text.match(
            /(?:elimina|borra|quita|remueve|suprime)\s+([a-z0-9_]+)/i
        );

    if (targetMatch) {

        cognition.target =
            targetMatch[1];
    }


    const fileMatch =
    text.match(
        /([a-z0-9\-_]+\.js)/i
    );

if (fileMatch) {

    cognition.targetFile =
        fileMatch[1];

    const found =
        window.findRepoFile?.(
            cognition.targetFile
        );

    if (found) {

        cognition.repoNode =
            found[1];

        cognition.repoAware =
            true;
    }
}
    return cognition;
}

            const wantsRepair =

    /\brepara\b/i.test(text) ||
    /\bcorrige\b/i.test(text) ||
    /\bajusta\b/i.test(text) ||
    /\bmodifica\b/i.test(text) ||

    /\baplica patch\b/i.test(text) ||
    /\bgenera patch\b/i.test(text) ||
    /\bcrear patch\b/i.test(text) ||
    /\baplicar patch\b/i.test(text) ||

    /\bfix\b/i.test(text);
            /* =====================================================
               UI ANALYSIS
            ===================================================== */

            if (

                text.includes(".html") ||

                text.includes("responsive") ||

                text.includes("ui") ||

                text.includes("frontend") ||

                text.includes("layout")

            ) {

                cognition.intent =
    wantsRepair
        ? "REPAIR_UI"
        : "ANALYZE_UI";

                cognition.domain =
                    "frontend";

                cognition.expectedOutput =
                    "human_ui_analysis";

                cognition.cognitionLayer =
                    "ui_audit";

                cognition.confidence =
                    0.92;

                const fileMatch =
    text.match(
        /([a-z0-9\-_]+\.html)/i
    );

if (fileMatch) {

    cognition.target =
        fileMatch[1];

} else {

    const humanFileMatch =
        text.match(
            /([a-z0-9\-_ ]+)\s+html/i
        );

    if (humanFileMatch) {

        cognition.target =
            humanFileMatch[1]
                .trim()
                .replace(/\s+/g, "-") +
            ".html";
    }
}
            }

            /* =====================================================
   BACKEND ANALYSIS
===================================================== */

if (

    text.includes(".js") ||

    text.includes("firebase") ||

    text.includes("runtime")

) {

    cognition.intent =
        "ANALYZE_RUNTIME";

    cognition.domain =
        "backend";

    cognition.expectedOutput =
        "technical_runtime_analysis";

    cognition.cognitionLayer =
        "runtime_audit";

    cognition.confidence =
        0.90;

    /* ==========================================
       JS FILE DETECTION
    ========================================== */

    const fileMatch =
        text.match(
            /([a-z0-9\-_]+\.js)/i
        );

    if (fileMatch) {

        cognition.target =
            fileMatch[1];

        const found =
            window.findRepoFile?.(
                cognition.target
            );

        if (found) {

            cognition.repoNode =
                found[1];

            cognition.repoAware =
                true;

            console.log(
                "🧠 [REPO_NODE_FOUND]",
                cognition.target,
                cognition.repoNode
            );
        }
    }
}
/* =====================================================
   REPO AWARENESS
===================================================== */

if (

    cognition.target &&

    window.__REPO_COGNITION__?.[
        cognition.target
    ]

) {

    cognition.repoNode =

        window.__REPO_COGNITION__[
            cognition.target
        ];

    cognition.repoAware =
        true;

    console.log(
        "🧠 [REPO_NODE_FOUND]",
        cognition.target,
        cognition.repoNode
    );
}

return cognition;
        }
    };

    global.JarvisCognitionEngine =
        CognitionEngine;

})(window);

