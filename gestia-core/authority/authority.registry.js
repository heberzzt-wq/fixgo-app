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

/* =============================================
   SOURCE ATTRIBUTION
============================================= */

const stackTrace =

    new Error()
        .stack || "";

let source =

    "unknown";

if (

    stackTrace.includes(
        "analysis.hub"
    )

) {

    source =
        "analysis.hub";
}

else if (

    stackTrace.includes(
        "execution.hub"
    )

) {

    source =
        "execution.hub";
}

else if (

    stackTrace.includes(
        "security.hub"
    )

) {

    source =
        "security.hub";
}

else if (

    stackTrace.includes(
        "repo.hub"
    )

) {

    source =
        "repo.hub";
}

else if (

    stackTrace.includes(
        "gestia-terminal"
    )

) {

    source =
        "terminal.surface";
}

else if (

    stackTrace.includes(
        "app-main"
    )

) {

    source =
        "legacy.app";
}

/* =============================================
   MUTATION OBJECT
============================================= */

const mutation = {

    id:

        crypto.randomUUID(),

    module,

    source,

    path,

    previous,

    value,

    timestamp:
        Date.now(),

    stack:
        stackTrace
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

        source,

        path,

        timestamp:
            Date.now()
    });


        console.groupCollapsed(

    `🛡️ [AUTHORITY_MUTATION] ${source} -> ${path}`

);

console.log(
    "MODULE:",
    module
);

console.log(
    "SOURCE:",
    source
);

console.log(
    "PATH:",
    path
);

console.log(
    "PREVIOUS:",
    previous
);

console.log(
    "VALUE:",
    value
);

console.log(
    "STACK:",
    stackTrace
);

console.log(
    "FULL MUTATION:",
    mutation
);

console.groupEnd();

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