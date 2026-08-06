/* =========================================================
   GESTIA RUNTIME V7
   FORTRESS KERNEL
   Cognitive Operational System Core
========================================================= */

console.log(
    "🚀 [GESTIA_RUNTIME_V7] Fortress Kernel Booting..."
);

/* =========================================================
   RUNTIME VERSION
========================================================= */

import {
    resolveGestiaRole,
    resolveGestiaRouteDecision
}
from "./auth/role-authority.js?v=role-authority-v3-single-navigation-20260713";

const GESTIA_RUNTIME_VERSION =
    "7.0.0";

const GESTIA_RUNTIME_MACRO_PACK_VERSION =
    "2.0.0-runtime-v7-macro-pack";

/* =========================================================
   DOUBLE BOOT PROTECTION
========================================================= */

if (

    window.__GESTIA_RUNTIME_V7_BOOTED__

) {

    console.warn(

        "⚠️ [GESTIA_RUNTIME_V7] Runtime already initialized"

    );

    throw new Error(
        "GESTIA_RUNTIME_ALREADY_BOOTED"
    );
}

/* =========================================================
   BOOT LOCK
========================================================= */

window.__GESTIA_RUNTIME_V7_BOOTED__ =
    true;

/* =========================================================
   GLOBAL NAMESPACE
========================================================= */

window.GestiaRuntime =
    window.GestiaRuntime || {};

window.GestiaRuntime.macroPack = {
    version:
        GESTIA_RUNTIME_MACRO_PACK_VERSION,
    authority:
        "full_repo_private_owner",
    safeZone:
        "advisory",
    governanceAction:
        "review_or_supervised_execution"
};

window.GestiaRuntime.describeRuntimeV7 = function() {

    return {
        ok: true,
        runtime:
            "gestia_runtime_v7",
        version:
            GESTIA_RUNTIME_VERSION,
        macroPack:
            window.GestiaRuntime.macroPack
    };
};


    console.log(
    "🧠 [GESTIA_RUNTIME_NAMESPACE]",
    window.GestiaRuntime
);
/* =========================================================
   CORE REGISTRY
========================================================= */

window.GestiaRuntime.core = {

    version:
        GESTIA_RUNTIME_VERSION,

    codename:
        "SIA7_FORTRESS",

    initializedAt:
        Date.now(),

    status:
        "BOOTING",

    mode:
        "COGNITIVE_OPERATIONAL_SYSTEM",

    environment:

        window.location.hostname.includes(
            "localhost"
        )

            ? "development"

            : "production",

    bootId:

        crypto.randomUUID(),

    lifecycle:
        "KERNEL_INITIALIZING"
};

/* =========================================================
   GLOBAL SERVICE REGISTRY
========================================================= */

window.GestiaRuntime.services = {

    auth:
        null,

    router:
        null,

    telemetry:
        null,

    cognition:
        null,

    orchestrator:
        null,

    persistence:
        null,

    eventBus:
        null,

    firewall:
        null,

    serviceWorker:
        null,

    voice:
        null
};

/* =========================================================
   GLOBAL STATE
========================================================= */

window.GestiaRuntime.state = {

    initialized:
        false,

    bootCompleted:
        false,

    authResolved:
        false,

    routeResolved:
        false,

    tenantResolved:
        false,

    cognitionReady:
        false,

    telemetryReady:
        false,

    serviceWorkerReady:
        false,

    currentUser:
        null,

    currentRole:
        null,

    currentTenant:
        null,

    currentSurface:
        null,

    currentModule:
        null,

        autonomous: {

    pending: null,

    lastAuto: 0,

    morningDone: false,

    cooldownActive: false,

    activeProposal: null,

    executiveState: "IDLE"
},

    bootPhase:
        "FORTRESS_KERNEL",

    lastBoot:
        Date.now()
};

/* =========================================================
   GLOBAL CONFIG
========================================================= */

window.GestiaRuntime.config = {

    debug:
        true,

    telemetry:
        true,

    cognition:
        true,

    strictRouting:
        true,

    runtimeProtection:
        true,

    enableVoice:
        true,

    enablePersistence:
        true,

    enableSnapshots:
        true,

    enableEventBus:
        true
};

/* =========================================================
   GLOBAL UTILITIES
========================================================= */

window.GestiaRuntime.utils = {

    generateId(prefix = "sia7") {

        return [

            prefix,

            Date.now(),

            Math.random()

                .toString(36)

                .substring(2, 10)

        ].join("_");
    },

    now() {

        return Date.now();
    },

    safe(fn) {

        try {

            return fn();

        }

        catch(error) {

            console.error(

                "🚨 [GESTIA_RUNTIME_SAFE_FAIL]",

                error
            );

            return null;
        }
    }
};

/* =========================================================
   GLOBAL LOGGER
========================================================= */

window.GestiaRuntime.log = function(

    event,

    payload = {},

    level = "info"

) {

    const timestamp =
        new Date().toISOString();

    const structure = {

        timestamp,

        event,

        level,

        payload
    };

    if (level === "error") {

        console.error(
            `🚨 ${event}`,
            structure
        );

        return;
    }

    if (level === "warn") {

        console.warn(
            `⚠️ ${event}`,
            structure
        );

        return;
    }

    console.log(
        `🧠 ${event}`,
        structure
    );
};

/* =========================================================
   BOOT TELEMETRY
========================================================= */

window.GestiaRuntime.log(

    "[FORTRESS_KERNEL_ONLINE]",

    {

        version:
            GESTIA_RUNTIME_VERSION,

        bootId:
            window.GestiaRuntime
                .core
                .bootId,

        environment:
            window.GestiaRuntime
                .core
                .environment
    }
);

/* =========================================================
   KERNEL STATUS UPDATE
========================================================= */

window.GestiaRuntime.core.status =
    "ONLINE";

window.GestiaRuntime.core.lifecycle =
    "FORTRESS_KERNEL_READY";

/* =========================================================
   KERNEL READY
========================================================= */

console.log(
    "🛡️ [FORTRESS_KERNEL] ONLINE"
);

/* =========================================================
   MEGABLOCK 02 :: GLOBAL STATE ENGINE
========================================================= */

console.log(
    "🧠 [GLOBAL_STATE_ENGINE] Initializing..."
);

/* =========================================================
   INTERNAL STATE STORE
========================================================= */

window.GestiaRuntime.store = {

    runtime: {

        online:
            true,

        initialized:
            false,

        hydrationComplete:
            false,

        cognitionReady:
            false,

        routerReady:
            false,

        authReady:
            false,

        telemetryReady:
            false,

        servicesReady:
            false,

sovereign: {

    active:
        true,

    federation:
        true,

    isolationMode:
        false,

    recoveryMode:
        false,

    totalHubs:
        0,

    isolatedHubs:
        0,

    lastRecovery:
        null
}
    },

    session: {

        authenticated:
            false,

        restoring:
            false,

        restored:
            false,

        expired:
            false,

        token:
            null
    },

    user: {

        uid:
            null,

        email:
            null,

        role:
            null,

        roleReal:
            null,

        tenantId:
            null,

        displayName:
            null,

        permissions:
            [],

        metadata:
            {}
    },

    routing: {

        current:
            null,

        previous:
            null,

        target:
            null,

        locked:
            false,

        hydrationLock:
            true
    },

    cognition: {

        active:
            false,

        mode:
            null,

        chainDepth:
            0,

        lastReasoning:
            null,

        lastIntent:
            null
    },

    telemetry: {

        bootTime:
            performance.now(),

        events:
            [],

        errors:
            [],

        warnings:
            []
    }
};
/* =========================================================
   SURFACE GOVERNANCE REGISTRY V2
========================================================= */

window.GestiaRuntime.surfaces = {

    registry: {},

    current: null,

    previous: null,

    locked: false
};

/* =========================================================
   REGISTER SURFACE
========================================================= */

window.GestiaRuntime.registerSurface =
function(config = {}) {

    try {

        const id =
            config.id;

        if (!id) {

            console.warn(
                "⚠️ [SURFACE_ID_MISSING]"
            );

            return false;
        }

        window
            .GestiaRuntime
            .surfaces
            .registry[id] = {

            id,

            runtime:

                config.runtime ||

                "GENERIC_RUNTIME",

            owner:

                config.owner ||

                "UNKNOWN",

            routes:

                config.routes || [],

            protected:

                config.protected !== false,

            isolated:

                config.isolated !== false,

            createdAt:
                Date.now()
        };

        console.log(
            `🧠 [SURFACE_REGISTERED]: ${id}`
        );

        return true;

    }

    catch(error) {

        console.error(
            "🚨 [SURFACE_REGISTER_FAIL]",
            error
        );

        return false;
    }
};


/* =========================================================
   SET ACTIVE SURFACE
========================================================= */

window.GestiaRuntime.setSurface =
function(surfaceId) {

    try {

        if (

            !surfaceId ||

            !window
                .GestiaRuntime
                .surfaces
                .registry[surfaceId]

        ) {

            console.warn(
                "⚠️ [INVALID_SURFACE]",
                surfaceId
            );

            return false;
        }

        const surfaces =

            window
                .GestiaRuntime
                .surfaces;

        surfaces.previous =
            surfaces.current;

        surfaces.current =
            surfaceId;

        console.log(
            `🧠 [SURFACE_ACTIVE]: ${surfaceId}`
        );

        return true;
    }

    catch(error) {

        console.error(
            "🚨 [SURFACE_SET_FAIL]",
            error
        );

        return false;
    }
};
/* =========================================================
   SET ACTIVE SURFACE
========================================================= */

window.GestiaRuntime.setSurface =
function(surfaceId) {

    try {

        const registry =

            window
                .GestiaRuntime
                .surfaces
                .registry;

        if (!registry[surfaceId]) {

            console.warn(
                "⚠️ [SURFACE_NOT_REGISTERED]",
                surfaceId
            );

            return false;
        }

        window
            .GestiaRuntime
            .surfaces
            .previous =

            window
                .GestiaRuntime
                .surfaces
                .current;

        window
            .GestiaRuntime
            .surfaces
            .current =
                surfaceId;

        console.log(
            `🧠 [ACTIVE_SURFACE]: ${surfaceId}`
        );

        return true;

    }

    catch(error) {

        console.error(
            "🚨 [SURFACE_SET_FAIL]",
            error
        );

        return false;
    }
};
/* =========================================================
   REACTIVE WATCHERS
========================================================= */

window.GestiaRuntime.watchers =
    [];

/* =========================================================
   STATE WATCHER REGISTRY
========================================================= */

window.GestiaRuntime.watch = function(

    key,

    callback

) {

    if (

        typeof callback !== "function"

    ) {

        return;
    }

    window.GestiaRuntime.watchers.push({

        id:

            window
                .GestiaRuntime
                .utils
                .generateId("watcher"),

        key,

        callback,

        createdAt:
            Date.now()
    });

    window.GestiaRuntime.log(

        "[STATE_WATCHER_REGISTERED]",

        { key }
    );
};

/* =========================================================
   STATE GETTER
========================================================= */

window.GestiaRuntime.getState =
    function(path) {

        try {

            return path

                .split(".")

                .reduce(

                    (acc, part) => {

                        return acc?.[part];

                    },

                    window.GestiaRuntime.store
                );
        }

        catch(error) {

            console.error(

                "🚨 [STATE_GET_FAIL]",

                error
            );

            return null;
        }
    };

/* =========================================================
   STATE SETTER
========================================================= */

window.GestiaRuntime.setState =
    function(

        path,

        value

    ) {

        try {

            const parts =
                path.split(".");

            const last =
                parts.pop();

            const target =
                parts.reduce(

                    (acc, part) => {

                        if (

                            !acc[part]

                        ) {

                            acc[part] = {};
                        }

                        return acc[part];

                    },

                    window.GestiaRuntime.store
                );

            const previous =
                target[last];


                /* =========================================
                   AUTHORITY OBSERVABILITY
                ========================================= */

try {

    window.GestiaAuthority
        ?.registerMutation?.({

        module:
            "GestiaRuntime",

        path,

        previous,

        value
    });

}

catch(authorityError) {

    console.warn(
        "⚠️ [AUTHORITY_OBSERVABILITY_FAIL]",
        authorityError
    );
}

            target[last] =
                value;

            /* =========================================
               TELEMETRY
            ========================================= */

            window
                .GestiaRuntime
                .store
                .telemetry
                .events
                .push({

                    type:
                        "STATE_UPDATE",

                    path,

                    previous,

                    value,

                    timestamp:
                        Date.now()
                });

            /* =========================================
               WATCHER NOTIFY
            ========================================= */

            for (

                const watcher

                of

                window
                    .GestiaRuntime
                    .watchers

            ) {

                if (

                    watcher.key === path ||

                    path.startsWith(
                        watcher.key
                    )

                ) {

                    try {

                        watcher.callback({

                            path,

                            previous,

                            value
                        });

                    }

                    catch(watcherError) {

                        console.error(

                            "🚨 [WATCHER_FAIL]",

                            watcherError
                        );
                    }
                }
            }

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [STATE_SET_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   HYDRATION LOCK ENGINE
========================================================= */

window.GestiaRuntime.lockHydration =
    function() {

        window
            .GestiaRuntime
            .setState(

                "routing.hydrationLock",

                true
            );

        window.GestiaRuntime.log(

            "[HYDRATION_LOCKED]"
        );
    };

window.GestiaRuntime.unlockHydration =
    function() {

        window
            .GestiaRuntime
            .setState(

                "routing.hydrationLock",

                false
            );

        window.GestiaRuntime.log(

            "[HYDRATION_UNLOCKED]"
        );
    };

/* =========================================================
   ROUTE LOCK ENGINE
========================================================= */

window.GestiaRuntime.lockRouting =
    function() {

        window
            .GestiaRuntime
            .setState(

                "routing.locked",

                true
            );

        window.GestiaRuntime.log(

            "[ROUTING_LOCKED]"
        );
    };

window.GestiaRuntime.unlockRouting =
    function() {

        window
            .GestiaRuntime
            .setState(

                "routing.locked",

                false
            );

        window.GestiaRuntime.log(

            "[ROUTING_UNLOCKED]"
        );
    };

/* =========================================================
   RUNTIME FLAGS
========================================================= */

window.GestiaRuntime.flags = {

    AUTH_BOOTING:
        true,

    ROUTER_BOOTING:
        true,

    COGNITION_BOOTING:
        true,

    TELEMETRY_BOOTING:
        true
};

/* =========================================================
   STATE ENGINE READY
========================================================= */

window.GestiaRuntime.setState(

    "runtime.initialized",

    true
);

window.GestiaRuntime.log(

    "[GLOBAL_STATE_ENGINE_READY]"
);

console.log(
    "🧠 [GLOBAL_STATE_ENGINE] ONLINE"
);

/* =========================================================
   MEGABLOCK 03 :: AUTH ENGINE
========================================================= */

console.log(
    "🔐 [AUTH_ENGINE] Initializing..."
);

/* =========================================================
   FIREBASE IMPORT BRIDGE
========================================================= */

import * as FirebaseCore
from "../firebase.js";

/* =========================================================
   FIREBASE SERVICES
========================================================= */

const auth =
    FirebaseCore.auth;

const db =
    FirebaseCore.db;

/* =========================================================
   FIREBASE SDK
========================================================= */

import {

    onAuthStateChanged,

    signOut

}
from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {

    doc,

    getDoc

}
from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* =========================================================
   AUTH REGISTRY
========================================================= */

window.GestiaRuntime.services.auth = {

    initialized:
        false,

    authenticated:
        false,

    restoring:
        false,

    currentUser:
        null
};

window.GestiaRuntime.resolveAuthenticatedRole =
    function(user = {}, metadata = {}) {
        return resolveGestiaRole(
            user,
            metadata
        );
    };

/* =========================================================
   SESSION RESTORE
========================================================= */

window.GestiaRuntime.restoreSession =
    async function(user) {

        try {

            window.GestiaRuntime.log(

                "[AUTH_SESSION_RESTORE_START]",

                {

                    uid:
                        user?.uid
                }
            );

            /* =============================================
               HYDRATION LOCK
            ============================================= */

            window.GestiaRuntime.lockHydration();

            /* =============================================
               SESSION STATE
            ============================================= */

            window.GestiaRuntime.setState(

                "session.restoring",

                true
            );

            /* =============================================
               USER LOOKUP
            ============================================= */

            const ref =
                doc(

                    db,

                    "users",

                    user.uid
                );

            const snap =
                await getDoc(ref);

            /* =============================================
               ROLE RESOLUTION
            ============================================= */

            let role =
                null;

            let roleReal =
                null;

            let tenantId =
                "GLOBAL_SYSTEM";

            let metadata =
                {};

            if (snap.exists()) {

                metadata =
                    snap.data();

                tenantId =

                    metadata?.tenantId ||

                    "GLOBAL_SYSTEM";
            }

            /* =============================================
               NORMALIZATION
            ============================================= */

            const resolvedRole =
                window.GestiaRuntime
                    .resolveAuthenticatedRole(
                        user,
                        metadata
                    );

            role =
                resolvedRole.role;

            roleReal =
                resolvedRole.roleReal;

            if (!role) {
                window.GestiaRuntime.log(
                    "[AUTH_ROLE_UNRESOLVED]",
                    {
                        uid: user.uid,
                        email: user.email,
                        source: resolvedRole.source
                    },
                    "WARNING"
                );
            }

            /* =============================================
               STATE UPDATE
            ============================================= */

            window.GestiaRuntime.setState(

                "user.uid",

                user.uid
            );

            window.GestiaRuntime.setState(

                "user.email",

                user.email
            );

            window.GestiaRuntime.setState(

                "user.role",

                role
            );

            window.GestiaRuntime.setState(

                "user.roleReal",

                roleReal
            );

            window.GestiaRuntime.setState(

                "user.tenantId",

                tenantId
            );

            window.GestiaRuntime.setState(

                "user.displayName",

                metadata?.nombre ||

                user.email
            );

            window.GestiaRuntime.setState(

                "user.metadata",

                metadata
            );

            window.GestiaRuntime.setState(

                "session.authenticated",

                true
            );

            window.GestiaRuntime.setState(

                "session.restored",

                true
            );

            window.GestiaRuntime.setState(

                "session.restoring",

                false
            );

            window.GestiaRuntime.setState(

                "runtime.authReady",

                true
            );

            /* =============================================
               GLOBAL SHORTCUTS
            ============================================= */

            window.GestiaUser = {

                uid:
                    user.uid,

                email:
                    user.email,

                role,

                roleReal,

                tenantId
            };

            /* =============================================
               SERVICE UPDATE
            ============================================= */

            window
                .GestiaRuntime
                .services
                .auth
                .authenticated = true;

            window
                .GestiaRuntime
                .services
                .auth
                .currentUser = user;

            /* =============================================
               HYDRATION COMPLETE
            ============================================= */

            window.GestiaRuntime.unlockHydration();

            /* =============================================
               LOGGING
            ============================================= */

            window.GestiaRuntime.log(

                "[AUTH_SESSION_RESTORE_COMPLETE]",

                {

                    uid:
                        user.uid,

                    role,

                    tenantId
                }
            );

            return {

                authenticated:
                    true,

                role,

                tenantId
            };

        }

        catch(error) {

            console.error(

                "🚨 [AUTH_RESTORE_FATAL]",

                error
            );

            window.GestiaRuntime.setState(

                "session.restoring",

                false
            );

            window.GestiaRuntime.unlockHydration();

            return {

                authenticated:
                    false
            };
        }
    };

/* =========================================================
   AUTH OBSERVER
========================================================= */

window.GestiaRuntime.startAuthObserver =
    function() {

        if (

            window
                .GestiaRuntime
                .services
                .auth
                .initialized

        ) {

            console.warn(

                "⚠️ [AUTH_ENGINE] Observer already active"
            );

            return;
        }

        window
            .GestiaRuntime
            .services
            .auth
            .initialized = true;

        onAuthStateChanged(

            auth,

            async (user) => {

                try {

                    /* =====================================
                       NO SESSION
                    ===================================== */

                    if (!user) {

                        window.GestiaRuntime.log(

                            "[AUTH_NO_SESSION]"
                        );

                        window.GestiaRuntime.setState(

                            "session.authenticated",

                            false
                        );

                        window.GestiaRuntime.setState(

                            "runtime.authReady",

                            true
                        );

                        window.GestiaRuntime.unlockHydration();

                        return;
                    }

                    /* =====================================
                       RESTORE SESSION
                    ===================================== */

                    await window

                        .GestiaRuntime

                        .restoreSession(user);

                }

                catch(error) {

                    console.error(

                        "🚨 [AUTH_OBSERVER_FATAL]",

                        error
                    );
                }
            }
        );

        window.GestiaRuntime.log(

            "[AUTH_OBSERVER_ONLINE]"
        );
    };

/* =========================================================
   LOGOUT ENGINE
========================================================= */

window.GestiaRuntime.logout =
    async function() {

        try {

            window.GestiaRuntime.log(

                "[AUTH_LOGOUT_START]"
            );

            await signOut(auth);

            window.location.href =
                "/login.html";

        }

        catch(error) {

            console.error(

                "🚨 [AUTH_LOGOUT_FAIL]",

                error
            );
        }
    };

/* =========================================================
   AUTH ENGINE READY
========================================================= */

window.GestiaRuntime.services.auth.ready =
    true;

window.GestiaRuntime.flags.AUTH_BOOTING =
    false;

window.GestiaRuntime.log(

    "[AUTH_ENGINE_READY]"
);

console.log(
    "🔐 [AUTH_ENGINE] ONLINE"
);

/* =========================================================
   MEGABLOCK 04 :: ROLE RESOLVER + ROUTER ENGINE
========================================================= */

console.log(
    "🛰️ [ROUTER_ENGINE] Initializing..."
);

/* =========================================================
   PUBLIC SURFACES

   Las rutas privadas pertenecen exclusivamente a
   role-authority.js. Mantener otra tabla por rol aqui fue la
   causa de redirecciones tardias y decisiones contradictorias.
========================================================= */

const GESTIA_PUBLIC_SURFACES =
    Object.freeze([
        "/",
        "/index.html",
        "/login.html",
        "/registro.html"
    ]);

/* =========================================================
   CURRENT SURFACE
========================================================= */

window.GestiaRuntime.getCurrentSurface =
    function() {

        return window.location.pathname;
    };

/* =========================================================
   PUBLIC SURFACE CHECK
========================================================= */

window.GestiaRuntime.isPublicSurface =
    function(pathname) {

        return GESTIA_PUBLIC_SURFACES
            .includes(pathname);
    };

/* =========================================================
   CANONICAL ROLE ROUTE DECISION
========================================================= */

window.GestiaRuntime.resolveCanonicalRouteDecision =
    function(pathname = window.location.pathname) {

        const metadata =
            window.GestiaRuntime.getState(
                "user.metadata"
            ) || {};

        const role =
            window.GestiaRuntime.getState(
                "user.role"
            );

        const roleReal =
            window.GestiaRuntime.getState(
                "user.roleReal"
            );

        return resolveGestiaRouteDecision({
            user: {
                email:
                    window.GestiaRuntime.getState(
                        "user.email"
                    ),
                role,
                rol: role
            },
            metadata: {
                ...metadata,
                role,
                rol: role,
                roleReal,
                rol_real: roleReal
            },
            pathname,
            search:
                window.location.search
        });
    };

/* =========================================================
   SAFE REDIRECT ENGINE
========================================================= */

window.GestiaRuntime.redirect =
    async function(

        target,

        reason = "runtime_navigation"

    ) {

        try {

            /* =============================================
               ROUTE LOCK
            ============================================= */

            if (

                window
                    .GestiaRuntime
                    .getState(
                        "routing.locked"
                    )

            ) {

                console.warn(

                    "⚠️ [ROUTER_LOCKED]"
                );

                return;
            }

            /* =============================================
               HYDRATION LOCK
            ============================================= */

            if (

                window
                    .GestiaRuntime
                    .getState(
                        "routing.hydrationLock"
                    )

            ) {

                console.warn(

                    "⚠️ [ROUTER_HYDRATION_LOCK]"
                );

                return;
            }

            /* =============================================
               CURRENT ROUTE
            ============================================= */

            const current =
                window.location.pathname;

            if (current === target) {

                return;
            }

            /* =============================================
               STATE UPDATE
            ============================================= */

            window.GestiaRuntime.setState(

                "routing.previous",

                current
            );

            window.GestiaRuntime.setState(

                "routing.target",

                target
            );

            /* =============================================
               LOGGING
            ============================================= */

            window.GestiaRuntime.log(

                "[ROUTE_REDIRECT]",

                {

                    from:
                        current,

                    to:
                        target,

                    reason
                }
            );

            /* =============================================
               REDIRECT
            ============================================= */

            window.location.href =
                target;

        }

        catch(error) {

            console.error(

                "🚨 [ROUTER_REDIRECT_FAIL]",

                error
            );
        }
    };

/* =========================================================
   SURFACE GUARD
========================================================= */

window.GestiaRuntime.guardSurface =
    async function() {

        try {

            /* =============================================
               WAIT HYDRATION
            ============================================= */

            if (

                window
                    .GestiaRuntime
                    .getState(
                        "routing.hydrationLock"
                    )

            ) {

                console.warn(

                    "⚠️ [SURFACE_GUARD_WAITING_HYDRATION]"
                );

                return;
            }

            /* =============================================
               CURRENT ROUTE
            ============================================= */

            const pathname =
                window.location.pathname;

            /* =============================================
               PUBLIC ROUTE
            ============================================= */

            const isLocalJarvisValidation =
                ["127.0.0.1", "localhost"].includes(window.location.hostname) &&
                new URLSearchParams(window.location.search).get("jarvisLocal") === "1";
            const isPublic =

                isLocalJarvisValidation || window
                    .GestiaRuntime
                    .isPublicSurface(
                        pathname
                    );

            /* =============================================
               SESSION
            ============================================= */

            const authenticated =

                window
                    .GestiaRuntime
                    .getState(
                        "session.authenticated"
                    );

            /* =============================================
               NO SESSION
            ============================================= */

            if (

                !authenticated &&

                !isPublic

            ) {

                await window

                    .GestiaRuntime

                    .redirect(

                        "/login.html",

                        "auth_required"
                    );

                return;
            }

            /* =============================================
               ROLE
            ============================================= */

            const role =

                window
                    .GestiaRuntime
                    .getState(
                        "user.role"
                    );

            if (
                authenticated &&
                !role
            ) {
                window.GestiaRuntime.log(
                    "[SURFACE_GUARD_ROLE_PENDING]",
                    {
                        pathname
                    },
                    "WARNING"
                );

                return;
            }

            /* =============================================
               CANONICAL ACCESS DECISION

               El Runtime observa la misma decision que
               firebase.js, app-main.js y app-login.js. No
               mantiene homes ni listas privadas paralelas.
            ============================================= */

            const routeDecision =
                window.GestiaRuntime
                    .resolveCanonicalRouteDecision(
                        pathname
                    );

            if (
                routeDecision.redirect &&
                routeDecision.target
            ) {
                const target =
                    routeDecision.target.startsWith("/")
                        ? routeDecision.target
                        : `/${routeDecision.target}`;

                await window
                    .GestiaRuntime
                    .redirect(
                        target,
                        routeDecision.reason
                    );

                return;
            }

            /* =============================================
               ROUTE READY
            ============================================= */

            window.GestiaRuntime.setState(

                "routing.current",

                pathname
            );

            window.GestiaRuntime.setState(

                "runtime.routerReady",

                true
            );

            window.GestiaRuntime.log(

                "[SURFACE_GUARD_PASS]",

                {

                    role,

                    pathname,

                    authorityReason:
                        routeDecision.reason
                }
            );

        }

        catch(error) {

            console.error(

                "🚨 [SURFACE_GUARD_FATAL]",

                error
            );
        }
    };

/* =========================================================
   ROUTER BOOTSTRAP
========================================================= */

window.GestiaRuntime.startRouter =
    async function() {

        try {

            window.GestiaRuntime.log(

                "[ROUTER_START]"
            );

            /* =============================================
               WAIT AUTH READY
            ============================================= */

            const waitForAuth =
                setInterval(

                    async () => {

                        const authReady =

                            window
                                .GestiaRuntime
                                .getState(
                                    "runtime.authReady"
                                );

                        if (!authReady) {

                            return;
                        }

                        clearInterval(
                            waitForAuth
                        );

                        await window

                            .GestiaRuntime

                            .guardSurface();

                    },

                    100
                );

        }

        catch(error) {

            console.error(

                "🚨 [ROUTER_START_FATAL]",

                error
            );
        }
    };

/* =========================================================
   ROUTER ENGINE READY
========================================================= */

window.GestiaRuntime.services.router = {

    ready:
        true
};

window.GestiaRuntime.flags.ROUTER_BOOTING =
    false;

window.GestiaRuntime.log(

    "[ROUTER_ENGINE_READY]"
);

console.log(
    "🛰️ [ROUTER_ENGINE] ONLINE"
);

/* =========================================================
   MEGABLOCK 05 :: BOOT ENGINE
========================================================= */

console.log(
    "🚀 [BOOT_ENGINE] Initializing..."
);

/* =========================================================
   BOOT REGISTRY
========================================================= */

window.GestiaRuntime.boot = {

    initialized:
        false,

    started:
        false,

    completed:
        false,

    phase:
        "BOOT_PENDING",

    startedAt:
        null,

    completedAt:
        null,

    duration:
        null
};

/* =========================================================
   BOOT PHASE ENGINE
========================================================= */

window.GestiaRuntime.setBootPhase =
    function(

        phase

    ) {

        window
            .GestiaRuntime
            .boot
            .phase = phase;

        window
            .GestiaRuntime
            .setState(

                "runtime.bootPhase",

                phase
            );

        window.GestiaRuntime.log(

            "[BOOT_PHASE_UPDATE]",

            { phase }
        );
    };

/* =========================================================
   SERVICE STARTER
========================================================= */

window.GestiaRuntime.startServices =
    async function() {

        try {

            window.GestiaRuntime.setBootPhase(

                "STARTING_SERVICES"
            );

            /* =============================================
               TELEMETRY
            ============================================= */

            window.GestiaRuntime.setState(

                "runtime.telemetryReady",

                true
            );

            /* =============================================
               COGNITION PLACEHOLDER
            ============================================= */

            window.GestiaRuntime.setState(

                "runtime.cognitionReady",

                true
            );

            /* =============================================
               SERVICE REGISTRY
            ============================================= */

            window.GestiaRuntime.services.telemetry = {

                ready:
                    true
            };

            window.GestiaRuntime.services.cognition = {

                ready:
                    true
            };

            window.GestiaRuntime.log(

                "[CORE_SERVICES_STARTED]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [SERVICE_START_FAIL]",

                error
            );
        }
    };

/* =========================================================
   MODULE DETECTION
========================================================= */

window.GestiaRuntime.detectSurface =
    function() {

        const pathname =
            window.location.pathname;

        /* =============================================
           ADMIN
        ============================================= */

        if (

            pathname.includes("admin")

        ) {

            return "admin";
        }

        /* =============================================
           TECNICO
        ============================================= */

        if (

            pathname.includes("tecnico")

        ) {

            return "tecnico";
        }

        /* =============================================
           CLIENTE
        ============================================= */

        if (

            pathname.includes("cliente")

        ) {

            return "cliente";
        }

        /* =============================================
           TERMINAL
        ============================================= */

        if (

            pathname.includes("terminal")

        ) {

            return "terminal";
        }

        /* =============================================
           LOGIN
        ============================================= */

        if (

            pathname.includes("login")

        ) {

            return "login";
        }

        /* =============================================
           REGISTRO
        ============================================= */

        if (

            pathname.includes("registro")

        ) {

            return "registro";
        }

        return "unknown";
    };

/* =========================================================
   MODULE ORCHESTRATION
========================================================= */

window.GestiaRuntime.mountSurface =
    async function() {

        try {

            window.GestiaRuntime.setBootPhase(

                "SURFACE_ORCHESTRATION"
            );

            const surface =

                window
                    .GestiaRuntime
                    .detectSurface();

            window.GestiaRuntime.setState(

                "runtime.currentSurface",

                surface
            );

            window.GestiaRuntime.log(

                "[SURFACE_DETECTED]",

                { surface }
            );

            /* =============================================
               SURFACE EVENTS
            ============================================= */

            window.dispatchEvent(

                new CustomEvent(

                    "gestia:surface-ready",

                    {

                        detail: {

                            surface
                        }
                    }
                )
            );

        }

        catch(error) {

            console.error(

                "🚨 [SURFACE_MOUNT_FAIL]",

                error
            );
        }
    };

/* =========================================================
   BOOT TIMELINE
========================================================= */

window.GestiaRuntime.createBootTimeline =
    function() {

        const timeline = {

            startedAt:

                window
                    .GestiaRuntime
                    .boot
                    .startedAt,

            completedAt:

                Date.now(),

            duration:

                Date.now() -

                window
                    .GestiaRuntime
                    .boot
                    .startedAt
        };

        window.GestiaRuntime.boot.duration =

            timeline.duration;

        window.GestiaRuntime.boot.completedAt =

            timeline.completedAt;

        window.GestiaRuntime.log(

            "[BOOT_TIMELINE]",

            timeline
        );
    };

/* =========================================================
   MAIN BOOT SEQUENCE
========================================================= */

window.GestiaRuntime.startBoot =
    async function() {

        try {

            /* =============================================
               DOUBLE START PROTECTION
            ============================================= */

            if (

                window
                    .GestiaRuntime
                    .boot
                    .started

            ) {

                console.warn(

                    "⚠️ [BOOT_ENGINE_ALREADY_STARTED]"
                );

                return;
            }

            /* =============================================
               START
            ============================================= */

            window
                .GestiaRuntime
                .boot
                .started = true;

            window
                .GestiaRuntime
                .boot
                .startedAt = Date.now();

            window.GestiaRuntime.setBootPhase(

                "BOOT_START"
            );

            window.GestiaRuntime.log(

                "[BOOT_SEQUENCE_START]"
            );

            /* =============================================
               START AUTH
            ============================================= */

            window.GestiaRuntime.setBootPhase(

                "AUTH_START"
            );

            window

                .GestiaRuntime

                .startAuthObserver();

            /* =============================================
               START ROUTER
            ============================================= */

            window.GestiaRuntime.setBootPhase(

                "ROUTER_START"
            );

            await window

                .GestiaRuntime

                .startRouter();

            /* =============================================
               START SERVICES
            ============================================= */

            await window

                .GestiaRuntime

                .startServices();

            /* =============================================
               SURFACE MOUNT
            ============================================= */

            await window

                .GestiaRuntime

                .mountSurface();

            /* =============================================
               FINALIZE
            ============================================= */

            window.GestiaRuntime.setBootPhase(

                "BOOT_COMPLETE"
            );

            window
                .GestiaRuntime
                .boot
                .completed = true;

            window.GestiaRuntime.setState(

                "runtime.bootCompleted",

                true
            );

            window.GestiaRuntime.createBootTimeline();

            window.GestiaRuntime.log(

                "[GESTIA_RUNTIME_ONLINE]"
            );

            console.log(
                "🛡️ [GESTIA_RUNTIME_V7] ONLINE"
            );

        }

        catch(error) {

            console.error(

                "🚨 [BOOT_SEQUENCE_FATAL]",

                error
            );
        }
    };

/* =========================================================
   DOM READY
========================================================= */

window.addEventListener(

    "DOMContentLoaded",

    async () => {

        console.log(
    "🧠 [SIA7] Runtime cargado en modo passive"
);
    }
);

/* =========================================================
   BOOT ENGINE READY
========================================================= */

window.GestiaRuntime.log(

    "[BOOT_ENGINE_READY]"
);

console.log(
    "🚀 [BOOT_ENGINE] ONLINE"
);

/* =========================================================
   MEGABLOCK 06 :: MODULE ORCHESTRATOR
========================================================= */

console.log(
    "🧩 [MODULE_ORCHESTRATOR] Initializing..."
);

/* =========================================================
   MODULE REGISTRY
========================================================= */

window.GestiaRuntime.modules = {

    registry: {},

    mounted: {},

    lifecycle: {},

    telemetry: {}
};

/* =========================================================
   MODULE REGISTER
========================================================= */

window.GestiaRuntime.registerModule =
    function(

        moduleName,

        config = {}

    ) {

        try {

            if (!moduleName) {

                throw new Error(
                    "MODULE_NAME_REQUIRED"
                );
            }

            window
                .GestiaRuntime
                .modules
                .registry
                [moduleName] = {

                    name:
                        moduleName,

                    mounted:
                        false,

                    initialized:
                        false,

                    createdAt:
                        Date.now(),

                    config
                };

            window.GestiaRuntime.log(

                "[MODULE_REGISTERED]",

                {

                    module:
                        moduleName
                }
            );

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [MODULE_REGISTER_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   MODULE MOUNT
========================================================= */

window.GestiaRuntime.mountModule =
    async function(

        moduleName,

        runtime = {}

    ) {

        try {

            const module =

                window
                    .GestiaRuntime
                    .modules
                    .registry
                    [moduleName];

            if (!module) {

                throw new Error(
                    "MODULE_NOT_REGISTERED"
                );
            }

            /* =============================================
               ALREADY MOUNTED
            ============================================= */

            if (

                module.mounted

            ) {

                console.warn(

                    "⚠️ [MODULE_ALREADY_MOUNTED]",

                    moduleName
                );

                return;
            }

            /* =============================================
               MOUNT
            ============================================= */

            module.mounted =
                true;

            module.initialized =
                true;

            module.runtime =
                runtime;

            module.mountedAt =
                Date.now();

            /* =============================================
               ACTIVE SURFACE
            ============================================= */

            window.GestiaRuntime.setState(

                "runtime.currentModule",

                moduleName
            );

            /* =============================================
               LIFECYCLE
            ============================================= */

            if (

                typeof module
                    ?.config
                    ?.onMount === "function"

            ) {

                await module
                    .config
                    .onMount(runtime);
            }

            /* =============================================
               TELEMETRY
            ============================================= */

            window
                .GestiaRuntime
                .modules
                .telemetry
                [moduleName] = {

                    mounted:
                        true,

                    mountedAt:
                        Date.now()
                };

            /* =============================================
               EVENT
            ============================================= */

            window.dispatchEvent(

                new CustomEvent(

                    "gestia:module-mounted",

                    {

                        detail: {

                            module:
                                moduleName
                        }
                    }
                )
            );

            window.GestiaRuntime.log(

                "[MODULE_MOUNTED]",

                {

                    module:
                        moduleName
                }
            );

        }

        catch(error) {

            console.error(

                "🚨 [MODULE_MOUNT_FAIL]",

                error
            );
        }
    };

/* =========================================================
   MODULE UNMOUNT
========================================================= */

window.GestiaRuntime.unmountModule =
    async function(

        moduleName

    ) {

        try {

            const module =

                window
                    .GestiaRuntime
                    .modules
                    .registry
                    [moduleName];

            if (!module) {

                return;
            }

            /* =============================================
               LIFECYCLE
            ============================================= */

            if (

                typeof module
                    ?.config
                    ?.onUnmount === "function"

            ) {

                await module
                    .config
                    .onUnmount();
            }

            module.mounted =
                false;

            /* =============================================
               EVENT
            ============================================= */

            window.dispatchEvent(

                new CustomEvent(

                    "gestia:module-unmounted",

                    {

                        detail: {

                            module:
                                moduleName
                        }
                    }
                )
            );

            window.GestiaRuntime.log(

                "[MODULE_UNMOUNTED]",

                {

                    module:
                        moduleName
                }
            );

        }

        catch(error) {

            console.error(

                "🚨 [MODULE_UNMOUNT_FAIL]",

                error
            );
        }
    };

/* =========================================================
   SURFACE AUTO REGISTRY
========================================================= */

window.GestiaRuntime.autoRegisterSurface =
    function() {

        const pathname =
            window.location.pathname;

        /* =============================================
           ADMIN
        ============================================= */

        if (

            pathname.includes("admin")

        ) {

            window
                .GestiaRuntime
                .registerModule(

                    "admin_surface"
                );
        }

        /* =============================================
           CLIENTE
        ============================================= */

        if (

            pathname.includes("cliente")

        ) {

            window
                .GestiaRuntime
                .registerModule(

                    "cliente_surface"
                );
        }

        /* =============================================
           TECNICO
        ============================================= */

        if (

            pathname.includes("tecnico")

        ) {

            window
                .GestiaRuntime
                .registerModule(

                    "tecnico_surface"
                );
        }

        /* =============================================
           TERMINAL
        ============================================= */

        if (

            pathname.includes("terminal")

        ) {

            window
                .GestiaRuntime
                .registerModule(

                    "terminal_surface"
                );
        }
    };

/* =========================================================
   SURFACE AUTO MOUNT
========================================================= */

window.GestiaRuntime.autoMountSurface =
    async function() {

        const pathname =
            window.location.pathname;

        /* =============================================
           ADMIN
        ============================================= */

        if (

            pathname.includes("admin")

        ) {

            await window

                .GestiaRuntime

                .mountModule(

                    "admin_surface"
                );
        }

        /* =============================================
           CLIENTE
        ============================================= */

        if (

            pathname.includes("cliente")

        ) {

            await window

                .GestiaRuntime

                .mountModule(

                    "cliente_surface"
                );
        }

        /* =============================================
           TECNICO
        ============================================= */

        if (

            pathname.includes("tecnico")

        ) {

            await window

                .GestiaRuntime

                .mountModule(

                    "tecnico_surface"
                );
        }

        /* =============================================
           TERMINAL
        ============================================= */

        if (

            pathname.includes("terminal")

        ) {

            await window

                .GestiaRuntime

                .mountModule(

                    "terminal_surface"
                );
        }
    };

/* =========================================================
   ORCHESTRATOR START
========================================================= */

window.GestiaRuntime.startOrchestrator =
    async function() {

        try {

            window.GestiaRuntime.log(

                "[MODULE_ORCHESTRATOR_START]"
            );

            /* =============================================
               REGISTRY
            ============================================= */

            window

                .GestiaRuntime

                .autoRegisterSurface();

            /* =============================================
               MOUNT
            ============================================= */

            await window

                .GestiaRuntime

                .autoMountSurface();

            /* =============================================
               READY
            ============================================= */

            window
                .GestiaRuntime
                .services
                .orchestrator = {

                    ready:
                        true
                };

            window.GestiaRuntime.log(

                "[MODULE_ORCHESTRATOR_READY]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [MODULE_ORCHESTRATOR_FATAL]",

                error
            );
        }
    };

/* =========================================================
   ORCHESTRATOR AUTO START
========================================================= */

window.addEventListener(

    "gestia:surface-ready",

    async () => {

        await window

            .GestiaRuntime

            .startOrchestrator();
    }
);

/* =========================================================
   MODULE ORCHESTRATOR READY
========================================================= */

console.log(
    "🧩 [MODULE_ORCHESTRATOR] ONLINE"
);

/* =========================================================
   MEGABLOCK 07 :: EVENT BUS ENGINE
========================================================= */

console.log(
    "📡 [EVENT_BUS_ENGINE] Initializing..."
);

/* =========================================================
   EVENT BUS REGISTRY
========================================================= */

window.GestiaRuntime.eventBus = {

    listeners: {},

    telemetry: {

        emitted:
            0,

        received:
            0
    }
};

/* =========================================================
   EVENT SUBSCRIBE
========================================================= */

window.GestiaRuntime.on =
    function(

        eventName,

        callback

    ) {

        try {

            if (

                !window
                    .GestiaRuntime
                    .eventBus
                    .listeners
                    [eventName]

            ) {

                window
                    .GestiaRuntime
                    .eventBus
                    .listeners
                    [eventName] = [];
            }

            const listener = {

                id:

                    window
                        .GestiaRuntime
                        .utils
                        .generateId(
                            "listener"
                        ),

                callback,

                createdAt:
                    Date.now()
            };

            window
                .GestiaRuntime
                .eventBus
                .listeners
                [eventName]

                .push(listener);

            window.GestiaRuntime.log(

                "[EVENT_LISTENER_REGISTERED]",

                {

                    event:
                        eventName
                }
            );

            return listener.id;

        }

        catch(error) {

            console.error(

                "🚨 [EVENT_SUBSCRIBE_FAIL]",

                error
            );
        }
    };

/* =========================================================
   EVENT UNSUBSCRIBE
========================================================= */

window.GestiaRuntime.off =
    function(

        eventName,

        listenerId

    ) {

        try {

            const listeners =

                window
                    .GestiaRuntime
                    .eventBus
                    .listeners
                    [eventName];

            if (!listeners) {

                return;
            }

            window
                .GestiaRuntime
                .eventBus
                .listeners
                [eventName] =

                listeners.filter(

                    listener =>

                        listener.id !== listenerId
                );

            window.GestiaRuntime.log(

                "[EVENT_LISTENER_REMOVED]",

                {

                    event:
                        eventName
                }
            );

        }

        catch(error) {

            console.error(

                "🚨 [EVENT_UNSUBSCRIBE_FAIL]",

                error
            );
        }
    };

/* =========================================================
   EVENT EMITTER
========================================================= */

window.GestiaRuntime.emit =
    async function(

        eventName,

        payload = {}

    ) {

        try {

            const listeners =

                window
                    .GestiaRuntime
                    .eventBus
                    .listeners
                    [eventName] || [];

            /* =============================================
               TELEMETRY
            ============================================= */

            window
                .GestiaRuntime
                .eventBus
                .telemetry
                .emitted++;

            /* =============================================
               LOGGING
            ============================================= */

            window.GestiaRuntime.log(

                "[EVENT_EMITTED]",

                {

                    event:
                        eventName,

                    listeners:
                        listeners.length
                }
            );

            /* =============================================
               EXECUTION
            ============================================= */

            for (

                const listener

                of listeners

            ) {

                try {

                    await listener.callback({

                        event:
                            eventName,

                        payload,

                        timestamp:
                            Date.now()
                    });

                    window
                        .GestiaRuntime
                        .eventBus
                        .telemetry
                        .received++;

                }

                catch(listenerError) {

                    console.error(

                        "🚨 [EVENT_LISTENER_FAIL]",

                        listenerError
                    );
                }
            }

            /* =============================================
               DOM EVENT BRIDGE
            ============================================= */

            window.dispatchEvent(

                new CustomEvent(

                    eventName,

                    {

                        detail:
                            payload
                    }
                )
            );

        }

        catch(error) {

            console.error(

                "🚨 [EVENT_EMIT_FATAL]",

                error
            );
        }
    };

/* =========================================================
   GLOBAL SYSTEM EVENTS
========================================================= */

window.GestiaRuntime.on(

    "runtime:boot-complete",

    async () => {

        window.GestiaRuntime.log(

            "[SYSTEM_EVENT_BOOT_COMPLETE]"
        );
    }
);

window.GestiaRuntime.on(

    "auth:session-restored",

    async (event) => {

        window.GestiaRuntime.log(

            "[SYSTEM_EVENT_AUTH_RESTORED]",

            event.payload
        );
    }
);

window.GestiaRuntime.on(

    "module:mounted",

    async (event) => {

        window.GestiaRuntime.log(

            "[SYSTEM_EVENT_MODULE_MOUNTED]",

            event.payload
        );
    }
);

/* =========================================================
   COGNITIVE SIGNAL BRIDGE
========================================================= */

window.GestiaRuntime.emitCognitiveSignal =
    async function(

        signal,

        payload = {}

    ) {

        try {

            await window

                .GestiaRuntime

                .emit(

                    "cognition:signal",

                    {

                        signal,

                        payload
                    }
                );

            window.GestiaRuntime.log(

                "[COGNITIVE_SIGNAL_EMITTED]",

                {

                    signal
                }
            );

        }

        catch(error) {

            console.error(

                "🚨 [COGNITIVE_SIGNAL_FAIL]",

                error
            );
        }
    };

/* =========================================================
   TELEMETRY BRIDGE
========================================================= */

window.GestiaRuntime.emitTelemetry =
    async function(

        type,

        payload = {}

    ) {

        try {

            await window

                .GestiaRuntime

                .emit(

                    "telemetry:event",

                    {

                        type,

                        payload
                    }
                );

        }

        catch(error) {

            console.error(

                "🚨 [TELEMETRY_EMIT_FAIL]",

                error
            );
        }
    };

/* =========================================================
   EVENT BUS START
========================================================= */

window.GestiaRuntime.startEventBus =
    async function() {

        try {

            window
                .GestiaRuntime
                .services
                .eventBus = {

                    ready:
                        true
                };

            window.GestiaRuntime.log(

                "[EVENT_BUS_ONLINE]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [EVENT_BUS_START_FAIL]",

                error
            );
        }
    };

/* =========================================================
   EVENT BUS AUTO START
========================================================= */

window.addEventListener(

    "gestia:surface-ready",

    async () => {

        await window

            .GestiaRuntime

            .startEventBus();
    }
);

/* =========================================================
   EVENT BUS READY
========================================================= */

console.log(
    "📡 [EVENT_BUS_ENGINE] ONLINE"
);

/* =========================================================
   MEGABLOCK 08 :: FIREWALL + ERROR ENGINE
========================================================= */

console.log(
    "🛡️ [FIREWALL_ENGINE] Initializing..."
);

/* =========================================================
   FIREWALL REGISTRY
========================================================= */

window.GestiaRuntime.firewall = {

    errors: [],

    warnings: [],

    blocked: [],

    redirects: {

        last:
            null,

        count:
            0,

        locked:
            false
    },

    listeners: {

        active:
            0
    }
};

/* =========================================================
   ERROR TRACKER
========================================================= */

window.GestiaRuntime.captureError =
    function(

        type,

        error,

        metadata = {}

    ) {

        try {

            const structure = {

                id:

                    window
                        .GestiaRuntime
                        .utils
                        .generateId(
                            "error"
                        ),

                type,

                message:
                    error?.message ||

                    "UNKNOWN_ERROR",

                stack:
                    error?.stack ||

                    null,

                metadata,

                timestamp:
                    Date.now()
            };

            window
                .GestiaRuntime
                .firewall
                .errors
                .push(structure);

            window.GestiaRuntime.log(

                "[RUNTIME_ERROR_CAPTURED]",

                structure,

                "error"
            );

            return structure;

        }

        catch(captureError) {

            console.error(

                "🚨 [ERROR_CAPTURE_FAIL]",

                captureError
            );
        }
    };

/* =========================================================
   WARNING TRACKER
========================================================= */

window.GestiaRuntime.captureWarning =
    function(

        type,

        payload = {}

    ) {

        try {

            const structure = {

                id:

                    window
                        .GestiaRuntime
                        .utils
                        .generateId(
                            "warning"
                        ),

                type,

                payload,

                timestamp:
                    Date.now()
            };

            window
                .GestiaRuntime
                .firewall
                .warnings
                .push(structure);

            console.warn(

                "⚠️ [GESTIA_WARNING]",

                structure
            );

        }

        catch(error) {

            console.error(

                "🚨 [WARNING_CAPTURE_FAIL]",

                error
            );
        }
    };

/* =========================================================
   SAFE EXECUTION WRAPPER
========================================================= */

window.GestiaRuntime.safeExecute =
    async function(

        label,

        callback

    ) {

        try {

            /* =============================================
               JARVIS EXECUTION FABRIC
            ============================================= */

            if (

                window
                    ?.Jarvis
                    ?.executor
                    ?.executeSteps

            ) {

                await window

                    .Jarvis

                    .executor

                    .executeSteps([{

                        type:
                            "RUNTIME_SAFE_EXECUTION",

                        payload: {

                            label,

                            timestamp:
                                Date.now()
                        }
                    }]);
            }

            /* =============================================
               EXECUTION
            ============================================= */

            return await callback();

        }

        catch(error) {

            window
                .GestiaRuntime
                .captureError(

                    label,

                    error
                );

            return null;
        }
    };

/* =========================================================
   REDIRECT FIREWALL
========================================================= */

window.GestiaRuntime.protectRedirect =
    function(

        target

    ) {

        try {

            const redirects =

                window
                    .GestiaRuntime
                    .firewall
                    .redirects;

            const now =
                Date.now();

            /* =============================================
               LOOP DETECTION
            ============================================= */

            if (

                redirects.last === target &&

                redirects.count >= 3

            ) {

                redirects.locked =
                    true;

                window
                    .GestiaRuntime
                    .captureWarning(

                        "REDIRECT_LOOP_BLOCKED",

                        { target }
                    );

                return false;
            }

            /* =============================================
               RESET WINDOW
            ============================================= */

            if (

                !redirects.timestamp ||

                now - redirects.timestamp > 5000

            ) {

                redirects.count =
                    0;
            }

            redirects.last =
                target;

            redirects.count++;

            redirects.timestamp =
                now;

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [REDIRECT_FIREWALL_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   LISTENER FIREWALL
========================================================= */

window.GestiaRuntime.protectListener =
    function(

        listenerName

    ) {

        try {

            window
                .GestiaRuntime
                .firewall
                .listeners
                .active++;

            if (

                window
                    .GestiaRuntime
                    .firewall
                    .listeners
                    .active > 500

            ) {

                window
                    .GestiaRuntime
                    .captureWarning(

                        "LISTENER_STORM_DETECTED",

                        {

                            listener:
                                listenerName
                        }
                    );
            }

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [LISTENER_FIREWALL_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

window.addEventListener(

    "error",

    (event) => {

        window
            .GestiaRuntime
            .captureError(

                "GLOBAL_RUNTIME_ERROR",

                event.error ||

                new Error(
                    event.message
                ),

                {

                    filename:
                        event.filename,

                    lineno:
                        event.lineno
                }
            );
    }
);

/* =========================================================
   GLOBAL PROMISE HANDLER
========================================================= */

window.addEventListener(

    "unhandledrejection",

    (event) => {

        window
            .GestiaRuntime
            .captureError(

                "UNHANDLED_PROMISE_REJECTION",

                event.reason
            );
    }
);

/* =========================================================
   RUNTIME HEALTH CHECK
========================================================= */

window.GestiaRuntime.runtimeHealth =
    function() {

        return {

            runtime:
                "ONLINE",

            errors:

                window
                    .GestiaRuntime
                    .firewall
                    .errors
                    .length,

            warnings:

                window
                    .GestiaRuntime
                    .firewall
                    .warnings
                    .length,

            listeners:

                window
                    .GestiaRuntime
                    .firewall
                    .listeners
                    .active,

            memory:

                performance?.memory ||

                null
        };
    };

/* =========================================================
   FIREWALL START
========================================================= */

window.GestiaRuntime.startFirewall =
    async function() {

        try {

            window
                .GestiaRuntime
                .services
                .firewall = {

                    ready:
                        true
                };

            window.GestiaRuntime.log(

                "[FIREWALL_ENGINE_ONLINE]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [FIREWALL_START_FAIL]",

                error
            );
        }
    };

/* =========================================================
   FIREWALL AUTO START
========================================================= */

window.addEventListener(

    "gestia:surface-ready",

    async () => {

        await window

            .GestiaRuntime

            .startFirewall();
    }
);

/* =========================================================
   FIREWALL READY
========================================================= */

console.log(
    "🛡️ [FIREWALL_ENGINE] ONLINE"
);

/* =========================================================
   MEGABLOCK 09 :: TELEMETRY ENGINE
========================================================= */

console.log(
    "📊 [TELEMETRY_ENGINE] Initializing..."
);

/* =========================================================
   TELEMETRY REGISTRY
========================================================= */

window.GestiaRuntime.telemetry = {

    metrics: {

        bootTime:
            performance.now(),

        memory:
            null,

        cpu:
            null,

        fps:
            null
    },

    runtime: {

        events: [],

        surfaces: [],

        cognition: [],

        routing: [],

        errors: []
    },

    heartbeat: {

        online:
            true,

        startedAt:
            Date.now(),

        lastPulse:
            Date.now()
    }
};

/* =========================================================
   METRIC CAPTURE
========================================================= */

window.GestiaRuntime.captureMetric =
    function(

        type,

        payload = {}

    ) {

        try {

            const structure = {

                id:

                    window
                        .GestiaRuntime
                        .utils
                        .generateId(
                            "metric"
                        ),

                type,

                payload,

                timestamp:
                    Date.now()
            };

            window
                .GestiaRuntime
                .telemetry
                .runtime
                .events
                .push(structure);

            return structure;

        }

        catch(error) {

            console.error(

                "🚨 [METRIC_CAPTURE_FAIL]",

                error
            );
        }
    };

/* =========================================================
   SURFACE TELEMETRY
========================================================= */

window.GestiaRuntime.captureSurface =
    function(

        surface

    ) {

        try {

            window
                .GestiaRuntime
                .telemetry
                .runtime
                .surfaces
                .push({

                    surface,

                    timestamp:
                        Date.now()
                });

            window.GestiaRuntime.log(

                "[SURFACE_TELEMETRY]",

                { surface }
            );

        }

        catch(error) {

            console.error(

                "🚨 [SURFACE_TELEMETRY_FAIL]",

                error
            );
        }
    };

/* =========================================================
   COGNITIVE TELEMETRY
========================================================= */

window.GestiaRuntime.captureCognition =
    function(

        signal,

        payload = {}

    ) {

        try {

            window
                .GestiaRuntime
                .telemetry
                .runtime
                .cognition
                .push({

                    signal,

                    payload,

                    timestamp:
                        Date.now()
                });

        }

        catch(error) {

            console.error(

                "🚨 [COGNITION_TELEMETRY_FAIL]",

                error
            );
        }
    };

/* =========================================================
   ROUTING TELEMETRY
========================================================= */

window.GestiaRuntime.captureRoute =
    function(

        from,

        to

    ) {

        try {

            window
                .GestiaRuntime
                .telemetry
                .runtime
                .routing
                .push({

                    from,

                    to,

                    timestamp:
                        Date.now()
                });

        }

        catch(error) {

            console.error(

                "🚨 [ROUTE_TELEMETRY_FAIL]",

                error
            );
        }
    };

/* =========================================================
   ERROR TELEMETRY
========================================================= */

window.GestiaRuntime.captureTelemetryError =
    function(

        error

    ) {

        try {

            window
                .GestiaRuntime
                .telemetry
                .runtime
                .errors
                .push({

                    message:
                        error?.message ||

                        "UNKNOWN",

                    timestamp:
                        Date.now()
                });

        }

        catch(telemetryError) {

            console.error(

                "🚨 [ERROR_TELEMETRY_FAIL]",

                telemetryError
            );
        }
    };

/* =========================================================
   HEARTBEAT ENGINE
========================================================= */

window.GestiaRuntime.startHeartbeat =
    function() {

        setInterval(() => {

            try {

                window
                    .GestiaRuntime
                    .telemetry
                    .heartbeat
                    .lastPulse = Date.now();

                /* =========================================
                   MEMORY
                ========================================= */

                if (

                    performance?.memory

                ) {

                    window
                        .GestiaRuntime
                        .telemetry
                        .metrics
                        .memory = {

                            used:

                                Math.round(

                                    performance
                                        .memory
                                        .usedJSHeapSize /

                                    1048576
                                ),

                            total:

                                Math.round(

                                    performance
                                        .memory
                                        .totalJSHeapSize /

                                    1048576
                                )
                        };
                }

                /* =========================================
                   TELEMETRY EVENT
                ========================================= */

                window.GestiaRuntime.log(

                    "[RUNTIME_HEARTBEAT]",

                    {

                        online:
                            true,

                        memory:

                            window
                                .GestiaRuntime
                                .telemetry
                                .metrics
                                .memory
                    }
                );

            }

            catch(error) {

                console.error(

                    "🚨 [HEARTBEAT_FAIL]",

                    error
                );
            }

        }, 30000);
    };

/* =========================================================
   TELEMETRY SNAPSHOT
========================================================= */

window.GestiaRuntime.runtimeSnapshot =
    function() {

        return {

            runtime:

                window
                    .GestiaRuntime
                    .core,

            state:

                window
                    .GestiaRuntime
                    .store,

            telemetry:

                window
                    .GestiaRuntime
                    .telemetry,

            health:

                window
                    .GestiaRuntime
                    .runtimeHealth()
        };
    };

/* =========================================================
   TELEMETRY BRIDGE
========================================================= */

window.GestiaRuntime.on(

    "module:mounted",

    async (event) => {

        window
            .GestiaRuntime
            .captureSurface(

                event
                    ?.payload
                    ?.module
            );
    }
);

window.GestiaRuntime.on(

    "cognition:signal",

    async (event) => {

        window
            .GestiaRuntime
            .captureCognition(

                event
                    ?.payload
                    ?.signal,

                event
                    ?.payload
            );
    }
);

/* =========================================================
   TELEMETRY START
========================================================= */

window.GestiaRuntime.startTelemetry =
    async function() {

        try {

            window.GestiaRuntime.log(

                "[TELEMETRY_START]"
            );

            /* =============================================
               HEARTBEAT
            ============================================= */

            window

                .GestiaRuntime

                .startHeartbeat();

            /* =============================================
               SERVICE READY
            ============================================= */

            window
                .GestiaRuntime
                .services
                .telemetry = {

                    ready:
                        true
                };

            /* =============================================
               STATE
            ============================================= */

            window.GestiaRuntime.setState(

                "runtime.telemetryReady",

                true
            );

            window.GestiaRuntime.log(

                "[TELEMETRY_ENGINE_READY]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [TELEMETRY_START_FAIL]",

                error
            );
        }
    };

/* =========================================================
   TELEMETRY AUTO START
========================================================= */

window.addEventListener(

    "gestia:surface-ready",

    async () => {

        await window

            .GestiaRuntime

            .startTelemetry();
    }
);

/* =========================================================
   TELEMETRY ENGINE READY
========================================================= */

console.log(
    "📊 [TELEMETRY_ENGINE] ONLINE"
);

/* =========================================================
   MEGABLOCK 10 :: SERVICE WORKER ENGINE
========================================================= */

console.log(
    "👷 [SERVICE_WORKER_ENGINE] Initializing..."
);

/* =========================================================
   SW REGISTRY
========================================================= */

window.GestiaRuntime.serviceWorker = {

    supported:

        "serviceWorker"

        in navigator,

    registered:
        false,

    registration:
        null,

    version:
        "7.0.0",

    status:
        "PENDING"
};

/* =========================================================
   SW VALIDATION
========================================================= */

window.GestiaRuntime.validateServiceWorker =
    function() {

        try {

            if (

                !window
                    .GestiaRuntime
                    .serviceWorker
                    .supported

            ) {

                console.warn(

                    "⚠️ [SW_NOT_SUPPORTED]"
                );

                return false;
            }

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [SW_VALIDATION_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   SW REGISTER
========================================================= */

window.GestiaRuntime.registerServiceWorker =
    async function() {

        try {

            /* =============================================
               VALIDATION
            ============================================= */

            const valid =

                window
                    .GestiaRuntime
                    .validateServiceWorker();

            if (!valid) {

                return;
            }

            /* =============================================
               ALREADY REGISTERED
            ============================================= */

            if (

                window
                    .GestiaRuntime
                    .serviceWorker
                    .registered

            ) {

                console.warn(

                    "⚠️ [SW_ALREADY_REGISTERED]"
                );

                return;
            }

            window.GestiaRuntime.log(

                "[SW_REGISTER_START]"
            );

            /* =============================================
               REGISTER
            ============================================= */

            const registration =

                await navigator

                    .serviceWorker

                    .register(

                        "/sw.js?v=jarvis-v7-contract-ci-20260617",
                        {
                            updateViaCache:
                                "none"
                        }
                    );

            /* =============================================
               STATE
            ============================================= */

            window
                .GestiaRuntime
                .serviceWorker
                .registered = true;

            window
                .GestiaRuntime
                .serviceWorker
                .registration = registration;

            window
                .GestiaRuntime
                .serviceWorker
                .status = "ONLINE";

            /* =============================================
               GLOBAL STATE
            ============================================= */

            window.GestiaRuntime.setState(

                "runtime.serviceWorkerReady",

                true
            );

            /* =============================================
               SERVICE REGISTRY
            ============================================= */

            window
                .GestiaRuntime
                .services
                .serviceWorker = {

                    ready:
                        true
                };

            /* =============================================
               TELEMETRY
            ============================================= */

            window.GestiaRuntime.log(

                "[SW_REGISTER_SUCCESS]",

                {

                    scope:
                        registration.scope
                }
            );

        }

        catch(error) {

            console.error(

                "🚨 [SW_REGISTER_FAIL]",

                error
            );

            window
                .GestiaRuntime
                .serviceWorker
                .status = "FAILED";
        }
    };

/* =========================================================
   SW UPDATE CHECK
========================================================= */

window.GestiaRuntime.checkServiceWorkerUpdates =
    async function() {

        try {

            const registration =

                window
                    .GestiaRuntime
                    .serviceWorker
                    .registration;

            if (!registration) {

                return;
            }

            await registration.update();

            window.GestiaRuntime.log(

                "[SW_UPDATE_CHECK]"
            );

        }

        catch(error) {

            console.warn(

                "🚨 [SW_UPDATE_CHECK_FAIL]",

                error
            );
        }
    };

/* =========================================================
   SW MESSAGE BRIDGE
========================================================= */

window.GestiaRuntime.sendSWMessage =
    function(

        type,

        payload = {}

    ) {

        try {

            const controller =

                navigator
                    ?.serviceWorker
                    ?.controller;

            if (!controller) {

                return;
            }

            controller.postMessage({

                type,

                payload,

                timestamp:
                    Date.now()
            });

        }

        catch(error) {

            console.error(

                "🚨 [SW_MESSAGE_FAIL]",

                error
            );
        }
    };

/* =========================================================
   SW LISTENER
========================================================= */

navigator.serviceWorker?.addEventListener(

    "message",

    async (event) => {

        try {

            const data =
                event?.data || {};

            window.GestiaRuntime.log(

                "[SW_MESSAGE_RECEIVED]",

                data
            );

            /* =============================================
               EVENT BUS BRIDGE
            ============================================= */

            await window

                .GestiaRuntime

                .emit(

                    "sw:message",

                    data
                );

        }

        catch(error) {

            console.error(

                "🚨 [SW_LISTENER_FAIL]",

                error
            );
        }
    }
);

/* =========================================================
   SW CACHE PURGE
========================================================= */

window.GestiaRuntime.purgeLegacyCaches =
    async function() {

        try {

            const keys =
                await caches.keys();

            for (

                const key

                of keys

            ) {

                /* =========================================
                   VERCEL GHOSTS
                ========================================= */

                if (

                    key
                        .toLowerCase()
                        .includes(
                            "vercel"
                        )

                ) {

                    await caches.delete(key);

                    window.GestiaRuntime.log(

                        "[LEGACY_CACHE_PURGED]",

                        { key }
                    );
                }
            }

        }

        catch(error) {

            console.error(

                "🚨 [CACHE_PURGE_FAIL]",

                error
            );
        }
    };

/* =========================================================
   SW START
========================================================= */

window.GestiaRuntime.startServiceWorker =
    async function() {

        try {

            window.GestiaRuntime.log(

                "[SW_ENGINE_START]"
            );

            /* =============================================
               PURGE
            ============================================= */

            await window

                .GestiaRuntime

                .purgeLegacyCaches();

            /* =============================================
               REGISTER
            ============================================= */

            await window

                .GestiaRuntime

                .registerServiceWorker();

            /* =============================================
               UPDATE CHECK LOOP
            ============================================= */

            setInterval(

                async () => {

                    await window

                        .GestiaRuntime

                        .checkServiceWorkerUpdates();

                },

                300000
            );

            window.GestiaRuntime.log(

                "[SW_ENGINE_READY]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [SW_ENGINE_FATAL]",

                error
            );
        }
    };

/* =========================================================
   SW AUTO START
========================================================= */

window.addEventListener(

    "load",

    async () => {

        await window

            .GestiaRuntime

            .startServiceWorker();
    }
);

/* =========================================================
   SERVICE WORKER ENGINE READY
========================================================= */

console.log(
    "👷 [SERVICE_WORKER_ENGINE] ONLINE"
);

/* =========================================================
   MEGABLOCK 11 :: SESSION PERSISTENCE ENGINE
========================================================= */

console.log(
    "💾 [SESSION_PERSISTENCE_ENGINE] Initializing..."
);

/* =========================================================
   PERSISTENCE REGISTRY
========================================================= */

window.GestiaRuntime.persistence = {

    enabled:
        true,

    storageKey:
        "GESTIA_RUNTIME_V7",

    snapshots: [],

    restored:
        false,

    lastSave:
        null
};

/* =========================================================
   SERIALIZE RUNTIME
========================================================= */

window.GestiaRuntime.serializeRuntime =
    function() {

        try {

            return {

                core:

                    window
                        .GestiaRuntime
                        .core,

                state:

                    window
                        .GestiaRuntime
                        .store,

                telemetry:

                    {

                        heartbeat:

                            window
                                .GestiaRuntime
                                .telemetry
                                .heartbeat
                    },

                timestamp:
                    Date.now()
            };

        }

        catch(error) {

            console.error(

                "🚨 [RUNTIME_SERIALIZE_FAIL]",

                error
            );

            return null;
        }
    };

/* =========================================================
   SAVE RUNTIME SNAPSHOT
========================================================= */

window.GestiaRuntime.saveRuntime =
    async function() {

        try {

            if (

                !window
                    .GestiaRuntime
                    .persistence
                    .enabled

            ) {

                return;
            }

            const snapshot =

                window
                    .GestiaRuntime
                    .serializeRuntime();

            if (!snapshot) {

                return;
            }

            /* =============================================
               LOCAL STORAGE
            ============================================= */

            localStorage.setItem(

                window
                    .GestiaRuntime
                    .persistence
                    .storageKey,

                JSON.stringify(
                    snapshot
                )
            );

            /* =============================================
               MEMORY SNAPSHOT
            ============================================= */

            window
                .GestiaRuntime
                .persistence
                .snapshots
                .push(snapshot);

            /* =============================================
               LIMIT
            ============================================= */

            if (

                window
                    .GestiaRuntime
                    .persistence
                    .snapshots
                    .length > 20

            ) {

                window
                    .GestiaRuntime
                    .persistence
                    .snapshots
                    .shift();
            }

            /* =============================================
               SAVE STATE
            ============================================= */

            window
                .GestiaRuntime
                .persistence
                .lastSave = Date.now();

            window.GestiaRuntime.log(

                "[RUNTIME_SNAPSHOT_SAVED]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [RUNTIME_SAVE_FAIL]",

                error
            );
        }
    };

/* =========================================================
   RESTORE RUNTIME
========================================================= */

window.GestiaRuntime.restoreRuntime =
    async function() {

        try {

            const raw =

                localStorage.getItem(

                    window
                        .GestiaRuntime
                        .persistence
                        .storageKey
                );

            if (!raw) {

                return false;
            }

            const snapshot =
                JSON.parse(raw);

            if (!snapshot?.state) {

                return false;
            }

            /* =============================================
               SAFE RESTORE
            ============================================= */

            const state =
                snapshot.state;

            /* =============================================
               USER
            ============================================= */

            if (

                state?.user

            ) {

                window
                    .GestiaRuntime
                    .store
                    .user =

                    state.user;
            }

            /* =============================================
               SESSION
            ============================================= */

            if (

                state?.session

            ) {

                window
                    .GestiaRuntime
                    .store
                    .session =

                    state.session;
            }

            /* =============================================
               ROUTING
            ============================================= */

            if (

                state?.routing

            ) {

                window
                    .GestiaRuntime
                    .store
                    .routing =

                    state.routing;
            }

            /* =============================================
               TELEMETRY
            ============================================= */

            if (

                state?.telemetry

            ) {

                window
                    .GestiaRuntime
                    .store
                    .telemetry =

                    state.telemetry;
            }

            /* =============================================
               STATUS
            ============================================= */

            window
                .GestiaRuntime
                .persistence
                .restored = true;

            window.GestiaRuntime.log(

                "[RUNTIME_RESTORED]"
            );

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [RUNTIME_RESTORE_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   AUTO SAVE LOOP
========================================================= */

window.GestiaRuntime.startPersistenceLoop =
    function() {

        setInterval(

            async () => {

                await window

                    .GestiaRuntime

                    .saveRuntime();

            },

            30000
        );
    };

/* =========================================================
   PAGE EXIT SNAPSHOT
========================================================= */

window.addEventListener(

    "beforeunload",

    async () => {

        await window

            .GestiaRuntime

            .saveRuntime();
    }
);

/* =========================================================
   VISIBILITY SNAPSHOT
========================================================= */

document.addEventListener(

    "visibilitychange",

    async () => {

        if (

            document.hidden

        ) {

            await window

                .GestiaRuntime

                .saveRuntime();
        }
    }
);

/* =========================================================
   PERSISTENCE START
========================================================= */

window.GestiaRuntime.startPersistence =
    async function() {

        try {

            window.GestiaRuntime.log(

                "[PERSISTENCE_START]"
            );

            /* =============================================
               RESTORE
            ============================================= */

            await window

                .GestiaRuntime

                .restoreRuntime();

            /* =============================================
               SAVE LOOP
            ============================================= */

            window

                .GestiaRuntime

                .startPersistenceLoop();

            /* =============================================
               SERVICE REGISTRY
            ============================================= */

            window
                .GestiaRuntime
                .services
                .persistence = {

                    ready:
                        true
                };

            window.GestiaRuntime.log(

                "[PERSISTENCE_ENGINE_READY]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [PERSISTENCE_START_FAIL]",

                error
            );
        }
    };

/* =========================================================
   PERSISTENCE AUTO START
========================================================= */

window.addEventListener(

    "gestia:surface-ready",

    async () => {

        await window

            .GestiaRuntime

            .startPersistence();
    }
);

/* =========================================================
   SESSION PERSISTENCE ENGINE READY
========================================================= */

console.log(
    "💾 [SESSION_PERSISTENCE_ENGINE] ONLINE"
);

/* =========================================================
   MEGABLOCK 12 :: AI BRIDGE LAYER
========================================================= */

console.log(
    "🧠 [AI_BRIDGE_LAYER] Initializing..."
);

/* =========================================================
   AI REGISTRY
========================================================= */

window.GestiaRuntime.ai = {

    connected:
        false,

    brain:
        null,

    semantic:
        null,

    cognition:
        {

            active:
                false,

            mode:
                "STANDBY",

            lastReasoning:
                null
        }
};

/* =========================================================
   BRAIN ENGINE DETECTION
========================================================= */

window.GestiaRuntime.detectBrainEngine =
    function() {

        try {

            /* =============================================
               GLOBAL DETECTION
            ============================================= */

            if (

                window.BrainEngine ||

                window.brainEngine ||

                window.GestiaBrain

            ) {

                const brain =

                    window.BrainEngine ||

                    window.brainEngine ||

                    window.GestiaBrain;

                window
                    .GestiaRuntime
                    .ai
                    .brain = brain;

                window.GestiaRuntime.log(

                    "[BRAIN_ENGINE_CONNECTED]"
                );

                return true;
            }

            console.warn(

                "⚠️ [BRAIN_ENGINE_NOT_FOUND]"
            );

            return false;

        }

        catch(error) {

            console.error(

                "🚨 [BRAIN_ENGINE_DETECT_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   SEMANTIC ENGINE DETECTION
========================================================= */

window.GestiaRuntime.detectSemanticEngine =
    function() {

        try {

            if (

                window.SemanticEngine ||

                window.semanticEngine ||

                window.GestiaSemantic

            ) {

                const semantic =

                    window.SemanticEngine ||

                    window.semanticEngine ||

                    window.GestiaSemantic;

                window
                    .GestiaRuntime
                    .ai
                    .semantic = semantic;

                window.GestiaRuntime.log(

                    "[SEMANTIC_ENGINE_CONNECTED]"
                );

                return true;
            }

            console.warn(

                "⚠️ [SEMANTIC_ENGINE_NOT_FOUND]"
            );

            return false;

        }

        catch(error) {

            console.error(

                "🚨 [SEMANTIC_ENGINE_DETECT_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   COGNITIVE SIGNAL OBSERVER
========================================================= */

window.GestiaRuntime.observeCognition =
    async function(

        signal,

        payload = {}

    ) {

        try {

            /* =============================================
               TELEMETRY
            ============================================= */

            window

                .GestiaRuntime

                .captureCognition(

                    signal,

                    payload
                );

            /* =============================================
               EVENT BUS
            ============================================= */

            await window

                .GestiaRuntime

                .emit(

                    "runtime:cognition",

                    {

                        signal,

                        payload
                    }
                );

            /* =============================================
               STATE
            ============================================= */

            window.GestiaRuntime.setState(

                "cognition.active",

                true
            );

            window.GestiaRuntime.setState(

                "cognition.lastReasoning",

                {

                    signal,

                    payload,

                    timestamp:
                        Date.now()
                }
            );

            window.GestiaRuntime.log(

                "[COGNITIVE_SIGNAL_OBSERVED]",

                { signal }
            );

        }

        catch(error) {

            console.error(

                "🚨 [COGNITIVE_OBSERVER_FAIL]",

                error
            );
        }
    };

/* =========================================================
   RUNTIME REASONING BRIDGE
========================================================= */

window.GestiaRuntime.reason =
    async function(

        input

    ) {

        try {

            const brain =

                window
                    .GestiaRuntime
                    .ai
                    .brain;

            if (!brain) {

                throw new Error(
                    "BRAIN_ENGINE_UNAVAILABLE"
                );
            }

            window.GestiaRuntime.log(

                "[RUNTIME_REASONING_START]",

                { input }
            );

            /* =============================================
               EXECUTION
            ============================================= */

            let result = null;

            /* =============================================
               BRAIN EXECUTION
            ============================================= */

            if (

                typeof brain
                    ?.procesarIntencion === "function"

            ) {

                result =

                    await brain
                        .procesarIntencion(
                            input
                        );
            }

            /* =============================================
               FALLBACK
            ============================================= */

            else if (

                typeof window
                    ?.GestiaCore
                    ?.procesarIntencion === "function"

            ) {

                result =

                    await window
                        .GestiaCore
                        .procesarIntencion(
                            input
                        );
            }

            /* =============================================
               STATE
            ============================================= */

            window.GestiaRuntime.setState(

                "cognition.lastIntent",

                input
            );

            /* =============================================
               TELEMETRY
            ============================================= */

            await window

                .GestiaRuntime

                .observeCognition(

                    "runtime_reasoning",

                    {

                        input,

                        result
                    }
                );

            window.GestiaRuntime.log(

                "[RUNTIME_REASONING_COMPLETE]"
            );

            return result;

        }

        catch(error) {

            console.error(

                "🚨 [RUNTIME_REASONING_FAIL]",

                error
            );

            return null;
        }
    };

/* =========================================================
   JARVIS BRIDGE
========================================================= */

window.GestiaRuntime.jarvis =
    {

        speak(message) {

            try {

                if (

                    typeof window
                        ?.hablarJarvis === "function"

                ) {

                    return window
                        .hablarJarvis(
                            message
                        );
                }

                console.warn(

                    "⚠️ [JARVIS_SPEAK_UNAVAILABLE]"
                );

            }

            catch(error) {

                console.error(

                    "🚨 [JARVIS_SPEAK_FAIL]",

                    error
                );
            }
        },

        async think(input) {

            return await window

                .GestiaRuntime

                .reason(input);
        }
    };

/* =========================================================
   AI HEARTBEAT
========================================================= */

window.GestiaRuntime.startAIHeartbeat =
    function() {

        setInterval(() => {

            try {

                const brainConnected =

                    !!window
                        .GestiaRuntime
                        .ai
                        .brain;

                const semanticConnected =

                    !!window
                        .GestiaRuntime
                        .ai
                        .semantic;

                window.GestiaRuntime.log(

                    "[AI_HEARTBEAT]",

                    {

                        brain:
                            brainConnected,

                        semantic:
                            semanticConnected
                    }
                );

            }

            catch(error) {

                console.error(

                    "🚨 [AI_HEARTBEAT_FAIL]",

                    error
                );
            }

        }, 60000);
    };

/* =========================================================
   AI START
========================================================= */

window.GestiaRuntime.startAI =
    async function() {

        try {

            window.GestiaRuntime.log(

                "[AI_BRIDGE_START]"
            );

            /* =============================================
               DETECTION
            ============================================= */

            const brain =

                window
                    .GestiaRuntime
                    .detectBrainEngine();

            const semantic =

                window
                    .GestiaRuntime
                    .detectSemanticEngine();

            /* =============================================
               STATUS
            ============================================= */

            window
                .GestiaRuntime
                .ai
                .connected =

                brain || semantic;

            /* =============================================
               STATE
            ============================================= */

            window.GestiaRuntime.setState(

                "runtime.cognitionReady",

                true
            );

            /* =============================================
               HEARTBEAT
            ============================================= */

            window

                .GestiaRuntime

                .startAIHeartbeat();

            /* =============================================
               SERVICES
            ============================================= */

            window
                .GestiaRuntime
                .services
                .cognition = {

                    ready:
                        true
                };

            window.GestiaRuntime.log(

                "[AI_BRIDGE_READY]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [AI_BRIDGE_FATAL]",

                error
            );
        }
    };

/* =========================================================
   AI AUTO START
========================================================= */

window.addEventListener(

    "gestia:surface-ready",

    async () => {

        await window

            .GestiaRuntime

            .startAI();
    }
);

/* =========================================================
   AI BRIDGE LAYER READY
========================================================= */

console.log(
    "🧠 [AI_BRIDGE_LAYER] ONLINE"
);

/* =========================================================
   MEGABLOCK 13 :: RUNTIME LOGGER + DIAGNOSTICS
========================================================= */

console.log(
    "📘 [RUNTIME_DIAGNOSTICS] Initializing..."
);

/* =========================================================
   DIAGNOSTICS REGISTRY
========================================================= */

window.GestiaRuntime.diagnostics = {

    logs: [],

    timeline: [],

    boot: [],

    cognition: [],

    modules: [],

    routing: [],

    auth: [],

    exports: []
};

/* =========================================================
   DIAGNOSTIC LOGGER
========================================================= */

window.GestiaRuntime.diagnostic =
    function(

        type,

        payload = {},

        level = "info"

    ) {

        try {

            const structure = {

                id:

                    window
                        .GestiaRuntime
                        .utils
                        .generateId(
                            "diag"
                        ),

                type,

                level,

                payload,

                timestamp:
                    Date.now()
            };

            /* =============================================
               GLOBAL LOGS
            ============================================= */

            window
                .GestiaRuntime
                .diagnostics
                .logs
                .push(structure);

            /* =============================================
               TIMELINE
            ============================================= */

            window
                .GestiaRuntime
                .diagnostics
                .timeline
                .push({

                    type,

                    timestamp:
                        Date.now()
                });

            /* =============================================
               CATEGORY MAP
            ============================================= */

            if (

                type.includes("BOOT")

            ) {

                window
                    .GestiaRuntime
                    .diagnostics
                    .boot
                    .push(structure);
            }

            if (

                type.includes("COGNITION")

            ) {

                window
                    .GestiaRuntime
                    .diagnostics
                    .cognition
                    .push(structure);
            }

            if (

                type.includes("MODULE")

            ) {

                window
                    .GestiaRuntime
                    .diagnostics
                    .modules
                    .push(structure);
            }

            if (

                type.includes("ROUTE")

            ) {

                window
                    .GestiaRuntime
                    .diagnostics
                    .routing
                    .push(structure);
            }

            if (

                type.includes("AUTH")

            ) {

                window
                    .GestiaRuntime
                    .diagnostics
                    .auth
                    .push(structure);
            }

            /* =============================================
               LIMIT
            ============================================= */

            if (

                window
                    .GestiaRuntime
                    .diagnostics
                    .logs
                    .length > 5000

            ) {

                window
                    .GestiaRuntime
                    .diagnostics
                    .logs
                    .shift();
            }

            return structure;

        }

        catch(error) {

            console.error(

                "🚨 [DIAGNOSTIC_LOG_FAIL]",

                error
            );
        }
    };

/* =========================================================
   RUNTIME INSPECTOR
========================================================= */

window.GestiaRuntime.inspect =
    function() {

        try {

            return {

                runtime:

                    window
                        .GestiaRuntime
                        .core,

                state:

                    window
                        .GestiaRuntime
                        .store,

                services:

                    window
                        .GestiaRuntime
                        .services,

                modules:

                    window
                        .GestiaRuntime
                        .modules,

                telemetry:

                    window
                        .GestiaRuntime
                        .telemetry,

                diagnostics:

                    {

                        logs:

                            window
                                .GestiaRuntime
                                .diagnostics
                                .logs
                                .length,

                        boot:

                            window
                                .GestiaRuntime
                                .diagnostics
                                .boot
                                .length,

                        cognition:

                            window
                                .GestiaRuntime
                                .diagnostics
                                .cognition
                                .length
                    },

                health:

                    window
                        .GestiaRuntime
                        .runtimeHealth()
            };

        }

        catch(error) {

            console.error(

                "🚨 [RUNTIME_INSPECT_FAIL]",

                error
            );

            return null;
        }
    };

/* =========================================================
   EXPORT SNAPSHOT
========================================================= */

window.GestiaRuntime.exportDiagnostics =
    function() {

        try {

            const exportData = {

                exportedAt:
                    Date.now(),

                runtime:

                    window
                        .GestiaRuntime
                        .inspect(),

                diagnostics:

                    window
                        .GestiaRuntime
                        .diagnostics
            };

            const serialized =
                JSON.stringify(

                    exportData,

                    null,

                    2
                );

            const blob =
                new Blob(

                    [serialized],

                    {

                        type:
                            "application/json"
                    }
                );

            const url =
                URL.createObjectURL(
                    blob
                );

            const a =
                document.createElement(
                    "a"
                );

            a.href = url;

            a.download =

                `gestia-runtime-diagnostics-${Date.now()}.json`;

            a.click();

            window
                .GestiaRuntime
                .diagnostics
                .exports
                .push({

                    timestamp:
                        Date.now()
                });

            window.GestiaRuntime.log(

                "[DIAGNOSTICS_EXPORTED]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [DIAGNOSTICS_EXPORT_FAIL]",

                error
            );
        }
    };

/* =========================================================
   LIVE DIAGNOSTIC BRIDGE
========================================================= */

window.GestiaRuntime.on(

    "runtime:cognition",

    async (event) => {

        window
            .GestiaRuntime
            .diagnostic(

                "COGNITION_SIGNAL",

                event.payload
            );
    }
);

window.GestiaRuntime.on(

    "telemetry:event",

    async (event) => {

        window
            .GestiaRuntime
            .diagnostic(

                "TELEMETRY_EVENT",

                event.payload
            );
    }
);

window.GestiaRuntime.on(

    "sw:message",

    async (event) => {

        window
            .GestiaRuntime
            .diagnostic(

                "SERVICE_WORKER_EVENT",

                event.payload
            );
    }
);

/* =========================================================
   BOOT DIAGNOSTIC
========================================================= */

window.GestiaRuntime.diagnostic(

    "BOOT_RUNTIME_DIAGNOSTICS_READY"
);

/* =========================================================
   DEBUG SHORTCUTS
========================================================= */

window.inspectGestia =
    function() {

        return window
            .GestiaRuntime
            .inspect();
    };

window.exportGestiaDiagnostics =
    function() {

        return window
            .GestiaRuntime
            .exportDiagnostics();
    };

/* =========================================================
   DIAGNOSTICS READY
========================================================= */

window.GestiaRuntime.log(

    "[RUNTIME_DIAGNOSTICS_READY]"
);

console.log(
    "📘 [RUNTIME_DIAGNOSTICS] ONLINE"
);

/* =========================================================
   MEGABLOCK 14 :: SELF-HEALING ENGINE
========================================================= */

console.log(
    "🧬 [SELF_HEALING_ENGINE] Initializing..."
);

/* =========================================================
   HEALING REGISTRY
========================================================= */

window.GestiaRuntime.healing = {

    active:
        true,

    cycles:
        0,

    repaired: [],

    watchdogs: {},

    runtimeStatus:
        "STABLE"
};

/* =========================================================
   RUNTIME VALIDATOR
========================================================= */

window.GestiaRuntime.validateRuntime =
    function() {

        try {

            const validations = {

                eventBus:

                    !!window
                        ?.GestiaRuntime
                        ?.eventBus,

                telemetry:

                    !!window
                        ?.GestiaRuntime
                        ?.telemetry,

                router:

                    !!window
                        ?.GestiaRuntime
                        ?.routes,

                auth:

                    !!window
                        ?.GestiaRuntime
                        ?.services
                        ?.auth,

                cognition:

                    !!window
                        ?.GestiaRuntime
                        ?.ai,

                persistence:

                    !!window
                        ?.GestiaRuntime
                        ?.persistence
            };

            const failed =

                Object.entries(
                    validations
                )

                .filter(

                    ([, valid]) => !valid
                )

                .map(

                    ([key]) => key
                );

            return {

                valid:
                    failed.length === 0,

                failed,

                validations
            };

        }

        catch(error) {

            console.error(

                "🚨 [RUNTIME_VALIDATION_FAIL]",

                error
            );

            return {

                valid:
                    false,

                failed:
                    ["validation_engine"]
            };
        }
    };

/* =========================================================
   EVENT BUS RECOVERY
========================================================= */

window.GestiaRuntime.repairEventBus =
    async function() {

        try {

            if (

                window
                    ?.GestiaRuntime
                    ?.eventBus

            ) {

                return true;
            }

            window.GestiaRuntime.eventBus = {

                listeners: {},

                telemetry: {

                    emitted: 0,

                    received: 0
                }
            };

            window
                .GestiaRuntime
                .healing
                .repaired
                .push({

                    component:
                        "eventBus",

                    timestamp:
                        Date.now()
                });

            window.GestiaRuntime.log(

                "[EVENT_BUS_REPAIRED]"
            );

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [EVENT_BUS_REPAIR_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   TELEMETRY RECOVERY
========================================================= */

window.GestiaRuntime.repairTelemetry =
    async function() {

        try {

            if (

                window
                    ?.GestiaRuntime
                    ?.telemetry

            ) {

                return true;
            }

            window.GestiaRuntime.telemetry = {

                metrics: {},

                runtime: {

                    events: []
                },

                heartbeat: {

                    online: true
                }
            };

            window
                .GestiaRuntime
                .healing
                .repaired
                .push({

                    component:
                        "telemetry",

                    timestamp:
                        Date.now()
                });

            window.GestiaRuntime.log(

                "[TELEMETRY_REPAIRED]"
            );

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [TELEMETRY_REPAIR_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   AI RECOVERY
========================================================= */

window.GestiaRuntime.repairAI =
    async function() {

        try {

            if (

                window
                    ?.GestiaRuntime
                    ?.ai

            ) {

                return true;
            }

            window.GestiaRuntime.ai = {

                connected:
                    false,

                cognition: {

                    active:
                        false
                }
            };

            window
                .GestiaRuntime
                .healing
                .repaired
                .push({

                    component:
                        "ai",

                    timestamp:
                        Date.now()
                });

            window.GestiaRuntime.log(

                "[AI_RUNTIME_REPAIRED]"
            );

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [AI_REPAIR_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   SELF REPAIR CYCLE
========================================================= */

window.GestiaRuntime.selfRepair =
    async function() {

        try {

            const validation =

                window
                    .GestiaRuntime
                    .validateRuntime();

            if (

                validation.valid

            ) {

                return true;
            }

            window.GestiaRuntime.log(

                "[SELF_REPAIR_START]",

                validation
            );

            /* =============================================
               EVENT BUS
            ============================================= */

            if (

                validation.failed.includes(
                    "eventBus"
                )

            ) {

                await window

                    .GestiaRuntime

                    .repairEventBus();
            }

            /* =============================================
               TELEMETRY
            ============================================= */

            if (

                validation.failed.includes(
                    "telemetry"
                )

            ) {

                await window

                    .GestiaRuntime

                    .repairTelemetry();
            }

            /* =============================================
               AI
            ============================================= */

            if (

                validation.failed.includes(
                    "cognition"
                )

            ) {

                await window

                    .GestiaRuntime

                    .repairAI();
            }

            /* =============================================
               STATUS
            ============================================= */

            window
                .GestiaRuntime
                .healing
                .runtimeStatus =

                "RECOVERED";

            window.GestiaRuntime.log(

                "[SELF_REPAIR_COMPLETE]"
            );

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [SELF_REPAIR_FATAL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   WATCHDOG ENGINE
========================================================= */

window.GestiaRuntime.startWatchdog =
    function() {

        setInterval(

            async () => {

                try {

                    window
                        .GestiaRuntime
                        .healing
                        .cycles++;

                    const health =

                        window
                            .GestiaRuntime
                            .runtimeHealth();

                    /* =====================================
                       MEMORY WATCH
                    ===================================== */

                    if (

                        health?.memory
                            ?.usedJSHeapSize >

                        250000000

                    ) {

                        window
                            .GestiaRuntime
                            .captureWarning(

                                "HIGH_MEMORY_USAGE"
                            );
                    }

                    /* =====================================
                       SELF REPAIR
                    ===================================== */

                    await window

                        .GestiaRuntime

                        .selfRepair();

                    /* =====================================
                       HEARTBEAT
                    ===================================== */

                    window.GestiaRuntime.log(

                        "[WATCHDOG_CYCLE]",

                        {

                            cycles:

                                window
                                    .GestiaRuntime
                                    .healing
                                    .cycles
                        }
                    );

                }

                catch(error) {

                    console.error(

                        "🚨 [WATCHDOG_FAIL]",

                        error
                    );
                }

            },

            45000
        );
    };

/* =========================================================
   AUTOFIX BRIDGE
========================================================= */

window.GestiaRuntime.invokeAutofix =
    async function(

        payload = {}

    ) {

        try {

            if (

                typeof window
                    ?.JarvisAutofix
                    ?.repair === "function"

            ) {

                return await window

                    .JarvisAutofix

                    .repair(payload);
            }

            console.warn(

                "⚠️ [AUTOFIX_ENGINE_UNAVAILABLE]"
            );

            return null;

        }

        catch(error) {

            console.error(

                "🚨 [AUTOFIX_BRIDGE_FAIL]",

                error
            );

            return null;
        }
    };

/* =========================================================
   SELF HEALING START
========================================================= */

window.GestiaRuntime.startSelfHealing =
    async function() {

        try {

            window.GestiaRuntime.log(

                "[SELF_HEALING_START]"
            );

            /* =============================================
               WATCHDOG
            ============================================= */

            window

                .GestiaRuntime

                .startWatchdog();

            /* =============================================
               SERVICE REGISTRY
            ============================================= */

            window
                .GestiaRuntime
                .services
                .healing = {

                    ready:
                        true
                };

            /* =============================================
               STATE
            ============================================= */

            window.GestiaRuntime.setState(

                "runtime.selfHealingReady",

                true
            );

            window.GestiaRuntime.log(

                "[SELF_HEALING_READY]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [SELF_HEALING_START_FAIL]",

                error
            );
        }
    };

/* =========================================================
   SELF HEALING AUTO START
========================================================= */

window.addEventListener(

    "gestia:surface-ready",

    async () => {

        await window

            .GestiaRuntime

            .startSelfHealing();
    }
);

/* =========================================================
   SELF HEALING ENGINE READY
========================================================= */

console.log(
    "🧬 [SELF_HEALING_ENGINE] ONLINE"
);

/* =========================================================
   MEGABLOCK 15 :: COGNITIVE ORCHESTRATION ENGINE
========================================================= */

console.log(
    "👁️ [COGNITIVE_ORCHESTRATION_ENGINE] Initializing..."
);

/* =========================================================
   COGNITIVE REGISTRY
========================================================= */

window.GestiaRuntime.cognitive = {

    active:
        true,

    mode:
        "SUPERVISOR",

    orchestration: {

        decisions: [],

        actions: [],

        policies: []
    },

    awareness: {

        runtime:
            true,

        modules:
            true,

        cognition:
            true,

        telemetry:
            true
    }
};

/* =========================================================
   SOVEREIGN RUNTIME API
========================================================= */

window.GestiaRuntime.sovereignRuntime = {

    hubs: {},

    isolateHub(

        hubId,

        reason = "UNKNOWN"

    ) {

        try {

            if (!hubId) {

                return false;
            }

            this.hubs[
                hubId
            ] ||= {};

            this.hubs[
                hubId
            ].isolated = true;

            this.hubs[
                hubId
            ].state =
                "ISOLATED";

            this.hubs[
                hubId
            ].reason =
                reason;

            this.hubs[
                hubId
            ].timestamp =
                Date.now();

            /* =============================================
               GLOBAL FEDERATION
            ============================================= */

            window.GestiaRuntime
                .setState(

                    "runtime.sovereign.isolationMode",

                    true
                );

            window.GestiaRuntime
                .setState(

                    "runtime.sovereign.recoveryMode",

                    true
                );

            window.GestiaRuntime
                .setState(

                    "runtime.sovereign.lastRecovery",

                    Date.now()
                );

            /* =============================================
               TELEMETRY
            ============================================= */

            window.GestiaRuntime.log(

                "[SOVEREIGN_HUB_ISOLATED]",

                {

                    hub:
                        hubId,

                    reason
                }
            );

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [SOVEREIGN_ISOLATION_FAIL]",

                error
            );

            return false;
        }
    }
    ,

validateHub(

    hubId

) {

    try {

        if (!hubId) {

            return {

                valid:
                    false,

                error:
                    "INVALID_HUB_ID"
            };
        }

        const hub =

            this.hubs?.[
                hubId
            ];

        /* =============================================
           HUB EXISTS
        ============================================= */

        if (!hub) {

            return {

                valid:
                    false,

                error:
                    "HUB_NOT_REGISTERED"
            };
        }

        /* =============================================
           ISOLATED
        ============================================= */

        if (

            hub.state ===
            "ISOLATED"

        ) {

            return {

                valid:
                    false,

                error:
                    "HUB_ISOLATED"
            };
        }

        /* =============================================
           VALID
        ============================================= */

        return {

            valid:
                true,

            hub:
                hubId,

            state:
                hub.state ||

                "ONLINE"
        };

    }

    catch(error) {

        console.error(

            "🚨 [SOVEREIGN_HUB_VALIDATION_FAIL]",

            error
        );

        return {

            valid:
                false,

            error:
                error.message
        };
    }
}

,

reintegrateHub(

    hubId

) {

    try {

        if (!hubId) {

            return {

                success:
                    false,

                error:
                    "INVALID_HUB_ID"
            };
        }

        const hub =

            this.hubs?.[
                hubId
            ];

        if (!hub) {

            return {

                success:
                    false,

                error:
                    "HUB_NOT_REGISTERED"
            };
        }

        /* =============================================
           HUB REINTEGRATION
        ============================================= */

        hub.isolated =
            false;

        hub.state =
            "ONLINE";

        hub.reintegrationTimestamp =

            Date.now();

        /* =============================================
           GLOBAL FEDERATION
        ============================================= */

        window.GestiaRuntime
            .setState(

                "runtime.sovereign.isolationMode",

                false
            );

        window.GestiaRuntime
            .setState(

                "runtime.sovereign.recoveryMode",

                false
            );

        /* =============================================
           TELEMETRY
        ============================================= */

        window.GestiaRuntime.log(

            "[SOVEREIGN_HUB_REINTEGRATED]",

            {

                hub:
                    hubId
            }
        );

        return {

            success:
                true,

            hub:
                hubId,

            state:
                "ONLINE"
        };

    }

    catch(error) {

        console.error(

            "🚨 [SOVEREIGN_REINTEGRATION_FAIL]",

            error
        );

        return {

            success:
                false,

            error:
                error.message
        };
    }
}
,

hydrateSovereignHubs() {

    try {

        const ownership =

            window
                .__MODULE_OWNERSHIP__ || {};

        const hubs = {};

        Object.entries(
            ownership
        ).forEach(([

            moduleId,

            meta

        ]) => {

            if (

                meta?.authority ||

                meta?.classification ===
                "authority_module"

            ) {

                hubs[
                    moduleId
                ] = {

                    id:
                        moduleId,

                    authority:
                        true,

                    scopes:
                        meta.scopes || [],

                    governance:

                        meta.governance ||

                        "NORMAL",

                    runtimeRole:

                        meta.runtimeRole ||

                        "unknown",

                    state:
                        "ONLINE",

                    hydrated:
                        true,

                    topologyDiscovered:
                        true,

                    registeredAt:

                        meta.registeredAt ||

                        Date.now()
                };
            }
        });

        this.hubs =
            hubs;

        window.GestiaRuntime.log(

            "[SOVEREIGN_HUBS_HYDRATED]",

            {

                total:

                    Object.keys(
                        hubs
                    ).length
            }
        );

        return {

            success:
                true,

            total:

                Object.keys(
                    hubs
                ).length,

            hubs
        };

    }

    catch(error) {

        console.error(

            "🚨 [SOVEREIGN_HYDRATION_FAIL]",

            error
        );

        return {

            success:
                false,

            error:
                error.message
        };
    }
}

,

runAutonomousGovernance() {

    try {

        const hubs =

            this.hubs || {};

        Object.entries(
            hubs
        ).forEach(([

            hubId,

            hub

        ]) => {

            const runtimeHealth =

                window
                    .__RUNTIME_HEALTH_MAP__?.[
                        hubId
                    ];

            if (!runtimeHealth) {

                return;
            }

            const health =

                runtimeHealth.health ||

                100;

            /* =============================================
               CRITICAL DEGRADATION
            ============================================= */

            if (

                health < 50 &&

                hub.state !==
                "ISOLATED"

            ) {

                console.warn(

                    `🚨 [AUTONOMOUS_ISOLATION]: ${hubId}`,

                    health
                );

                this.isolateHub(

                    hubId,

                    "AUTONOMOUS_RUNTIME_GOVERNANCE"
                );
            }

            /* =============================================
               RECOVERY DETECTED
            ============================================= */

            else if (

                health >= 80 &&

                hub.state ===
                "ISOLATED"

            ) {

                console.log(

                    `♻️ [AUTONOMOUS_REINTEGRATION]: ${hubId}`,

                    health
                );

                this.reintegrateHub(
                    hubId
                );
            }
        });

        return {

            success:
                true,

            total:

                Object.keys(
                    hubs
                ).length
        };

    }

    catch(error) {

        console.error(

            "🚨 [AUTONOMOUS_GOVERNANCE_FAIL]",

            error
        );

        return {

            success:
                false,

            error:
                error.message
        };
    }
}
};

/* =========================================================
   SOVEREIGN RUNTIME READY
========================================================= */

console.log(
    "🧠 [SOVEREIGN_RUNTIME_API] ONLINE"
);


/* =========================================================
   POLICY ENGINE
========================================================= */

window.GestiaRuntime.registerPolicy =
    function(

        name,

        validator

    ) {

        try {

            if (

                typeof validator !== "function"

            ) {

                throw new Error(
                    "INVALID_POLICY"
                );
            }

            window
                .GestiaRuntime
                .cognitive
                .orchestration
                .policies
                .push({

                    name,

                    validator,

                    createdAt:
                        Date.now()
                });

            window.GestiaRuntime.log(

                "[COGNITIVE_POLICY_REGISTERED]",

                { name }
            );

        }

        catch(error) {

            console.error(

                "🚨 [POLICY_REGISTER_FAIL]",

                error
            );
        }
    };

/* =========================================================
   POLICY VALIDATION
========================================================= */

window.GestiaRuntime.validatePolicies =
    async function(

        payload = {}

    ) {

        try {

            const policies =

                window
                    .GestiaRuntime
                    .cognitive
                    .orchestration
                    .policies;

            const results = [];

            for (

                const policy

                of policies

            ) {

                try {

                    const result =
                        await policy
                            .validator(
                                payload
                            );

                    results.push({

                        policy:
                            policy.name,

                        valid:
                            result === true
                    });

                }

                catch(policyError) {

                    results.push({

                        policy:
                            policy.name,

                        valid:
                            false,

                        error:
                            policyError
                                ?.message
                    });
                }
            }

            return results;

        }

        catch(error) {

            console.error(

                "🚨 [POLICY_VALIDATION_FAIL]",

                error
            );

            return [];
        }
    };

/* =========================================================
   COGNITIVE DECISION ENGINE
========================================================= */

window.GestiaRuntime.makeDecision =
    async function(

        context = {}

    ) {

        try {

            window.GestiaRuntime.log(

                "[COGNITIVE_DECISION_START]",

                context
            );

            /* =============================================
               VALIDATE POLICIES
            ============================================= */

            const policies =

                await window

                    .GestiaRuntime

                    .validatePolicies(
                        context
                    );

            /* =============================================
               DECISION
            ============================================= */

            const decision = {

                id:

                    window
                        .GestiaRuntime
                        .utils
                        .generateId(
                            "decision"
                        ),

                context,

                policies,

                approved:

                    policies.every(
                        p => p.valid
                    ),

                timestamp:
                    Date.now()
            };

            /* =============================================
               STORE
            ============================================= */

            window
                .GestiaRuntime
                .cognitive
                .orchestration
                .decisions
                .push(decision);

            /* =============================================
               TELEMETRY
            ============================================= */

            await window

                .GestiaRuntime

                .emitTelemetry(

                    "COGNITIVE_DECISION",

                    decision
                );

            window.GestiaRuntime.log(

                "[COGNITIVE_DECISION_COMPLETE]",

                decision
            );

            return decision;

        }

        catch(error) {

            console.error(

                "🚨 [COGNITIVE_DECISION_FAIL]",

                error
            );

            return null;
        }
    };

/* =========================================================
   ACTION ORCHESTRATOR
========================================================= */

window.GestiaRuntime.orchestrate =
    async function(

        action,

        payload = {}

    ) {

        try {

            window.GestiaRuntime.log(

                "[COGNITIVE_ORCHESTRATION_START]",

                {

                    action,

                    payload
                }
            );

            /* =============================================
               DECISION
            ============================================= */

            const decision =

                await window

                    .GestiaRuntime

                    .makeDecision({

                        action,

                        payload
                    });

            if (

                !decision?.approved

            ) {

                window
                    .GestiaRuntime
                    .captureWarning(

                        "COGNITIVE_ACTION_DENIED",

                        {

                            action
                        }
                    );

                return false;
            }

            /* =============================================
               EXECUTION
            ============================================= */

            await window

                .GestiaRuntime

                .emit(

                    "runtime:orchestration",

                    {

                        action,

                        payload,

                        decision
                    }
                );

            /* =============================================
               STORE
            ============================================= */

            window
                .GestiaRuntime
                .cognitive
                .orchestration
                .actions
                .push({

                    action,

                    payload,

                    timestamp:
                        Date.now()
                });

            window.GestiaRuntime.log(

                "[COGNITIVE_ORCHESTRATION_COMPLETE]",

                {

                    action
                }
            );

            return true;

        }

        catch(error) {

            console.error(

                "🚨 [COGNITIVE_ORCHESTRATION_FAIL]",

                error
            );

            return false;
        }
    };

/* =========================================================
   RUNTIME AWARENESS
========================================================= */

window.GestiaRuntime.runtimeAwareness =
    function() {

        try {

            return {

                runtime:

                    window
                        .GestiaRuntime
                        .runtimeHealth(),

                services:

                    Object.keys(

                        window
                            .GestiaRuntime
                            .services || {}
                    ),

                modules:

                    Object.keys(

                        window
                            .GestiaRuntime
                            .modules
                            ?.registry || {}
                    ),

                cognition:

                    window
                        .GestiaRuntime
                        .ai,

                telemetry:

                    {

                        events:

                            window
                                .GestiaRuntime
                                .telemetry
                                .runtime
                                .events
                                .length
                    }
            };

        }

        catch(error) {

            console.error(

                "🚨 [RUNTIME_AWARENESS_FAIL]",

                error
            );

            return null;
        }
    };

/* =========================================================
   SUPERVISOR LOOP
========================================================= */

window.GestiaRuntime.startSupervisor =
    function() {

        setInterval(

            async () => {

                try {

                    const awareness =

                        window
                            .GestiaRuntime
                            .runtimeAwareness();

                    /* =====================================
                       HEALTH VALIDATION
                    ===================================== */

                    if (

                        awareness
                            ?.runtime
                            ?.errors > 25

                    ) {

                        await window

                            .GestiaRuntime

                            .invokeAutofix({

                                reason:
                                    "HIGH_ERROR_RATE"
                            });
                    }

                    /* =====================================
                       COGNITIVE SIGNAL
                    ===================================== */

                    await window

                        .GestiaRuntime

                        .emitCognitiveSignal(

                            "runtime_supervision",

                            awareness
                        );

                    window.GestiaRuntime.log(

                        "[SUPERVISOR_CYCLE]"
                    );

                }

                catch(error) {

                    console.error(

                        "🚨 [SUPERVISOR_FAIL]",

                        error
                    );
                }

            },

            60000
        );
    };

/* =========================================================
   DEFAULT POLICIES
========================================================= */

window.GestiaRuntime.registerPolicy(

    "runtime_integrity",

    async () => {

        const health =

            window
                .GestiaRuntime
                .runtimeHealth();

        return health.errors < 100;
    }
);

window.GestiaRuntime.registerPolicy(

    "routing_integrity",

    async () => {

        return !window
            .GestiaRuntime
            .getState(
                "routing.locked"
            );
    }
);

/* =========================================================
   COGNITIVE START
========================================================= */

window.GestiaRuntime.startCognitiveLayer =
    async function() {

        try {

            window.GestiaRuntime.log(

                "[COGNITIVE_LAYER_START]"
            );

            /* =============================================
               SUPERVISOR
            ============================================= */

            window

                .GestiaRuntime

                .startSupervisor();

            /* =============================================
               SERVICE REGISTRY
            ============================================= */

            window
                .GestiaRuntime
                .services
                .cognitive = {

                    ready:
                        true
                };

            /* =============================================
               STATE
            ============================================= */

            window.GestiaRuntime.setState(

                "runtime.cognitiveReady",

                true
            );

            window.GestiaRuntime.log(

                "[COGNITIVE_LAYER_READY]"
            );

        }

        catch(error) {

            console.error(

                "🚨 [COGNITIVE_LAYER_FAIL]",

                error
            );
        }
    };

/* =========================================================
   COGNITIVE AUTO START
========================================================= */

window.addEventListener(

    "gestia:surface-ready",

    async () => {

        await window

            .GestiaRuntime

            .startCognitiveLayer();
    }
);

/* =========================================================
   COGNITIVE ORCHESTRATION ENGINE READY
========================================================= */

console.log(
    "👁️ [COGNITIVE_ORCHESTRATION_ENGINE] ONLINE"
);

/* =====================================================
   JARVIS SOVEREIGN CORE V2
===================================================== */

window.Jarvis ||= {

    runtime:
        window.GestiaRuntime ||

        null,

    cognition: {},

    memory: {},

    orchestrator: {},

    executor: {},

    telemetry: {},

    repair: {},

    snapshots: {},

    status: "INITIALIZING",

    initializedAt:
        Date.now()
};

/* =====================================================
   RUNTIME LINK
===================================================== */

window.Jarvis.runtime =
    window.GestiaRuntime;

/* =====================================================
   ONLINE STATUS
===================================================== */

window.Jarvis.status =
    "ONLINE";

console.log(
    "🧠 [JARVIS_SOVEREIGN_CORE] ONLINE",
    window.Jarvis
);
