from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one anchor, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

# --- jarvis-fs-bridge.js -----------------------------------------------------
replace_once(
    "jarvis-fs-bridge.js",
    'import {\n    registerNexoWebMediaRoutes\n} from "./nexo-web-media-bridge.js";',
    'import {\n    collectNexoRealWebMedia,\n    registerNexoWebMediaRoutes\n} from "./nexo-web-media-bridge.js";'
)
replace_once(
    "jarvis-fs-bridge.js",
    '"2.41.0-source-grounded-research-v124";',
    '"2.42.0-browser-network-media-fallback-v135";'
)

helper = r'''
export async function captureBrowserNetworkMedia({
    url = "",
    chrome = resolveChromeExecutable(),
    timeoutMs = 45000,
    root = DEFAULT_ROOT
} = {}) {
    const targetUrl = normalizeBrowserUrl(url);
    if (!chrome) {
        return {
            ok: false,
            status: "BROWSER_EXECUTABLE_NOT_FOUND",
            error: "BROWSER_EXECUTABLE_NOT_FOUND",
            media: []
        };
    }
    if (typeof globalThis.WebSocket !== "function") {
        return {
            ok: false,
            status: "BROWSER_CDP_WEBSOCKET_UNAVAILABLE",
            error: "BROWSER_CDP_WEBSOCKET_UNAVAILABLE",
            media: []
        };
    }

    const boundedTimeoutMs = Math.min(
        Math.max(Number(timeoutMs) || 45000, 8000),
        90000
    );
    const profileDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "jarvis-browser-media-cdp-")
    );
    const child = spawn(
        chrome,
        [
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-sync",
            "--no-first-run",
            "--remote-debugging-port=0",
            "--remote-allow-origins=*",
            `--user-data-dir=${profileDir}`,
            "about:blank"
        ],
        {
            cwd: path.resolve(root),
            stdio: "ignore",
            windowsHide: true
        }
    );

    let socket = null;
    try {
        const port = await readChromeDevToolsPort(
            profileDir,
            child,
            Math.min(12000, boundedTimeoutMs)
        );
        const targetResponse = await fetch(
            `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,
            { method: "PUT" }
        );
        if (!targetResponse.ok) {
            throw new Error(`BROWSER_MEDIA_CDP_NEW_TARGET_${targetResponse.status}`);
        }
        const target = await targetResponse.json();
        if (!target?.webSocketDebuggerUrl) {
            throw new Error("BROWSER_MEDIA_CDP_PAGE_WS_REQUIRED");
        }

        socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
        const pending = new Map();
        const media = new Map();
        let nextId = 1;
        let loadResolve = null;
        const loaded = new Promise(resolve => {
            loadResolve = resolve;
        });
        const opened = new Promise((resolve, reject) => {
            socket.onopen = resolve;
            socket.onerror = () => reject(
                new Error("BROWSER_MEDIA_CDP_SOCKET_OPEN_FAILED")
            );
        });
        socket.onmessage = event => {
            let message;
            try {
                message = JSON.parse(String(event.data));
            }
            catch {
                return;
            }
            if (message?.id && pending.has(message.id)) {
                const current = pending.get(message.id);
                pending.delete(message.id);
                if (message.error) {
                    current.reject(
                        new Error(message.error.message || "BROWSER_MEDIA_CDP_ERROR")
                    );
                }
                else {
                    current.resolve(message.result);
                }
                return;
            }
            if (message?.method === "Page.loadEventFired") {
                loadResolve?.(true);
                return;
            }
            if (message?.method !== "Network.responseReceived") {
                return;
            }
            const response = message?.params?.response || {};
            const resourceType = String(message?.params?.type || "").trim();
            const mimeType = String(response?.mimeType || "")
                .split(";")[0]
                .trim()
                .toLowerCase();
            const kind = mimeType.startsWith("image/")
                ? "image"
                : mimeType.startsWith("video/")
                    ? "video"
                    : "";
            const mediaUrl = String(response?.url || "").trim();
            if (!kind || !/^https?:\/\//i.test(mediaUrl)) {
                return;
            }
            let declaredBytes = 0;
            for (const [headerName, headerValue] of Object.entries(response?.headers || {})) {
                if (String(headerName).toLowerCase() === "content-length") {
                    declaredBytes = Number(headerValue || 0);
                    break;
                }
            }
            const previous = media.get(mediaUrl);
            const candidate = {
                kind,
                url: mediaUrl,
                mimeType,
                resourceType,
                declaredBytes: Number.isFinite(declaredBytes) ? declaredBytes : 0,
                status: Number(response?.status || 0),
                sourcePageUrl: targetUrl,
                sourceTag: "browser-network"
            };
            if (
                !previous ||
                candidate.declaredBytes > Number(previous.declaredBytes || 0)
            ) {
                media.set(mediaUrl, candidate);
            }
        };

        await opened;
        const call = (method, params = {}) =>
            new Promise((resolve, reject) => {
                const id = nextId++;
                pending.set(id, { resolve, reject });
                socket.send(JSON.stringify({ id, method, params }));
            });

        await call("Network.enable");
        await call("Page.enable");
        await call("Runtime.enable");
        const navigation = await call("Page.navigate", { url: targetUrl });
        if (navigation?.errorText) {
            throw new Error(`BROWSER_MEDIA_NAVIGATION_FAILED:${navigation.errorText}`);
        }
        await Promise.race([
            loaded,
            sleepMs(Math.min(10000, Math.max(2500, Math.floor(boundedTimeoutMs / 3))))
        ]);
        try {
            await call("Runtime.evaluate", {
                expression: `(() => new Promise(async resolve => { try { const height = Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0); const steps = 5; for (let index = 1; index <= steps; index += 1) { window.scrollTo(0, Math.floor(height * index / steps)); await new Promise(done => setTimeout(done, 350)); } window.scrollTo(0, 0); resolve(true); } catch { resolve(false); } }))()`,
                awaitPromise: true,
                returnByValue: true
            });
        }
        catch {}
        await sleepMs(
            Math.min(5000, Math.max(1500, Math.floor(boundedTimeoutMs / 10)))
        );

        const candidates = [...media.values()]
            .filter(item => item.status >= 200 && item.status < 400)
            .sort((left, right) =>
                Number(right.declaredBytes || 0) -
                Number(left.declaredBytes || 0)
            )
            .slice(0, 120);
        return {
            ok: true,
            status: candidates.length > 0
                ? "BROWSER_NETWORK_MEDIA_DISCOVERED"
                : "BROWSER_NETWORK_MEDIA_EMPTY",
            url: targetUrl,
            candidateCount: candidates.length,
            counts: {
                images: candidates.filter(item => item.kind === "image").length,
                videos: candidates.filter(item => item.kind === "video").length,
                total: candidates.length
            },
            media: candidates,
            engine: path.basename(chrome)
        };
    }
    catch(error) {
        return {
            ok: false,
            status: "BROWSER_NETWORK_MEDIA_FAILED",
            error: error?.message || String(error),
            url: targetUrl,
            candidateCount: 0,
            media: []
        };
    }
    finally {
        try { socket?.close?.(); } catch {}
        try { child.kill("SIGTERM"); } catch {}
        await sleepMs(150);
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
    }
}

'''
replace_once(
    "jarvis-fs-bridge.js",
    'export async function exportReelWebmWithChrome({',
    helper + 'export async function exportReelWebmWithChrome({' 
)
replace_once(
    "jarvis-fs-bridge.js",
    'actions: ["inspect", "screenshot", "pdf", "open"]',
    'actions: ["inspect", "screenshot", "pdf", "open", "media"]'
)

media_route = r'''
            if (action === "media") {
                const observed = await captureBrowserNetworkMedia({
                    url,
                    chrome,
                    timeoutMs,
                    root
                });
                if (observed?.ok !== true) {
                    return res.status(502).json({
                        ...observed,
                        action,
                        engine: path.basename(chrome),
                        version: JARVIS_FS_BRIDGE_VERSION
                    });
                }
                const collected = await collectNexoRealWebMedia({
                    url,
                    discoveredMedia: observed.media,
                    requireImages: req.body?.requireImages === true,
                    requireVideos: req.body?.requireVideos === true,
                    requireAnyVisual: req.body?.requireAnyVisual === true,
                    maxImages: req.body?.maxImages,
                    maxVideos: req.body?.maxVideos,
                    timeoutMs,
                    root,
                    allowPrivateHostsForTesting: false
                });
                return res.status(collected?.ok === true ? 200 : 422).json({
                    ...collected,
                    action,
                    browserNetwork: {
                        status: observed.status,
                        candidateCount: observed.candidateCount,
                        counts: observed.counts
                    },
                    engine: path.basename(chrome),
                    version: JARVIS_FS_BRIDGE_VERSION
                });
            }

'''
replace_once(
    "jarvis-fs-bridge.js",
    '            const args = [\n                "--headless=new",',
    media_route + '            const args = [\n                "--headless=new",'
)
replace_once(
    "jarvis-fs-bridge.js",
    'allowedActions: ["inspect", "screenshot", "pdf", "open"],',
    'allowedActions: ["inspect", "screenshot", "pdf", "open", "media"],'
)

# --- nexo-web-media-bridge.js ----------------------------------------------
replace_once(
    "nexo-web-media-bridge.js",
    '"1.3.0-real-reel-production-gate-v134";',
    '"1.4.0-browser-network-media-fallback-v135";'
)
replace_once(
    "nexo-web-media-bridge.js",
    '    allowedHosts = [],\n    timeoutMs = 30000,',
    '    allowedHosts = [],\n    discoveredMedia = [],\n    timeoutMs = 30000,'
)
old_discovery = '''    const page = normalizeHttpUrl(url);\n    const pageResponse = await fetchBounded(page, {\n        maxBytes: MAX_HTML_BYTES,\n        timeoutMs,\n        allowedExactMimes: ["text/html", "application/xhtml+xml"],\n        allowPrivateHostsForTesting\n    });\n    const html = pageResponse.bytes.toString("utf8");\n    const discovered = mediaCandidates(html, pageResponse.url)\n        .filter(item => {\n            const mediaHost = new URL(item.url).hostname;\n            return (\n                hostAllowed(mediaHost, page.hostname, allowedHosts) ||\n                sourceDeclaredMediaCandidate(item)\n            );\n        });'''
new_discovery = '''    const page = normalizeHttpUrl(url);\n    let finalPageUrl = page.toString();\n    let discoveryMode = "html_static";\n    const networkCandidates = (Array.isArray(discoveredMedia) ? discoveredMedia : [])\n        .map(item => {\n            if (!item || typeof item !== "object") return null;\n            const mimeType = String(item.mimeType || "").trim().toLowerCase();\n            const declaredKind = String(item.kind || "").trim().toLowerCase();\n            const kind = ["image", "video"].includes(declaredKind)\n                ? declaredKind\n                : mimeType.startsWith("image/")\n                    ? "image"\n                    : mimeType.startsWith("video/")\n                        ? "video"\n                        : "";\n            if (!kind) return null;\n            try {\n                const candidateUrl = normalizeHttpUrl(item.url);\n                return {\n                    kind,\n                    url: candidateUrl.toString(),\n                    sourceTag: "browser-network",\n                    alt: String(item.alt || "").slice(0, 300),\n                    mediaRole: "scene",\n                    networkObserved: true,\n                    sourcePageUrl: String(item.sourcePageUrl || page.toString()),\n                    declaredBytes: Math.max(0, Number(item.declaredBytes || 0)),\n                    resourceType: String(item.resourceType || ""),\n                    observedMimeType: mimeType\n                };\n            } catch {\n                return null;\n            }\n        })\n        .filter(Boolean);\n\n    let discovered;\n    if (networkCandidates.length > 0) {\n        discoveryMode = "browser_network";\n        discovered = networkCandidates;\n    }\n    else {\n        const pageResponse = await fetchBounded(page, {\n            maxBytes: MAX_HTML_BYTES,\n            timeoutMs,\n            allowedExactMimes: ["text/html", "application/xhtml+xml"],\n            allowPrivateHostsForTesting\n        });\n        finalPageUrl = pageResponse.url;\n        const html = pageResponse.bytes.toString("utf8");\n        discovered = mediaCandidates(html, pageResponse.url)\n            .filter(item => {\n                const mediaHost = new URL(item.url).hostname;\n                return (\n                    hostAllowed(mediaHost, page.hostname, allowedHosts) ||\n                    sourceDeclaredMediaCandidate(item)\n                );\n            });\n    }'''
replace_once("nexo-web-media-bridge.js", old_discovery, new_discovery)
replace_once(
    "nexo-web-media-bridge.js",
    '''        const ordered = kind === "image"\n            ? [\n                ...available.filter(item => item.mediaRole === "brand_logo"),\n                ...available.filter(item => item.mediaRole !== "brand_logo")\n            ]\n            : available;''',
    '''        const ordered = available.some(item => item.networkObserved === true)\n            ? [...available].sort((left, right) =>\n                Number(right.declaredBytes || 0) -\n                Number(left.declaredBytes || 0)\n            )\n            : kind === "image"\n                ? [\n                    ...available.filter(item => item.mediaRole === "brand_logo"),\n                    ...available.filter(item => item.mediaRole !== "brand_logo")\n                ]\n                : available;'''
)
replace_once(
    "nexo-web-media-bridge.js",
    '''                        sourceDeclared: sourceDeclaredMediaCandidate(candidate),\n                        mediaRole: candidate.mediaRole || "scene"''',
    '''                        sourceDeclared: sourceDeclaredMediaCandidate(candidate),\n                        networkObserved: candidate.networkObserved === true,\n                        sourcePageUrl: candidate.sourcePageUrl || page.toString(),\n                        mediaRole: candidate.mediaRole || "scene"'''
)
replace_once(
    "nexo-web-media-bridge.js",
    '''                sourceDeclared: sourceDeclaredMediaCandidate(candidate),\n                mediaRole: candidate.mediaRole || "scene",\n                alt: candidate.alt,''',
    '''                sourceDeclared: sourceDeclaredMediaCandidate(candidate),\n                networkObserved: candidate.networkObserved === true,\n                sourcePageUrl: candidate.sourcePageUrl || page.toString(),\n                mediaRole: candidate.mediaRole || "scene",\n                alt: candidate.alt,'''
)
replace_once(
    "nexo-web-media-bridge.js",
    '''                sourceDeclared: sourceDeclaredMediaCandidate(candidate),\n                mediaRole: candidate.mediaRole || "scene",\n                reason: error?.message || String(error)''',
    '''                sourceDeclared: sourceDeclaredMediaCandidate(candidate),\n                networkObserved: candidate.networkObserved === true,\n                sourcePageUrl: candidate.sourcePageUrl || page.toString(),\n                mediaRole: candidate.mediaRole || "scene",\n                reason: error?.message || String(error)'''
)
replace_once(
    "nexo-web-media-bridge.js",
    '        finalPageUrl: pageResponse.url,\n        capturedAt:',
    '        finalPageUrl,\n        discoveryMode,\n        capturedAt:'
)
replace_once(
    "nexo-web-media-bridge.js",
    '        finalPageUrl: pageResponse.url,\n        requirementsMet,',
    '        finalPageUrl,\n        discoveryMode,\n        requirementsMet,'
)

# --- NEXO runtime fallback --------------------------------------------------
replace_once(
    "gestia-core/nexo/nexo.real-media.tools.js",
    '"1.4.0-real-reel-production-gate-v134";',
    '"1.5.0-browser-network-media-fallback-v135";'
)
old_execute = '''        execute: async (args = {}, context = {}) => {\n            const result = await bridgeRequest("/web/media/collect", {\n                ...args,\n                objectiveId: args.objectiveId || context.objectiveId || "",\n                caseId: args.caseId || context.caseId || ""\n            }, Math.max(60000, Number(args.timeoutMs) || 120000));\n            return {\n                ...result,\n                objectiveSatisfied: result?.ok === true && result?.requirementsMet === true,\n                blocked: result?.ok !== true || result?.requirementsMet !== true,\n                requiresInput: false,\n                retryable: result?.status === "LOCAL_BRIDGE_REQUIRED"\n            };\n        }'''
new_execute = '''        execute: async (args = {}, context = {}) => {\n            const timeoutMs = Math.max(60000, Number(args.timeoutMs) || 120000);\n            const staticResult = await bridgeRequest("/web/media/collect", {\n                ...args,\n                objectiveId: args.objectiveId || context.objectiveId || "",\n                caseId: args.caseId || context.caseId || ""\n            }, timeoutMs);\n            let result = staticResult;\n            let browserFallback = null;\n            const shouldTryBrowser =\n                staticResult?.status !== "LOCAL_BRIDGE_REQUIRED" &&\n                (staticResult?.ok !== true || staticResult?.requirementsMet !== true);\n            if (shouldTryBrowser) {\n                const browserResult = await bridgeRequest("/browser", {\n                    action: "media",\n                    url: args.url,\n                    requireImages: args.requireImages === true,\n                    requireVideos: args.requireVideos === true,\n                    requireAnyVisual: args.requireAnyVisual === true,\n                    maxImages: args.maxImages,\n                    maxVideos: args.maxVideos,\n                    timeoutMs: Number(args.timeoutMs) || 45000,\n                    objectiveId: args.objectiveId || context.objectiveId || "",\n                    caseId: args.caseId || context.caseId || ""\n                }, timeoutMs);\n                browserFallback = {\n                    attempted: true,\n                    status: browserResult?.status || "BROWSER_MEDIA_FALLBACK_FAILED",\n                    ok: browserResult?.ok === true,\n                    requirementsMet: browserResult?.requirementsMet === true,\n                    candidateCount: Number(browserResult?.browserNetwork?.candidateCount || 0)\n                };\n                if (\n                    browserResult?.ok === true &&\n                    browserResult?.requirementsMet === true\n                ) {\n                    result = {\n                        ...browserResult,\n                        browserFallbackUsed: true,\n                        staticCollectionStatus: staticResult?.status || null\n                    };\n                }\n                else {\n                    result = {\n                        ...staticResult,\n                        browserFallbackUsed: false,\n                        browserFallback\n                    };\n                }\n            }\n            return {\n                ...result,\n                ...(browserFallback ? { browserFallback } : {}),\n                objectiveSatisfied: result?.ok === true && result?.requirementsMet === true,\n                blocked: result?.ok !== true || result?.requirementsMet !== true,\n                requiresInput: false,\n                retryable: result?.status === "LOCAL_BRIDGE_REQUIRED"\n            };\n        }'''
replace_once("gestia-core/nexo/nexo.real-media.tools.js", old_execute, new_execute)
replace_once(
    "gestia-core/nexo/nexo.real-media.tools.js",
    '"Descarga fotos y videos reales desde una URL explícita, valida host, MIME, firma de bytes, tamaño y SHA-256, y conserva un manifiesto local. Nunca genera material sintético."',
    '"Descarga fotos y videos reales desde una URL explícita; si el HTML estático no expone suficientes medios, usa Chrome/CDP para observar recursos visuales solicitados por esa misma página y después valida host, MIME, firma de bytes, tamaño y SHA-256. Nunca genera material sintético."'
)

# --- cache-busting chain ----------------------------------------------------
replace_once(
    "modules/terminal/nexo-bootstrap.js",
    '"1.7.0-semantic-reel-media-authority-v131";',
    '"1.8.0-browser-network-media-fallback-v135";'
)
replace_once(
    "modules/terminal/nexo-bootstrap.js",
    '"../../gestia-core/nexo/nexo.real-media.tools.js?v=v94-real-media-reel-hydration-v127-20260811"',
    '"../../gestia-core/nexo/nexo.real-media.tools.js?v=v135-browser-network-media-fallback-20260812"'
)
replace_once(
    "modules/terminal/proposal-state.js",
    'import "./nexo-bootstrap.js?v=v94-real-media-runtime-authority-v128-20260811";',
    'import "./nexo-bootstrap.js?v=v135-browser-network-media-fallback-20260812";'
)
replace_once(
    "gestia-terminal.html",
    '<script type="module" src="/modules/terminal/proposal-state.js?v=shared-proposal-state-v1-20260713"></script>',
    '<script type="module" src="/modules/terminal/proposal-state.js?v=v135-browser-network-media-fallback-20260812"></script>'
)

print("v135 browser-network media fallback patch applied")
