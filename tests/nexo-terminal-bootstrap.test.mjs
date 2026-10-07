import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { test } from "node:test";

const root = process.cwd();
const bootstrap = fs.readFileSync(
    path.join(root, "modules/terminal/nexo-bootstrap.js"),
    "utf8"
);

const PRODUCTION_ORIGIN = "https://fixgo-44e4d.web.app";
const PRODUCTION_BOOTSTRAP_VERSION = "1.17.0-private-firestore-relay";

test("historical NEXO bootstrap is Jarvis-only and installs no alternate semantic authority", () => {
    assert.match(bootstrap, /installJarvisRealMediaTools/);
    assert.match(bootstrap, /installJarvisRealMediaRuntimeGuard/);
    assert.match(bootstrap, /nexo\.real-media\.tools\.js/);
    assert.match(bootstrap, /__JARVIS_TERMINAL_BOOTSTRAP__/);
    assert.match(bootstrap, /identity:\s*"JARVIS"/);
    assert.match(bootstrap, /semanticAuthority:\s*"jarvisSemanticPlan"/);
    assert.match(bootstrap, /alternateBrains:\s*0/);
    assert.doesNotMatch(bootstrap, /__NEXO_TERMINAL_BOOTSTRAP__/);
    assert.doesNotMatch(bootstrap, /nexo\.semantic-planner-resilience/);
    assert.doesNotMatch(bootstrap, /resilienceVersion/);
});

test("NEXO bootstrap remains inert outside the browser", () => {
    assert.match(bootstrap, /environment:\s*"non_browser"/);
    assert.match(bootstrap, /active:\s*false/);
});

test("NEXO bootstrap hydrates the existing localhost bridge as loopback from the runtime contract", () => {
    assert.match(bootstrap, /globalThis\.JarvisLocalBridge\s*=\s*bridge/);
    assert.match(bootstrap, /http:\/\/localhost:3344/);
    assert.match(bootstrap, /jarvis-runtime-contract\.json/);
    assert.match(bootstrap, /"X-Jarvis-Release-Id": contract\.releaseId/);
    assert.match(bootstrap, /targetAddressSpace:\s*"loopback"/);
    assert.match(bootstrap, /localBridgeTargetAddressSpace:\s*"loopback"/);
    assert.match(bootstrap, /localBridgeActive/);
    assert.doesNotMatch(bootstrap, /targetAddressSpace:\s*"local"/);
    assert.doesNotMatch(bootstrap, /releaseId:\s*"v94-/);
    assert.match(bootstrap, /maximumAttempts = 3/);
    assert.match(bootstrap, /JARVIS_LOCAL_BRIDGE_TRANSIENT_RETRY/);
    assert.match(bootstrap, /attempt \* 350/);
});


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function openCdpPage(chrome, url) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (chrome.exitCode !== null) {
            throw new Error(`V142_PRODUCTION_CHROME_EXITED:${chrome.exitCode}`);
        }
        try {
            const response = await fetch("http://127.0.0.1:9222/json");
            const targets = await response.json();
            const target = targets.find(item =>
                item?.type === "page" &&
                String(item?.url || "").startsWith(PRODUCTION_ORIGIN) &&
                item?.webSocketDebuggerUrl
            );
            if (target) return target;
        }
        catch {}
        await sleep(250);
    }
    throw new Error(`V142_PRODUCTION_PAGE_NOT_FOUND:${url}`);
}

async function connectCdp(webSocketDebuggerUrl) {
    const socket = new WebSocket(webSocketDebuggerUrl);
    const pending = new Map();
    let nextId = 1;

    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = () => reject(new Error("V142_PRODUCTION_CDP_OPEN_FAILED"));
    });

    socket.onmessage = event => {
        let message;
        try {
            message = JSON.parse(String(event.data));
        }
        catch {
            return;
        }
        if (!message?.id || !pending.has(message.id)) return;
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
            request.reject(new Error(message.error.message || "V142_PRODUCTION_CDP_ERROR"));
        }
        else {
            request.resolve(message.result);
        }
    };

    return {
        socket,
        call(method, params = {}) {
            return new Promise((resolve, reject) => {
                const id = nextId++;
                pending.set(id, { resolve, reject });
                socket.send(JSON.stringify({ id, method, params }));
            });
        }
    };
}

test("V142 predeploy Chrome verifies production loopback transport while source certifies the Jarvis bootstrap", {
    skip: process.env.GITHUB_ACTIONS !== "true" || process.platform !== "linux",
    timeout: 120000
}, async t => {
    const { createJarvisUploadBridgeApp } = await import("../jarvis-upload-bridge.js");
    const contract = JSON.parse(
        fs.readFileSync(path.join(root, "jarvis-runtime-contract.json"), "utf8")
    );
    const fixtureRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "v142-production-browser-fixture-")
    );
    const bridgeRoot = path.join(fixtureRoot, "worktree");
    const remoteRoot = path.join(fixtureRoot, "remote.git");
    fs.mkdirSync(bridgeRoot);
    const profile = fs.mkdtempSync(
        path.join(os.tmpdir(), "v142-production-browser-profile-")
    );

    execFileSync("git", ["init", "--bare", remoteRoot], {
        stdio: "ignore"
    });
    execFileSync("git", ["init", "-b", "v94-media-v4n-negative-claims"], {
        cwd: bridgeRoot,
        stdio: "ignore"
    });
    const runGit = args => execFileSync("git", args, {
        cwd: bridgeRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    const canonicalRemote = `https://github.com/${contract.repository}.git`;
    runGit(["config", "user.email", "v142-browser@example.invalid"]);
    runGit(["config", "user.name", "V142 Browser Test"]);
    runGit(["remote", "add", "origin", canonicalRemote]);
    runGit([
        "config",
        `url.${pathToFileURL(remoteRoot).href}.insteadOf`,
        canonicalRemote
    ]);
    fs.writeFileSync(
        path.join(bridgeRoot, "jarvis-runtime-contract.json"),
        JSON.stringify(contract, null, 2),
        "utf8"
    );
    runGit(["add", "jarvis-runtime-contract.json"]);
    runGit(["commit", "-m", "fixture: authorize browser bridge identity"]);
    runGit(["push", "-u", "origin", contract.branch]);

    const server = createJarvisUploadBridgeApp({ root: bridgeRoot }).listen(3344);
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });

    const chromePath = execFileSync(
        "bash",
        ["-lc", "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"],
        { encoding: "utf8" }
    ).trim();
    assert.ok(chromePath, "Chrome/Chromium is required for the production browser contract");

    const targetUrl = `${PRODUCTION_ORIGIN}/manual.html?v142-postdeploy=${Date.now()}`;
    const chrome = spawn(chromePath, [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--remote-debugging-port=9222",
        `--user-data-dir=${profile}`,
        targetUrl
    ], {
        stdio: "ignore",
        detached: process.platform === "linux"
    });

    let cdp = null;
    t.after(async () => {
        try { cdp?.socket?.close(); } catch {}

        let chromeExit = null;
        if (chrome.exitCode === null) {
            chromeExit = new Promise(resolve => {
                const timer = setTimeout(resolve, 8000);
                chrome.once("exit", () => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }

        try {
            if (process.platform === "linux" && Number.isInteger(chrome.pid)) {
                process.kill(-chrome.pid, "SIGKILL");
            }
            else if (chrome.exitCode === null) {
                chrome.kill("SIGKILL");
            }
        }
        catch {
            try {
                if (chrome.exitCode === null) chrome.kill("SIGKILL");
            }
            catch {}
        }

        if (chromeExit) {
            await chromeExit;
        }

        await new Promise(resolve => server.close(() => resolve()));
        fs.rmSync(fixtureRoot, {
            recursive: true,
            force: true,
            maxRetries: 20,
            retryDelay: 200
        });
        try {
            fs.rmSync(profile, {
                recursive: true,
                force: true,
                maxRetries: 20,
                retryDelay: 200
            });
        }
        catch(error) {
            if (error?.code !== "ENOTEMPTY") throw error;
            console.warn(
                "V142_CHROME_PROFILE_CLEANUP_DEFERRED",
                error?.message || String(error)
            );
        }
    });

    const pageTarget = await openCdpPage(chrome, targetUrl);
    cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
    await cdp.call("Runtime.enable");

    let stable = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const probe = await cdp.call("Runtime.evaluate", {
                expression: `({href:location.href,protocol:location.protocol,readyState:document.readyState})`,
                returnByValue: true
            });
            const value = probe?.result?.value || null;
            if (
                value?.protocol === "https:" &&
                String(value?.href || "").startsWith(PRODUCTION_ORIGIN) &&
                ["interactive", "complete"].includes(value?.readyState)
            ) {
                stable = value;
                break;
            }
        }
        catch(error) {
            if (!/Execution context was destroyed|Cannot find context|Cannot find default execution context/i.test(String(error?.message || error))) {
                throw error;
            }
        }
        await sleep(250);
    }
    assert.ok(stable?.href, "Production browser never reached a stable HTTPS context");

    let permissionMethod = null;
    try {
        await cdp.call("Browser.setPermission", {
            permission: { name: "loopback-network" },
            setting: "granted",
            origin: PRODUCTION_ORIGIN
        });
        permissionMethod = "Browser.setPermission:loopback-network";
    }
    catch(firstError) {
        await cdp.call("Browser.grantPermissions", {
            permissions: ["loopbackNetwork"],
            origin: PRODUCTION_ORIGIN
        });
        permissionMethod = "Browser.grantPermissions:loopbackNetwork";
    }

    const moduleUrl = `${PRODUCTION_ORIGIN}/modules/terminal/nexo-bootstrap.js?v=v142-postdeploy-${Date.now()}`;
    const evaluated = await cdp.call("Runtime.evaluate", {
        expression: `
            (async () => {
                const moduleUrl = ${JSON.stringify(moduleUrl)};
                const sourceResponse = await fetch(moduleUrl, {cache:"no-store"});
                const sourceText = await sourceResponse.text();
                const servedVersion = sourceText.includes(${JSON.stringify(PRODUCTION_BOOTSTRAP_VERSION)})
                    ? ${JSON.stringify(PRODUCTION_BOOTSTRAP_VERSION)}
                    : null;
                const servedLoopback = sourceText.includes('targetAddressSpace: "loopback"');
                const servedLegacyLocal = sourceText.includes('targetAddressSpace: "local"');
                let importError = null;
                try {
                    await import(moduleUrl);
                }
                catch(error) {
                    importError = {name:error?.name||null,message:error?.message||String(error)};
                }
                for (let attempt = 0; attempt < 80; attempt += 1) {
                    if (
                        globalThis.__JARVIS_TERMINAL_BOOTSTRAP__?.localBridgeActive === true &&
                        typeof globalThis.JarvisLocalBridge?.requestJson === "function"
                    ) break;
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
                let permissionState = null;
                try {
                    permissionState = (await navigator.permissions.query({name:"loopback-network"})).state;
                }
                catch {}
                const boot = globalThis.__JARVIS_TERMINAL_BOOTSTRAP__ || null;
                const hasBridge = typeof globalThis.JarvisLocalBridge?.requestJson === "function";
                let transportProbe = null;
                let research = null;
                let transportError = null;
                if (hasBridge) {
                    try {
                        transportProbe = await globalThis.JarvisLocalBridge.requestJson(
                            "/research",
                            {query:"x"},
                            {timeoutMs:10000}
                        );
                        research = await globalThis.JarvisLocalBridge.requestJson(
                            "/research",
                            {
                                query:"Taquería El Dorado @taqueria.eldorado Cancún",
                                timeoutMs:20000,
                                allowedDomain:"",
                                exactEntity:"Taquería El Dorado",
                                seedUrl:""
                            },
                            {timeoutMs:30000}
                        );
                    }
                    catch(error) {
                        transportError = {name:error?.name||null,message:error?.message||String(error)};
                    }
                }
                return {
                    origin:location.origin,
                    sourceHttpOk:sourceResponse.ok,
                    sourceHttpStatus:sourceResponse.status,
                    servedVersion,
                    servedLoopback,
                    servedLegacyLocal,
                    importError,
                    permissionState,
                    boot:boot ? {
                        version:boot.version||null,
                        active:boot.active===true,
                        localBridgeActive:boot.localBridgeActive===true,
                        localBridgeTargetAddressSpace:boot.localBridgeTargetAddressSpace||null
                    } : null,
                    hasBridge,
                    transportProbe:transportProbe ? {
                        status:transportProbe.status||null,
                        error:transportProbe.error||null,
                        httpStatus:transportProbe.httpStatus||null
                    } : null,
                    research:research ? {
                        ok:research.ok===true,
                        grounded:research.grounded===true,
                        status:research.status||null,
                        error:research.error||null,
                        sourceCount:Array.isArray(research.sources)?research.sources.length:Number(research.sourceCount||0),
                        httpStatus:research.httpStatus||null
                    } : null,
                    transportError
                };
            })()
        `,
        awaitPromise: true,
        returnByValue: true
    });
    if (evaluated?.exceptionDetails) {
        throw new Error(`V142_POSTDEPLOY_BROWSER_EXCEPTION:${evaluated.exceptionDetails.text || "unknown"}`);
    }
    const result = evaluated?.result?.value || null;

    console.log("V142_POSTDEPLOY_LOOPBACK_BROWSER", JSON.stringify({
        stable,
        permissionMethod,
        ...result
    }));

    assert.equal(result?.origin, PRODUCTION_ORIGIN);
    assert.equal(result?.sourceHttpOk, true);
    assert.equal(result?.servedLoopback, true);
    assert.equal(result?.servedLegacyLocal, false);
    assert.equal(result?.importError, null);
    assert.equal(result?.permissionState, "granted");
    assert.equal(result?.hasBridge, true);
    assert.equal(result?.transportError, null);
    assert.equal(result?.transportProbe?.httpStatus, 400);
    assert.equal(result?.transportProbe?.error, "WEB_RESEARCH_QUERY_REQUIRED");
    assert.ok(
        result?.research?.status,
        "Taquería El Dorado research must return through the served production bridge"
    );
    assert.equal(
        bootstrap.includes(PRODUCTION_BOOTSTRAP_VERSION),
        true
    );
    if (result?.servedVersion === PRODUCTION_BOOTSTRAP_VERSION) {
        assert.equal(result?.boot?.version, PRODUCTION_BOOTSTRAP_VERSION);
        assert.equal(result?.boot?.active, true);
        assert.equal(result?.boot?.localBridgeActive, true);
        assert.equal(result?.boot?.localBridgeTargetAddressSpace, "loopback");
    }
});

// Private relay regressions: transport evidence is not model completion.
import { JARVIS_PRIVATE_RELAY, validateJarvisRelayRequest, jarvisRelayPresenceIsLive } from '../gestia-core/jarvis/jarvis.semantic.transport.js';
import { createJarvisPrivateRelayClient, startJarvisBrowserRelay } from '../modules/terminal/nexo-bootstrap.js';
const relayId = '11111111-2222-4333-8444-555555555555';
function relayEnvelope(overrides = {}) {
    const now = Date.now();
    return { schemaVersion: 1, ownerUid: JARVIS_PRIVATE_RELAY.ownerUid, requestId: relayId,
        route: '/semantic/plan', state: 'QUEUED', body: '{"input":"Hola"}', releaseId: 'relay-test',
        createdAt: now - 10, expiresAt: now + 290000, ...overrides };
}

test('private relay validates owner route proof lifetime and payload before invoking anything', () => {
    const good = relayEnvelope();
    assert.equal(validateJarvisRelayRequest(good, { requestId: relayId, releaseId: 'relay-test' }).payload.input, 'Hola');
    for (const patch of [
        { ownerUid: 'other' }, { requestId: 'other' }, { route: '/write/authorize' }, { route: '/video/generate' },
        { route: 'http://attacker.invalid/semantic/plan' }, { route: '/semantic/plan?route=/write' },
        { route: '/../write' }, { releaseId: 'old' }, { state: 'RUNNING' }, { schemaVersion: 2 },
        { expiresAt: Date.now() - 1 }, { createdAt: Date.now() - 360000 }, { createdAt: Date.now() + 120000 },
        { body: '[]' }, { body: 'null' }, { body: '{' }, { body: 'x'.repeat(JARVIS_PRIVATE_RELAY.maxBytes + 1) }
    ]) assert.throws(() => validateJarvisRelayRequest({ ...good, ...patch }, { requestId: relayId, releaseId: 'relay-test' }), /JARVIS_RELAY_/);
    assert.throws(() => validateJarvisRelayRequest(relayEnvelope({ route: '/memory/query', body: JSON.stringify({ identity: { userId: 'other' } }) }),
        { requestId: relayId, releaseId: 'relay-test' }), /MEMORY_OWNER_MISMATCH/);
    const memory = validateJarvisRelayRequest(relayEnvelope({ route: '/memory/query', body: '{}' }), { requestId: relayId, releaseId: 'relay-test' });
    assert.equal(memory.payload.identity.userId, JARVIS_PRIVATE_RELAY.ownerUid);
});

test('private relay presence rejects cached old disconnected and mismatched workers', () => {
    const presence = { schemaVersion: 1, online: true, releaseId: 'relay-test', workerId: relayId, heartbeatAt: Date.now() };
    assert.equal(jarvisRelayPresenceIsLive(presence, 'relay-test'), true);
    for (const patch of [{ online: false }, { workerId: '' }, { releaseId: 'wrong' }, { heartbeatAt: Date.now() - 121000 }, { heartbeatAt: null }]) {
        assert.equal(jarvisRelayPresenceIsLive({ ...presence, ...patch }, 'relay-test'), false);
    }
});

function relayFakeSdk() {
    const docs = new Map(), watchers = new Set(), writes = [];
    const stamp = () => ({ toMillis: () => Date.now() });
    const ref = path => ({ path, id: path.split('/').at(-1) });
    const snap = path => ({ id: path.split('/').at(-1), ref: ref(path), exists: () => docs.has(path),
        data: () => docs.get(path), metadata: { fromCache: false } });
    const read = target => target.collection ? {
        docs: [...docs.keys()].filter(path => path.startsWith(target.path + '/') && !path.slice(target.path.length + 1).includes('/'))
            .filter(path => target.filters.every(f => f.kind !== 'where' || (f.op === '==' ? docs.get(path)[f.field] === f.value : false)))
            .map(snap), metadata: { fromCache: false }
    } : snap(target.path);
    const emit = () => { for (const watcher of watchers) queueMicrotask(() => { if (watchers.has(watcher)) watcher.callback(read(watcher.target)); }); };
    const apply = (target, data, merge) => {
        const value = merge ? { ...docs.get(target.path) } : {};
        for (const [key, item] of Object.entries(data)) { if (item === sdk.DELETE) delete value[key]; else value[key] = item; }
        docs.set(target.path, value); writes.push({ path: target.path, data: { ...data } });
    };
    const sdk = {
        DELETE: Symbol('delete'),
        doc(...args) { const [base, ...rest] = args; return ref([base?.path || '', ...rest].filter(Boolean).join('/')); },
        collection(parent, child) { return { ...ref(parent.path + '/' + child), collection: true, filters: [] }; },
        where(field, op, value) { return { kind: 'where', field, op, value }; }, limit(value) { return { kind: 'limit', value }; },
        query(parent, ...filters) { return { ...parent, filters }; },
        serverTimestamp: stamp, Timestamp: { fromMillis: value => ({ toMillis: () => value }) }, deleteField() { return sdk.DELETE; },
        async getDocFromServer(target) { return snap(target.path); }, async getDocs(target) { return read(target); },
        async setDoc(target, data) { apply(target, data, false); emit(); },
        async updateDoc(target, data) { apply(target, data, true); emit(); },
        async deleteDoc(target) { docs.delete(target.path); emit(); },
        onSnapshot(target, callback) { const watcher = { target, callback }; watchers.add(watcher); queueMicrotask(() => { if(watchers.has(watcher))callback(read(target)); }); return () => watchers.delete(watcher); },
        async runTransaction(_db, callback) {
            const pending = []; const result = await callback({ get: async target => snap(target.path),
                set(target, data) { pending.push([target, data, false]); }, update(target, data) { pending.push([target, data, true]); } });
            for (const args of pending) apply(...args); if (pending.length) emit(); return result;
        }
    };
    return { sdk, docs, writes, emit, watchers };
}

test('private relay crosses the authenticated queue and delivers an exact correlated local result once', async () => {
    const fake = relayFakeSdk(), auth = { currentUser: { uid: JARVIS_PRIVATE_RELAY.ownerUid }, async authStateReady() {} };
    const state = [], calls = [], progress = [];
    const local = async (route, payload) => {
        if (route === '/workstation/health') return { ok: true, status: 'JARVIS_WORKSTATION_LIVE', runtime: { bridgeStarted: true, loadedHead: 'test' } };
        calls.push({ route, payload });
        return { ok: true, text: 'Hola pariente', localSemanticInferenceUsed: true, cloudSemanticInferenceUsed: false };
    };
    const worker = await startJarvisBrowserRelay({ auth, db: {}, sdk: fake.sdk, contract: { releaseId: 'relay-test' }, requestLocal: local,
        uuid: () => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', onState: next => state.push(next) });
    try {
        const client = createJarvisPrivateRelayClient({ auth, db: {}, sdk: fake.sdk, uuid: () => relayId, onProgress: next => progress.push(next) });
        const result = await client.requestJson('/semantic/plan', { input: 'Hola' }, { contract: { releaseId: 'relay-test' } });
        fake.emit(); fake.emit(); await sleep(5);
        assert.equal(calls.length, 1); assert.equal(calls[0].route, '/semantic/plan');
        assert.equal(result.text, 'Hola pariente'); assert.equal(result.relay.requestId, relayId);
        assert.equal(result.cloudSemanticInferenceUsed, false);
        const receipt = fake.docs.get(`jarvis_private_relay/${JARVIS_PRIVATE_RELAY.ownerUid}/requests/${relayId}`);
        assert.equal(receipt.state, 'COMPLETED'); assert.equal(receipt.body, undefined);
        assert.ok(state.some(item => item.status === 'EXECUTING'));
        assert.ok(progress.some(item => item.requestId === relayId));
        assert.ok(!fake.writes.some(item => item.path.includes('services/') || item.path.includes('users/')));
    } finally { await worker.stop(); }
    assert.equal(fake.watchers.size, 0);
});

test('private relay rejects another session unsupported operations and an offline workstation without loopback fallback', async () => {
    const fake = relayFakeSdk(); const auth = { currentUser: { uid: 'other' }, async authStateReady() {} };
    const client = createJarvisPrivateRelayClient({ auth, db: {}, sdk: fake.sdk });
    await assert.rejects(client.requestJson('/semantic/plan', {}, { contract: { releaseId: 'relay-test' } }), /OWNER_REQUIRED/);
    auth.currentUser.uid = JARVIS_PRIVATE_RELAY.ownerUid;
    await assert.rejects(client.requestJson('/write/authorize', {}, { contract: { releaseId: 'relay-test' } }), /LOCAL_OPERATION_REQUIRED/);
    await assert.rejects(client.requestJson('/semantic/plan', {}, { contract: { releaseId: 'relay-test' } }), /WORKSTATION_UNAVAILABLE/);
    assert.equal(fake.writes.length, 0);
});
