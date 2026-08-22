import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as tls from "node:tls";

import {
    JARVIS_FS_BRIDGE_VERSION,
    appendChunkedUpload,
    cancelChunkedUpload,
    completeChunkedUpload,
    createJarvisFsBridgeApp,
    saveUploadedArtifact,
    startChunkedUpload
} from "./jarvis-fs-bridge.js";

function ensureSystemCertificates() {
    if (
        typeof tls.getCACertificates === "function" &&
        typeof tls.setDefaultCACertificates === "function"
    ) {
        const certificates = [
            ...tls.getCACertificates("default"),
            ...tls.getCACertificates("system")
        ];
        tls.setDefaultCACertificates([...new Set(certificates)]);
    }
}

function decodeResearchHtml(value = "") {
    return String(value || "")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 32));
}

function stripResearchMarkup(value = "") {
    return decodeResearchHtml(
        String(value || "")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
    )
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeResearchDomain(value = "") {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];
}

function researchDomainFromUrl(value = "") {
    try {
        return new URL(String(value || "")).hostname
            .toLowerCase()
            .replace(/^www\./, "");
    }
    catch {
        return "";
    }
}

function researchIdentityHandleFromUrl(value = "") {
    try {
        const parsed = new URL(String(value || ""));
        for (const rawSegment of parsed.pathname.split("/")) {
            let segment = rawSegment;
            try {
                segment = decodeURIComponent(rawSegment);
            }
            catch {
                // Preserve the raw path segment if decoding fails.
            }
            const normalized = String(segment || "")
                .trim()
                .toLowerCase();
            if (normalized.startsWith("@") && normalized.length > 1) {
                return normalized;
            }
        }
    }
    catch {
        // Invalid or missing URLs simply do not carry an identity handle.
    }
    return "";
}

function normalizeDuckDuckGoResearchUrl(value = "") {
    const decoded = decodeResearchHtml(String(value || "").trim());
    if (!decoded) return "";
    try {
        const candidate = decoded.startsWith("//")
            ? `https:${decoded}`
            : decoded;
        const parsed = new URL(candidate, "https://duckduckgo.com");
        const redirected = parsed.hostname.endsWith("duckduckgo.com")
            ? parsed.searchParams.get("uddg")
            : "";
        return redirected || parsed.toString();
    }
    catch {
        return "";
    }
}

function extractDuckDuckGoHtmlResearchSources(html = "") {
    const sources = [];
    const blocks = String(html || "")
        .split(/<div class="result results_links[^>]*>/i)
        .slice(1);

    for (const block of blocks) {
        const titleMatch = block.match(
            /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
        );
        if (!titleMatch) continue;
        const snippetMatch = block.match(
            /class="result__snippet"[^>]*>([\s\S]*?)(?:<\/a>|<\/div>)/i
        );
        const url = normalizeDuckDuckGoResearchUrl(titleMatch[1]);
        if (!/^https?:\/\//i.test(url)) continue;
        sources.push({
            title: stripResearchMarkup(titleMatch[2]).slice(0, 220),
            url,
            summary: stripResearchMarkup(snippetMatch?.[1] || "").slice(0, 700)
        });
    }

    return sources;
}

function extractDuckDuckGoLiteResearchSources(html = "") {
    const sources = [];
    const anchorPattern = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = anchorPattern.exec(String(html || ""))) !== null) {
        const url = normalizeDuckDuckGoResearchUrl(match[1]);
        const title = stripResearchMarkup(match[2]);
        if (!/^https?:\/\//i.test(url) || !title) continue;
        const domain = researchDomainFromUrl(url);
        if (!domain || domain.endsWith("duckduckgo.com")) continue;
        sources.push({
            title: title.slice(0, 220),
            url,
            summary: ""
        });
        if (sources.length >= 12) break;
    }
    return sources;
}

function extractResearchRssTag(item = "", tag = "") {
    const match = String(item || "").match(
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
    );
    return decodeResearchHtml(
        String(match?.[1] || "")
            .replace(/^<!\[CDATA\[/, "")
            .replace(/\]\]>$/, "")
    ).trim();
}

function extractBingRssResearchSources(rss = "") {
    return (String(rss || "").match(/<item>[\s\S]*?<\/item>/gi) || [])
        .map(item => ({
            title: stripResearchMarkup(extractResearchRssTag(item, "title")).slice(0, 220),
            url: extractResearchRssTag(item, "link"),
            summary: stripResearchMarkup(extractResearchRssTag(item, "description")).slice(0, 700)
        }))
        .filter(source => /^https?:\/\//i.test(source.url));
}

function buildLocalResearchQuery(
    query = "",
    {
        allowedDomain = "",
        exactEntity = "",
        seedUrl = ""
    } = {}
) {
    const values = [String(query || "").replace(/\s+/g, " ").trim()];
    const entity = String(exactEntity || "").replace(/\s+/g, " ").trim();
    if (entity && !values.join(" ").toLowerCase().includes(entity.toLowerCase())) {
        values.push(`"${entity}"`);
    }

    const identityHandle = researchIdentityHandleFromUrl(seedUrl);
    if (
        identityHandle &&
        !values.join(" ").toLowerCase().includes(identityHandle)
    ) {
        values.push(`"${identityHandle}"`);
    }

    let domain = normalizeResearchDomain(allowedDomain);
    if (!domain && seedUrl) domain = researchDomainFromUrl(seedUrl);
    if (domain && !values.join(" ").toLowerCase().includes(`site:${domain}`)) {
        values.push(`site:${domain}`);
    }

    return values
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600);
}

async function fetchLocalResearchText(
    fetchImpl,
    url,
    {
        timeoutMs,
        headers = {}
    } = {}
) {
    const response = await fetchImpl(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 JarvisLocalResearch/1.0",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ...headers
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
    }
    return {
        text: await response.text(),
        url: response.url || url,
        status: response.status
    };
}

function localResearchSourceMatchesDomain(source, domain = "") {
    const expected = normalizeResearchDomain(domain);
    if (!expected) return true;
    const actual = researchDomainFromUrl(source?.url);
    return actual === expected || actual.endsWith(`.${expected}`);
}

function localResearchSourceMatchesEntity(source, exactEntity = "") {
    const entity = String(exactEntity || "").trim().toLowerCase();
    if (!entity) return true;
    const tokens = entity
        .split(/[^\p{L}\p{N}]+/u)
        .filter(token => token.length >= 2);
    if (tokens.length === 0) return true;
    const haystack = [
        source?.title,
        source?.url,
        researchDomainFromUrl(source?.url),
        source?.summary
    ].join(" ").toLowerCase();
    return tokens.every(token => haystack.includes(token));
}

function localResearchSourceMatchesSeedIdentity(source, seedUrl = "") {
    const expectedHandle = researchIdentityHandleFromUrl(seedUrl);
    if (!expectedHandle) return true;

    const actualHandle = researchIdentityHandleFromUrl(source?.url);
    if (actualHandle) {
        return actualHandle === expectedHandle;
    }

    const haystack = [
        source?.title,
        source?.url,
        source?.summary
    ].join(" ").toLowerCase();
    return haystack.includes(expectedHandle);
}

function normalizeLocalResearchSources(candidates = [], options = {}) {
    const seen = new Set();
    const effectiveDomain =
        normalizeResearchDomain(options.allowedDomain) ||
        researchDomainFromUrl(options.seedUrl);
    return candidates
        .filter(source => {
            const url = String(source?.url || "").trim();
            if (!/^https?:\/\//i.test(url) || seen.has(url)) return false;
            if (!localResearchSourceMatchesDomain(source, effectiveDomain)) return false;
            if (!localResearchSourceMatchesEntity(source, options.exactEntity)) return false;
            if (!localResearchSourceMatchesSeedIdentity(source, options.seedUrl)) return false;
            seen.add(url);
            return true;
        })
        .slice(0, 8)
        .map((source, index) => ({
            id: index + 1,
            title: String(source.title || researchDomainFromUrl(source.url) || source.url).slice(0, 220),
            url: String(source.url),
            summary: String(source.summary || "").slice(0, 700)
        }));
}

async function directLocalResearchDomainFallback(fetchImpl, options, timeoutMs) {
    const domain = normalizeResearchDomain(options.allowedDomain) || researchDomainFromUrl(options.seedUrl);
    if (!domain) return [];
    const target = /^https?:\/\//i.test(String(options.seedUrl || ""))
        ? String(options.seedUrl)
        : `https://${domain}/`;
    const result = await fetchLocalResearchText(fetchImpl, target, { timeoutMs });
    const title = stripResearchMarkup(
        result.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || domain
    );
    const description = stripResearchMarkup(
        result.text.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)?.[1] || ""
    );
    return [{
        title: title || domain,
        url: result.url,
        summary: description
    }];
}

export async function runResilientLocalWebResearch(
    query = "",
    timeoutMs = 20000,
    options = {},
    fetchImpl = globalThis.fetch
) {
    if (typeof fetchImpl !== "function") {
        throw new Error("WEB_RESEARCH_FETCH_REQUIRED");
    }

    const normalizedQuery = buildLocalResearchQuery(query, options);
    if (normalizedQuery.length < 5) {
        throw new Error("WEB_RESEARCH_QUERY_REQUIRED");
    }

    ensureSystemCertificates();
    const boundedTimeoutMs = Math.min(
        Math.max(Number(timeoutMs) || 20000, 5000),
        30000
    );
    const attempts = [];
    let candidates = [];
    let engine = "";

    const providers = [
        {
            name: "jarvis_local_duckduckgo_html_research",
            url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalizedQuery)}`,
            parse: extractDuckDuckGoHtmlResearchSources
        },
        {
            name: "jarvis_local_duckduckgo_lite_research",
            url: `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(normalizedQuery)}`,
            parse: extractDuckDuckGoLiteResearchSources
        },
        {
            name: "jarvis_local_bing_rss_research",
            url: `https://www.bing.com/search?format=rss&q=${encodeURIComponent(normalizedQuery)}`,
            parse: extractBingRssResearchSources,
            headers: {
                Accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8"
            }
        }
    ];

    for (const provider of providers) {
        try {
            const result = await fetchLocalResearchText(fetchImpl, provider.url, {
                timeoutMs: boundedTimeoutMs,
                headers: provider.headers
            });
            const parsed = provider.parse(result.text);
            const accepted = normalizeLocalResearchSources(parsed, options);
            attempts.push({
                provider: provider.name,
                ok: accepted.length > 0,
                status: result.status,
                sourceCount: accepted.length
            });
            if (accepted.length > 0) {
                candidates = accepted;
                engine = provider.name;
                break;
            }
        }
        catch(error) {
            attempts.push({
                provider: provider.name,
                ok: false,
                error: String(error?.message || error || "FAILED")
            });
        }
    }

    if (candidates.length === 0) {
        try {
            const direct = normalizeLocalResearchSources(
                await directLocalResearchDomainFallback(fetchImpl, options, boundedTimeoutMs),
                options
            );
            attempts.push({
                provider: "jarvis_local_direct_domain_research",
                ok: direct.length > 0,
                sourceCount: direct.length
            });
            if (direct.length > 0) {
                candidates = direct;
                engine = "jarvis_local_direct_domain_research";
            }
        }
        catch(error) {
            attempts.push({
                provider: "jarvis_local_direct_domain_research",
                ok: false,
                error: String(error?.message || error || "FAILED")
            });
        }
    }

    if (candidates.length === 0) {
        const detail = attempts
            .map(attempt => `${attempt.provider}:${attempt.error || attempt.status || "NO_SOURCES"}`)
            .join(" | ");
        throw new Error(`WEB_RESEARCH_UPSTREAMS_FAILED ${detail}`);
    }

    const sources = candidates.map(({ summary, ...source }) => source);
    const supports = candidates.map(source => ({
        text: source.summary || source.title,
        sourceIds: [source.id]
    }));

    return {
        ok: true,
        grounded: true,
        status: "GROUNDED_LOCAL_SEARCH",
        engine,
        query: normalizedQuery,
        answer: [
            `Encontré ${sources.length} fuentes web para: ${normalizedQuery}`,
            "",
            ...candidates.slice(0, 5).map(source =>
                `[${source.id}] ${source.title}: ${source.summary || "Fuente recuperada sin resumen."}`
            )
        ].join("\n"),
        sources,
        supports,
        sourceCount: sources.length,
        searchQueries: [normalizedQuery],
        researchedAt: new Date().toISOString(),
        attempts,
        readOnly: true,
        policy: {
            citationsRequired: true,
            externalSideEffects: false,
            fallback: true
        }
    };
}

export const JARVIS_UPLOAD_BRIDGE_VERSION =
    "1.4.0-exact-seed-identity-v142";

const MODULE_FILE =
    fileURLToPath(import.meta.url);

const LEGACY_UPLOAD_ROUTE_PATHS =
    new Set([
        "/upload",
        "/upload/start",
        "/upload/chunk",
        "/upload/complete",
        "/upload/cancel"
    ]);

const REPLACED_ROUTE_PATHS =
    new Set([
        ...LEGACY_UPLOAD_ROUTE_PATHS,
        "/research"
    ]);

function resolveBridgeRoot(root = "") {
    return path.resolve(
        root ||
        process.env.FIXGO_REPO_ROOT ||
        process.cwd()
    );
}

function routePaths(layer = {}) {
    const pathValue =
        layer?.route?.path;

    return (
        Array.isArray(pathValue)
            ? pathValue
            : [pathValue]
    )
        .map(value =>
            String(value || "")
                .trim()
        )
        .filter(Boolean);
}

export function removeLegacyUploadRoutes(app) {
    const router =
        app?.router ||
        app?._router ||
        null;
    const stack =
        router?.stack;

    if (!Array.isArray(stack)) {
        throw new Error("EXPRESS_ROUTER_STACK_REQUIRED");
    }

    let removed =
        0;

    for (
        let index = stack.length - 1;
        index >= 0;
        index -= 1
    ) {
        const paths =
            routePaths(stack[index]);

        if (
            paths.some(routePath =>
                REPLACED_ROUTE_PATHS.has(
                    routePath
                )
            )
        ) {
            stack.splice(index, 1);
            removed += 1;
        }
    }

    return {
        ok: true,
        status:
            removed > 0
                ? "LEGACY_UPLOAD_ROUTES_REMOVED"
                : "LEGACY_UPLOAD_ROUTES_NOT_PRESENT",
        removed,
        protectedPaths:
            [...REPLACED_ROUTE_PATHS]
    };
}

function uploadErrorStatus(error = "") {
    const message = String(error || "UPLOAD_FAILED");

    if (message === "UPLOAD_SESSION_NOT_FOUND") {
        return 404;
    }

    if (
        message.startsWith("UPLOAD_") ||
        message.startsWith("ARTIFACT_")
    ) {
        return 400;
    }

    return 500;
}

function sendUploadError(
    res,
    error,
    status = "UPLOAD_FAILED"
) {
    const message =
        error?.message ||
        String(error || status);

    return res
        .status(uploadErrorStatus(message))
        .json({
            ok: false,
            status,
            error: message,
            bridgeVersion:
                JARVIS_FS_BRIDGE_VERSION,
            uploadTransportVersion:
                JARVIS_UPLOAD_BRIDGE_VERSION
        });
}

function verifiedUploadPayload(result = {}) {
    return {
        ...result,
        ok:
            result?.ok === true,
        persisted:
            result?.ok === true,
        artifactId:
            result?.sha256 ||
            result?.output ||
            null,
        attachmentId:
            result?.sha256 ||
            result?.output ||
            null,
        bridgeVersion:
            JARVIS_FS_BRIDGE_VERSION,
        uploadTransportVersion:
            JARVIS_UPLOAD_BRIDGE_VERSION
    };
}

export function registerJarvisUploadRoutes(
    app,
    {
        root = ""
    } = {}
) {
    if (!app || typeof app.post !== "function") {
        throw new Error("EXPRESS_APP_REQUIRED");
    }

    const repoRoot =
        resolveBridgeRoot(root);

    app.post("/research", async (req, res) => {
        try {
            const result =
                await runResilientLocalWebResearch(
                    req.body?.query ||
                    req.body?.prompt ||
                    "",
                    req.body?.timeoutMs ||
                    20000,
                    {
                        allowedDomain:
                            req.body?.allowedDomain ||
                            "",
                        exactEntity:
                            req.body?.exactEntity ||
                            "",
                        seedUrl:
                            req.body?.seedUrl ||
                            ""
                    }
                );

            return res.json({
                ...result,
                bridgeVersion:
                    JARVIS_FS_BRIDGE_VERSION,
                uploadTransportVersion:
                    JARVIS_UPLOAD_BRIDGE_VERSION
            });
        }
        catch(error) {
            const message =
                String(
                    error?.message ||
                    error ||
                    "WEB_RESEARCH_FAILED"
                );

            return res
                .status(
                    message === "WEB_RESEARCH_QUERY_REQUIRED"
                        ? 400
                        : 502
                )
                .json({
                    ok: false,
                    grounded: false,
                    status:
                        "WEB_RESEARCH_FAILED",
                    error:
                        message,
                    bridgeVersion:
                        JARVIS_FS_BRIDGE_VERSION,
                    uploadTransportVersion:
                        JARVIS_UPLOAD_BRIDGE_VERSION
                });
        }
    });

    app.get("/upload/health", (req, res) => {
        return res.json({
            ok: true,
            status:
                "UPLOAD_TRANSPORT_READY",
            bridgeVersion:
                JARVIS_FS_BRIDGE_VERSION,
            uploadTransportVersion:
                JARVIS_UPLOAD_BRIDGE_VERSION
        });
    });

    app.post("/upload/start", (req, res) => {
        try {
            const result =
                startChunkedUpload({
                    ...(req.body || {}),
                    root:
                        repoRoot
                });

            return res.json({
                ...result,
                persisted:
                    false,
                bridgeVersion:
                    JARVIS_FS_BRIDGE_VERSION,
                uploadTransportVersion:
                    JARVIS_UPLOAD_BRIDGE_VERSION
            });
        }
        catch(error) {
            return sendUploadError(
                res,
                error,
                "UPLOAD_START_FAILED"
            );
        }
    });

    app.post("/upload/chunk", (req, res) => {
        try {
            const result =
                appendChunkedUpload({
                    ...(req.body || {}),
                    root:
                        repoRoot
                });

            return res.json({
                ...result,
                persisted:
                    false,
                bridgeVersion:
                    JARVIS_FS_BRIDGE_VERSION,
                uploadTransportVersion:
                    JARVIS_UPLOAD_BRIDGE_VERSION
            });
        }
        catch(error) {
            return sendUploadError(
                res,
                error,
                "UPLOAD_CHUNK_FAILED"
            );
        }
    });

    app.post("/upload/complete", (req, res) => {
        try {
            const result =
                completeChunkedUpload({
                    ...(req.body || {}),
                    root:
                        repoRoot
                });

            return res.json(
                verifiedUploadPayload(result)
            );
        }
        catch(error) {
            return sendUploadError(
                res,
                error,
                "UPLOAD_COMPLETE_FAILED"
            );
        }
    });

    app.post("/upload/cancel", (req, res) => {
        try {
            const result =
                cancelChunkedUpload({
                    ...(req.body || {}),
                    root:
                        repoRoot
                });

            return res.json({
                ...result,
                persisted:
                    false,
                bridgeVersion:
                    JARVIS_FS_BRIDGE_VERSION,
                uploadTransportVersion:
                    JARVIS_UPLOAD_BRIDGE_VERSION
            });
        }
        catch(error) {
            return sendUploadError(
                res,
                error,
                "UPLOAD_CANCEL_FAILED"
            );
        }
    });

    app.post("/upload", (req, res) => {
        try {
            const result =
                saveUploadedArtifact({
                    ...(req.body || {}),
                    root:
                        repoRoot
                });
            const target =
                path.resolve(
                    repoRoot,
                    result.output
                );
            const bytes =
                fs.readFileSync(target);
            const sha256 =
                createHash("sha256")
                    .update(bytes)
                    .digest("hex");

            return res.json(
                verifiedUploadPayload({
                    ...result,
                    sha256
                })
            );
        }
        catch(error) {
            return sendUploadError(
                res,
                error,
                "UPLOAD_LEGACY_FAILED"
            );
        }
    });

    app.use((req, res, next) => {
        if (!req.path.startsWith("/upload")) {
            return next();
        }

        return res.status(404).json({
            ok: false,
            status:
                "UPLOAD_ROUTE_NOT_FOUND",
            error:
                "UPLOAD_ROUTE_NOT_FOUND",
            method:
                req.method,
            path:
                req.path,
            bridgeVersion:
                JARVIS_FS_BRIDGE_VERSION,
            uploadTransportVersion:
                JARVIS_UPLOAD_BRIDGE_VERSION
        });
    });

    return app;
}

export function createJarvisUploadBridgeApp({
    root = ""
} = {}) {
    const repoRoot =
        resolveBridgeRoot(root);
    const app =
        createJarvisFsBridgeApp({
            root:
                repoRoot
        });

    const legacyUploadRoutes =
        removeLegacyUploadRoutes(app);

    const uploadApp =
        registerJarvisUploadRoutes(
            app,
            {
                root:
                    repoRoot
            }
        );

    uploadApp.locals.nexoUploadBridge = {
        version:
            JARVIS_UPLOAD_BRIDGE_VERSION,
        legacyUploadRoutes
    };

    return uploadApp;
}

export function startJarvisUploadBridge({
    port =
        Number(
            process.env.JARVIS_FS_BRIDGE_PORT
        ) ||
        3344,
    root = ""
} = {}) {
    const repoRoot =
        resolveBridgeRoot(root);
    const app =
        createJarvisUploadBridgeApp({
            root:
                repoRoot
        });

    return app.listen(port, () => {
        console.log(
            `[JARVIS_UPLOAD_BRIDGE] ${JARVIS_UPLOAD_BRIDGE_VERSION} online http://localhost:${port}`
        );
        console.log(
            `[JARVIS_UPLOAD_BRIDGE_ROOT] ${repoRoot}`
        );
    });
}

if (
    process.argv[1] &&
    path.resolve(process.argv[1]) === MODULE_FILE
) {
    startJarvisUploadBridge();
}
