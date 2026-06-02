
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


            const wantsRepair =

    text.includes("repara") ||
    text.includes("corrige") ||
    text.includes("fix") ||
    text.includes("patch") ||
    text.includes("ajusta") ||
    text.includes("modifica");
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

