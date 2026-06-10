/* =====================================================================================
   REPAIR TRANSLATOR ENGINE V1
   SIA7 Cognitive Repo Surgeon
===================================================================================== */

console.log(
    "🧠 [REPAIR_TRANSLATOR] ONLINE"
);

window.buildRepairPatch =
async function(
    repairContext = {}
) {

    try {

        console.log(
            "🧠 [REPAIR_TRANSLATOR_START]",
            repairContext
        );

        const {

            targetFile,

            userIntent,

            source

        } = repairContext;

        if (!targetFile) {

            throw new Error(
                "TARGET_FILE_REQUIRED"
            );
        }

        let currentSource =
            source;

        if (!currentSource) {

            const loaded =

                await window
                    .loadRepoContext(
                        targetFile
                    );

            if (!loaded?.ok) {

                throw new Error(
                    loaded?.error ||
                    "SOURCE_LOAD_FAIL"
                );
            }

            currentSource =
                loaded.source;
        }

        const intent =

            String(
                userIntent || ""
            ).toLowerCase();

        let strategy =
            "UNKNOWN";

        let search =
            null;

        let replace =
            null;

        let confidence =
            0.5;

        /* ============================================
           FUNCTION APPEND
        ============================================ */

        const functionMatch =

            intent.match(
                /agrega\s+([a-zA-Z0-9_]+)/i
            );

        if (functionMatch) {

            const functionName =

                functionMatch[1];

            strategy =
                "FUNCTION_APPEND";

            confidence =
                0.95;

            search =
                "export default";

            replace =
`export function ${functionName}() {

    return {
        ok: true,
        timestamp: Date.now()
    };
}

export default`;

            console.log(
                "🧠 [PATCH_STRATEGY]",
                strategy,
                functionName
            );
        }

        /* ============================================
           EXPORT APPEND
        ============================================ */

        if (

            !search &&

            currentSource.includes(
                "window."
            )

        ) {

            strategy =
                "WINDOW_FUNCTION_APPEND";

            confidence =
                0.75;

            search =
                "\n};";

            replace =
`\n};

window.runtimeDiagnostic =
function() {

    return {

        healthy: true,

        timestamp:
            Date.now()
    };
};`;
        }

        if (!search) {

            return {

                ok: false,

                reason:
                    "NO_REPAIR_STRATEGY",

                file:
                    targetFile,

                intent:
                    userIntent
            };
        }

        const patch = {

            ok: true,

            file:
                targetFile,

            strategy,

            confidence,

            search,

            replace,

            sourceLength:
                currentSource.length
        };

        console.log(
            "🧠 [PATCH_READY]",
            patch
        );

        return patch;

    }

    catch(error) {

        console.error(
            "🚨 [REPAIR_TRANSLATOR_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};

console.log(
    "🧠 [REPAIR_TRANSLATOR_READY]"
);