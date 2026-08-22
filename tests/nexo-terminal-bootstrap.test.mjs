import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const bootstrap = fs.readFileSync(
    path.join(root, "modules/terminal/nexo-bootstrap.js"),
    "utf8"
);

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

test("NEXO bootstrap hydrates the existing local bridge transport from the runtime contract", () => {
    assert.match(bootstrap, /globalThis\.JarvisLocalBridge\s*=\s*bridge/);
    assert.match(bootstrap, /http:\/\/localhost:3344/);
    assert.match(bootstrap, /jarvis-runtime-contract\.json/);
    assert.match(bootstrap, /"X-Jarvis-Release-Id": contract\.releaseId/);
    assert.match(bootstrap, /targetAddressSpace:\s*"local"/);
    assert.match(bootstrap, /localBridgeActive/);
    assert.doesNotMatch(bootstrap, /releaseId:\s*"v94-/);
});

test("V142 production Hosting reaches the existing local research bridge from real Chrome", {
    skip:
        process.env.GITHUB_ACTIONS !== "true" ||
        process.platform !== "linux",
    timeout: 120000
}, async t => {
    const os = await import("node:os");
    const {
        execFileSync,
        spawn
    } = await import("node:child_process");
    const {
        createJarvisUploadBridgeApp
    } = await import("../jarvis-upload-bridge.js");

    const branch =
        "v94-media-v4n-negative-claims";
    const contract =
        JSON.parse(
            fs.readFileSync(
                path.join(root, "jarvis-runtime-contract.json"),
                "utf8"
            )
        );
    const bridgeRoot =
        fs.mkdtempSync(
            path.join(
                os.tmpdir(),
                "v142-production-browser-bridge-"
            )
        );
    const chromeProfile =
        fs.mkdtempSync(
            path.join(
                os.tmpdir(),
                "v142-production-browser-profile-"
            )
        );

    execFileSync(
        "git",
        ["init", "-b", branch],
        {
            cwd: bridgeRoot,
            stdio: "ignore"
        }
    );
    fs.writeFileSync(
        path.join(
            bridgeRoot,
            "jarvis-runtime-contract.json"
        ),
        JSON.stringify(
            {
                ...contract,
                branch
            },
            null,
            2
        ),
        "utf8"
    );

    const server =
        createJarvisUploadBridgeApp({
            root: bridgeRoot
        }).listen(3344);
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });

    let chrome = null;
    t.after(async () => {
        if (chrome && chrome.exitCode === null) {
            try {
                chrome.kill("SIGKILL");
            }
            catch {}
        }
        await new Promise(resolve =>
            server.close(() => resolve())
        );
        fs.rmSync(bridgeRoot, {
            recursive: true,
            force: true
        });
        fs.rmSync(chromeProfile, {
            recursive: true,
            force: true
        });
    });

    const chromePath =
        execFileSync(
            "bash",
            [
                "-lc",
                "command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser"
            ],
            {
                encoding: "utf8"
            }
        ).trim();
    assert.ok(
        chromePath,
        "Chrome/Chromium is required for the V142 production browser contract"
    );

    const targetUrl =
        `https://fixgo-44e4d.web.app/gestia-terminal.html?v142-browser=${Date.now()}`;
    chrome = spawn(
        chromePath,
        [
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--remote-debugging-port=9222",
            `--user-data-dir=${chromeProfile}`,
            targetUrl
        ],
        {
            stdio: "ignore"
        }
    );

    const sleep = ms =>
        new Promise(resolve =>
            setTimeout(resolve, ms)
        );
    let pageTarget = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
        if (chrome.exitCode !== null) {
            throw new Error(
                `V142_PRODUCTION_CHROME_EXITED:${chrome.exitCode}`
            );
        }
        try {
            const response =
                await fetch(
                    "http://127.0.0.1:9222/json"
                );
            const targets =
                await response.json();
            pageTarget =
                targets.find(item =>
                    item?.type === "page" &&
                    String(item?.url || "")
                        .includes("gestia-terminal.html") &&
                    item?.webSocketDebuggerUrl
                ) || null;
            if (pageTarget) break;
        }
        catch {}
        await sleep(250);
    }
    assert.ok(
        pageTarget?.webSocketDebuggerUrl,
        "V142 production Terminal page did not become available through Chrome DevTools"
    );

    const socket =
        new WebSocket(
            pageTarget.webSocketDebuggerUrl
        );
    const pending =
        new Map();
    let nextId = 1;
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = () =>
            reject(
                new Error(
                    "V142_PRODUCTION_CDP_OPEN_FAILED"
                )
            );
    });
    t.after(() => {
        try {
            socket.close();
        }
        catch {}
    });
    socket.onmessage = event => {
        let message;
        try {
            message = JSON.parse(
                String(event.data)
            );
        }
        catch {
            return;
        }
        if (!message?.id || !pending.has(message.id)) {
            return;
        }
        const request =
            pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
            request.reject(
                new Error(
                    message.error.message ||
                    "V142_PRODUCTION_CDP_ERROR"
                )
            );
        }
        else {
            request.resolve(message.result);
        }
    };
    const cdp = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, {
                resolve,
                reject
            });
            socket.send(
                JSON.stringify({
                    id,
                    method,
                    params
                })
            );
        });

    await cdp("Runtime.enable");
    const evaluated =
        await cdp(
            "Runtime.evaluate",
            {
                expression: `
                    (async () => {
                        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
                        for (let attempt = 0; attempt < 120; attempt += 1) {
                            if (
                                globalThis.__NEXO_TERMINAL_BOOTSTRAP__?.localBridgeActive === true &&
                                typeof globalThis.JarvisLocalBridge?.requestJson === "function"
                            ) break;
                            await sleep(250);
                        }
                        const bootstrap = globalThis.__NEXO_TERMINAL_BOOTSTRAP__ || null;
                        const hasBridge = typeof globalThis.JarvisLocalBridge?.requestJson === "function";
                        let result = null;
                        let transportError = null;
                        if (hasBridge) {
                            try {
                                const value = await globalThis.JarvisLocalBridge.requestJson(
                                    "/research",
                                    {
                                        query: "Taquería El Dorado @taqueria.eldorado Cancún",
                                        timeoutMs: 30000,
                                        allowedDomain: "",
                                        exactEntity: "Taquería El Dorado",
                                        seedUrl: ""
                                    },
                                    {
                                        timeoutMs: 40000
                                    }
                                );
                                result = {
                                    ok: value?.ok === true,
                                    grounded: value?.grounded === true,
                                    status: value?.status || null,
                                    error: value?.error || null,
                                    sourceCount: Array.isArray(value?.sources)
                                        ? value.sources.length
                                        : Number(value?.sourceCount || 0),
                                    httpStatus: value?.httpStatus || null
                                };
                            }
                            catch(error) {
                                transportError = {
                                    name: error?.name || null,
                                    message: error?.message || String(error)
                                };
                            }
                        }
                        return {
                            href: location.href,
                            origin: location.origin,
                            bootstrap: bootstrap
                                ? {
                                    version: bootstrap.version || null,
                                    active: bootstrap.active === true,
                                    localBridgeActive: bootstrap.localBridgeActive === true,
                                    localBridgeBaseUrl: bootstrap.localBridgeBaseUrl || null
                                }
                                : null,
                            hasBridge,
                            result,
                            transportError
                        };
                    })()
                `,
                awaitPromise: true,
                returnByValue: true
            }
        );
    if (evaluated?.exceptionDetails) {
        throw new Error(
            `V142_PRODUCTION_BROWSER_EXCEPTION:${evaluated.exceptionDetails.text || "unknown"}`
        );
    }
    const browserResult =
        evaluated?.result?.value || null;

    console.log(
        "V142_PRODUCTION_BROWSER_LOCAL_BRIDGE",
        JSON.stringify(browserResult)
    );

    assert.equal(
        browserResult?.origin,
        "https://fixgo-44e4d.web.app"
    );
    assert.equal(
        browserResult?.bootstrap?.version,
        "1.11.0-local-bridge-transport-v142"
    );
    assert.equal(
        browserResult?.bootstrap?.localBridgeActive,
        true
    );
    assert.equal(
        browserResult?.hasBridge,
        true
    );
    assert.equal(
        browserResult?.transportError,
        null
    );
    assert.ok(
        browserResult?.result?.status,
        "The production page must receive a JSON status from /research"
    );
});
