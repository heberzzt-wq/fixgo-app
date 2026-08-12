from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one anchor, found {count}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")

# Bridge version and CDP request identity/body capture.
replace_once(
    "jarvis-fs-bridge.js",
    '"2.42.0-browser-network-media-fallback-v135";',
    '"2.43.0-cdp-response-body-media-v135";'
)
replace_once(
    "jarvis-fs-bridge.js",
    '''            const candidate = {\n                kind,\n                url: mediaUrl,\n                mimeType,\n                resourceType,\n                declaredBytes: Number.isFinite(declaredBytes) ? declaredBytes : 0,\n                status: Number(response?.status || 0),\n                sourcePageUrl: targetUrl,\n                sourceTag: "browser-network"\n            };''',
    '''            const candidate = {\n                kind,\n                url: mediaUrl,\n                mimeType,\n                resourceType,\n                requestId: String(message?.params?.requestId || ""),\n                declaredBytes: Number.isFinite(declaredBytes) ? declaredBytes : 0,\n                status: Number(response?.status || 0),\n                sourcePageUrl: targetUrl,\n                sourceTag: "browser-network"\n            };'''
)
body_capture = r'''        const bodyCandidates = [...media.values()]
            .filter(item =>
                item.status >= 200 &&
                item.status < 400 &&
                String(item.requestId || "").trim()
            )
            .sort((left, right) => {
                const familyOrder =
                    (right.kind === "video" ? 1 : 0) -
                    (left.kind === "video" ? 1 : 0);
                return familyOrder ||
                    Number(right.declaredBytes || 0) -
                    Number(left.declaredBytes || 0);
            })
            .slice(0, 24);
        let capturedBodyBytes = 0;
        for (const candidate of bodyCandidates) {
            const maximum = candidate.kind === "video"
                ? 50 * 1024 * 1024
                : 12 * 1024 * 1024;
            if (Number(candidate.declaredBytes || 0) > maximum) {
                candidate.bodyCaptureError = "BROWSER_MEDIA_CDP_DECLARED_SIZE_EXCEEDED";
                continue;
            }
            try {
                const responseBody = await call("Network.getResponseBody", {
                    requestId: candidate.requestId
                });
                const rawBody = String(responseBody?.body || "");
                if (!rawBody) {
                    candidate.bodyCaptureError = "BROWSER_MEDIA_CDP_BODY_EMPTY";
                    continue;
                }
                if (
                    responseBody?.base64Encoded === true &&
                    rawBody.length > Math.ceil(maximum * 4 / 3) + 16
                ) {
                    candidate.bodyCaptureError = "BROWSER_MEDIA_CDP_BODY_SIZE_EXCEEDED";
                    continue;
                }
                const bodyBytes = responseBody?.base64Encoded === true
                    ? Buffer.from(rawBody, "base64")
                    : Buffer.from(rawBody, "utf8");
                if (
                    bodyBytes.length < 1 ||
                    bodyBytes.length > maximum ||
                    capturedBodyBytes + bodyBytes.length > 120 * 1024 * 1024
                ) {
                    candidate.bodyCaptureError = "BROWSER_MEDIA_CDP_BODY_SIZE_EXCEEDED";
                    continue;
                }
                capturedBodyBytes += bodyBytes.length;
                candidate.bodyCaptured = true;
                candidate.bodyBytes = bodyBytes.length;
                candidate.bodyBase64 = bodyBytes.toString("base64");
            }
            catch(error) {
                candidate.bodyCaptureError =
                    error?.message ||
                    "BROWSER_MEDIA_CDP_BODY_UNAVAILABLE";
            }
        }

'''
replace_once(
    "jarvis-fs-bridge.js",
    '''        const candidates = [...media.values()]\n            .filter(item => item.status >= 200 && item.status < 400)''',
    body_capture + '''        const candidates = [...media.values()]\n            .filter(item => item.status >= 200 && item.status < 400)'''
)
replace_once(
    "jarvis-fs-bridge.js",
    '''            candidateCount: candidates.length,\n            counts: {\n                images: candidates.filter(item => item.kind === "image").length,\n                videos: candidates.filter(item => item.kind === "video").length,\n                total: candidates.length\n            },''',
    '''            candidateCount: candidates.length,\n            bodyCapturedCount: candidates.filter(item => item.bodyCaptured === true).length,\n            bodyCapturedBytes: candidates.reduce((sum, item) =>\n                sum + Number(item.bodyBytes || 0), 0),\n            counts: {\n                images: candidates.filter(item => item.kind === "image").length,\n                videos: candidates.filter(item => item.kind === "video").length,\n                total: candidates.length\n            },'''
)
replace_once(
    "jarvis-fs-bridge.js",
    '''                        status: observed.status,\n                        candidateCount: observed.candidateCount,\n                        counts: observed.counts''',
    '''                        status: observed.status,\n                        candidateCount: observed.candidateCount,\n                        bodyCapturedCount: observed.bodyCapturedCount || 0,\n                        bodyCapturedBytes: observed.bodyCapturedBytes || 0,\n                        counts: observed.counts'''
)

# Collector consumes captured session bytes and selects primary visual media.
replace_once(
    "nexo-web-media-bridge.js",
    '"1.4.0-browser-network-media-fallback-v135";',
    '"1.5.0-cdp-response-body-media-v135";'
)
replace_once(
    "nexo-web-media-bridge.js",
    '''                    declaredBytes: Math.max(0, Number(item.declaredBytes || 0)),\n                    resourceType: String(item.resourceType || ""),\n                    observedMimeType: mimeType''',
    '''                    declaredBytes: Math.max(0, Number(item.declaredBytes || 0)),\n                    resourceType: String(item.resourceType || ""),\n                    observedMimeType: mimeType,\n                    bodyCaptured: item.bodyCaptured === true,\n                    bodyBytes: Math.max(0, Number(item.bodyBytes || 0)),\n                    bodyBase64: item.bodyCaptured === true\n                        ? String(item.bodyBase64 || "")\n                        : "",\n                    bodyCaptureError: String(item.bodyCaptureError || "")'''
)
old_selection = '''    const selected = [];\n    for (const kind of ["image", "video"]) {\n        const available = discovered.filter(item => item.kind === kind);\n        const ordered = available.some(item => item.networkObserved === true)\n            ? [...available].sort((left, right) =>\n                Number(right.declaredBytes || 0) -\n                Number(left.declaredBytes || 0)\n            )\n            : kind === "image"\n                ? [\n                    ...available.filter(item => item.mediaRole === "brand_logo"),\n                    ...available.filter(item => item.mediaRole !== "brand_logo")\n                ]\n                : available;\n        selected.push(...ordered.slice(0, limits[kind]));\n    }'''
new_selection = '''    const selected = [];\n    const browserPrimaryVideoAvailable =\n        discoveryMode === "browser_network" &&\n        discovered.some(item =>\n            item.kind === "video" &&\n            (\n                item.bodyCaptured === true ||\n                Number(item.declaredBytes || 0) >= 50000\n            )\n        );\n    for (const kind of ["image", "video"]) {\n        let available = discovered.filter(item => item.kind === kind);\n        if (discoveryMode === "browser_network") {\n            available = available.filter(item => {\n                const effectiveBytes = Math.max(\n                    Number(item.bodyBytes || 0),\n                    Number(item.declaredBytes || 0)\n                );\n                if (kind === "video") return effectiveBytes >= 50000;\n                return effectiveBytes >= 20000 &&\n                    String(item.resourceType || "").toLowerCase() === "image";\n            });\n        }\n        const ordered = available.some(item => item.networkObserved === true)\n            ? [...available].sort((left, right) =>\n                Math.max(Number(right.bodyBytes || 0), Number(right.declaredBytes || 0)) -\n                Math.max(Number(left.bodyBytes || 0), Number(left.declaredBytes || 0))\n            )\n            : kind === "image"\n                ? [\n                    ...available.filter(item => item.mediaRole === "brand_logo"),\n                    ...available.filter(item => item.mediaRole !== "brand_logo")\n                ]\n                : available;\n        let effectiveLimit = limits[kind];\n        if (\n            discoveryMode === "browser_network" &&\n            kind === "image" &&\n            browserPrimaryVideoAvailable &&\n            requireImages !== true\n        ) {\n            effectiveLimit = 0;\n        }\n        if (\n            discoveryMode === "browser_network" &&\n            kind === "video" &&\n            browserPrimaryVideoAvailable\n        ) {\n            effectiveLimit = Math.min(effectiveLimit, 1);\n        }\n        selected.push(...ordered.slice(0, effectiveLimit));\n    }'''
replace_once("nexo-web-media-bridge.js", old_selection, new_selection)
old_fetch = '''            const fetched = await fetchBounded(candidate.url, {\n                maxBytes: candidate.kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES,\n                timeoutMs,\n                allowedMimePrefixes: [candidate.kind === "video" ? "video/" : "image/"],\n                allowPrivateHostsForTesting\n            });'''
new_fetch = '''            let fetched;\n            if (candidate.bodyCaptured === true && candidate.bodyBase64) {\n                const candidateUrl = normalizeHttpUrl(candidate.url);\n                await assertPublicUrl(candidateUrl, { allowPrivateHostsForTesting });\n                const maximum = candidate.kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;\n                const bytes = Buffer.from(candidate.bodyBase64, "base64");\n                if (\n                    bytes.length < 1 ||\n                    bytes.length > maximum ||\n                    (Number(candidate.bodyBytes || 0) > 0 && bytes.length !== Number(candidate.bodyBytes))\n                ) {\n                    throw new Error("WEB_MEDIA_CAPTURED_BODY_SIZE_INVALID");\n                }\n                const observedMimeType = String(candidate.observedMimeType || "").toLowerCase();\n                if (!observedMimeType.startsWith(`${candidate.kind}/`)) {\n                    throw new Error("WEB_MEDIA_CAPTURED_BODY_MIME_INVALID");\n                }\n                fetched = {\n                    url: candidateUrl.toString(),\n                    mimeType: observedMimeType,\n                    bytes,\n                    headers: {}\n                };\n            }\n            else {\n                fetched = await fetchBounded(candidate.url, {\n                    maxBytes: candidate.kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES,\n                    timeoutMs,\n                    allowedMimePrefixes: [candidate.kind === "video" ? "video/" : "image/"],\n                    allowPrivateHostsForTesting\n                });\n            }'''
replace_once("nexo-web-media-bridge.js", old_fetch, new_fetch)
replace_once(
    "nexo-web-media-bridge.js",
    '''                        type: "verbatim_download",\n                        sha256: digest,''',
    '''                        type: candidate.bodyCaptured === true\n                            ? "browser_network_response_body"\n                            : "verbatim_download",\n                        sha256: digest,'''
)
replace_once(
    "nexo-web-media-bridge.js",
    '''                networkObserved: candidate.networkObserved === true,\n                sourcePageUrl: candidate.sourcePageUrl || page.toString(),''',
    '''                networkObserved: candidate.networkObserved === true,\n                bodyCaptured: candidate.bodyCaptured === true,\n                sourcePageUrl: candidate.sourcePageUrl || page.toString(),'''
)

# Runtime/cache versions.
replace_once(
    "gestia-core/nexo/nexo.real-media.tools.js",
    '"1.5.0-browser-network-media-fallback-v135";',
    '"1.6.0-cdp-response-body-media-v135";'
)
replace_once(
    "gestia-core/nexo/nexo.real-media.tools.js",
    '"Descarga fotos y videos reales desde una URL explícita; si el HTML estático no expone suficientes medios, usa Chrome/CDP para observar recursos visuales solicitados por esa misma página y después valida host, MIME, firma de bytes, tamaño y SHA-256. Nunca genera material sintético."',
    '"Descarga fotos y videos reales desde una URL explícita; si el HTML estático no expone suficientes medios, usa Chrome/CDP para observar y conservar los bytes visuales recibidos por esa misma sesión, y después valida host, MIME, firma de bytes, tamaño y SHA-256. Prioriza el medio principal y nunca genera material sintético."'
)
replace_once(
    "modules/terminal/nexo-bootstrap.js",
    '"1.8.0-browser-network-media-fallback-v135";',
    '"1.9.0-cdp-response-body-media-v135";'
)
replace_once(
    "modules/terminal/nexo-bootstrap.js",
    '"../../gestia-core/nexo/nexo.real-media.tools.js?v=v135-browser-network-media-fallback-20260812"',
    '"../../gestia-core/nexo/nexo.real-media.tools.js?v=v135-cdp-response-body-media-20260812"'
)
replace_once(
    "modules/terminal/proposal-state.js",
    'import "./nexo-bootstrap.js?v=v135-browser-network-media-fallback-20260812";',
    'import "./nexo-bootstrap.js?v=v135-cdp-response-body-media-20260812";'
)
replace_once(
    "gestia-terminal.html",
    '<script type="module" src="/modules/terminal/proposal-state.js?v=v135-browser-network-media-fallback-20260812"></script>',
    '<script type="module" src="/modules/terminal/proposal-state.js?v=v135-cdp-response-body-media-20260812"></script>'
)
replace_once(
    "tests/jarvis-fs-bridge-v2.test.mjs",
    'assert.equal(description.version, "2.42.0-browser-network-media-fallback-v135");',
    'assert.equal(description.version, "2.43.0-cdp-response-body-media-v135");'
)

print("v135 CDP response-body patch applied")
