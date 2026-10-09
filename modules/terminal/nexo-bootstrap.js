import { readSemanticStream, semanticFailurePresentation, JARVIS_PRIVATE_RELAY, validateJarvisRelayRequest, jarvisRelayPresenceIsLive, relayTimestampMs } from "../../gestia-core/jarvis/jarvis.semantic.transport.js";
/*
 * ======================================================================================
 * JARVIS TERMINAL BOOTSTRAP — HISTORICAL NEXO FILENAME ONLY
 * ======================================================================================
 * Se carga antes del core mediante proposal-state.js.
 * Única identidad activa: JARVIS.
 * Este path histórico permanece sólo por compatibilidad de Hosting/caché.
 * No instala cerebro, identidad ni autoridad NEXO.
 * ======================================================================================
 */

export const JARVIS_TERMINAL_BOOTSTRAP_VERSION =
    "1.17.0-private-firestore-relay";
export const NEXO_TERMINAL_BOOTSTRAP_VERSION =
    JARVIS_TERMINAL_BOOTSTRAP_VERSION; // compatibility export only

const INSTALL_KEY = "__JARVIS_TERMINAL_BOOTSTRAP__";
const LOCAL_BRIDGE_BASE_URL = "http://localhost:3344";
let runtimeContractPromise = null;

function runtimeContractUrl() {
    return new URL(
        "../../jarvis-runtime-contract.json",
        import.meta.url
    ).toString();
}

async function readRuntimeContract() {
    if (!runtimeContractPromise) {
        runtimeContractPromise = (async () => {
            const response = await globalThis.fetch(
                runtimeContractUrl(),
                {
                    method: "GET",
                    cache: "no-store"
                }
            );
            if (!response?.ok) {
                throw new Error(
                    `JARVIS_RUNTIME_CONTRACT_HTTP_${response?.status || 0}`
                );
            }
            const contract = await response.json();
            const releaseId = String(
                contract?.releaseId || ""
            ).trim();
            if (!releaseId) {
                throw new Error("JARVIS_RUNTIME_RELEASE_ID_REQUIRED");
            }
            return {
                ...contract,
                releaseId
            };
        })().catch(error => {
            runtimeContractPromise = null;
            throw error;
        });
    }
    return runtimeContractPromise;
}

// Private beta relay. It uses the existing Firebase web session, not CLI
// credentials. Only the authenticated owner can submit or read these records.
const PRIVATE_RELAY_WORKSTATION_KEY = "jarvis.privateRelay.workstation.v1";
const SEMANTIC_TRANSPORT_SILENCE_MS = 45000;
let privateRelaySdkPromise;

export function shouldUseJarvisPrivateRelay({
    publicOrigin = false,
    privateRelayEnabled = false,
    workstationEnabled = false,
    relayState = null,
    brokerActive = false
} = {}) {
    if (!publicOrigin || privateRelayEnabled !== true) return false;
    if (!workstationEnabled) return true;
    if (brokerActive) return false;
    return relayState?.status === "STANDBY";
}

export function createJarvisTransportSilenceWatchdog(
    controller,
    { silenceMs = SEMANTIC_TRANSPORT_SILENCE_MS, onStall = () => {} } = {}
) {
    let timer = null, stalled = false;
    const arm = () => {
        if (stalled) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            stalled = true;
            onStall();
            controller.abort();
        }, Math.max(1, Number(silenceMs) || SEMANTIC_TRANSPORT_SILENCE_MS));
    };
    return {
        start: arm,
        touch: arm,
        clear() { clearTimeout(timer); timer = null; },
        get stalled() { return stalled; }
    };
}
async function privateRelayDependencies() {
    if (!privateRelaySdkPromise) privateRelaySdkPromise = Promise.all([
        import("../../firebase.js"),
        import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js")
    ]).then(([firebase, sdk]) => ({ auth: firebase.auth, db: firebase.db, sdk })).catch(error => {
        privateRelaySdkPromise = null; throw error;
    });
    return privateRelaySdkPromise;
}

export function createJarvisPrivateRelayClient({ auth, db, sdk, now = Date.now,
    uuid = () => globalThis.crypto.randomUUID(), onProgress = () => {},
    pollIntervalMs = 5000, receiptSilenceMs = 15000, pollReadTimeoutMs = 10000 }) {
    const policy = JARVIS_PRIVATE_RELAY;
    return {
        async requestJson(route, payload, { contract, signal } = {}) {
            await auth.authStateReady?.();
            if (auth.currentUser?.uid !== policy.ownerUid) throw new Error("JARVIS_RELAY_OWNER_REQUIRED");
            if (!policy.routes.includes(route)) throw new Error("JARVIS_RELAY_LOCAL_OPERATION_REQUIRED");
            signal?.throwIfAborted();
            const parent = sdk.doc(db, policy.collection, policy.ownerUid);
            const live = await sdk.getDocFromServer(parent);
            if (!jarvisRelayPresenceIsLive(live.data(), contract.releaseId, now())) throw new Error("JARVIS_RELAY_WORKSTATION_UNAVAILABLE");
            const body = JSON.stringify(payload || {});
            if (new TextEncoder().encode(body).length > policy.maxBytes) throw new Error("JARVIS_RELAY_PAYLOAD_TOO_LARGE");
            const requestId = uuid(), ref = sdk.doc(parent, "requests", requestId);
            const request = { schemaVersion: policy.version, ownerUid: policy.ownerUid, requestId,
                route, releaseId: contract.releaseId, body, state: "QUEUED", createdAt: sdk.serverTimestamp(),
                expiresAt: sdk.Timestamp.fromMillis(now() + policy.queueMaxAgeMs) };
            let accepted = false, lastPresence = live.data(), settled = false, created = false;
            let lastReceiptSignalAt = now(), pollingReceipt = false;
            let unwatchJob = () => {}, unwatchWorker = () => {}, timer;
            const result = new Promise((resolve, reject) => {
                const finish = (error, value) => {
                    if (settled) return; settled = true;
                    clearInterval(timer); unwatchJob(); unwatchWorker(); signal?.removeEventListener("abort", abort);
                    if (error) { error.requestId = requestId; error.executionStarted = accepted ? true : null; reject(error); }
                    else resolve(value);
                };
                const consumeReceipt = (data, source = "listener") => {
                    if (!data || typeof data !== "object" || settled) return;
                    lastReceiptSignalAt = now();
                    if (data.requestId !== requestId || data.ownerUid !== policy.ownerUid) {
                        finish(new Error("JARVIS_RELAY_RECEIPT_INVALID"));
                        return;
                    }
                    if (data.state === "RUNNING") {
                        accepted = true;
                        onProgress({
                            ...(data.progress || { type: "progress", stage: "planning", requestId, noDeadline: true }),
                            transportSource: source
                        });
                    }
                    if (data.state === "FAILED") {
                        finish(new Error(data.error || "JARVIS_RELAY_RESULT_UNCONFIRMED"));
                        return;
                    }
                    if (data.state === "COMPLETED") {
                        try {
                            const value = JSON.parse(data.result);
                            if (value?.relay?.requestId !== requestId) throw new Error("JARVIS_RELAY_RECEIPT_INVALID");
                            finish(null, value);
                        } catch (error) { finish(error); }
                    }
                };
                const boundedServerRead = target => new Promise((resolveRead, rejectRead) => {
                    let done = false;
                    const timeout = setTimeout(() => {
                        if (done) return;
                        done = true;
                        rejectRead(new Error("JARVIS_RELAY_POLL_READ_STALLED"));
                    }, Math.max(1000, Number(pollReadTimeoutMs) || 10000));
                    Promise.resolve(sdk.getDocFromServer(target)).then(value => {
                        if (done) return;
                        done = true; clearTimeout(timeout); resolveRead(value);
                    }, error => {
                        if (done) return;
                        done = true; clearTimeout(timeout); rejectRead(error);
                    });
                });
                const pollServerReceipt = async () => {
                    if (settled || pollingReceipt) return;
                    pollingReceipt = true;
                    try {
                        const [jobRead, presenceRead] = await Promise.allSettled([
                            boundedServerRead(ref),
                            boundedServerRead(parent)
                        ]);
                        let presenceConfirmed = false;
                        if (presenceRead.status === "fulfilled" && presenceRead.value?.exists?.()) {
                            lastPresence = presenceRead.value.data();
                            presenceConfirmed = true;
                        }
                        if (jobRead.status === "fulfilled" && jobRead.value?.exists?.()) {
                            consumeReceipt(jobRead.value.data(), "server_poll");
                        }
                        if (settled) return;
                        if (auth.currentUser?.uid !== policy.ownerUid) {
                            finish(new Error("JARVIS_RELAY_OWNER_REQUIRED"));
                        } else if (presenceConfirmed && !jarvisRelayPresenceIsLive(lastPresence, contract.releaseId, now())) {
                            finish(new Error("JARVIS_RELAY_RESULT_UNCONFIRMED"));
                        } else if (!accepted && now() > request.expiresAt.toMillis()) {
                            finish(new Error("JARVIS_RELAY_REQUEST_EXPIRED"));
                        } else if (jobRead.status === "rejected" || presenceRead.status === "rejected") {
                            onProgress({ type: "progress", stage: "relay_server_poll_wait", requestId, noDeadline: true });
                        }
                    } finally {
                        pollingReceipt = false;
                    }
                };
                const abort = () => finish(new Error(accepted ? "JARVIS_RELAY_RESULT_UNCONFIRMED" : "JARVIS_RELAY_REQUEST_CANCELLED"));
                signal?.addEventListener("abort", abort, { once: true });
                unwatchJob = sdk.onSnapshot(ref, snapshot => {
                    if (snapshot.metadata?.fromCache || !snapshot.exists()) return;
                    consumeReceipt(snapshot.data(), "listener");
                }, error => {
                    onProgress({ type: "progress", stage: "relay_listener_recovering", requestId, noDeadline: true,
                        error: String(error?.code || "listener").slice(0, 80) });
                });
                unwatchWorker = sdk.onSnapshot(parent, snapshot => {
                    if (!snapshot.metadata?.fromCache) lastPresence = snapshot.data();
                }, error => {
                    onProgress({ type: "progress", stage: "relay_presence_recovering", requestId, noDeadline: true,
                        error: String(error?.code || "listener").slice(0, 80) });
                });
                timer = setInterval(() => {
                    if (settled) return;
                    if (auth.currentUser?.uid !== policy.ownerUid) {
                        finish(new Error("JARVIS_RELAY_OWNER_REQUIRED"));
                        return;
                    }
                    if (!accepted && now() > request.expiresAt.toMillis()) {
                        finish(new Error("JARVIS_RELAY_REQUEST_EXPIRED"));
                        return;
                    }
                    const silence = now() - lastReceiptSignalAt;
                    if (silence >= Math.max(1, Number(receiptSilenceMs) || 15000) ||
                        !jarvisRelayPresenceIsLive(lastPresence, contract.releaseId, now())) {
                        void pollServerReceipt();
                    }
                }, Math.max(5, Number(pollIntervalMs) || 5000));
                // No inference deadline while the worker reports progress. Polling
                // only recovers a lost Firestore listener and never replays work.
                sdk.setDoc(ref, request).then(() => {
                    created = true;
                    lastReceiptSignalAt = now();
                    if (settled && !accepted) sdk.updateDoc(ref, { state: "CANCELLED", finishedAt: sdk.serverTimestamp() }).catch(() => {});
                    if (!settled) onProgress({ type: "progress", stage: "relay_queued", requestId, noDeadline: true });
                }).catch(error => finish(new Error("JARVIS_RELAY_SUBMISSION_FAILED:" + (error.code || "unknown"))));
            });
            try { return await result; }
            catch (error) {
                if (created && !accepted) sdk.updateDoc(ref, { state: "CANCELLED", finishedAt: sdk.serverTimestamp() }).catch(() => {});
                throw error;
            }
        }
    };
}

export async function startJarvisBrowserRelay({ auth, db, sdk, contract, requestLocal,
    now = Date.now, uuid = () => globalThis.crypto.randomUUID(), onState = () => {} }) {
    const policy = JARVIS_PRIVATE_RELAY;
    await auth.authStateReady?.();
    if (auth.currentUser?.uid !== policy.ownerUid) throw new Error("JARVIS_RELAY_OWNER_REQUIRED");
    const parent = sdk.doc(db, policy.collection, policy.ownerUid), jobs = sdk.collection(parent, "requests");
    const workerId = uuid(), pending = new Map();
    let stopped = false, busy = false, unsubscribe, timer, lastHeartbeat = 0;
    const health = await requestLocal("/workstation/health", {}, { timeoutMs: 4000 });
    if (health?.ok !== true || health.status !== "JARVIS_WORKSTATION_LIVE" || !health.runtime?.bridgeStarted) {
        throw new Error("JARVIS_RELAY_LOCAL_HEALTH_REQUIRED");
    }
    const heartbeat = async () => {
        if (stopped || auth.currentUser?.uid !== policy.ownerUid) throw new Error("JARVIS_RELAY_OWNER_REQUIRED");
        const local = await requestLocal("/workstation/health", {}, { timeoutMs: 4000 });
        if (local?.ok !== true || local.status !== "JARVIS_WORKSTATION_LIVE") throw new Error("JARVIS_RELAY_LOCAL_HEALTH_REQUIRED");
        await sdk.runTransaction(db, async tx => {
            const prior = (await tx.get(parent)).data();
            if (
                prior?.workerId &&
                prior.workerId !== workerId &&
                jarvisRelayPresenceIsLive(
                    prior,
                    contract.releaseId,
                    now()
                )
            ) {
                throw new Error("JARVIS_RELAY_LEASE_HELD");
            }
            tx.set(parent, { schemaVersion: policy.version, ownerUid: policy.ownerUid, workerId, online: true,
                releaseId: contract.releaseId, heartbeatAt: sdk.serverTimestamp(),
                loadedHead: String(local.runtime?.loadedHead || "").slice(0, 64) });
        });
        lastHeartbeat = now(); onState({ status: "READY", workerId, loadedHead: local.runtime?.loadedHead });
    };
    const complete = async (ref, result, error = null) => {
        await sdk.updateDoc(ref, { state: error ? "FAILED" : "COMPLETED", result: result ? JSON.stringify(result) : null,
            error, body: sdk.deleteField(), finishedAt: sdk.serverTimestamp() });
    };
    const execute = async ref => {
        let job, approved;
        const claimed = await sdk.runTransaction(db, async tx => {
            const snapshot = await tx.get(ref), lease = await tx.get(parent);
            job = snapshot.data();
            if (job?.state !== "QUEUED" || lease.data()?.workerId !== workerId) return false;
            try { approved = validateJarvisRelayRequest(job, { requestId: ref.id, releaseId: contract.releaseId, now: now() }); }
            catch (error) {
                tx.update(ref, { state: "FAILED", workerId, error: error.message,
                    finishedAt: sdk.serverTimestamp(), body: sdk.deleteField() });
                return false;
            }
            tx.update(ref, { state: "RUNNING", workerId, startedAt: sdk.serverTimestamp() });
            return true;
        });
        if (!claimed) return;
        onState({ status: "EXECUTING", workerId, requestId: ref.id, route: approved.route });
        console.info("[JARVIS_PRIVATE_RELAY_RECEIVED]", { requestId: ref.id, route: approved.route });
        let result, error = null, lastProgressAt = 0;
        try {
            // Session facts are stamped by this authenticated gateway after
            // envelope validation. They describe limits; they never grant rights.
            const localPayload = approved.route === "/semantic/plan" ? {
                ...approved.payload,
                missionState: { ...approved.payload.missionState, runtimeTransport: {
                    name: "FIRESTORE_PRIVATE", allowedRoutes: [...policy.routes],
                    writesAllowed: false, publicationAllowed: false, remoteMediaAllowed: false
                } }
            } : approved.payload;
            const value = await requestLocal(approved.route, localPayload, {
                privateRelayExecution: true,
                onProgress(frame) {
                    if (now() - lastProgressAt < 10000) return;
                    lastProgressAt = now();
                    sdk.updateDoc(ref, { progress: { type: "progress", stage: String(frame.stage || "planning").slice(0, 80),
                        elapsedMs: Number(frame.elapsedMs) || 0, generatedChars: Number(frame.generatedChars) || 0,
                        noDeadline: true, requestId: ref.id } }).catch(() => {});
                }
            });
            result = { ...value, relay: { requestId: ref.id, workerId, transport: "FIRESTORE_PRIVATE", executionStarted: true } };
            if (new TextEncoder().encode(JSON.stringify(result)).length > policy.maxBytes) throw new Error("JARVIS_RELAY_RESPONSE_TOO_LARGE");
        } catch (failure) { error = String(failure.code || failure.message || "JARVIS_RELAY_RESULT_UNCONFIRMED").slice(0, 240); result = null; }
        // A failed result delivery retries only this immutable receipt, never
        // the local operation. No result implies success until Firestore ACKs.
        let published = false;
        for (let attempt = 0; attempt < 3 && !stopped; attempt++) {
            try { await complete(ref, result, error); published = true; break; }
            catch {
                const receipt = await sdk.getDocFromServer(ref).catch(() => null);
                const data = receipt?.data();
                if (data?.workerId === workerId && data.state === (error ? "FAILED" : "COMPLETED") &&
                    data.result === (result ? JSON.stringify(result) : null) && data.error === error) {
                    published = true; break;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
        onState({ status: published ? "READY" : "RESULT_UNCONFIRMED", workerId,
            lastCompletedRequestId: published ? ref.id : null, requestId: ref.id });
        console.info("[JARVIS_PRIVATE_RELAY_RESULT]", { requestId: ref.id, published });
    };
    const pump = async () => {
        if (busy || stopped || now() - lastHeartbeat > policy.offlineMs) return;
        busy = true;
        try {
            while (pending.size && !stopped) {
                const [id, ref] = pending.entries().next().value; pending.delete(id);
                try { await execute(ref); }
                catch (error) { onState({ status: "RECONNECTING", workerId, error: error.code || error.message }); }
            }
        } finally { busy = false; }
    };
    const attach = () => {
        if (stopped || unsubscribe) return;
        unsubscribe = sdk.onSnapshot(sdk.query(jobs, sdk.where("state", "==", "QUEUED"), sdk.limit(16)), snapshot => {
            if (snapshot.metadata?.fromCache) return;
            for (const doc of snapshot.docs) pending.set(doc.id, doc.ref);
            void pump();
        }, error => { unsubscribe = null; onState({ status: "RECONNECTING", workerId, error: error.code || "listener" }); });
    };
    await heartbeat();
    // Interrupted operations are never replayed automatically after a page
    // reload or loss of the workstation session.
    const interrupted = await sdk.getDocs(sdk.query(jobs, sdk.where("state", "==", "RUNNING"), sdk.limit(16)));
    for (const doc of interrupted.docs) if (doc.data().workerId !== workerId) {
        await sdk.updateDoc(doc.ref, { state: "FAILED", resolvedBy: workerId,
            error: "JARVIS_RELAY_RESULT_UNCONFIRMED_NO_REPLAY", finishedAt: sdk.serverTimestamp(), body: sdk.deleteField() });
    }
    attach();
    let maintaining = false, lastCleanup = 0;
    timer = setInterval(async () => {
        if (maintaining || stopped) return;
        maintaining = true;
        try {
            await heartbeat(); attach(); void pump();
            if (now() - lastCleanup > 300000) {
                lastCleanup = now();
                const old = await sdk.getDocs(sdk.query(jobs, sdk.where("finishedAt", "<", sdk.Timestamp.fromMillis(now() - 3600000)), sdk.limit(24)));
                for (const doc of old.docs) await sdk.deleteDoc(doc.ref);
            }
        } catch (error) { onState({ status: "RECONNECTING", workerId, error: error.code || error.message }); }
        finally { maintaining = false; }
    }, policy.heartbeatMs);
    return { workerId,
        async stop() {
            stopped = true; clearInterval(timer); unsubscribe?.();
            try { await sdk.runTransaction(db, async tx => { const value = (await tx.get(parent)).data();
                if (value?.workerId === workerId) tx.update(parent, { online: false, heartbeatAt: sdk.serverTimestamp() }); }); } catch {}
            onState({ status: "STOPPED", workerId });
        }
    };
}

function privateRelayWorkstationEnabled() {
    try { return globalThis.localStorage?.getItem(PRIVATE_RELAY_WORKSTATION_KEY) === JARVIS_PRIVATE_RELAY.ownerUid; }
    catch { return false; }
}

function configureJarvisPrivateRelay(bridge) {
    const direct = bridge.requestJson.bind(bridge);
    let client, broker, starting, autoRetry, lastRelayError;
    bridge.privateRelayState = { status: "NOT_CHECKED", connected: false };
    const progress = detail => globalThis.dispatchEvent?.(new CustomEvent("jarvis:semantic-progress", { detail }));
    bridge.enablePrivateRelay = async () => {
        if (broker) return bridge.privateRelayState;
        if (starting) return starting;
        starting = (async () => {
            const dependencies = await privateRelayDependencies(), contract = await readRuntimeContract();
            if (contract.privateRelayEnabled !== true) throw new Error("JARVIS_RELAY_NOT_ENABLED");
            broker = await startJarvisBrowserRelay({ ...dependencies, contract, requestLocal: direct,
                onState: state => { bridge.privateRelayState = { ...state, connected: state.status === "READY" || state.status === "EXECUTING" }; } });
            globalThis.localStorage?.setItem(PRIVATE_RELAY_WORKSTATION_KEY, JARVIS_PRIVATE_RELAY.ownerUid);
            return bridge.privateRelayState;
        })().finally(() => { starting = null; });
        return starting;
    };
    bridge.disablePrivateRelay = async () => {
        clearTimeout(autoRetry);
        globalThis.localStorage?.removeItem(PRIVATE_RELAY_WORKSTATION_KEY);
        await broker?.stop(); broker = null;
    };
    bridge.requestJson = async (route, payload = {}, options = {}) => {
        const contract = await readRuntimeContract();
        const publicOrigin = ["fixgo-44e4d.web.app", "fixgo-44e4d.firebaseapp.com"].includes(globalThis.location?.hostname);
        const workstationEnabled = privateRelayWorkstationEnabled();
        const useRelay = shouldUseJarvisPrivateRelay({
            publicOrigin,
            privateRelayEnabled: contract.privateRelayEnabled === true,
            workstationEnabled,
            relayState: bridge.privateRelayState,
            brokerActive: Boolean(broker)
        });
        if (!useRelay) {
            return direct(route, payload, options);
        }
        if (!client) client = createJarvisPrivateRelayClient({ ...await privateRelayDependencies(), onProgress: progress });
        let result;
        try {
            result = await client.requestJson(route, payload, { ...options, contract });
        } catch (error) {
            const code = String(error?.code || error?.message || "");
            if (code !== "JARVIS_RELAY_WORKSTATION_UNAVAILABLE") throw error;
            // The prior lease can disappear between STANDBY detection and the
            // first request. WORKSTATION_UNAVAILABLE happens before the relay
            // request is created, so taking the lease here cannot replay work.
            try {
                await bridge.enablePrivateRelay();
            } catch (takeoverError) {
                const takeoverCode = String(takeoverError?.code || takeoverError?.message || "");
                if (takeoverCode !== "JARVIS_RELAY_LEASE_HELD") throw takeoverError;
                bridge.privateRelayState = {
                    status: "STANDBY",
                    connected: false,
                    error: takeoverCode
                };
            }
            if (broker) {
                return direct(route, payload, options);
            }
            await new Promise(resolve => setTimeout(resolve, 250));
            result = await client.requestJson(route, payload, { ...options, contract });
        }
        bridge.privateRelayState = { status: "RESPONSE_RECEIVED", connected: true, requestId: result.relay?.requestId };
        return result;
    };
    const resumeWorkstation = () => bridge.enablePrivateRelay().catch(error => {
        const code = error.code || error.message;
        const peerOwnsLease = code === "JARVIS_RELAY_LEASE_HELD";
        bridge.privateRelayState = { status: peerOwnsLease ? "STANDBY" : "RECONNECTING", connected: false, error: code };
        if (lastRelayError !== code) {
            (peerOwnsLease ? console.info : console.warn)(peerOwnsLease ? "[JARVIS_PRIVATE_RELAY_PEER_ACTIVE]" : "[JARVIS_PRIVATE_RELAY_NOT_READY]", code);
            lastRelayError = code;
        }
        if (privateRelayWorkstationEnabled()) autoRetry = setTimeout(resumeWorkstation, peerOwnsLease ? 30000 : 15000);
    });
    if (privateRelayWorkstationEnabled()) autoRetry = setTimeout(resumeWorkstation, 0);
    return bridge;
}

export function installJarvisLocalBridgeTransport() {
    const existing =
        globalThis.JarvisLocalBridge ||
        globalThis.window?.JarvisLocalBridge ||
        null;
    if (typeof existing?.requestJson === "function") {
        return existing;
    }

    const bridge = {
        describeFailure: semanticFailurePresentation,
        async requestJson(
            route,
            payload = {},
            options = {}
        ) {
            const path = String(route || "").trim();
            if (!path.startsWith("/") || path.startsWith("//")) {
                throw new Error("JARVIS_LOCAL_BRIDGE_ROUTE_INVALID");
            }

            const contract = await readRuntimeContract();
            const semanticRequest = path === "/semantic/plan" || path === "/semantic/respond";
            const {
                timeoutMs: _semanticTimeoutMs,
                ...semanticPayload
            } =
                payload &&
                typeof payload === "object"
                    ? payload
                    : {};
            const requestPayload = semanticRequest
                ? {
                    ...semanticPayload,
                    streamProgress: true,
                    noDeadline: true
                }
                : payload;
            const timeoutMs = semanticRequest ? null : Math.min(
                Math.max(Number(options?.timeoutMs) || 120000, 1000),
                180000
            );
            const maximumAttempts = 3;
            const requestAttempts = semanticRequest ? 1 : maximumAttempts;
            let lastError = null;

            for (
                let attempt = 1;
                attempt <= requestAttempts;
                attempt += 1
            ) {
                const controller = new AbortController();
                const startedAt = Date.now();
                let deadlineExceeded = false;
                const timeout = semanticRequest
                    ? null
                    : setTimeout(
                        () => { deadlineExceeded = true; controller.abort(); },
                        timeoutMs
                    );
                const silenceWatchdog = semanticRequest
                    ? createJarvisTransportSilenceWatchdog(controller, {
                        silenceMs: Number(options?.semanticSilenceMs) || SEMANTIC_TRANSPORT_SILENCE_MS,
                        onStall: () => console.warn("[JARVIS_SEMANTIC_TRANSPORT_STALLED]", {
                            route: path,
                            elapsedMs: Date.now() - startedAt,
                            silenceMs: Number(options?.semanticSilenceMs) || SEMANTIC_TRANSPORT_SILENCE_MS
                        })
                    })
                    : null;
                silenceWatchdog?.start();

                // No total inference deadline applies to semantic work. The
                // watchdog above only detects a transport that stops delivering
                // the server's 5-second progress heartbeat.
                try {
                    const response = await globalThis.fetch(
                        `${LOCAL_BRIDGE_BASE_URL}${path}`,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "X-Jarvis-Release-Id": contract.releaseId
                            },
                            body: JSON.stringify(
                                requestPayload && typeof requestPayload === "object"
                                    ? requestPayload
                                    : {}
                            ),
                            cache: "no-store",
                            signal: controller.signal,
                            targetAddressSpace: "loopback"
                        }
                    );
                    silenceWatchdog?.touch();
                    if (semanticRequest && response.headers.get("content-type")?.includes("application/x-ndjson")) {
                        return await readSemanticStream(response, {
                            onActivity: () => silenceWatchdog?.touch(),
                            onProgress: detail => {
                                if (options.privateRelayExecution === true) options.onProgress?.(detail);
                                else globalThis.dispatchEvent?.(new CustomEvent("jarvis:semantic-progress", { detail }));
                            }
                        });
                    }
                    // An older bridge can still reply with one JSON result.
                    const text = await response.text();
                    let result = {};
                    if (text) {
                        try {
                            result = JSON.parse(text);
                        }
                        catch {
                            throw new Error(
                                `JARVIS_LOCAL_BRIDGE_INVALID_JSON_${response.status}`
                            );
                        }
                    }
                    if (!response.ok) {
                        return {
                            ...result,
                            ok: result?.ok === true,
                            httpStatus: response.status
                        };
                    }
                    return result;
                }
                catch(error) {
                    lastError = error;
                    const aborted =
                        error?.name === "AbortError";

                    if (aborted) {
                        if (semanticRequest && silenceWatchdog?.stalled) {
                            const stalledError =
                                new Error("JARVIS_LOCAL_BRIDGE_TRANSPORT_STALLED");
                            stalledError.code =
                                "JARVIS_LOCAL_BRIDGE_TRANSPORT_STALLED";
                            stalledError.route =
                                path;
                            stalledError.timeoutReason =
                                "TRANSPORT_SILENCE";
                            stalledError.elapsedMs =
                                Date.now() - startedAt;
                            stalledError.silenceMs =
                                Number(options?.semanticSilenceMs) || SEMANTIC_TRANSPORT_SILENCE_MS;
                            throw stalledError;
                        }
                        const timeoutError =
                            new Error("JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST");
                        timeoutError.code =
                            "JARVIS_LOCAL_BRIDGE_TIMEOUT_REQUEST";
                        timeoutError.route =
                            path;
                        timeoutError.timeoutMs =
                            timeoutMs;
                        timeoutError.timeoutReason = deadlineExceeded ? "ABSOLUTE_DEADLINE" : "REQUEST_ABORTED";
                        timeoutError.elapsedMs = Date.now() - startedAt;
                        console.warn("[JARVIS_LOCAL_BRIDGE_TIMEOUT]", {
                            route: path, timeoutReason: timeoutError.timeoutReason,
                            timeoutMs, elapsedMs: timeoutError.elapsedMs
                        });
                        throw timeoutError;
                    }

                    if (attempt >= requestAttempts) {
                        throw error;
                    }

                    console.warn(
                        "[JARVIS_LOCAL_BRIDGE_TRANSIENT_RETRY]",
                        {
                            route:
                                path,
                            attempt,
                            nextAttempt:
                                attempt + 1,
                            error:
                                error?.message || String(error)
                        }
                    );

                    await new Promise(resolve =>
                        setTimeout(
                            resolve,
                            attempt * 350
                        )
                    );
                }
                finally {
                    silenceWatchdog?.clear();
                    if (timeout) clearTimeout(timeout);
                }
            }

            throw (
                lastError ||
                new Error("JARVIS_LOCAL_BRIDGE_REQUEST_FAILED")
            );
        }
    };

    configureJarvisPrivateRelay(bridge);
    globalThis.JarvisLocalBridge = bridge;
    if (globalThis.window) {
        globalThis.window.JarvisLocalBridge = bridge;
    }

    console.info("[JARVIS_LOCAL_BRIDGE_TRANSPORT_READY]", {
        baseUrl: LOCAL_BRIDGE_BASE_URL,
        targetAddressSpace: "loopback",
        contractSource: "jarvis-runtime-contract.json"
    });

    return bridge;
}

export async function instalarBootstrapTerminalJarvis() {
    if (globalThis[INSTALL_KEY]) {
        return globalThis[INSTALL_KEY];
    }

    if (typeof window === "undefined") {
        const serverInstallation = {
            ok: true,
            active: false,
            environment: "non_browser",
            version: JARVIS_TERMINAL_BOOTSTRAP_VERSION
        };
        globalThis[INSTALL_KEY] = serverInstallation;
        return serverInstallation;
    }

    const localBridge =
        installJarvisLocalBridgeTransport();

    const realMediaTools = await import(
        "../../gestia-core/nexo/nexo.real-media.tools.js?v=v137-local-speech-synthesis-20260812"
    );
    const runtimeMediaGuard = await import(
        "../../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js?v=v137-local-speech-synthesis-20260812"
    );

    const toolsInstallation =
        realMediaTools.installJarvisRealMediaTools();
    const guardInstallation =
        runtimeMediaGuard.installJarvisRealMediaRuntimeGuard();

    const installation = {
        ok: true,
        active: true,
        environment: "browser",
        version: JARVIS_TERMINAL_BOOTSTRAP_VERSION,
        localBridgeActive:
            typeof localBridge?.requestJson === "function",
        localBridgeBaseUrl:
            LOCAL_BRIDGE_BASE_URL,
        localBridgeTargetAddressSpace:
            "loopback",
        realMediaToolsVersion:
            realMediaTools.JARVIS_REAL_MEDIA_TOOLS_VERSION || null,
        runtimeMediaGuardVersion:
            runtimeMediaGuard.JARVIS_REAL_MEDIA_RUNTIME_GUARD_VERSION || null,
        realMediaToolsInstalling: true,
        runtimeMediaGuardInstalling: true,
        identity: "JARVIS",
        semanticAuthority: "jarvisSemanticPlan",
        alternateBrains: 0,
        nexoAuthorityActive: false,
        loadedAt: new Date().toISOString()
    };

    globalThis[INSTALL_KEY] = installation;
    globalThis.__JARVIS_TERMINAL_BOOT_HEALTH__ = installation;

    Promise.all([toolsInstallation, guardInstallation]).then(([toolsResult, guardResult]) => {
        const settled = {
            ...installation,
            realMediaToolsInstalling: false,
            runtimeMediaGuardInstalling: false,
            realMediaToolsActive:
                toolsResult?.active === true,
            realMediaToolsStatus:
                toolsResult?.status ||
                (toolsResult?.active === true ? "READY" : "INACTIVE"),
            realMediaToolsInstalledAt:
                toolsResult?.installedAt || null,
            runtimeMediaGuardActive:
                guardResult?.active === true,
            runtimeMediaGuardStatus:
                guardResult?.status ||
                (guardResult?.active === true ? "READY" : "INACTIVE"),
            runtimeMediaGuardInstalledAt:
                guardResult?.installedAt || null
        };
        globalThis[INSTALL_KEY] = settled;
        globalThis.__JARVIS_TERMINAL_BOOT_HEALTH__ = settled;
        console.info("[JARVIS_REAL_MEDIA_TOOLS_READY]", toolsResult);
        console.info("[JARVIS_REAL_MEDIA_RUNTIME_GUARD_READY]", guardResult);
    });

    console.info("[JARVIS_TERMINAL_BOOTSTRAP_READY]", installation);

    return installation;
}

await instalarBootstrapTerminalJarvis();
