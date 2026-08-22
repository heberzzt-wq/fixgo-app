import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { test } from "node:test";

const root = process.cwd();
const bootstrap = fs.readFileSync(
    path.join(root, "modules/terminal/nexo-bootstrap.js"),
    "utf8"
);

const PRODUCTION_ORIGIN = "https://fixgo-44e4d.web.app";
const PRODUCTION_BOOTSTRAP_VERSION = "1.12.0-loopback-transport-v142";

test("NEXO bootstrap keeps tools but installs no alternate semantic authority", () => {
    assert.match(bootstrap, /installNexoRealMediaTools/);
    assert.match(bootstrap, /nexo\.real-media\.tools\.js/);
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

test("V142 real Chrome verifies the served loopback bootstrap and local research bridge", {
    skip: process.env.GITHUB_ACTIONS !== "true" || process.platform !== "linux",
    timeout: 120000
}, async t => {
    const { createJarvisUploadBridgeApp } = await import("../jarvis-upload-bridge.js");
    const contract = JSON.parse(
        fs.readFileSync(path.join(root, "jarvis-runtime-contract.json"), "utf8")
    );
    const bridgeRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "v142-production-browser-bridge-")
    );
    const profile = fs.mkdtempSync(
        path.join(os.tmpdir(), "v142-production-browser-profile-")
    );

    execFileSync("git", ["init", "-b", "v94-media-v4n-negative-claims"], {
        cwd: bridgeRoot,
        stdio: "ignore"
    });
    fs.writeFileSync(
        path.join(bridgeRoot, "jarvis-runtime-contract.json"),
        JSON.stringify(contract, null, 2),
        "utf8"
    );

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
    ], { stdio: "ignore" });

    let cdp = null;
    t.after(async () => {
        try { cdp?.socket?.close(); } catch {}
        if (chrome.exitCode === null) {
            try { chrome.kill("SIGKILL"); } catch {}
        }
        await new Promise(resolve => server.close(() => resolve()));
        fs.rmSync(bridgeRoot, { recursive: true, force: true });
        fs.rmSync(profile, { recursive: true, force: true });
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
            if (!/Execution context was destroyed|Cannot find context/i.test(String(error?.message || error))) {
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
                        globalThis.__NEXO_TERMINAL_BOOTSTRAP__?.localBridgeActive === true &&
                        typeof globalThis.JarvisLocalBridge?.requestJson === "function"
                    ) break;
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
                let permissionState = null;
                try {
                    permissionState = (await navigator.permissions.query({name:"loopback-network"})).state;
                }
                catch {}
                const boot = globalThis.__NEXO_TERMINAL_BOOTSTRAP__ || null;
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
    assert.equal(result?.servedVersion, PRODUCTION_BOOTSTRAP_VERSION);
    assert.equal(result?.servedLoopback, true);
    assert.equal(result?.servedLegacyLocal, false);
    assert.equal(result?.importError, null);
    assert.equal(result?.permissionState, "granted");
    assert.equal(result?.boot?.version, PRODUCTION_BOOTSTRAP_VERSION);
    assert.equal(result?.boot?.active, true);
    assert.equal(result?.boot?.localBridgeActive, true);
    assert.equal(result?.boot?.localBridgeTargetAddressSpace, "loopback");
    assert.equal(result?.hasBridge, true);
    assert.equal(result?.transportError, null);
    assert.equal(result?.transportProbe?.httpStatus, 400);
    assert.equal(result?.transportProbe?.error, "WEB_RESEARCH_QUERY_REQUIRED");
    assert.ok(result?.research?.status, "Taquería El Dorado research must return through the served production bridge");
});
