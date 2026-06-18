/* =========================================================
   GESTIA AUTHORITY REGISTRY V2
   Sovereign Mutation Observability Layer
========================================================= */

const AUTHORITY_REGISTRY_VERSION =
    "2.0.0-authority-contract";

const AUTHORITY_POLICY = {
    authority:
        "full_repo_private_owner",
    safeZone:
        "advisory",
    mutationMode:
        "observed_supervised",
    blockedPathPolicy:
        "deny_secrets_git_node_modules"
};

console.log(
    "🛡️ [AUTHORITY_REGISTRY] Booting..."
);

window.__GESTIA_AUTHORITY__ =
    window.__GESTIA_AUTHORITY__ || {

    initialized: true,

    version: AUTHORITY_REGISTRY_VERSION,

    startedAt: Date.now(),

    mutations: [],

    modules: {},

    scopes: {},

    telemetry: [],

    riskScore: 0,

    riskEvents: []
};

Object.assign(
    window.__GESTIA_AUTHORITY__,
    {
        version:
            AUTHORITY_REGISTRY_VERSION,
        policy:
            AUTHORITY_POLICY,
        authorityMode:
            AUTHORITY_POLICY.authority,
        safeZone:
            AUTHORITY_POLICY.safeZone
    }
);
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

            version:
                AUTHORITY_REGISTRY_VERSION,

            policy:
                AUTHORITY_POLICY,

            scopes,

            registeredAt:
                Date.now()
        };

        window.__MODULE_OWNERSHIP__ ||= {};

window.__MODULE_OWNERSHIP__[
    module
] = {

    authority: true,

    module,

    scopes,

    classification:
        "authority_module",

    runtimeRole:
        "core",

    governance:
        "HIGH",

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
        "operations-executor"
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

    version:
        AUTHORITY_REGISTRY_VERSION,

    policy:
        AUTHORITY_POLICY,

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
   GOVERNANCE RISK ACCUMULATION
============================================= */

try {

    const riskPaths = [

        "cognition.unsafe",
        "repo.safezone",
        "terminal.original.intent"
    ];

    const risky = riskPaths.some(

        riskKey =>

            String(path)
                .includes(riskKey)
    );

    if (risky) {

        window.__GESTIA_AUTHORITY__
            .riskScore += 1;

        window.__GESTIA_AUTHORITY__
            .riskEvents
            .push({

                path,

                module,

                timestamp:
                    Date.now()
            });

        console.warn(

            "⚠️ [GOVERNANCE_RISK_SCORE]",

            {

                riskScore:

                    window
                        .__GESTIA_AUTHORITY__
                        .riskScore,

                lastEvent:
                    path
            }
        );
    }

}

catch(riskErr) {

    console.warn(

        "⚠️ [RISK_ACCUMULATION_FAIL]",

        riskErr
    );
}
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

export function describeAuthorityRegistry() {

    return {
        ok: true,
        registry:
            "gestia_authority_registry",
        version:
            AUTHORITY_REGISTRY_VERSION,
        policy:
            AUTHORITY_POLICY,
        modules:
            Object.keys(
                window.__GESTIA_AUTHORITY__?.modules || {}
            ).length,
        mutations:
            window.__GESTIA_AUTHORITY__?.mutations?.length || 0,
        riskScore:
            window.__GESTIA_AUTHORITY__?.riskScore || 0
    };
}

/* =========================================================
   GLOBAL EXPOSURE
========================================================= */

window.GestiaAuthority = {

    registerAuthorityModule,

    registerMutation,

    getAuthoritySnapshot,

    describeAuthorityRegistry
};

console.log(
    "🛡️ [AUTHORITY_REGISTRY] ONLINE"
);
