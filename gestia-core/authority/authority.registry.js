/* =========================================================
   GESTIA AUTHORITY REGISTRY V1
   Sovereign Mutation Observability Layer
========================================================= */

console.log(
    "🛡️ [AUTHORITY_REGISTRY] Booting..."
);

/* =========================================================
   GLOBAL AUTHORITY STATE
========================================================= */

window.__GESTIA_AUTHORITY__ =
    window.__GESTIA_AUTHORITY__ || {

    initialized: true,

    version: "1.0.0",

    startedAt: Date.now(),

    mutations: [],

    modules: {},

    scopes: {},

    telemetry: []
};

/* =========================================================
   REGISTER MODULE
========================================================= */

export function registerAuthorityModule({

    module = "UNKNOWN_MODULE",

    scopes = []

} = {}) {

    try {

        window.__GESTIA_AUTHORITY__
            .modules[module] = {

            module,

            scopes,

            registeredAt:
                Date.now()
        };

        console.log(
            `🛡️ [AUTHORITY_MODULE_REGISTERED]: ${module}`
        );

        return true;

    }

    catch(error) {

        console.error(
            "🚨 [AUTHORITY_REGISTER_FAIL]",
            error
        );

        return false;
    }
}

/* =========================================================
   REGISTER MUTATION
========================================================= */

export function registerMutation({

    module = "UNKNOWN_MODULE",

    path = "UNKNOWN_PATH",

    value = null,

    previous = null

} = {}) {

    try {

        const mutation = {

            id:

                crypto.randomUUID(),

            module,

            path,

            previous,

            value,

            timestamp:
                Date.now(),

            stack:

    new Error()
        .stack
        };

        window.__GESTIA_AUTHORITY__
            .mutations
            .push(mutation);

        /* =============================================
           TELEMETRY
        ============================================= */

        window.__GESTIA_AUTHORITY__
            .telemetry
            .push({

                type:
                    "STATE_MUTATION",

                module,

                path,

                timestamp:
                    Date.now()
            });

        console.log(

            `🛡️ [AUTHORITY_MUTATION] ${module} -> ${path}`,

            mutation
        );

        return mutation;
    }

    catch(error) {

        console.error(
            "🚨 [AUTHORITY_MUTATION_FAIL]",
            error
        );

        return null;
    }
}

/* =========================================================
   GET AUTHORITY SNAPSHOT
========================================================= */

export function getAuthoritySnapshot() {

    return structuredClone(

        window.__GESTIA_AUTHORITY__
    );
}

/* =========================================================
   GLOBAL EXPOSURE
========================================================= */

window.GestiaAuthority = {

    registerAuthorityModule,

    registerMutation,

    getAuthoritySnapshot
};

console.log(
    "🛡️ [AUTHORITY_REGISTRY] ONLINE"
);