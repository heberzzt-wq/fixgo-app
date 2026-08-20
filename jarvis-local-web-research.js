import * as tls from "node:tls";

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

function decodeHtml(value = "") {
    return String(value || "")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 32));
}

function stripMarkup(value = "") {
    return decodeHtml(
        String(value || "")
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
    )
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeDomain(value = "") {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0];
}

function domainFromUrl(value = "") {
    try {
        return new URL(String(value || "")).hostname
            .toLowerCase()
            .replace(/^www\./, "");
    }
    catch {
        return "";
    }
}

function normalizeDuckDuckGoUrl(value = "") {
    const decoded = decodeHtml(String(value || "").trim());
    if (!decoded) return "";
    try {
        const candidate = decoded.startsWith("//")
            ? `https:${decoded}`
            : decoded;
        const parsed = new URL(candidate, "https://duckduckgo.com");
        const redirected = parsed.hostname.endsWith("duckduckgo.com")
            ? parsed.searchParams.get("uddg")
            : "";
        return redirected ? decodeURIComponent(redirected) : parsed.toString();
    }
    catch {
        return "";
    }
}

function extractDuckDuckGoHtmlSources(html = "") {
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
        const url = normalizeDuckDuckGoUrl(titleMatch[1]);
        if (!/^https?:\/\//i.test(url)) continue;
        sources.push({
            title: stripMarkup(titleMatch[2]).slice(0, 220),
            url,
            summary: stripMarkup(snippetMatch?.[1] || "").slice(0, 700)
        });
    }

    return sources;
}

function extractDuckDuckGoLiteSources(html = "") {
    const sources = [];
    const anchorPattern = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = anchorPattern.exec(String(html || ""))) !== null) {
        const url = normalizeDuckDuckGoUrl(match[1]);
        const title = stripMarkup(match[2]);
        if (!/^https?:\/\//i.test(url) || !title) continue;
        const domain = domainFromUrl(url);
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

function extractRssTag(item = "", tag = "") {
    const match = String(item || "").match(
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
    );
    return decodeHtml(
        String(match?.[1] || "")
            .replace(/^<!\[CDATA\[/, "")
            .replace(/\]\]>$/, "")
    ).trim();
}

function extractBingRssSources(rss = "") {
    return (String(rss || "").match(/<item>[\s\S]*?<\/item>/gi) || [])
        .map(item => ({
            title: stripMarkup(extractRssTag(item, "title")).slice(0, 220),
            url: extractRssTag(item, "link"),
            summary: stripMarkup(extractRssTag(item, "description")).slice(0, 700)
        }))
        .filter(source => /^https?:\/\//i.test(source.url));
}

function buildResearchQuery(
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

    let domain = normalizeDomain(allowedDomain);
    if (!domain && seedUrl) domain = domainFromUrl(seedUrl);
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

async function fetchText(
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

function sourceMatchesDomain(source, domain = "") {
    const expected = normalizeDomain(domain);
    if (!expected) return true;
    const actual = domainFromUrl(source?.url);
    return actual === expected || actual.endsWith(`.${expected}`);
}

function sourceMatchesEntity(source, exactEntity = "") {
    const entity = String(exactEntity || "").trim().toLowerCase();
    if (!entity) return true;
    const tokens = entity
        .split(/[^\p{L}\p{N}]+/u)
        .filter(token => token.length >= 2);
    if (tokens.length === 0) return true;
    const haystack = [
        source?.title,
        source?.url,
        domainFromUrl(source?.url),
        source?.summary
    ].join(" ").toLowerCase();
    return tokens.every(token => haystack.includes(token));
}

function normalizeSources(candidates = [], options = {}) {
    const seen = new Set();
    return candidates
        .filter(source => {
            const url = String(source?.url || "").trim();
            if (!/^https?:\/\//i.test(url) || seen.has(url)) return false;
            if (!sourceMatchesDomain(source, options.allowedDomain)) return false;
            if (!sourceMatchesEntity(source, options.exactEntity)) return false;
            seen.add(url);
            return true;
        })
        .slice(0, 8)
        .map((source, index) => ({
            id: index + 1,
            title: String(source.title || domainFromUrl(source.url) || source.url).slice(0, 220),
            url: String(source.url),
            summary: String(source.summary || "").slice(0, 700)
        }));
}

async function directDomainFallback(fetchImpl, options, timeoutMs) {
    const domain = normalizeDomain(options.allowedDomain) || domainFromUrl(options.seedUrl);
    if (!domain) return [];
    const target = /^https?:\/\//i.test(String(options.seedUrl || ""))
        ? String(options.seedUrl)
        : `https://${domain}/`;
    const result = await fetchText(fetchImpl, target, { timeoutMs });
    const title = stripMarkup(
        result.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || domain
    );
    const description = stripMarkup(
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

    const normalizedQuery = buildResearchQuery(query, options);
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
            parse: extractDuckDuckGoHtmlSources
        },
        {
            name: "jarvis_local_duckduckgo_lite_research",
            url: `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(normalizedQuery)}`,
            parse: extractDuckDuckGoLiteSources
        },
        {
            name: "jarvis_local_bing_rss_research",
            url: `https://www.bing.com/search?format=rss&q=${encodeURIComponent(normalizedQuery)}`,
            parse: extractBingRssSources,
            headers: { Accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8" }
        }
    ];

    for (const provider of providers) {
        try {
            const result = await fetchText(fetchImpl, provider.url, {
                timeoutMs: boundedTimeoutMs,
                headers: provider.headers
            });
            const parsed = provider.parse(result.text);
            const accepted = normalizeSources(parsed, options);
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
            const direct = normalizeSources(
                await directDomainFallback(fetchImpl, options, boundedTimeoutMs),
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

export const __test = {
    buildResearchQuery,
    extractBingRssSources,
    extractDuckDuckGoHtmlSources,
    extractDuckDuckGoLiteSources,
    normalizeDuckDuckGoUrl,
    normalizeSources
};
