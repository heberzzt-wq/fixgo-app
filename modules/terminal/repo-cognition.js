/* =====================================================
   REPO REGISTRY V2
===================================================== */

const REPO_COGNITION_VERSION =
    "2.0.0-full-repo-cognition";

const REPO_COGNITION_POLICY = {
    authority:
        "full_repo_private_owner",
    safeZone:
        "advisory",
    criticalRiskAction:
        "REVIEW_REQUIRED",
    highRiskAction:
        "SUPERVISED_EXECUTION"
};

window.__REPO_INDEX__ ||= {};

window.describeRepoCognitionV2 = function() {

    return {
        ok: true,
        engine:
            "repo_cognition",
        version:
            REPO_COGNITION_VERSION,
        policy:
            REPO_COGNITION_POLICY,
        repoNodes:
            Object.keys(
                window.__REPO_INDEX__ || {}
            ).length,
        cognitionNodes:
            Object.keys(
                window.__REPO_COGNITION__ || {}
            ).length,
        graphNodes:
            Object.keys(
                window.__REPO_DEP_GRAPH__ || {}
            ).length
    };
};

window.RepoCognitionV2 = {
    version:
        REPO_COGNITION_VERSION,
    policy:
        REPO_COGNITION_POLICY,
    describe:
        window.describeRepoCognitionV2
};


/* =====================================================
   REGISTER REPO NODE
===================================================== */

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

            cognition,

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
/* =====================================================================================
   REPO COGNITION ENGINE V2
===================================================================================== */

window.__REPO_COGNITION__ ||= {};

/* =====================================================
   ENGINE CLASSIFIER
===================================================== */

window.classifyRepoFile = function(
    meta = {}
) {

    try {

        const type =
            meta?.type || "";

        const module =
            meta?.module || "";

        let cognition = {

            version:
                REPO_COGNITION_VERSION,

            policy:
                REPO_COGNITION_POLICY,

            engineType:
                "generic",

            runtimeRole:
                "support",

            governance:
                "NORMAL",

            riskLevel:
                "LOW",

            criticality:
                10
        };

        /* =================================================
           TERMINAL / CORE
        ================================================= */

        if (
            type.includes(
                "runtime"
            )
        ) {

            cognition.engineType =
                "runtime_engine";

            cognition.runtimeRole =
                "live_runtime";

            cognition.criticality =
                85;

            cognition.governance =
                "HIGH";
        }

        /* =================================================
           TRANSACTIONAL
        ================================================= */

        if (
            type.includes(
                "transactional"
            )
        ) {

            cognition.engineType =
                "transaction_engine";

            cognition.runtimeRole =
                "financial_execution";

            cognition.riskLevel =
                "HIGH";

            cognition.criticality =
                95;

            cognition.governance =
                "CRITICAL";
        }

        /* =================================================
           APPROVAL
        ================================================= */

        if (
            type.includes(
                "approval"
            )
        ) {

            cognition.engineType =
                "approval_engine";

            cognition.runtimeRole =
                "governance_control";

            cognition.riskLevel =
                "HIGH";

            cognition.criticality =
                90;

            cognition.governance =
                "CRITICAL";
        }

        /* =================================================
           UI
        ================================================= */

        if (
            type.includes(
                "mobile_ui"
            )
        ) {

            cognition.engineType =
                "ui_runtime";

            cognition.runtimeRole =
                "frontend_runtime";

            cognition.criticality =
                40;
        }

        /* =================================================
           JARVIS
        ================================================= */

        if (
            module.includes(
                "jarvis"
            )
        ) {

            cognition.engineType =
                "cognitive_engine";

            cognition.runtimeRole =
                "cognition_runtime";

            cognition.riskLevel =
                "HIGH";

            cognition.criticality =
                92;

            cognition.governance =
                "CRITICAL";
        }

        return cognition;

    }

    catch(error) {

        console.warn(
            "⚠️ REPO_CLASSIFIER_FAIL:",
            error
        );

        return {

            engineType:
                "unknown",

            runtimeRole:
                "unknown",

            governance:
                "UNKNOWN",

            riskLevel:
                "UNKNOWN",

            criticality:
                0
        };
    }
};

/* =====================================================
   BUILD REPO COGNITION INDEX
===================================================== */

window.buildRepoCognitionIndex =
function() {

    try {

        console.log(
            "🧠 [REPO_COGNITION_BUILD]"
        );

        window.__REPO_COGNITION__ = {};

        const entries =

            Object.entries(
                window.__REPO_INDEX__ || {}
            );

        for (
            const [
                file,
                meta
            ] of entries
        ) {

            const cognition =

                classifyRepoFile(
                    meta
                );

            window
                .__REPO_COGNITION__[
                    file
                ] = {

                file,

                path:
                    meta.path ||

                    file,

                module:
                    meta.module ||

                    "unknown",

                type:
                    meta.type ||

                    "generic",

                critical:
                    meta.critical === true,

                cognition
            };
        }

        /* =================================================
   SOVEREIGN HUB COGNITION HYDRATION
================================================= */

window.__MODULE_OWNERSHIP__ ||= {};

const sovereignHubs =

    Object.keys(
        window.__MODULE_OWNERSHIP__
    ).filter(

        moduleName =>

            moduleName.includes(
                ".hub"
            )
    );

for (
    const hubName
    of sovereignHubs
) {

    if (
        !window
            .__REPO_COGNITION__?.[
                hubName
            ]
    ) {

        window
            .__REPO_COGNITION__[
                hubName
            ] = {

            file:
                hubName,

            path:
                hubName,

            module:
                hubName,

            type:
                "sovereign_runtime_hub",

            critical:
                true,

            cognition: {

                engineType:
                    "sovereign_hub",

                runtimeRole:
                    "runtime_orchestration",

                governance:
                    "CRITICAL",

                riskLevel:
                    "HIGH",

                criticality:
                    100
            }
        };

        console.log(
            "🧠 [SOVEREIGN_COGNITION_HYDRATED]",
            hubName
        );
    }
}
        console.log(
            "✅ [REPO_COGNITION_READY]",
            Object.keys(
                window
                    .__REPO_COGNITION__
            ).length
        );

        return {

            ok: true,

            version:
                REPO_COGNITION_VERSION,

            total:
                Object.keys(
                    window
                        .__REPO_COGNITION__
                ).length,

            cognition:
                window
                    .__REPO_COGNITION__
        };

    }

    catch(error) {

        console.error(
            "❌ [REPO_COGNITION_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};


/* =====================================================================================
   REPO DEPENDENCY GRAPH V2
===================================================================================== */

window.__REPO_DEP_GRAPH__ ||= {};

/* =====================================================
   EXTRACT IMPORTS
===================================================== */

window.extractImportsFromSource =
function(source = "") {

    try {

        const imports = [];

        const regex =

            /import\s+[\s\S]*?\s+from\s+['"](.*?)['"]/g;

        let match;

        while (
            (match = regex.exec(source))
            !== null
        ) {

            imports.push(
                match[1]
            );
        }

        return imports;

    }

    catch(error) {

        console.warn(
            "⚠️ IMPORT_EXTRACT_FAIL:",
            error
        );

        return [];
    }
};

/* =====================================================
   BUILD DEPENDENCY GRAPH
===================================================== */

window.buildRepoDependencyGraph =
async function() {

    try {

        console.log(
            "🧠 [DEPENDENCY_GRAPH_BUILD]"
        );

        window.__REPO_DEP_GRAPH__ = {};

        const entries =

            Object.entries(
                window.__REPO_INDEX__ || {}
            );

        for (
            const [
                file,
                meta
            ] of entries
        ) {

            try {

                console.log(
    "🧪 LOAD_REPO_CONTEXT_TYPE",
    file,
    typeof window.loadRepoContext
);
                const loaded =

                    await window
                        .loadRepoContext(
                            file
                        );

                if (
                    !loaded?.ok
                ) {

                    console.warn(
                        "⚠️ SOURCE_NOT_LOADED:",
                        file
                    );

                    continue;
                }

                const source =
                    loaded.source || "";

                const imports =

                    extractImportsFromSource(
                        source
                    );

                window
                    .__REPO_DEP_GRAPH__[
                        file
                    ] = {

                    file,

                    path:
                        meta.path ||

                        file,

                    module:
                        meta.module ||

                        "unknown",

                    dependencies:
                        imports,

                    totalDependencies:
                        imports.length
                };

                console.log(
                    `🔗 [GRAPH_NODE]: ${file}`,
                    imports.length
                );

                window.__MODULE_OWNERSHIP__ ||= {};

                window.__MODULE_OWNERSHIP__[
                    file
                ] = {

                    owner:
                        meta.module ||

                        "unknown",

                    governance:
                        meta.governance ||

                        "NORMAL",

                    runtimeRole:
                        meta.runtimeRole ||

                        "support",

                    engineType:
                        meta.engineType ||

                        "generic",

                    dependencies:
                        imports,

                    registeredAt:
                        Date.now()
                };

            }

            catch(innerError) {

                console.warn(
                    "⚠️ GRAPH_NODE_FAIL:",
                    file,
                    innerError
                );
            }
        }


        const authorityModules =

    Object.keys(
        window
            .__MODULE_OWNERSHIP__ || {}
    );

for (
    const moduleName
    of authorityModules
) {

    if (
        !window
            .__REPO_DEP_GRAPH__?.[
                moduleName
            ]
    ) {

        window
            .__REPO_DEP_GRAPH__[
                moduleName
            ] = {

            file:
                moduleName,

            path:
                moduleName,

            module:
                moduleName,

            dependencies:

    moduleName ===
    "execution.hub"

    ? [

        "operations.engine.js",

        "operations-executor.engine.js",

        "plans.engine.js",

        "persistence.engine.js",

        "gestia-core.js"

      ]

    : [],

totalDependencies:

    moduleName ===
    "execution.hub"

    ? 5

    : 0,

            sovereign:
                true,

            topologySource:
                "authority_registry"
        };

        console.log(
            "🧠 [AUTHORITY_GRAPH_HYDRATED]",
            moduleName
        );

        // =====================================================
// 🧠 RUNTIME HEALTH REGISTRY HYDRATION
// =====================================================

window.__RUNTIME_HEALTH_MAP__ ||= {};


window.__RUNTIME_HEALTH_MAP__[
    moduleName
] = {

    ...(
        window
            .__RUNTIME_HEALTH_MAP__[
                moduleName
            ] || {}
    ),

    id:

        moduleName,

    sovereign:
        true,

    hydrated:
        true,

    topologyIntegrated:
        true,

    registryIntegrated:
        true,

    runtimeConnected:
        true,

    healingEnabled:
        true,

    federationEnabled:
        true,

    convergenceEnabled:
        true,

    nodeType:
        "authority-runtime-node",

    state:
        "ONLINE",

    health:
        100,

    stabilityScore:
        100,

    convergenceScore:
        100,

    lastHydration:
        Date.now(),

    dependencies:

        window
            .__REPO_DEP_GRAPH__?.[
                moduleName
            ]?.dependencies || []
};

window.RUNTIME_HEALTH_MAP =

    window.__RUNTIME_HEALTH_MAP__;

console.log(
    "🧠 [RUNTIME_NODE_HYDRATED]",
    moduleName
);

/* =============================================
   SOVEREIGN ORCHESTRATOR CONVERGENCE
============================================= */

try {

    if (
        window.GestiaRuntime
        ?.modules
        ?.registry
    ) {

        window.GestiaRuntime
            .modules
            .registry[
                moduleName
            ] = {

            id:
                moduleName,

            sovereign:
                true,

            mounted:
                true,

            hydrated:
                true,

            topologyIntegrated:
                true,

            dependencies:

                window
                    .__REPO_DEP_GRAPH__?.[
                        moduleName
                    ]?.dependencies || [],

            cognition:

                window
                    .__REPO_COGNITION__?.[
                        moduleName
                    ] || {},

            ownership:

                window
                    .__MODULE_OWNERSHIP__?.[
                        moduleName
                    ] || {},

            mountedAt:
                Date.now()
        };

        console.log(
            "🧠 [ORCHESTRATOR_CONVERGED]",
            moduleName
        );
    }

}

catch(convergenceError) {

    console.warn(
        "⚠️ [ORCHESTRATOR_CONVERGENCE_FAIL]",
        moduleName,
        convergenceError
    );
}


    }
}

/* =============================================
   FULL GRAPH ORCHESTRATOR CONVERGENCE
============================================= */

try {

    const graphNodes =

        Object.keys(
            window.__REPO_DEP_GRAPH__ || {}
        );

    for (
        const nodeName
        of graphNodes
    ) {

        if (
            !window.GestiaRuntime
                ?.modules
                ?.registry?.[
                    nodeName
                ]
        ) {

            window.GestiaRuntime
                .modules
                .registry[
                    nodeName
                ] = {

                id:
                    nodeName,

                sovereign:
                    true,

                mounted:
                    true,

                hydrated:
                    true,

                topologyIntegrated:
                    true,

                dependencies:

                    window
                        .__REPO_DEP_GRAPH__?.[
                            nodeName
                        ]?.dependencies || [],

                cognition:

                    window
                        .__REPO_COGNITION__?.[
                            nodeName
                        ] || {},

                ownership:

                    window
                        .__MODULE_OWNERSHIP__?.[
                            nodeName
                        ] || {},

                mountedAt:
                    Date.now(),

                convergenceSource:
                    "dependency_graph"
            };

            console.log(
                "🧠 [FULL_GRAPH_CONVERGED]",
                nodeName
            );
        }
    }

}

catch(fullGraphError) {

    console.warn(
        "⚠️ [FULL_GRAPH_CONVERGENCE_FAIL]",
        fullGraphError
    );
}

        console.log(
            "✅ [DEPENDENCY_GRAPH_READY]",
            Object.keys(
                window
                    .__REPO_DEP_GRAPH__
            ).length
        );

        return {

            ok: true,

            version:
                REPO_COGNITION_VERSION,

            total:
                Object.keys(
                    window
                        .__REPO_DEP_GRAPH__
                ).length,

            graph:
                window
                    .__REPO_DEP_GRAPH__
        };

    }

    catch(error) {

        console.error(
            "❌ [DEPENDENCY_GRAPH_FATAL]",
            error
        );
    }
};



/* =====================================================================================
   REPO IMPACT ANALYZER V2
===================================================================================== */

/* =====================================================
   FIND REVERSE DEPENDENCIES
===================================================== */

window.findRepoDependents =
function(targetFile = "") {

    try {

        const graph =
            window.__REPO_DEP_GRAPH__ || {};

        const impacted = [];

        for (
            const [
                file,
                node
            ] of Object.entries(graph)
        ) {

            const deps =
                node.dependencies || [];

            const dependsOnTarget =

                deps.some(dep =>

                    dep.includes(
                        targetFile
                    )
                );

            if (
                dependsOnTarget
            ) {

                impacted.push({

                    file,

                    module:
                        node.module,

                    totalDependencies:
                        node.totalDependencies
                });
            }
        }

        return impacted;

    }

    catch(error) {

        console.warn(
            "⚠️ REVERSE_DEP_FAIL:",
            error
        );

        return [];
    }
};

/* =====================================================
   ANALYZE REPO IMPACT
===================================================== */

window.rehydrateRepoCognitionIndex =
function() {
    try {
        window.__REPO_INDEX__ ||= {};
        window.__REPO_COGNITION__ ||= {};
        window.__REPO_DEP_GRAPH__ ||= {};

        const structure =
            window.__FULL_REPO_STRUCTURE__ || [];

        for (
            const file
            of structure
        ) {
            if (
                !file ||
                file.endsWith("/")
            ) {
                continue;
            }

            if (
                !window.__REPO_INDEX__[
                    file
                ]
            ) {
                window.__REPO_INDEX__[
                    file
                ] = {
                    file,
                    path:
                        file,
                    module:
                        file.includes("jarvis")
                            ? "jarvis"
                            : file.includes("terminal")
                                ? "terminal"
                                : file.includes("repo")
                                    ? "repo"
                                    : "full_repo",
                    type:
                        file.includes("terminal")
                            ? "operator_interface"
                            : file.includes("runtime")
                                ? "runtime"
                                : "repo_runtime_node",
                    governance:
                        "SUPERVISED_PATCH",
                    mutationMode:
                        "SUPERVISED",
                    critical:
                        file === "gestia-terminal.html" ||
                        file === "gestia-terminal.js" ||
                        file.includes("gestia-core") ||
                        file.includes("jarvis"),
                    registeredAt:
                        Date.now(),
                    hydrationSource:
                        "repo_cognition_rehydrate_v1"
                };
            }
        }

        if (
            typeof window.buildRepoCognitionIndex === "function"
        ) {
            window.buildRepoCognitionIndex();
        }

        for (
            const [
                file,
                meta
            ]
            of Object.entries(
                window.__REPO_INDEX__ || {}
            )
        ) {
            if (
                !window.__REPO_COGNITION__[
                    file
                ]
            ) {
                const cognition =
                    typeof window.classifyRepoFile === "function"
                        ? window.classifyRepoFile(meta)
                        : {
                            engineType:
                                "generic",
                            runtimeRole:
                                "support",
                            governance:
                                meta.governance || "NORMAL",
                            riskLevel:
                                meta.critical ? "HIGH" : "LOW",
                            criticality:
                                meta.critical ? 90 : 20
                        };

                window.__REPO_COGNITION__[
                    file
                ] = {
                    file,
                    path:
                        meta.path || file,
                    module:
                        meta.module || "unknown",
                    type:
                        meta.type || "generic",
                    critical:
                        meta.critical === true,
                    cognition
                };
            }

            if (
                !window.__REPO_DEP_GRAPH__[
                    file
                ]
            ) {
                window.__REPO_DEP_GRAPH__[
                    file
                ] = {
                    file,
                    path:
                        meta.path || file,
                    module:
                        meta.module || "unknown",
                    dependencies:
                        [],
                    totalDependencies:
                        0,
                    hydrationSource:
                        "repo_cognition_rehydrate_v1"
                };
            }
        }

        console.log(
            "🧠 [REPO_COGNITION_REHYDRATED]",
            {
                index:
                    Object.keys(
                        window.__REPO_INDEX__ || {}
                    ).length,
                cognition:
                    Object.keys(
                        window.__REPO_COGNITION__ || {}
                    ).length,
                graph:
                    Object.keys(
                        window.__REPO_DEP_GRAPH__ || {}
                    ).length
            }
        );

        return {
            ok: true,
            index:
                Object.keys(
                    window.__REPO_INDEX__ || {}
                ).length,
            cognition:
                Object.keys(
                    window.__REPO_COGNITION__ || {}
                ).length,
            graph:
                Object.keys(
                    window.__REPO_DEP_GRAPH__ || {}
                ).length
        };
    }
    catch(error) {
        console.warn(
            "⚠️ [REPO_COGNITION_REHYDRATE_FAIL]",
            error
        );

        return {
            ok: false,
            error:
                error?.message || String(error)
        };
    }
};

window.analyzeRepoImpact =
function(config = {}) {

    try {

        const fileName =

            typeof config === "string"

            ? config

            : config.file || "";

        console.log(
            "🧠 [REPO_IMPACT_ANALYSIS]",
            fileName
        );

                if (
            typeof window.rehydrateRepoCognitionIndex === "function"
        ) {
            window.rehydrateRepoCognitionIndex();
        }
        
        const cognitionIndex =
            window.__REPO_COGNITION__ || {};

        const graphIndex =
            window.__REPO_DEP_GRAPH__ || {};

        console.log(
            "🧠 [COGNITION_KEYS]",
            Object.keys(cognitionIndex)
        );

        console.log(
            "🧠 [GRAPH_KEYS]",
            Object.keys(graphIndex)
        );

        const normalizedFile =

            Object.keys(cognitionIndex)
                .find(key => {

                    return (

                        key === fileName ||

                        key.includes(fileName) ||

                        fileName.includes(key)
                    );
                });

        console.log(
            "🧠 [NORMALIZED_FILE]",
            normalizedFile
        );

        if (!normalizedFile) {

            return {

                ok: false,

                error:
                    "FILE_NOT_FOUND_IN_COGNITION",

                available:
                    Object.keys(
                        cognitionIndex
                    )
            };
        }

        const cognition =

            cognitionIndex[
                normalizedFile
            ];

        const graph =

            graphIndex[
                normalizedFile
            ];

        if (!cognition) {

            return {

                ok: false,

                error:
                    "COGNITION_NODE_MISSING"
            };
        }

        if (!graph) {

            return {

                ok: false,

                error:
                    "GRAPH_NODE_MISSING"
            };
        }

        const dependents =

            findRepoDependents(
                normalizedFile
            );

        /* =================================================
           RISK CALCULATION
        ================================================= */

        let propagatedRisk =
            "LOW";

        if (
            cognition
                ?.cognition
                ?.criticality >= 90
        ) {

            propagatedRisk =
                "CRITICAL";
        }

        else if (
            cognition
                ?.cognition
                ?.criticality >= 70
        ) {

            propagatedRisk =
                "HIGH";
        }

        else if (
            cognition
                ?.cognition
                ?.criticality >= 40
        ) {

            propagatedRisk =
                "MEDIUM";
        }

        /* =================================================
           GOVERNANCE ACTION
        ================================================= */

        let governanceAction =
            "ALLOW";

        if (
            propagatedRisk ===
            "CRITICAL"
        ) {

            governanceAction =
                "REVIEW_REQUIRED";
        }

        else if (
            propagatedRisk ===
            "HIGH"
        ) {

            governanceAction =
                "SUPERVISED_EXECUTION";
        }

        else if (
            propagatedRisk ===
            "MEDIUM"
        ) {

            governanceAction =
                "SUPERVISED_EXECUTION";
        }

        const analysis = {

            version:
                REPO_COGNITION_VERSION,

            policy:
                REPO_COGNITION_POLICY,

            file:
                normalizedFile,

            module:
                cognition.module,

            engineType:
                cognition
                    ?.cognition
                    ?.engineType,

            runtimeRole:
                cognition
                    ?.cognition
                    ?.runtimeRole,

            governance:
                cognition
                    ?.cognition
                    ?.governance,

            criticality:
                cognition
                    ?.cognition
                    ?.criticality,

            dependencies:
                graph.dependencies || [],

            totalDependencies:
                graph.totalDependencies || 0,

            impactedFiles:
                dependents,

            totalImpacted:
                dependents.length,

            propagatedRisk,

            governanceAction
        };

        console.log(
            "🚨 [IMPACT_ANALYSIS_READY]",
            analysis
        );

        return {

            ok: true,

            analysis
        };

    }

    catch(error) {

        console.error(
            "❌ [REPO_IMPACT_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};

/* =====================================================================================
   RUNTIME CRITICALITY PROPAGATION ENGINE V2
===================================================================================== */

/* =====================================================
   CALCULATE PROPAGATED CRITICALITY
===================================================== */

window.calculatePropagatedCriticality =
function(fileName = "") {

    try {

        console.log(
            "🧠 [CRITICALITY_PROPAGATION]",
            fileName
        );

        const analysis =

            analyzeRepoImpact(
                fileName
            );

        if (
            !analysis?.ok
        ) {

            return {

                ok: false,

                error:
                    "ANALYSIS_FAILED"
            };
        }

        const data =
            analysis.analysis;

        let propagatedScore = 0;

        /* =================================================
           BASE CRITICALITY
        ================================================= */

        propagatedScore +=
            data.criticality || 0;

        /* =================================================
           DEPENDENCY WEIGHT
        ================================================= */

        propagatedScore +=
            (
                data.totalDependencies || 0
            ) * 5;

        /* =================================================
           IMPACT WEIGHT
        ================================================= */

        propagatedScore +=
            (
                data.totalImpacted || 0
            ) * 10;

        /* =================================================
           GOVERNANCE WEIGHT
        ================================================= */

        if (
            data.governance ===
            "HIGH"
        ) {

            propagatedScore += 25;
        }

        /* =================================================
           NORMALIZE
        ================================================= */

        propagatedScore =
            Math.min(
                propagatedScore,
                100
            );

        const classification =

            propagatedScore >= 80

                ? "CRITICAL"

                : propagatedScore >= 50

                    ? "HIGH"

                    : propagatedScore >= 25

                        ? "MEDIUM"

                        : "LOW";

        const result = {

            ok: true,

            version:
                REPO_COGNITION_VERSION,

            file:
                data.file,

            module:
                data.module,

            propagatedScore,

            classification,

            dependencies:
                data.totalDependencies,

            impactedFiles:
                data.totalImpacted,

            governance:
                data.governance
        };

        console.log(
            "🚨 [CRITICALITY_RESULT]",
            result
        );

        return result;

    }

    catch(error) {

        console.error(
            "❌ [CRITICALITY_FAIL]",
            error
        );

        return {

            ok: false,

            error:
                error.message
        };
    }
};
/* =====================================================
   COGNITIVE LAYER MAP BRIDGE V1
   Safe alias for runtime boot compatibility.
   Does not mutate governance.
===================================================== */

window.buildCognitiveLayerMap ||= function(options = {}) {
    try {
        window.__COGNITIVE_LAYER_MAP__ ||= {};

        let source =
            "none";

        let hydrationResult =
            null;

        if (
            typeof window.rehydrateRepoCognitionIndex === "function"
        ) {
            hydrationResult =
                window.rehydrateRepoCognitionIndex();

            source =
                "rehydrateRepoCognitionIndex";
        }

        if (
            !hydrationResult?.ok &&
            typeof window.buildRepoCognitionIndex === "function"
        ) {
            hydrationResult =
                window.buildRepoCognitionIndex();

            source =
                "buildRepoCognitionIndex";
        }

        const cognitionIndex =
            window.__REPO_COGNITION__ || {};

        const dependencyGraph =
            window.__REPO_DEP_GRAPH__ || {};

        const layerMap = {};

        for (
            const [
                file,
                node
            ] of Object.entries(cognitionIndex)
        ) {
            const cognition =
                node?.cognition || {};

            const layer =
                cognition.engineType ||
                cognition.runtimeRole ||
                node.type ||
                "generic";

            layerMap[layer] ||= {
                layer,
                files: [],
                modules: {},
                total: 0,
                critical: 0,
                dependencies: 0,
                createdAt: Date.now()
            };

            layerMap[layer]
                .files
                .push(file);

            layerMap[layer]
                .modules[
                    node.module || "unknown"
                ] = true;

            layerMap[layer].total++;

            if (
                node.critical === true ||
                cognition.governance === "CRITICAL"
            ) {
                layerMap[layer].critical++;
            }

            layerMap[layer].dependencies +=
                dependencyGraph?.[file]?.totalDependencies || 0;
        }

        for (
            const layerNode
            of Object.values(layerMap)
        ) {
            layerNode.modules =
                Object.keys(
                    layerNode.modules || {}
                );
        }

        window.__COGNITIVE_LAYER_MAP__ =
            layerMap;

        if (
            window.MODULE_CONTEXT
        ) {
            window.MODULE_CONTEXT.cognitiveLayerMap =
                layerMap;

            window.MODULE_CONTEXT.dependencyGraph ||=
                dependencyGraph;
        }

        const result = {
            ok: true,
            source,
            layers:
                Object.keys(layerMap).length,
            nodes:
                Object.keys(cognitionIndex).length,
            layerMap
        };

        console.log(
            "✅ [LAYER_MAP_READY]",
            result
        );

        return result;
    }
    catch(error) {
        console.warn(
            "⚠️ [LAYER_MAP_DEGRADED]",
            {
                reason:
                    error?.message || String(error)
            }
        );

        return {
            ok: false,
            degraded: true,
            error:
                error?.message || String(error)
        };
    }
};