window.bootstrapRuntimeCognition =
async function() {

    try {

        console.log(
            "🧠 [BOOT_HYDRATION_START]"
        );

        /* =================================================
           INIT DB
        ================================================= */

        await initRuntimePersistence();

        /* =================================================
           RESTORE SNAPSHOT
        ================================================= */

        await restoreRuntimeSnapshot();

        /* =================================================
           START HEALTH SCANNER
        ================================================= */

        startRuntimeHealthScanner();

        /* =================================================
           START SNAPSHOT DAEMON
        ================================================= */

        await startSnapshotDaemon();

        console.log(
            "✅ [BOOT_HYDRATION_COMPLETED]"
        );

        return {

            ok: true,

            cognition:
                "ONLINE"
        };

    }

    catch(error) {

        console.error(
            "❌ [BOOT_HYDRATION_FAIL]",
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
   COGNITIVE EVENT BUS V2
===================================================== */

window.__RUNTIME_EVENT_BUS__ = {

    /* =============================================
   DISPATCH QUEUE
============================================= */

dispatchQueue: {

    active: true,

    processing: false,

    maxQueueSize: 5000,

    totalQueued: 0,

    totalProcessed: 0,

    totalDropped: 0,

    lastProcessedAt: null,

    queues: {

        CRITICAL: [],

        HIGH: [],

        NORMAL: [],

        LOW: []
    }
},

    /* =============================================
       ACTIVE LISTENERS
    ============================================= */

    listeners: {},

    /* =============================================
       EVENT METRICS
    ============================================= */

    metrics: {

        emitted: 0,

        delivered: 0,

        errors: 0,

        replayed: 0,

        suppressed: 0,

        quarantined: 0
    },

    /* =============================================
       DISPATCH STATE
    ============================================= */

    dispatch: {

        active: true,

        paused: false,

        replayMode: false,

        lastDispatch: null
    },

    /* =============================================
       EVENT PRIORITIES
    ============================================= */

    priorities: {

        LOW: 1,

        NORMAL: 5,

        HIGH: 10,

        CRITICAL: 20
    },

    /* =============================================
       QUEUE PLACEHOLDERS
    ============================================= */

    queues: {

        LOW: [],

        NORMAL: [],

        HIGH: [],

        CRITICAL: []
    },

    /* =============================================
       RUNTIME GOVERNANCE
    ============================================= */

    governance: {

        suppressionEnabled: true,

        quarantineEnabled: true,

        replayEnabled: true,

        persistenceEnabled: true
    }
};


/* =====================================================
   RUNTIME CHANNEL STATE FACTORY V1
===================================================== */

window.createRuntimeChannelState =

function(

    channel

) {

    return {

        channel,

        /* =============================================
           EVENT METRICS
        ============================================= */

        emitted: 0,

        delivered: 0,

        errors: 0,

        /* =============================================
           HEALTH
        ============================================= */

        health: "ONLINE",

        quarantined: false,

        suppressed: false,

        /* =============================================
           TIMESTAMPS
        ============================================= */

        createdAt:
            Date.now(),

        lastEvent: null,

        lastError: null,

        lastRecovery: null,

        lastSuppression: null,

        lastQuarantine: null,

        /* =============================================
           FAILURE TRACKING
        ============================================= */

        failureStreak: 0,

        recoveryStreak: 0,

        suppressionCount: 0,

        quarantineCount: 0,

        /* =============================================
           GOVERNANCE
        ============================================= */

        cooldownUntil: null,

        governance: {

            autoRecover: true,

            autoSuppress: true,

            autoQuarantine: true
        }
    };
};
/* =====================================================
   EVENT CHANNEL METRICS V3
===================================================== */

window.__RUNTIME_EVENT_CHANNELS__ ||= {

    governance:

        createRuntimeChannelState(
            "governance"
        ),

    repair:

        createRuntimeChannelState(
            "repair"
        ),

    scanner:

        createRuntimeChannelState(
            "scanner"
        ),

    daemon:

        createRuntimeChannelState(
            "daemon"
        ),

    persistence:

        createRuntimeChannelState(
            "persistence"
        ),

    cognition:

        createRuntimeChannelState(
            "cognition"
        ),

    runtime:

        createRuntimeChannelState(
            "runtime"
        )
};
/* =====================================================
   EVENT CHANNEL ROUTING REGISTRY V2
===================================================== */

window.__RUNTIME_CHANNEL_ROUTING__ ||= {

    governance: [],

    repair: [],

    scanner: [],

    daemon: [],

    persistence: [],

    cognition: [],

    runtime: []
};

/* =====================================================
   EVENT PERSISTENCE LEDGER V3
===================================================== */

window.__RUNTIME_EVENT_LEDGER__ ||= {

    /* =============================================
       CORE STORAGE
    ============================================= */

    events: [],

    indexes: {},

    /* =============================================
       MEMORY METRICS
    ============================================= */

    totalPersisted: 0,

    totalPruned: 0,

    totalReplaySessions: 0,

    totalReplayedEvents: 0,

    totalQueries: 0,

    totalCorruptedEvents: 0,

    /* =============================================
       RETENTION
    ============================================= */

    maxEvents: 1000,

    retentionPolicy: {

        pruneOldest: true,

        preserveCritical: true,

        preserveGovernance: true,

        preserveReplayChains: true
    },

    /* =============================================
       TIMESTAMPS
    ============================================= */

    createdAt:
        Date.now(),

    persistedAt: null,

    lastReplay: null,

    lastPrune: null,

    lastQuery: null,

    /* =============================================
       MEMORY SESSIONS
    ============================================= */

    sessions: {

        currentSession:

            crypto.randomUUID(),

        previousSession:
            null,

        totalSessions: 1
    },

    /* =============================================
       REPLAY GOVERNANCE
    ============================================= */

    replay: {

        active: false,

        replayId: null,

        replayStartedAt: null,

        replayCompletedAt: null,

        replayFailures: 0
    },

    /* =============================================
       LEDGER HEALTH
    ============================================= */

    integrity: {

        corrupted: false,

        corruptionCount: 0,

        lastCorruption: null,

        lastIntegrityCheck: null
    },

    /* =============================================
       MEMORY GOVERNANCE
    ============================================= */

    governance: {

        persistenceEnabled: true,

        replayEnabled: true,

        pruningEnabled: true,

        integrityChecksEnabled: true
    }
};
/* =====================================================
   EVENT QUERY ENGINE V3
===================================================== */

window.queryRuntimeEvents =

function({

    eventType = null,

    channel = null,

    priority = null,

    source = null,

    daemon = null,

    correlationId = null,

    replayed = null,

    limit = 50,

    latest = true

} = {}) {

    try {

        let events = [

            ...window
                .__RUNTIME_EVENT_LEDGER__
                .events
        ];

        /* =============================================
           QUERY METRICS
        ============================================= */

        window
            .__RUNTIME_EVENT_LEDGER__
            .totalQueries++;

        window
            .__RUNTIME_EVENT_LEDGER__
            .lastQuery =
                Date.now();

        /* =============================================
           FILTER: EVENT TYPE
        ============================================= */

        if (

            eventType

        ) {

            events =

                events.filter(

                    (event) =>

                        event.type ===
                        eventType
                );
        }

        /* =============================================
           FILTER: CHANNEL
        ============================================= */

        if (

            channel

        ) {

            events =

                events.filter(

                    (event) =>

                        event.channel ===
                        channel
                );
        }

        /* =============================================
           FILTER: PRIORITY
        ============================================= */

        if (

            priority

        ) {

            events =

                events.filter(

                    (event) =>

                        event.priority ===
                        priority
                );
        }

        /* =============================================
           FILTER: SOURCE
        ============================================= */

        if (

            source

        ) {

            events =

                events.filter(

                    (event) =>

                        event.source ===
                        source
                );
        }

        /* =============================================
           FILTER: DAEMON
        ============================================= */

        if (

            daemon

        ) {

            events =

                events.filter(

                    (event) =>

                        event
                            .cognition
                            ?.daemon ===

                        daemon
                );
        }

        /* =============================================
           FILTER: CORRELATION ID
        ============================================= */

        if (

            correlationId

        ) {

            events =

                events.filter(

                    (event) =>

                        event
                            .causality
                            ?.correlationId ===

                        correlationId
                );
        }

        /* =============================================
           FILTER: REPLAYED
        ============================================= */

        if (

            replayed !== null

        ) {

            events =

                events.filter(

                    (event) =>

                        event
                            .replay
                            ?.replayed ===

                        replayed
                );
        }

        /* =============================================
           SORT LATEST
        ============================================= */

        events.sort(

            (a, b) =>

                latest

                    ? b.timestamp - a.timestamp

                    : a.timestamp - b.timestamp
        );

        /* =============================================
           LIMIT
        ============================================= */

        events =

            events.slice(
                0,
                limit
            );

        /* =============================================
           RESULT
        ============================================= */

        return {

            ok: true,

            total:
                events.length,

            filters: {

                eventType,
                channel,
                priority,
                source,
                daemon,
                correlationId,
                replayed,
                limit,
                latest
            },

            events
        };

    }

    catch(error) {

        console.error(
            "❌ [EVENT_QUERY_FAIL]",
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
   EVENT REPLAY ENGINE V3
===================================================== */

window.replayRuntimeEvents =

async function({

    channel = null,

    eventType = null,

    source = null,

    priority = null,

    daemon = null,

    correlationId = null,

    limit = 100,

    latest = false,

    replayListeners = false,

    simulateOnly = false

} = {}) {

    try {

        /* =============================================
           REPLAY SESSION
        ============================================= */

        const replayId =

            crypto.randomUUID();

        const replayTimestamp =
            Date.now();

        /* =============================================
           REPLAY GOVERNANCE
        ============================================= */

        window
            .__RUNTIME_EVENT_LEDGER__
            .replay
            .active = true;

        window
            .__RUNTIME_EVENT_LEDGER__
            .replay
            .replayId =
                replayId;

        window
            .__RUNTIME_EVENT_LEDGER__
            .replay
            .replayStartedAt =
                replayTimestamp;

        window
            .__RUNTIME_EVENT_LEDGER__
            .totalReplaySessions++;

        /* =============================================
           QUERY EVENTS
        ============================================= */

        const query =

            window.queryRuntimeEvents({

                channel,
                eventType,
                priority,
                source,
                daemon,
                correlationId,
                limit,
                latest
            });

        if (

            !query.ok

        ) {

            return query;
        }

        const replayed = [];

        let listenerExecutions = 0;

        let listenerFailures = 0;

        const reconstructedChannels =
            new Set();

        /* =============================================
           ENABLE REPLAY MODE
        ============================================= */

        window
            .__RUNTIME_EVENT_BUS__
            .dispatch
            .replayMode = true;

        /* =============================================
           REPLAY LOOP
        ============================================= */

        for (

            const originalEvent of
            query.events

        ) {

            try {

                reconstructedChannels.add(
                    originalEvent.channel
                );

                /* =====================================
                   REPLAY EVENT COPY
                ===================================== */

                const replayEvent =

                    structuredClone(
                        originalEvent
                    );

                replayEvent.replay = {

                    replayed: true,

                    replayId,

                    replayTimestamp
                };

                /* =====================================
                   OPTIONAL LISTENER REPLAY
                ===================================== */

                if (

                    replayListeners
                    &&
                    !simulateOnly

                ) {

                    const listeners =

                        window
                            .__RUNTIME_EVENT_BUS__
                            .listeners[
                                replayEvent.type
                            ] || [];

                    for (

                        const listenerObject of
                        listeners

                    ) {

                        try {

                            if (

                                !listenerObject.active

                            ) {

                                continue;
                            }

                            if (

                                listenerObject
                                    .replayAware ===
                                false

                            ) {

                                continue;
                            }

                            await listenerObject
                                .callback(

                                    replayEvent
                                );

                            listenerObject.executions++;

                            listenerObject.lastExecution =
                                Date.now();

                            listenerExecutions++;

                        }

                        catch(error) {

                            listenerObject.errors++;

                            listenerFailures++;

                            console.error(
                                "❌ [REPLAY_LISTENER_FAIL]",
                                {
                                    event:
                                        replayEvent.type,

                                    error
                                }
                            );
                        }
                    }
                }

                replayed.push({

                    eventId:
                        replayEvent.eventId,

                    type:
                        replayEvent.type,

                    channel:
                        replayEvent.channel,

                    priority:
                        replayEvent.priority,

                    source:
                        replayEvent.source,

                    replayId,

                    replayed: true,

                    timestamp:
                        replayEvent.timestamp
                });

                window
                    .__RUNTIME_EVENT_BUS__
                    .metrics
                    .replayed++;

                window
                    .__RUNTIME_EVENT_LEDGER__
                    .totalReplayedEvents++;

            }

            catch(error) {

                window
                    .__RUNTIME_EVENT_LEDGER__
                    .replay
                    .replayFailures++;

                console.error(
                    "❌ [EVENT_REPLAY_FAIL]",
                    error
                );
            }
        }

        /* =============================================
           DISABLE REPLAY MODE
        ============================================= */

        window
            .__RUNTIME_EVENT_BUS__
            .dispatch
            .replayMode = false;

        window
            .__RUNTIME_EVENT_LEDGER__
            .replay
            .active = false;

        window
            .__RUNTIME_EVENT_LEDGER__
            .replay
            .replayCompletedAt =
                Date.now();

        window
            .__RUNTIME_EVENT_LEDGER__
            .lastReplay =
                Date.now();

        /* =============================================
           RESULT
        ============================================= */

        const result = {

            ok: true,

            replayId,

            replayTimestamp,

            total:
                replayed.length,

            replayListeners,

            simulateOnly,

            listenerExecutions,

            listenerFailures,

            reconstructedChannels:
                [
                    ...reconstructedChannels
                ],

            replayed
        };

        console.log(
            "♻️ [EVENT_REPLAY_COMPLETED]",
            result
        );

        return result;

    }

    catch(error) {

        window
            .__RUNTIME_EVENT_BUS__
            .dispatch
            .replayMode = false;

        window
            .__RUNTIME_EVENT_LEDGER__
            .replay
            .active = false;

        console.error(
            "❌ [EVENT_REPLAY_ENGINE_FAIL]",
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
   SUBSCRIBE RUNTIME EVENT V2
===================================================== */

window.subscribeRuntimeEvent =

function(

    eventName,

    callback,

    options = {}

) {

    try {

        /* =============================================
           VALIDATION
        ============================================= */

        if (

            !eventName ||

            typeof callback !==
            "function"

        ) {

            return false;
        }

        /* =============================================
           EVENT LIST INITIALIZATION
        ============================================= */

        if (

            !window
                .__RUNTIME_EVENT_BUS__
                .listeners[
                    eventName
                ]

        ) {

            window
                .__RUNTIME_EVENT_BUS__
                .listeners[
                    eventName
                ] = [];
        }

        /* =============================================
           LISTENER METADATA
        ============================================= */

        const listenerObject = {

            callback,

            eventName,

            createdAt:
                Date.now(),

            priority:
                options.priority ||
                "NORMAL",

            passive:
                options.passive ||
                false,

            once:
                options.once ||
                false,

            daemon:
                options.daemon ||
                false,

            replayAware:
                options.replayAware !==
                false,

            source:
                options.source ||
                "runtime.listener",

            executions: 0,

            errors: 0,

            lastExecution: null,

            active: true
        };

        /* =============================================
           REGISTER LISTENER
        ============================================= */

        window
            .__RUNTIME_EVENT_BUS__
            .listeners[
                eventName
            ]
            .push(listenerObject);

        /* =============================================
           AUTO CHANNEL ROUTING
        ============================================= */

        const inferredChannel =

            eventName.includes(
                "governance"
            )

                ? "governance"

            : eventName.includes(
                "repair"
            )

                ? "repair"

            : eventName.includes(
                "scanner"
            )

                ? "scanner"

            : eventName.includes(
                "daemon"
            )

                ? "daemon"

            : eventName.includes(
                "persistence"
            )

                ? "persistence"

            : eventName.includes(
                "cognition"
            )

                ? "cognition"

            : "runtime";

        window
            .__RUNTIME_CHANNEL_ROUTING__[
                inferredChannel
            ]
            .push({

                eventName,

                listener:
                    listenerObject
            });

        console.log(
            "📡 [EVENT_SUBSCRIBED]",
            {

                event:
                    eventName,

                channel:
                    inferredChannel,

                priority:
                    listenerObject.priority,

                daemon:
                    listenerObject.daemon
            }
        );

        return true;

    }

    catch(error) {

        console.error(
            "❌ [EVENT_SUBSCRIBE_FAIL]",
            error
        );

        return false;
    }
};


/* =====================================================
   EVENT BUS TEST LISTENER
===================================================== */

subscribeRuntimeEvent(

    "runtime.snapshot.created",

    async function(event) {

        console.log(
            "📥 [EVENT_RECEIVED]",
            event
        );

        console.log(
            "📦 [EVENT_PAYLOAD]",
            event.payload
        );
    }
);


/* =====================================================
   GOVERNANCE CHANNEL LISTENER
===================================================== */

subscribeRuntimeEvent(

    "runtime.governance.recorded",

    async function(event) {

        console.log(
            "🛡️ [GOVERNANCE_CHANNEL]",
            event
        );

        console.log(
            "📊 [GOVERNANCE_METRICS]",
            window
                .__RUNTIME_EVENT_CHANNELS__
                .governance
        );
    }
);
/* =====================================================
   UNSUBSCRIBE RUNTIME EVENT V2
===================================================== */

window.unsubscribeRuntimeEvent =

function(

    eventName,
    callback = null

) {

    try {

        const listeners =

            window
                .__RUNTIME_EVENT_BUS__
                .listeners[
                    eventName
                ];

        /* =============================================
           NO LISTENERS
        ============================================= */

        if (

            !listeners

        ) {

            return false;
        }

        /* =============================================
           REMOVE ALL EVENT LISTENERS
        ============================================= */

        if (

            callback === null

        ) {

            window
                .__RUNTIME_EVENT_BUS__
                .listeners[
                    eventName
                ] = [];

            console.log(
                "📴 [ALL_EVENT_LISTENERS_REMOVED]",
                eventName
            );

            return true;
        }

        /* =============================================
           FILTER ACTIVE LISTENERS
        ============================================= */

        window
            .__RUNTIME_EVENT_BUS__
            .listeners[
                eventName
            ] =

            listeners.filter(

                (listenerObject) =>

                    listenerObject.callback !==
                    callback
            );

        /* =============================================
           CLEAN ROUTING REGISTRY
        ============================================= */

        for (

            const channel of

            Object.keys(

                window
                    .__RUNTIME_CHANNEL_ROUTING__
            )

        ) {

            window
                .__RUNTIME_CHANNEL_ROUTING__[
                    channel
                ] =

                window
                    .__RUNTIME_CHANNEL_ROUTING__[
                        channel
                    ]

                    .filter(

                        (route) =>

                            route.listener
                                ?.callback !==

                            callback
                    );
        }

        console.log(
            "📴 [EVENT_UNSUBSCRIBED]",
            {

                event:
                    eventName
            }
        );

        return true;

    }

    catch(error) {

        console.error(
            "❌ [EVENT_UNSUBSCRIBE_FAIL]",
            error
        );

        return false;
    }
};

/* =====================================================
   EMIT RUNTIME EVENT V3
===================================================== */

window.emitRuntimeEvent =

async function(

    eventName,
    payload = {},
    options = {}

) {

    try {

        /* =============================================
           EVENT ENVELOPE
        ============================================= */

        const eventEnvelope =

            createRuntimeEventEnvelope(

                eventName,
                payload,
                options
            );

        /* =============================================
           EVENT LISTENERS
        ============================================= */

        const listeners =

            window
                .__RUNTIME_EVENT_BUS__
                .listeners[
                    eventName
                ] || [];

        /* =============================================
           CHANNEL RESOLUTION
        ============================================= */

        const channel =

            eventEnvelope.channel ||
            "runtime";

        /* =============================================
           CHANNEL STATE
        ============================================= */

        const channelState =

            window
                .__RUNTIME_EVENT_CHANNELS__[
                    channel
                ];

        /* =============================================
           CHANNEL ROUTING LOOKUP
        ============================================= */

        const routedListeners =

            window
                .__RUNTIME_CHANNEL_ROUTING__[
                    channel
                ] || [];

        console.log(
            "🧠 [CHANNEL_ROUTING]",
            {
                channel,

                routed:
                    routedListeners.length
            }
        );

        /* =============================================
           QUARANTINE BLOCK
        ============================================= */

        if (

            channelState?.quarantined ===
            true

        ) {

            window
                .__RUNTIME_EVENT_BUS__
                .metrics
                .quarantined++;

            console.error(
                "☣️ [QUARANTINED_CHANNEL_BLOCKED]",
                channel
            );

            return {

                ok: false,

                blocked: true,

                quarantined: true,

                reason:
                    "CHANNEL_QUARANTINED",

                channel
            };
        }

        /* =============================================
           SUPPRESSION BLOCK
        ============================================= */

        if (

            channelState?.suppressed ===
            true

        ) {

            window
                .__RUNTIME_EVENT_BUS__
                .metrics
                .suppressed++;

            console.warn(
                "🔇 [SUPPRESSED_CHANNEL_BLOCKED]",
                channel
            );

            return {

                ok: false,

                blocked: true,

                suppressed: true,

                reason:
                    "CHANNEL_SUPPRESSED",

                channel
            };
        }

        /* =============================================
           CRITICAL BLOCK
        ============================================= */

        if (

            channelState?.health ===
            "CRITICAL"

        ) {

            console.error(
                "🛑 [CHANNEL_BLOCKED]",
                channel
            );

            return {

                ok: false,

                blocked: true,

                reason:
                    "CHANNEL_CRITICAL",

                channel
            };
        }

        /* =============================================
           BUS METRICS
        ============================================= */

        window
            .__RUNTIME_EVENT_BUS__
            .metrics
            .emitted++;

        window
            .__RUNTIME_EVENT_BUS__
            .dispatch
            .lastDispatch = Date.now();

        /* =============================================
           CHANNEL METRICS
        ============================================= */

        if (

            channelState

        ) {

            channelState.emitted++;

            channelState.lastEvent =
                Date.now();
        }

        /* =============================================
           EVENT LEDGER PERSISTENCE
        ============================================= */

        if (

            window
                .__RUNTIME_EVENT_BUS__
                .governance
                .persistenceEnabled

        ) {

            window
                .__RUNTIME_EVENT_LEDGER__
                .events
                .push(eventEnvelope);

            /* =========================================
               EVENT TYPE INDEX
            ========================================= */

            const eventType =

                eventEnvelope.type;

            if (

                !window
                    .__RUNTIME_EVENT_LEDGER__
                    .indexes[
                        eventType
                    ]

            ) {

                window
                    .__RUNTIME_EVENT_LEDGER__
                    .indexes[
                        eventType
                    ] = [];
            }

            window
                .__RUNTIME_EVENT_LEDGER__
                .indexes[
                    eventType
                ]
                .push(eventEnvelope);

            window
                .__RUNTIME_EVENT_LEDGER__
                .totalPersisted++;

            window
                .__RUNTIME_EVENT_LEDGER__
                .persistedAt =
                    Date.now();

            /* =========================================
               EVENT LEDGER LIMIT
            ========================================= */

            if (

                window
                    .__RUNTIME_EVENT_LEDGER__
                    .events
                    .length >

                window
                    .__RUNTIME_EVENT_LEDGER__
                    .maxEvents

            ) {

                window
                    .__RUNTIME_EVENT_LEDGER__
                    .events
                    .shift();

                window
                    .__RUNTIME_EVENT_LEDGER__
                    .totalPruned++;
            }
        }

        console.log(
            "📡 [EVENT_EMITTED]",
            eventEnvelope
        );



      /* =============================================
   EVENT QUEUE INSERTION
============================================= */

const priority =

    eventEnvelope.priority ||
    "NORMAL";

const queueSystem =

    window
        .__RUNTIME_EVENT_BUS__
        .dispatchQueue;

/* =============================================
   QUEUE VALIDATION
============================================= */

if (

    !queueSystem.queues[
        priority
    ]

) {

    queueSystem.totalDropped++;

    console.error(
        "❌ [INVALID_PRIORITY_QUEUE]",
        priority
    );

    return {

        ok: false,

        error:
            "INVALID_PRIORITY_QUEUE"
    };
}

/* =============================================
   QUEUE LIMIT PROTECTION
============================================= */

const totalQueuedEvents =

    Object.values(

        queueSystem.queues

    )

    .reduce(

        (acc, queue) =>

            acc + queue.length,

        0
    );

if (

    totalQueuedEvents >=
    queueSystem.maxQueueSize

) {

    queueSystem.totalDropped++;

    console.error(
        "🚨 [DISPATCH_QUEUE_FULL]"
    );

    return {

        ok: false,

        error:
            "DISPATCH_QUEUE_FULL"
    };
}

/* =============================================
   QUEUE EVENT
============================================= */

queueSystem
    .queues[
        priority
    ]
    .push({

        eventEnvelope,

        listeners,

        channelState,

        queuedAt:
            Date.now()
    });

queueSystem.totalQueued++;

console.log(
    "📥 [EVENT_QUEUED]",
    {

        event:
            eventName,

        priority,

        queueSize:

            queueSystem
                .queues[
                    priority
                ]
                .length
    }
);


/* =============================================
   AUTO DISPATCH TRIGGER
============================================= */

if (

    !queueSystem.processing

) {

    processRuntimeDispatchQueue()
        .catch(

            (error) => {

                console.error(
                    "❌ [AUTO_DISPATCH_FAIL]",
                    error
                );
            }
        );
}
/* =============================================
   ASYNCHRONOUS DELIVERY ENABLED
============================================= */

console.log(
    "⚡ [ASYNC_DISPATCH_ACTIVE]",
    {
        event:
            eventName,

        priority,

        channel
    }
);
        /* =============================================
           FINAL RESULT
        ============================================= */

        return {

            ok: true,

            event:
                eventName,

            eventId:
                eventEnvelope.eventId,

            channel,

            listeners:
                listeners.length,

            persisted: true
        };

    }

    catch(error) {

        console.error(
            "❌ [EVENT_EMIT_FAIL]",
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
   RUNTIME DISPATCH PROCESSOR V1
===================================================== */

window.processRuntimeDispatchQueue =

async function() {

    try {

        const queueSystem =

            window
                .__RUNTIME_EVENT_BUS__
                .dispatchQueue;

        /* =============================================
           PROCESSING LOCK
        ============================================= */

        if (

            queueSystem.processing

        ) {

            return {

                ok: false,

                reason:
                    "ALREADY_PROCESSING"
            };
        }

        queueSystem.processing =
            true;

        /* =============================================
           PRIORITY ORDER
        ============================================= */

        const priorityOrder = [

            "CRITICAL",

            "HIGH",

            "NORMAL",

            "LOW"
        ];

        let processed = 0;

        /* =============================================
           PROCESS LOOP
        ============================================= */

        for (

            const priority of
            priorityOrder

        ) {

            const queue =

                queueSystem
                    .queues[
                        priority
                    ];

            while (

                queue.length > 0

            ) {

                const queuedEvent =

                    queue.shift();

                if (

                    !queuedEvent

                ) {

                    continue;
                }

                const {

                    eventEnvelope,

                    listeners,

                    channelState

                } = queuedEvent;

                /* =====================================
                   PROCESS LISTENERS
                ===================================== */

                for (

                    const listenerObject of
                    listeners

                ) {

                    try {

                        if (

                            !listenerObject.active

                        ) {

                            continue;
                        }

                        if (

                            listenerObject.passive

                        ) {

                            continue;
                        }

                        await listenerObject
                            .callback(

                                eventEnvelope
                            );

                        listenerObject.executions++;

                        listenerObject.lastExecution =
                            Date.now();

                        /* =============================
                           ONCE CLEANUP
                        ============================= */

                        if (

                            listenerObject.once

                        ) {

                            listenerObject.active =
                                false;
                        }

                        /* =============================
                           DELIVERY METRICS
                        ============================= */

                        window
                            .__RUNTIME_EVENT_BUS__
                            .metrics
                            .delivered++;

                        if (

                            channelState

                        ) {

                            channelState.delivered++;
                        }

                    }

                    catch(error) {

                        listenerObject.errors++;

                        window
                            .__RUNTIME_EVENT_BUS__
                            .metrics
                            .errors++;

                        if (

                            channelState

                        ) {

                            channelState.errors++;
                        }

                        console.error(
                            "❌ [QUEUE_DELIVERY_FAIL]",
                            {
                                event:
                                    eventEnvelope.type,

                                listener:
                                    listenerObject
                                        .eventName,

                                error
                            }
                        );
                    }
                }

                processed++;

                queueSystem.totalProcessed++;

                queueSystem.lastProcessedAt =
                    Date.now();
            }
        }

        queueSystem.processing =
            false;

        console.log(
            "⚙️ [DISPATCH_QUEUE_PROCESSED]",
            {
                processed
            }
        );

        return {

            ok: true,

            processed
        };

    }

    catch(error) {

        window
            .__RUNTIME_EVENT_BUS__
            .dispatchQueue
            .processing = false;

        console.error(
            "❌ [DISPATCH_PROCESSOR_FAIL]",
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
   AUTO HYDRATION
===================================================== */

window.addEventListener(
    "load",

    async function() {

        try {

            console.log(
                "🧠 [AUTO_REPO_HYDRATION]"
            );

            /* =================================================
               INIT RUNTIME PERSISTENCE
            ================================================= */

            await initRuntimePersistence();

            /* =================================================
               BOOTSTRAP REPO COGNITION
            ================================================= */


            await bootstrapRepoCognition();

await import(
    "./gestia-core/repair-translator.engine.js?v=" +
    Date.now()
);

console.log(
    "🧠 [REPAIR_TRANSLATOR_LOADED]"
);

            await bootstrapRepoCognition();


            await import(
    "./gestia-core/repo/resource.registry.js?v=" +
    Date.now()
);

console.log(
    "🧠 [RESOURCE_REGISTRY_LOADED]"
);



            /* =================================================
               BOOTSTRAP RUNTIME COGNITION
            ================================================= */

            await bootstrapRuntimeCognition();

            /* =====================================================
   HYBRID COGNITION RUNTIME EXPOSURE
===================================================== */

try {

    console.log(
        "🧠 [HYBRID_COGNITION_EXPOSURE]"
    );

    /* =================================================
       LOAD BRAIN ENGINE
    ================================================= */

    const brainModule =

        await import(
            "./gestia-core/brain.engine.js"
        );

    console.log(
        "✅ [BRAIN_ENGINE_RUNTIME]"
    );

    /* =================================================
       LOAD SEMANTIC ENGINE
    ================================================= */

    const semanticModule =

        await import(
            "./gestia-core/semantic.engine.js"
        );

    console.log(
        "✅ [SEMANTIC_ENGINE_RUNTIME]"
    );

    /* =================================================
       LOAD GESTIA CORE
    ================================================= */

    const gestiaCoreModule =

        await import(
            "./gestia-core/gestia-core.js"
        );

    console.log(
        "✅ [GESTIA_CORE_RUNTIME]"
    );

    /* =================================================
       GLOBAL EXPOSURE
    ================================================= */

    const reasoningFn =

        brainModule
            ?.runCognitiveReasoning ||

        brainModule
            ?.invocarArquitectoIA ||

        null;

    if (

        reasoningFn

    ) {

        window.runCognitiveReasoning =
            reasoningFn;

        console.log(
            "✅ [REASONING_EXPOSED]"
        );
    }

    /* =================================================
       SEMANTIC STATE
    ================================================= */

    const semanticStateFn =

        semanticModule
            ?.getSemanticCognitiveState ||

        null;

    if (

        semanticStateFn

    ) {

        window.getSemanticCognitiveState =
            semanticStateFn;

        console.log(
            "✅ [SEMANTIC_STATE_EXPOSED]"
        );
    }

    /* =================================================
       GESTIA CORE
    ================================================= */

    const GestiaCore =

        gestiaCoreModule
            ?.GestiaCore ||

        gestiaCoreModule
            ?.default ||

        null;

    if (

        GestiaCore

    ) {

        window.GestiaCore =
            GestiaCore;

        console.log(
            "✅ [GESTIA_CORE_EXPOSED]"
        );
    }

    /* =================================================
       COGNITIVE RUNTIME STATE
    ================================================= */

    window.__HYBRID_COGNITION_RUNTIME__ = {

        online: true,

        initializedAt:
            Date.now(),

        modules: {

            brain:
                !!brainModule,

            semantic:
                !!semanticModule,

            core:
                !!gestiaCoreModule
        },

        globals: {

            GestiaCore:
                !!window.GestiaCore,

            reasoning:
                !!window
                    .runCognitiveReasoning,

            semantic:
                !!window
                    .getSemanticCognitiveState
        }
    };

    /* =================================================
       COGNITIVE EVENT
    ================================================= */

    if (

        typeof emitRuntimeEvent ===
        "function"

    ) {

        await emitRuntimeEvent(

            "cognition.hybrid.runtime.online",

            {

                runtime:
                    "hybrid_cognition",

                online:
                    true,

                timestamp:
                    Date.now()
            },

            {

                priority:
                    "HIGH",

                channel:
                    "cognition"
            }
        );
    }

    console.table({

        GestiaCore:
            !!window.GestiaCore,

        reasoning:
            !!window
                .runCognitiveReasoning,

        semantic:
            !!window
                .getSemanticCognitiveState
    });

    console.log(
        "🚀 [HYBRID_COGNITION_RUNTIME] ONLINE"
    );

}

catch(error) {

    console.error(
        "❌ [HYBRID_RUNTIME_EXPOSURE_FAIL]",
        error
    );

    window
        .__HYBRID_COGNITION_RUNTIME__ = {

            online: false,

            error:
                error.message,

            crashedAt:
                Date.now()
        };
}

        }

        catch(error) {

            console.warn(
                "⚠️ AUTO_HYDRATION_FAIL:",
                error
            );
        }
    }
);
