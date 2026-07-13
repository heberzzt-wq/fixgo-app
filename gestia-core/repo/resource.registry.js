/* =====================================================
   SIA7 RESOURCE REGISTRY
   Sovereign Single Source Of Truth
===================================================== */

window.__SIA7_RESOURCE_REGISTRY__ ||= {

    version:
        "SIA7_V2",

    hydratedAt:
        null,

    /* ============================================
       REPOSITORY
    ============================================ */

    files: {},

    modules: {},

    dependencies: {},

    ownership: {},

    /* ============================================
       FIRESTORE
    ============================================ */

    collections: {},

    firestoreBindings: {},

    /* ============================================
       COGNITION
    ============================================ */

    engines: {},

    hubs: {},

    runtime: {},

    /* ============================================
       IMPACT
    ============================================ */

    impactGraph: {},

    governance: {}
};

const registry =
    window.__SIA7_RESOURCE_REGISTRY__;

registry.version =
    "SIA7_V2";

registry.hydrationCount =
    (registry.hydrationCount || 0) + 1;

registry.files = {};
registry.modules = {};
registry.dependencies = {};
registry.ownership = {};
registry.collections = {};
registry.firestoreBindings = {};
registry.engines = {};
registry.hubs = {};
registry.runtime = {};
registry.impactGraph = {};
registry.governance = {};

/* =====================================================
   FIRESTORE COLLECTIONS
===================================================== */

[
    "anuncios_b2b",
    "b2b_keys",
    "bitacora_edificios",
    "clientes",
    "config_rutinas",
    "config_services",
    "configuracion",
    "flotilla_b2b",
    "gestia_dynamic_data",
    "gestia_firewall",
    "gestia_ledger",
    "gestia_logs",
    "gestia_memory",
    "gestia_module_versions_global",
    "gestia_operations",
    "gestia_records",
    "gestia_reputation",
    "gestia_security_logs",
    "gestia_system_health",
    "jarvis_supervision_reports",
    "gestia_system_modules",
    "log_rutinas",
    "logs_ia_mantenimiento",
    "logs_terminal_heberto",
    "notificaciones_pendientes",
    "packages",
    "panicAlerts",
    "rastreo",
    "repo_files",
    "residenciales",
    "services",
    "servicios_b2b",
    "support_tickets",
    "tareas",
    "tecnicos",
    "tenants",
    "transacciones",
    "users"
]

.forEach(collection => {

    registry.collections[
        collection
    ] = {

        status:
            "ACTIVE",

        source:
            "firestore_default"
    };
});

/* =====================================================
   REPO COGNITION HYDRATION
===================================================== */

for (

    const [file,node]

    of Object.entries(

        window.__REPO_COGNITION__ || {}

    )

) {

    registry.files[file] = {

        path:
            node.path,

        module:
            node.module,

        type:
            node.type,

        critical:
            !!node.critical,

        cognition:
            node.cognition || {}
    };

    if (

        node.module

    ) {

        registry.modules[
            node.module
        ] ||= {

            files: [],

            dependencies: [],

            firestore: []
        };

        registry.modules[
            node.module
        ]
        .files
        .push(file);

        registry.ownership[
            file
        ] =

            node.module;
    }
}

/* =====================================================
   DEPENDENCY GRAPH HYDRATION
===================================================== */

for (

    const [file,graph]

    of Object.entries(

        window.__REPO_DEP_GRAPH__ || {}

    )

) {

    registry.dependencies[
        file
    ] =

        graph;

    const moduleName =

        registry
            .ownership
            ?.[file];

    if (

        moduleName &&

        registry.modules[
            moduleName
        ]

    ) {

        registry.modules[
            moduleName
        ]
        .dependencies =

            graph.dependencies || [];

        registry.impactGraph[
            moduleName
        ] = {

            file,

            dependencies:

                graph.dependencies || [],

            totalDependencies:

                graph.totalDependencies || 0
        };
    }
}

/* =====================================================
   ENGINES
===================================================== */

[
    "brain",
    "semantic",
    "intent",
    "planner",
    "executor",
    "persistence",
    "firewall",
    "self_repair",
    "context_memory",
    "jarvis_bridge"
]

.forEach(engine => {

    registry.engines[
        engine
    ] = {

        status:
            "REGISTERED"
    };
});

/* =====================================================
   HUBS
===================================================== */

[
    "analysis.hub",
    "execution.hub",
    "repo.hub",
    "security.hub"
]

.forEach(hub => {

    registry.hubs[
        hub
    ] = {

        status:
            "REGISTERED"
    };
});

/* =====================================================
   RUNTIME
===================================================== */

registry.runtime = {

    hybridRuntime:

        !!window
            .__HYBRID_COGNITION_RUNTIME__,

    runtimeV7:

        !!window
            .__GESTIA_RUNTIME_V7_BOOTED__,

    booted:

        !!window
            .__GESTIA_RUNTIME_V7_BOOTED__
};

/* =====================================================
   GOVERNANCE
===================================================== */

registry.governance = {

    repoAware:
        true,

    dependencyAware:
        true,

    firestoreAware:
        true,

    runtimeAware:
        true,

    impactAware:
        true
};

registry.hydratedAt =
    Date.now();

console.log(
    "🧠 [RESOURCE_REGISTRY_READY]",
    {
        files:
            Object.keys(
                registry.files
            ).length,

        modules:
            Object.keys(
                registry.modules
            ).length,

        collections:
            Object.keys(
                registry.collections
            ).length,

        dependencies:
            Object.keys(
                registry.dependencies
            ).length
    }
);
