import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as tls from "node:tls";

import {
    JARVIS_FS_BRIDGE_VERSION,
    appendChunkedUpload,
    cancelChunkedUpload,
    completeChunkedUpload,
    createJarvisFsBridgeApp,
    inspectLocalConnectors,
    saveUploadedArtifact,
    startChunkedUpload
} from "./jarvis-fs-bridge.js";
import { inspectLocalVideoHardware } from "./jarvis-local-video-engine.js";

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

function researchVideoIdFromUrl(value = "") {
    try {
        const parsed =
            new URL(
                String(value || "")
            );
        const segments =
            parsed.pathname
                .split("/")
                .filter(Boolean);

        const videoIndex =
            segments.findIndex(
                segment =>
                    segment.toLowerCase() ===
                    "video"
            );

        return (
            videoIndex >= 0 &&
            segments[videoIndex + 1]
        )
            ? String(
                segments[
                    videoIndex + 1
                ]
            ).trim()
            : "";
    }
    catch {
        return "";
    }
}

function researchUrlMatchesSeedAnchor(
    candidate = "",
    seedUrl = ""
) {
    const candidateDomain =
        researchDomainFromUrl(
            candidate
        );
    const seedDomain =
        researchDomainFromUrl(
            seedUrl
        );

    if (
        !candidateDomain ||
        !seedDomain ||
        candidateDomain !==
            seedDomain
    ) {
        return false;
    }

    const expectedHandle =
        researchIdentityHandleFromUrl(
            seedUrl
        );
    const actualHandle =
        researchIdentityHandleFromUrl(
            candidate
        );

    if (
        expectedHandle &&
        actualHandle !==
            expectedHandle
    ) {
        return false;
    }

    const expectedVideoId =
        researchVideoIdFromUrl(
            seedUrl
        );
    const actualVideoId =
        researchVideoIdFromUrl(
            candidate
        );

    if (
        expectedVideoId &&
        actualVideoId !==
            expectedVideoId
    ) {
        return false;
    }

    return Boolean(
        expectedHandle ||
        expectedVideoId
    );
}

function isTikTokResearchUrl(
    value = ""
) {
    const domain =
        researchDomainFromUrl(
            value
        );

    return (
        domain === "tiktok.com" ||
        domain.endsWith(
            ".tiktok.com"
        )
    );
}

function extractResearchMetadataUrl(
    html = ""
) {
    const source =
        String(html || "");

    const patterns = [
        /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
        /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i,
        /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i
    ];

    for (const pattern of patterns) {
        const match =
            source.match(
                pattern
            );

        if (match?.[1]) {
            return decodeResearchHtml(
                match[1]
            ).trim();
        }
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

    const domain = normalizeResearchDomain(allowedDomain);
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

async function fetchLocalResearchJson(
    fetchImpl,
    url,
    {
        timeoutMs,
        headers = {}
    } = {}
) {
    const response =
        await fetchImpl(
            url,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 JarvisLocalResearch/1.0",
                    Accept:
                        "application/json,*/*;q=0.8",
                    ...headers
                },
                redirect:
                    "follow",
                signal:
                    AbortSignal.timeout(
                        timeoutMs
                    )
            }
        );

    if (!response.ok) {
        throw new Error(
            `HTTP_${response.status}`
        );
    }

    return {
        json:
            await response.json(),
        url:
            response.url || url,
        status:
            response.status
    };
}

async function directTikTokOembedResearchFallback(
    fetchImpl,
    options,
    timeoutMs
) {
    const seedUrl =
        String(
            options?.seedUrl ||
            ""
        ).trim();

    if (
        !seedUrl ||
        !isTikTokResearchUrl(
            seedUrl
        )
    ) {
        return [];
    }

    const expectedHandle =
        researchIdentityHandleFromUrl(
            seedUrl
        );

    if (!expectedHandle) {
        return [];
    }

    const endpoint =
        "https://www.tiktok.com/oembed?url=" +
        encodeURIComponent(
            seedUrl
        );

    const result =
        await fetchLocalResearchJson(
            fetchImpl,
            endpoint,
            {
                timeoutMs
            }
        );

    const payload =
        result.json &&
        typeof result.json ===
            "object"
            ? result.json
            : {};

    const authorUrl =
        String(
            payload.author_url ||
            ""
        ).trim();

    const actualHandle =
        researchIdentityHandleFromUrl(
            authorUrl
        );

    if (
        !actualHandle ||
        actualHandle !==
            expectedHandle
    ) {
        return [];
    }

    const authorName =
        String(
            payload.author_name ||
            ""
        ).trim();

    const title =
        String(
            payload.title ||
            authorName ||
            expectedHandle
        )
            .replace(
                /\s+/g,
                " "
            )
            .trim()
            .slice(
                0,
                220
            );

    return [
        {
            title,
            url:
                seedUrl,
            summary: [
                "TikTok oEmbed verific? la fuente ancla.",
                authorName
                    ? `Autor: ${authorName}.`
                    : "",
                `Identidad: ${actualHandle}.`,
                `author_url: ${authorUrl}`
            ]
                .filter(Boolean)
                .join(" ")
                .slice(
                    0,
                    700
                )
        }
    ];
}

async function directLocalResearchSeedMetadataFallback(
    fetchImpl,
    options,
    timeoutMs
) {
    const seedUrl =
        String(
            options?.seedUrl ||
            ""
        ).trim();

    if (!seedUrl) {
        return [];
    }

    const result =
        await fetchLocalResearchText(
            fetchImpl,
            seedUrl,
            {
                timeoutMs
            }
        );

    const metadataUrl =
        extractResearchMetadataUrl(
            result.text
        );

    if (
        !metadataUrl ||
        !researchUrlMatchesSeedAnchor(
            metadataUrl,
            seedUrl
        )
    ) {
        return [];
    }

    const title =
        stripResearchMarkup(
            result.text.match(
                /<title[^>]*>([\s\S]*?)<\/title>/i
            )?.[1] ||
            researchIdentityHandleFromUrl(
                seedUrl
            ) ||
            researchDomainFromUrl(
                seedUrl
            )
        );

    const description =
        stripResearchMarkup(
            result.text.match(
                /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i
            )?.[1] ||
            ""
        );

    return [
        {
            title:
                title ||
                metadataUrl,
            url:
                seedUrl,
            summary: [
                "La metadata p?blica del documento confirm? la fuente ancla.",
                `canonical/og:url: ${metadataUrl}.`,
                description
            ]
                .filter(Boolean)
                .join(" ")
                .slice(
                    0,
                    700
                )
        }
    ];
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
        normalizeResearchDomain(options.allowedDomain);
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

    if (
        options?.seedUrl
    ) {
        const anchorVerifiers = [
            {
                name:
                    "jarvis_local_tiktok_oembed_anchor",
                run:
                    () =>
                        directTikTokOembedResearchFallback(
                            fetchImpl,
                            options,
                            boundedTimeoutMs
                        )
            },
            {
                name:
                    "jarvis_local_seed_metadata_anchor",
                run:
                    () =>
                        directLocalResearchSeedMetadataFallback(
                            fetchImpl,
                            options,
                            boundedTimeoutMs
                        )
            }
        ];

        for (
            const verifier
            of anchorVerifiers
        ) {
            try {
                const verified =
                    normalizeLocalResearchSources(
                        await verifier.run(),
                        {
                            ...options,
                            exactEntity:
                                ""
                        }
                    );

                attempts.push({
                    provider:
                        verifier.name,
                    ok:
                        verified.length >
                        0,
                    sourceCount:
                        verified.length
                });

                if (
                    verified.length >
                    0
                ) {
                    candidates =
                        verified;
                    engine =
                        verifier.name;
                    break;
                }
            }
            catch(error) {
                attempts.push({
                    provider:
                        verifier.name,
                    ok:
                        false,
                    error:
                        String(
                            error?.message ||
                            error ||
                            "FAILED"
                        )
                });
            }
        }
    }

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

    if (candidates.length === 0) {
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
    "1.7.0-workstation-supervisor-v142";

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

const workstationRuntimeState = {
    startedAt: null,
    bridgeStarted: false,
    workerStarted: false,
    workerPollMs: 5000,
    lastDoctorAt: null
};

function workstationCommand(command, args = [], {
    cwd = process.cwd(),
    timeoutMs = 5000
} = {}) {
    try {
        const result = spawnSync(command, args, {
            cwd,
            encoding: "utf8",
            windowsHide: true,
            timeout: timeoutMs,
            shell: process.platform === "win32",
            stdio: ["ignore", "pipe", "pipe"]
        });
        return {
            ok: result.status === 0,
            status: result.status,
            stdout: String(result.stdout || "").trim().slice(0, 2000),
            stderr: String(result.stderr || "").trim().slice(0, 2000),
            error: result.error?.message || null
        };
    }
    catch(error) {
        return {
            ok: false,
            status: null,
            stdout: "",
            stderr: "",
            error: error?.message || String(error)
        };
    }
}

async function probeLocalJson(url, timeoutMs = 1200) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: "GET",
            signal: controller.signal
        });
        let body = null;
        try {
            body = await response.json();
        }
        catch {}
        return {
            ok: response.ok,
            reachable: true,
            status: response.status,
            body
        };
    }
    catch(error) {
        return {
            ok: false,
            reachable: false,
            status: null,
            body: null,
            error:
                error?.name === "AbortError"
                    ? "TIMEOUT"
                    : (error?.message || String(error))
        };
    }
    finally {
        clearTimeout(timer);
    }
}

function readFirebaseWorkstationConfig(repoRoot) {
    try {
        const config = JSON.parse(
            fs.readFileSync(
                path.join(repoRoot, "firebase.json"),
                "utf8"
            )
        );
        return {
            configured: true,
            projectConfigPresent:
                fs.existsSync(path.join(repoRoot, ".firebaserc")),
            firestoreRules:
                config?.firestore?.rules || null,
            storageRules:
                config?.storage?.rules || null,
            emulators: {
                firestore: {
                    host:
                        config?.emulators?.firestore?.host ||
                        "127.0.0.1",
                    port:
                        Number(config?.emulators?.firestore?.port || 8180)
                },
                storage: {
                    host:
                        config?.emulators?.storage?.host ||
                        "127.0.0.1",
                    port:
                        Number(config?.emulators?.storage?.port || 9299)
                }
            }
        };
    }
    catch(error) {
        return {
            configured: false,
            projectConfigPresent: false,
            firestoreRules: null,
            storageRules: null,
            emulators: null,
            error: error?.message || String(error)
        };
    }
}

export async function inspectJarvisWorkstation({
    root = ""
} = {}) {
    const repoRoot = resolveBridgeRoot(root);
    const gitExecutable =
        process.platform === "win32" &&
        fs.existsSync("C:\\Program Files\\Git\\cmd\\git.exe")
            ? "C:\\Program Files\\Git\\cmd\\git.exe"
            : "git";

    const git = workstationCommand(
        gitExecutable,
        ["--version"],
        { cwd: repoRoot }
    );
    const gitBranch = git.ok
        ? workstationCommand(
            gitExecutable,
            ["branch", "--show-current"],
            { cwd: repoRoot }
        )
        : { ok: false, stdout: "" };
    const gitHead = git.ok
        ? workstationCommand(
            gitExecutable,
            ["rev-parse", "HEAD"],
            { cwd: repoRoot }
        )
        : { ok: false, stdout: "" };

    const npm = workstationCommand(
        "npm",
        ["--version"],
        { cwd: repoRoot }
    );
    const npx = workstationCommand(
        "npx",
        ["--version"],
        { cwd: repoRoot }
    );
    const vscode = workstationCommand(
        "code",
        ["--version"],
        { cwd: repoRoot }
    );
    const firebase = workstationCommand(
        "firebase",
        ["--version"],
        { cwd: repoRoot }
    );
    const ollamaCli = workstationCommand(
        "ollama",
        ["--version"],
        { cwd: repoRoot }
    );

    const firebaseConfig =
        readFirebaseWorkstationConfig(repoRoot);
    const expectedModel =
        String(
            process.env.JARVIS_LOCAL_LLM_MODEL ||
            "qwen2.5-coder:7b"
        ).trim();
    const expectedEmbeddingModel =
        String(
            process.env.JARVIS_LOCAL_EMBEDDING_MODEL ||
            "qwen3-embedding:0.6b"
        ).trim();

    const ollama =
        await probeLocalJson(
            "http://127.0.0.1:11434/api/tags",
            1500
        );
    const ollamaModels =
        Array.isArray(ollama?.body?.models)
            ? ollama.body.models
                .map(item =>
                    String(
                        item?.name ||
                        item?.model ||
                        ""
                    ).trim()
                )
                .filter(Boolean)
            : [];
    const expectedModelPresent =
        ollamaModels.includes(expectedModel) ||
        ollamaModels.some(name =>
            name.startsWith(
                `${expectedModel.split(":")[0]}:`
            )
        );
    const expectedEmbeddingModelPresent =
        ollamaModels.includes(expectedEmbeddingModel) ||
        ollamaModels.some(name =>
            name.startsWith(
                `${expectedEmbeddingModel.split(":")[0]}:`
            )
        );

    let embeddingProbe = {
        ok: false,
        status: "LOCAL_EMBEDDING_NOT_PROBED"
    };
    if (
        ollama.reachable === true &&
        expectedEmbeddingModelPresent
    ) {
        const controller = new AbortController();
        const timer = setTimeout(
            () => controller.abort(),
            5000
        );
        try {
            const response = await fetch(
                "http://127.0.0.1:11434/api/embed",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: expectedEmbeddingModel,
                        input: ["jarvis local embedding health"]
                    }),
                    signal: controller.signal
                }
            );
            const payload = await response.json().catch(() => null);
            embeddingProbe = {
                ok:
                    response.ok === true &&
                    Array.isArray(payload?.embeddings) &&
                    Array.isArray(payload.embeddings[0]) &&
                    payload.embeddings[0].length > 0,
                status:
                    response.ok === true
                        ? "LOCAL_EMBEDDING_PROBED"
                        : `LOCAL_EMBEDDING_HTTP_${response.status}`,
                dimensions:
                    Array.isArray(payload?.embeddings?.[0])
                        ? payload.embeddings[0].length
                        : 0
            };
        }
        catch(error) {
            embeddingProbe = {
                ok: false,
                status:
                    error?.name === "AbortError"
                        ? "LOCAL_EMBEDDING_PROBE_TIMEOUT"
                        : "LOCAL_EMBEDDING_PROBE_FAILED",
                error: error?.message || String(error)
            };
        }
        finally {
            clearTimeout(timer);
        }
    }

    const firestoreEmulator =
        firebaseConfig?.emulators?.firestore
            ? await probeLocalJson(
                `http://${firebaseConfig.emulators.firestore.host}:${firebaseConfig.emulators.firestore.port}`,
                700
            )
            : { ok: false, reachable: false };
    const storageEmulator =
        firebaseConfig?.emulators?.storage
            ? await probeLocalJson(
                `http://${firebaseConfig.emulators.storage.host}:${firebaseConfig.emulators.storage.port}`,
                700
            )
            : { ok: false, reachable: false };

    let connectors = null;
    try {
        connectors =
            await inspectLocalConnectors({
                root: repoRoot,
                timeoutMs: 5000
            });
    }
    catch(error) {
        connectors = {
            ok: false,
            status: "CONNECTOR_INSPECTION_FAILED",
            error: error?.message || String(error),
            connectors: []
        };
    }

    const localVideo =
        inspectLocalVideoHardware({
            root: repoRoot,
            env: {
                ...process.env,
                JARVIS_LOCAL_VIDEO_MODEL:
                    process.env.JARVIS_LOCAL_VIDEO_MODEL ||
                    "auto"
            }
        });

    workstationRuntimeState.lastDoctorAt =
        new Date().toISOString();

    return {
        ok: true,
        status: "JARVIS_WORKSTATION_INSPECTED",
        checkedAt: workstationRuntimeState.lastDoctorAt,
        root: repoRoot,
        runtime: {
            ...workstationRuntimeState,
            processId: process.pid,
            node: {
                ok: true,
                version: process.version,
                executable: process.execPath
            }
        },
        repo: {
            gitAvailable: git.ok,
            gitVersion: git.stdout || null,
            branch: gitBranch.stdout || null,
            head: gitHead.stdout || null
        },
        tooling: {
            npm: {
                ok: npm.ok,
                version: npm.stdout || null
            },
            npx: {
                ok: npx.ok,
                version: npx.stdout || null
            },
            vscode: {
                ok: vscode.ok,
                version:
                    vscode.stdout
                        ? vscode.stdout.split(/\r?\n/)[0]
                        : null
            },
            firebaseCli: {
                ok: firebase.ok,
                version: firebase.stdout || null,
                globalInstallRequired: false,
                emulatorScriptsAvailable:
                    npm.ok &&
                    fs.existsSync(
                        path.join(repoRoot, "package.json")
                    )
            }
        },
        firebase: {
            ...firebaseConfig,
            firestoreEmulatorRunning:
                firestoreEmulator.reachable === true,
            storageEmulatorRunning:
                storageEmulator.reachable === true,
            mutationPolicy:
                "DEPLOY_ONLY_THROUGH_GOVERNED_RELEASE_GATE"
        },
        localAi: {
            provider: "ollama-openai-compatible-local",
            endpoint:
                "http://127.0.0.1:11434/v1",
            embeddingEndpoint:
                "http://127.0.0.1:11434/api/embed",
            cliAvailable: ollamaCli.ok,
            serverRunning: ollama.reachable === true,
            models: ollamaModels,
            expectedModel,
            expectedModelPresent,
            expectedEmbeddingModel,
            expectedEmbeddingModelPresent,
            embeddingProbe,
            ready:
                ollama.reachable === true &&
                expectedModelPresent &&
                expectedEmbeddingModelPresent &&
                embeddingProbe.ok === true,
            externalFallback: false
        },
        localVideo: {
            ...localVideo,
            freeLocalEligible:
                localVideo.ok === true,
            runpodPaidFallbackAuthorized: false
        },
        connectors,
        governedCapabilities: [
            "repo.read",
            "repo.grep",
            "repo.search",
            "repo.write.authorized",
            "git.status",
            "git.diff",
            "git.commit.authorized",
            "git.push.authorized",
            "npm.tests",
            "npm.ci",
            "firebase.firestore.emulator",
            "firebase.storage.emulator",
            "firebase.hosting.inspect",
            "firebase.deploy.governed",
            "ollama.local.llm",
            "ollama.local.embedding",
            "video.generate.local",
            "vscode.workspace"
        ]
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

    const workstationHealthHandler = async (_req, res) => {
        try {
            const result =
                await inspectJarvisWorkstation({
                    root: repoRoot
                });
            return res.json({
                ...result,
                bridgeVersion:
                    JARVIS_FS_BRIDGE_VERSION,
                uploadTransportVersion:
                    JARVIS_UPLOAD_BRIDGE_VERSION
            });
        }
        catch(error) {
            return res.status(500).json({
                ok: false,
                status: "JARVIS_WORKSTATION_INSPECTION_FAILED",
                error: error?.message || String(error),
                bridgeVersion:
                    JARVIS_FS_BRIDGE_VERSION,
                uploadTransportVersion:
                    JARVIS_UPLOAD_BRIDGE_VERSION
            });
        }
    };

    app.get("/workstation/health", workstationHealthHandler);
    app.post("/workstation/health", workstationHealthHandler);

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

export function markJarvisWorkstationRuntime(state = {}) {
    workstationRuntimeState.startedAt =
        workstationRuntimeState.startedAt ||
        new Date().toISOString();
    Object.assign(
        workstationRuntimeState,
        state
    );
    return { ...workstationRuntimeState };
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

    return app.listen(port, "127.0.0.1", () => {
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
