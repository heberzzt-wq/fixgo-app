/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 — COGNITIVE BOOTSTRAP V7
 * Archivo: /gestia-core/cognitive.bootstrap.js
 * ======================================================================================
 * OBJETIVO:
 * Runtime bootstrap central del Cognitive Operating System.
 *
 * RESPONSABILIDADES:
 * ✔ cargar cognition runtime
 * ✔ exponer globals oficiales
 * ✔ validar engines cognitivos
 * ✔ registrar estado runtime
 * ✔ evitar boot duplicado
 * ✔ conectar semantic cognition
 * ✔ conectar reasoning runtime
 *
 * REGLAS:
 * ❌ NO lógica UI
 * ❌ NO lógica Firebase
 * ❌ NO lógica visual
 * ❌ NO side-effects peligrosos
 *
 * SOLO:
 * ✔ runtime cognition
 * ✔ exposure layer
 * ✔ validation layer
 * ✔ kernel bridge
 * ======================================================================================
 */

console.log(
    "🧠 [COGNITIVE_BOOTSTRAP] INIT"
);

/* ======================================================================================
   DUPLICATE BOOT PROTECTION
====================================================================================== */

if (
    window.__COGNITIVE_BOOTSTRAPPED__
) {

    console.warn(
        "⚠️ [COGNITIVE_BOOTSTRAP] ALREADY_RUNNING"
    );

}
else {

    window.__COGNITIVE_BOOTSTRAPPED__ =
        true;

    /* ==================================================================================
       IMPORTS
    ================================================================================== */

    import(
        "./brain.engine.js"
    )

    .then(async(brainModule) => {

        console.log(
            "🧠 [BRAIN_ENGINE] LOADED"
        );

        try {

            /* ==========================================================================
               SOVEREIGN REPO COGNITION
            ========================================================================== */

                await import(
                    "./repo/repo.cognition.index.js"
                );

            console.log(
                "🧠 [REPO_COGNITION_INDEX] LOADED"
            );

            /* ==========================================================================
               SEMANTIC ENGINE
            ========================================================================== */

            const semanticModule =
                await import(
                    "./semantic.engine.js"
                );

            console.log(
                "🧠 [SEMANTIC_ENGINE] LOADED"
            );

            /* ==========================================================================
               INTENT ENGINE
            ========================================================================== */

            const intentModule =
                await import(
                    "./intent.engine.js"
                );

            console.log(
                "🧠 [INTENT_ENGINE] LOADED"
            );

            /* ==========================================================================
               GESTIA CORE
            ========================================================================== */

            const gestiaModule =
                await import(
                    "./gestia-core.js"
                );

            console.log(
                "🧠 [GESTIA_CORE] LOADED"
            );

            /* ==========================================================================
               GLOBAL REGISTRY
            ========================================================================== */

            window.__COGNITIVE_RUNTIME__ = {

                registries: {

                dependencyGraph: true,

                cognitiveGraph: true,

                moduleOwnership: true,

                impactGraph: true,

                engineFailures: true,

             engineRecovery: true
            },

                online: false,

                initializedAt:
                    Date.now(),

                engines: {

                    brain: false,

                    semantic: false,

                    intent: false,

                    core: false
                },

                globals: {

                    GestiaCore: false,

                    reasoning: false,

                    semanticState: false
                },

                health: {

                    status:
                        "BOOTING",

                    failures: [],

                    warnings: []
                }
            };


            /* ==========================================================================
   SOVEREIGN RUNTIME REGISTRIES
========================================================================== */

window.__DEPENDENCY_GRAPH__ ||= {};

window.__COGNITIVE_GRAPH__ ||= {};

window.__MODULE_OWNERSHIP__ ||= {};

window.__FILE_IMPACT_GRAPH__ ||= {};

window.__ENGINE_FAILURES__ ||= {};

window.__ENGINE_RECOVERY__ ||= {};


            /* ==========================================================================
               BRAIN ENGINE EXPOSURE
            ========================================================================== */

            if (

                brainModule

            ) {

                const reasoningFn =

                    brainModule
                        .runCognitiveReasoning ||

                    brainModule
                        .invocarArquitectoIA ||

                    window
                        .runCognitiveReasoning ||

                    null;

                if (

                    reasoningFn

                ) {

                    window
                        .runCognitiveReasoning =
                            reasoningFn;

                    window
                        .__COGNITIVE_RUNTIME__
                        .engines
                        .brain = true;

                    window
                        .__COGNITIVE_RUNTIME__
                        .globals
                        .reasoning = true;

                    console.log(
                        "✅ [REASONING_RUNTIME] ONLINE"
                    );
                }

                else {

                    console.warn(
                        "⚠️ [REASONING_RUNTIME] NOT_FOUND"
                    );

                    window
                        .__COGNITIVE_RUNTIME__
                        .health
                        .warnings
                        .push(
                            "REASONING_RUNTIME_NOT_FOUND"
                        );
                }
            }

            /* ==========================================================================
               SEMANTIC ENGINE EXPOSURE
            ========================================================================== */

            if (

                semanticModule

            ) {

                const semanticStateFn =

                    semanticModule
                        .getSemanticCognitiveState ||

                    window
                        .getSemanticCognitiveState ||

                    null;

                if (

                    semanticStateFn

                ) {

                    window
                        .getSemanticCognitiveState =
                            semanticStateFn;

                    window
                        .__COGNITIVE_RUNTIME__
                        .engines
                        .semantic = true;

                    window
                        .__COGNITIVE_RUNTIME__
                        .globals
                        .semanticState = true;

                    console.log(
                        "✅ [SEMANTIC_RUNTIME] ONLINE"
                    );
                }

                else {

                    console.warn(
                        "⚠️ [SEMANTIC_RUNTIME] NOT_FOUND"
                    );

                    window
                        .__COGNITIVE_RUNTIME__
                        .health
                        .warnings
                        .push(
                            "SEMANTIC_RUNTIME_NOT_FOUND"
                        );
                }
            }

            /* ==========================================================================
               INTENT ENGINE VALIDATION
            ========================================================================== */

            if (

                intentModule

            ) {

                window
                    .__COGNITIVE_RUNTIME__
                    .engines
                    .intent = true;

                console.log(
                    "✅ [INTENT_RUNTIME] ONLINE"
                );
            }

            /* ==========================================================================
               GESTIA CORE EXPOSURE
            ========================================================================== */

            if (

                gestiaModule

            ) {

                const core =

                    gestiaModule
                        .GestiaCore ||

                    gestiaModule
                        .default ||

                    window
                        .GestiaCore ||

                    null;

                if (

                    core

                ) {

                    window.GestiaCore =
                        core;

                    window
                        .__COGNITIVE_RUNTIME__
                        .engines
                        .core = true;

                    window
                        .__COGNITIVE_RUNTIME__
                        .globals
                        .GestiaCore = true;

                    console.log(
                        "✅ [GESTIA_CORE] EXPOSED"
                    );
                }

                else {

                    console.warn(
                        "⚠️ [GESTIA_CORE] NOT_FOUND"
                    );

                    window
                        .__COGNITIVE_RUNTIME__
                        .health
                        .warnings
                        .push(
                            "GESTIA_CORE_NOT_FOUND"
                        );
                }
            }

            /* ==========================================================================
               EVENT BUS VALIDATION
            ========================================================================== */

            if (

                window
                    .__RUNTIME_EVENT_BUS__

            ) {

                console.log(
                    "✅ [EVENT_BUS] ONLINE"
                );
            }

            else {

                console.warn(
                    "⚠️ [EVENT_BUS] NOT_FOUND"
                );

                window
                    .__COGNITIVE_RUNTIME__
                    .health
                    .warnings
                    .push(
                        "EVENT_BUS_NOT_FOUND"
                    );
            }

            /* ==========================================================================
               REPO COGNITION
            ========================================================================== */

            if (

                typeof window
                    .bootstrapRepoCognition ===
                "function"

            ) {

                try {

                    const repoResult =

                        await window
                            .bootstrapRepoCognition();

                    console.log(
                        "🧠 [REPO_COGNITION]",
                        repoResult
                    );

                }

                catch(error) {

                    console.error(
                        "❌ [REPO_COGNITION_FAIL]",
                        error
                    );

                    window
                        .__COGNITIVE_RUNTIME__
                        .health
                        .failures
                        .push({
                            module:
                                "repo_cognition",

                            error:
                                error.message
                        });
                }
            }

            /* ==========================================================================
               RUNTIME HYDRATION
            ========================================================================== */

            if (

                typeof window
                    .bootstrapRuntimeCognition ===
                "function"

            ) {

                try {

                    const hydrationResult =

                        await window
                            .bootstrapRuntimeCognition();

                    console.log(
                        "🧠 [RUNTIME_HYDRATION]",
                        hydrationResult
                    );

                }

                catch(error) {

                    console.error(
                        "❌ [RUNTIME_HYDRATION_FAIL]",
                        error
                    );

                    window
                        .__COGNITIVE_RUNTIME__
                        .health
                        .failures
                        .push({
                            module:
                                "runtime_hydration",

                            error:
                                error.message
                        });
                }
            }

            /* ==========================================================================
               HEALTH VALIDATION
            ========================================================================== */

            const runtimeState =

                window
                    .__COGNITIVE_RUNTIME__;

            const healthy =

                runtimeState
                    .globals
                    .GestiaCore

                &&

                runtimeState
                    .globals
                    .reasoning;

            runtimeState.online =
                healthy;

            runtimeState.health.status =

                healthy
                    ? "ONLINE"
                    : "DEGRADED";

            /* ==========================================================================
               FINAL REPORT
            ========================================================================== */

            console.table({

                GestiaCore:
                    !!window.GestiaCore,

                reasoning:
                    !!window
                        .runCognitiveReasoning,

                semantic:
                    !!window
                        .getSemanticCognitiveState,

                runtime:
                    runtimeState.online,

                status:
                    runtimeState
                        .health
                        .status
            });

            console.log(
                "🚀 [COGNITIVE_BOOTSTRAP] READY"
            );

        }

        catch(error) {

            console.error(
                "❌ [COGNITIVE_BOOTSTRAP_FATAL]",
                error
            );

            window.__COGNITIVE_RUNTIME__ = {

                online: false,

                fatal: true,

                error:
                    error.message,

                crashedAt:
                    Date.now()
            };
        }
    })

    .catch((error) => {

        console.error(
            "❌ [BRAIN_ENGINE_LOAD_FAIL]",
            error
        );

        window.__COGNITIVE_RUNTIME__ = {

            online: false,

            fatal: true,

            module:
                "brain.engine.js",

            error:
                error.message,

            crashedAt:
                Date.now()
        };
    });
}