"use strict";

const DEFAULT_MODEL =
    "gemini-2.5-flash";

const MAX_QUERY_LENGTH = 600;
const MAX_SOURCES = 8;
const MAX_SUPPORTS = 24;

function collapseWhitespace(value = "") {
    let output = "";
    let separating = false;
    for (const character of String(value || "")) {
        if (character.charCodeAt(0) <= 32) {
            separating = Boolean(output);
            continue;
        }
        if (separating && output) output += " ";
        output += character;
        separating = false;
        if (output.length >= MAX_QUERY_LENGTH) break;
    }
    return output.trim();
}

function normalizeResearchQuery(value = "") {
    return collapseWhitespace(value);
}

function cleanHost(value = "") {
    const host = String(value || "").trim().toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
}

function requestedDomainFromQuery(query = "", explicitDomain = "") {
    if (explicitDomain) {
        try {
            return cleanHost(new URL(explicitDomain.includes("://") ? explicitDomain : `https://${explicitDomain}`).hostname);
        } catch {
            return "";
        }
    }

    const trailing = new Set([".", ",", ";", ":", ")", "]", "}", "!", "?", "\"", "'"]);
    for (const rawToken of String(query || "").split(" ")) {
        let token = rawToken.trim();
        while (token && trailing.has(token.at(-1))) token = token.slice(0, -1);
        if (!token.includes("://")) continue;
        try {
            const parsed = new URL(token);
            if (parsed.protocol === "https:" || parsed.protocol === "http:") return cleanHost(parsed.hostname);
        } catch {
            continue;
        }
    }
    return "";
}

function requestedHostsFromQuery(query = "", explicitDomain = "") {
    const domain =
        requestedDomainFromQuery(query, explicitDomain);
    if (!domain) return [];

    const hosts = [];
    const addHost = value => {
        const candidate =
            String(value || "").trim();
        if (!candidate) return;
        try {
            const url =
                new URL(
                    candidate.includes("://")
                        ? candidate
                        : `https://${candidate}`
                );
            const host =
                String(url.hostname || "")
                    .trim()
                    .toLowerCase();
            if (
                (url.protocol === "https:" || url.protocol === "http:") &&
                cleanHost(host) === domain &&
                !hosts.includes(host)
            ) {
                hosts.push(host);
            }
        } catch {
            return;
        }
    };

    const trailing =
        new Set([
            ".",
            ",",
            ";",
            ":",
            ")",
            "]",
            "}",
            "!",
            "?",
            "\"",
            "'"
        ]);
    for (
        const rawToken of
        String(query || "").split(" ")
    ) {
        let token =
            rawToken.trim();
        while (
            token &&
            trailing.has(token.at(-1))
        ) {
            token =
                token.slice(0, -1);
        }
        if (token.includes("://")) addHost(token);
    }

    addHost(explicitDomain);
    addHost(domain);
    addHost(`www.${domain}`);
    return hosts;
}

function sourceMatchesDomain(source = {}, domain = "") {
    if (!domain) return true;
    try {
        const parsed =
            new URL(source.url);
        const host =
            cleanHost(parsed.hostname);
        if (
            host === domain ||
            host.endsWith(`.${domain}`)
        ) {
            return true;
        }

        const isGoogleGroundingRedirect =
            host ===
                "vertexaisearch.cloud.google.com" &&
            parsed.pathname.startsWith(
                "/grounding-api-redirect/"
            );
        if (!isGoogleGroundingRedirect) {
            return false;
        }

        for (
            const hint of [
                source.domain,
                source.title
            ]
        ) {
            try {
                const hintHost =
                    cleanHost(
                        new URL(
                            String(hint || "")
                                .includes("://")
                                ? String(hint)
                                : `https://${String(hint || "")}`
                        ).hostname
                    );
                if (
                    hintHost === domain ||
                    hintHost.endsWith(
                        `.${domain}`
                    )
                ) {
                    return true;
                }
            } catch {
                continue;
            }
        }
        return false;
    } catch {
        return false;
    }
}

function readHtmlAttribute(openingTag = "", attributeName = "") {
    const source = String(openingTag || "");
    const target = String(attributeName || "").toLowerCase();
    let index = 0;
    while (index < source.length) {
        while (index < source.length && source.charCodeAt(index) <= 32) index += 1;
        const nameStart = index;
        while (index < source.length) {
            const character = source[index];
            if (character === "=" || character === ">" || character.charCodeAt(0) <= 32) break;
            index += 1;
        }
        const name = source.slice(nameStart, index).toLowerCase();
        while (index < source.length && source.charCodeAt(index) <= 32) index += 1;
        if (source[index] !== "=") {
            index += 1;
            continue;
        }
        index += 1;
        while (index < source.length && source.charCodeAt(index) <= 32) index += 1;
        const quote = source[index] === '"' || source[index] === "'" ? source[index++] : null;
        const valueStart = index;
        if (quote) {
            while (index < source.length && source[index] !== quote) index += 1;
        } else {
            while (index < source.length && source[index] !== ">" && source[index].charCodeAt(0) > 32) index += 1;
        }
        if (name === target) return source.slice(valueStart, index).trim();
        index += 1;
    }
    return "";
}

function visibleText(fragment = "", maximum = 900) {
    let output = "";
    let insideTag = false;
    let separating = false;
    for (const character of String(fragment || "")) {
        if (character === "<") {
            insideTag = true;
            separating = Boolean(output);
            continue;
        }
        if (character === ">") {
            insideTag = false;
            continue;
        }
        if (insideTag) continue;
        if (character.charCodeAt(0) <= 32) {
            separating = Boolean(output);
            continue;
        }
        if (separating && output) output += " ";
        output += character;
        separating = false;
        if (output.length >= maximum) break;
    }
    return output.trim();
}

function extractHtmlElements(html = "", tagName = "", maximum = 12) {
    const source = String(html || "");
    const lower = source.toLowerCase();
    const tag = String(tagName || "").toLowerCase();
    const opening = `<${tag}`;
    const closing = `</${tag}>`;
    const values = [];
    let cursor = 0;
    while (values.length < maximum) {
        const start = lower.indexOf(opening, cursor);
        if (start < 0) break;
        const contentStart = lower.indexOf(">", start);
        if (contentStart < 0) break;
        const end = lower.indexOf(closing, contentStart + 1);
        if (end < 0) break;
        const value = visibleText(source.slice(contentStart + 1, end));
        if (value) values.push(value);
        cursor = end + closing.length;
    }
    return values;
}

function extractHtmlLinks(html = "", baseUrl = "", domain = "", maximum = 24) {
    const source = String(html || "");
    const lower = source.toLowerCase();
    const links = [];
    let cursor = 0;
    while (links.length < maximum) {
        const start = lower.indexOf("<a", cursor);
        if (start < 0) break;
        const end = lower.indexOf(">", start);
        if (end < 0) break;
        const href = readHtmlAttribute(source.slice(start + 2, end), "href");
        cursor = end + 1;
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
        try {
            const url = new URL(href, baseUrl);
            url.hash = "";
            const candidate = { url: url.href };
            if (url.protocol === "https:" && sourceMatchesDomain(candidate, domain) && !links.includes(url.href)) {
                links.push(url.href);
            }
        } catch {
            continue;
        }
    }
    return links;
}

async function runJarvisDirectDomainResearch({
    fetchImpl = globalThis.fetch,
    query = "",
    allowedDomain = "",
    objectiveId = "",
    caseId = "",
    maximumPages = 6,
    fallbackReason =
        "GEMINI_CREDENTIAL_UNAVAILABLE"
} = {}) {
    const normalizedQuery = normalizeResearchQuery(query);
    const domain = requestedDomainFromQuery(normalizedQuery, allowedDomain);
    if (!domain) throw new Error("DIRECT_RESEARCH_DOMAIN_REQUIRED");
    if (typeof fetchImpl !== "function") throw new Error("DIRECT_RESEARCH_FETCH_REQUIRED");

    const entryUrls =
        requestedHostsFromQuery(
            normalizedQuery,
            allowedDomain
        ).map(host => `https://${host}/`);
    const queue = [];
    if (entryUrls.length > 0) {
        queue.push(entryUrls.shift());
    }
    const visited = new Set();
    const pages = [];
    while (
        (
            queue.length > 0 ||
            (
                pages.length === 0 &&
                entryUrls.length > 0
            )
        ) &&
        pages.length < maximumPages
    ) {
        if (queue.length === 0) {
            queue.push(entryUrls.shift());
        }
        const url = queue.shift();
        if (visited.has(url)) continue;
        visited.add(url);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const response = await fetchImpl(url, {
                headers: { "User-Agent": "JarvisReadOnlyResearch/1.0" },
                redirect: "follow",
                signal: controller.signal
            });
            const finalUrl = response?.url || url;
            if (!response?.ok || !sourceMatchesDomain({ url: finalUrl }, domain)) continue;
            const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
            if (!contentType.includes("text/html")) continue;
            const html = String(await response.text()).slice(0, 1500000);
            const title = extractHtmlElements(html, "title", 1)[0] || finalUrl;
            const headings = [
                ...extractHtmlElements(html, "h1", 4),
                ...extractHtmlElements(html, "h2", 8)
            ].slice(0, 10);
            const paragraphs = extractHtmlElements(html, "p", 12)
                .filter(item => item.length >= 40)
                .slice(0, 6);
            if (headings.length === 0 && paragraphs.length === 0) continue;
            pages.push({ url: finalUrl, title, headings, paragraphs });
            for (const link of extractHtmlLinks(html, finalUrl, domain)) {
                if (!visited.has(link) && !queue.includes(link)) queue.push(link);
            }
        } catch {
            continue;
        } finally {
            clearTimeout(timer);
        }
    }
    if (pages.length === 0) throw new Error("DIRECT_RESEARCH_NO_PRIMARY_PAGES");

    const sources = pages.map((page, index) => ({ id: index + 1, title: page.title, url: page.url }));
    const facts = pages.map((page, index) => ({
        id: index + 1,
        type: "PRIMARY_PAGE_EVIDENCE",
        claim: [page.title, ...page.headings, ...page.paragraphs].filter(Boolean).join(" | ").slice(0, 2400),
        sourceIds: [index + 1]
    }));
    const supports = facts.map(fact => ({ text: fact.claim, sourceIds: fact.sourceIds }));
    return {
        ok: true,
        grounded: true,
        engine: "jarvis_direct_primary_domain_research",
        model: null,
        query: normalizedQuery,
        requestedDomain: domain,
        objectiveId: String(objectiveId || ""),
        caseId: String(caseId || ""),
        researchedAt: new Date().toISOString(),
        provider: "direct_primary_domain_crawl",
        answer: facts.map(fact => fact.claim).join("\n\n").slice(0, 12000),
        sources,
        discardedSources: [],
        supports,
        facts,
        inferences: [],
        searchQueries: [],
        sourceCount: sources.length,
        readOnly: true,
        policy: {
            citationsRequired: true,
            consultedSourcesOnly: true,
            requestedDomainEnforced: true,
            factsSeparatedFromInference: true,
            duplicatesRemoved: true,
            codeWrite: false,
            externalSideEffects: false,
            fallbackReason:
                String(fallbackReason || "")
                    .trim()
                    .slice(0, 160) ||
                "PRIMARY_GROUNDED_RESEARCH_UNAVAILABLE"
        }
    };
}

function extractGroundingMetadata(response = {}) {
    return response?.candidates?.[0]
        ?.groundingMetadata || {};
}

function buildGroundingIndex(response = {}) {
    const metadata =
        extractGroundingMetadata(response);
    const chunks =
        Array.isArray(metadata?.groundingChunks)
            ? metadata.groundingChunks
            : [];
    const sourceIdByUrl = new Map();
    const sourceIdByChunkIndex = new Map();
    const sources = [];
    chunks.forEach((chunk, index) => {
            const web = chunk?.web;
            const uri =
                String(web?.uri || "").trim();
            let valid = false;
            try {
                valid = new URL(uri).protocol === "https:";
            } catch {
                valid = false;
            }
            if (!valid) return;
            let id = sourceIdByUrl.get(uri);
            if (!id && sources.length < MAX_SOURCES) {
                id = sources.length + 1;
                sourceIdByUrl.set(uri, id);
                sources.push({
                id,
                title:
                    String(web?.title || "Fuente web")
                        .trim()
                        .slice(0, 180),
                url: uri
                });
            }
            if (id) sourceIdByChunkIndex.set(index, id);
        });
    return { sources, sourceIdByChunkIndex };
}

function extractGroundingSources(response = {}) {
    return buildGroundingIndex(response).sources;
}

function extractGroundingSupports(response = {}) {
    const metadata =
        extractGroundingMetadata(response);
    const supports =
        Array.isArray(metadata?.groundingSupports)
            ? metadata.groundingSupports
            : [];

    const { sourceIdByChunkIndex } = buildGroundingIndex(response);
    const seen = new Set();
    return supports
        .map(support => ({
            text:
                String(
                    support?.segment?.text ||
                    ""
                )
                    .trim()
                    .slice(0, 320),
            sourceIds:
                Array.isArray(
                    support?.groundingChunkIndices
                )
                    ? support.groundingChunkIndices
                        .filter(index => Number.isInteger(index) && sourceIdByChunkIndex.has(index))
                        .map(index => sourceIdByChunkIndex.get(index))
                        .filter((id, index, ids) => ids.indexOf(id) === index)
                        .slice(0, 8)
                    : []
        }))
        .filter(support => {
            if (!support.text || support.sourceIds.length === 0) return false;
            const key = `${support.text}|${support.sourceIds.join(",")}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, MAX_SUPPORTS);
}

async function runJarvisWebResearch({
    ai,
    query,
    model = DEFAULT_MODEL,
    objectiveId = "",
    caseId = "",
    allowedDomain = ""
} = {}) {
    if (!ai?.models?.generateContent) {
        throw new Error(
            "JARVIS_WEB_RESEARCH_AI_REQUIRED"
        );
    }

    const normalizedQuery =
        normalizeResearchQuery(query);
    const requestedDomain =
        requestedDomainFromQuery(normalizedQuery, allowedDomain);
    const groundedQuery = requestedDomain
        ? normalizeResearchQuery(`site:${requestedDomain} ${normalizedQuery}`)
        : normalizedQuery;

    if (normalizedQuery.length < 5) {
        throw new Error(
            "JARVIS_WEB_RESEARCH_QUERY_REQUIRED"
        );
    }

    const response =
        await ai.models.generateContent({
            model,
            contents: [
                "Investiga la solicitud usando Google Search.",
                "Responde en espanol con hechos concretos y separa claramente cualquier incertidumbre.",
                "Distingue hechos consultados de inferencias o recomendaciones del modelo.",
                "No inventes fuentes ni afirmes haber consultado una pagina que no aparezca en groundingMetadata.",
                requestedDomain
                    ? `Usa ${requestedDomain} como dominio primario obligatorio. Descarta empresas y dominios de nombre parecido.`
                    : "No se indico un dominio primario obligatorio.",
                `Solicitud: ${groundedQuery}`
            ].join("\n"),
            config: {
                tools: [
                    {
                        googleSearch: {}
                    }
                ],
                temperature: 0.2,
                maxOutputTokens: 1400
            }
        });

    const answer =
        String(response?.text || "")
            .trim()
            .slice(0, 12000);
    const metadata =
        extractGroundingMetadata(response);
    const allSources =
        extractGroundingSources(response);
    const acceptedSources = allSources.filter(source => sourceMatchesDomain(source, requestedDomain));
    const acceptedIds = new Set(acceptedSources.map(source => source.id));
    const discardedSources = allSources.filter(source => !acceptedIds.has(source.id));
    const allSupports =
        extractGroundingSupports(response);
    const supports = allSupports
        .map(support => ({ ...support, sourceIds: support.sourceIds.filter(id => acceptedIds.has(id)) }))
        .filter(support => support.sourceIds.length > 0);
    const relevantSourceIds = new Set(supports.flatMap(support => support.sourceIds));
    const sources = acceptedSources.filter(source => relevantSourceIds.has(source.id));
    const searchQueries =
        Array.isArray(metadata?.webSearchQueries)
            ? metadata.webSearchQueries
                .map(item =>
                    String(item || "")
                        .trim()
                        .slice(0, 240)
                )
                .filter(Boolean)
                .slice(0, 8)
            : [];

    const researchedAt = new Date().toISOString();
    const facts = supports.map((support, index) => ({
        id: index + 1,
        type: "VERIFIED_FACT",
        claim: support.text,
        sourceIds: support.sourceIds
    }));
    const supportedAnswer =
        supports
            .map(support => support.text)
            .filter((value, index, values) =>
                Boolean(value) &&
                values.indexOf(value) === index
            )
            .join("\n\n")
            .slice(0, 12000);
    const verifiedAnswer =
        requestedDomain
            ? supportedAnswer
            : answer;
    const modelSynthesisAllowed =
        !requestedDomain ||
        discardedSources.length === 0;
    const inferences =
        answer &&
        modelSynthesisAllowed
            ? [{
        type: "MODEL_SYNTHESIS",
        text: answer,
        basisFactIds: facts.map(fact => fact.id),
        warning: "Síntesis del modelo; verificar contra los hechos y fuentes vinculados."
            }]
            : [];

    return {
        ok:
            Boolean(verifiedAnswer) &&
            sources.length > 0 &&
            facts.length > 0,
        grounded:
            sources.length > 0 && facts.length > 0,
        engine:
            "jarvis_grounded_web_research",
        model,
        query:
            groundedQuery,
        requestedDomain: requestedDomain || null,
        objectiveId: String(objectiveId || ""),
        caseId: String(caseId || ""),
        researchedAt,
        provider: "google_search_grounding",
        answer:
            verifiedAnswer,
        sources,
        discardedSources,
        supports,
        facts,
        inferences,
        searchQueries,
        sourceCount:
            sources.length,
        readOnly: true,
        policy: {
            citationsRequired: true,
            consultedSourcesOnly: true,
            requestedDomainEnforced: Boolean(requestedDomain),
            modelSynthesisFiltered:
                Boolean(requestedDomain) &&
                !modelSynthesisAllowed,
            factsSeparatedFromInference: true,
            duplicatesRemoved: true,
            codeWrite: false,
            externalSideEffects: false
        }
    };
}

module.exports = {
    DEFAULT_MODEL,
    MAX_QUERY_LENGTH,
    collapseWhitespace,
    normalizeResearchQuery,
    requestedDomainFromQuery,
    requestedHostsFromQuery,
    sourceMatchesDomain,
    readHtmlAttribute,
    visibleText,
    extractHtmlElements,
    extractHtmlLinks,
    runJarvisDirectDomainResearch,
    extractGroundingSources,
    extractGroundingSupports,
    runJarvisWebResearch
};
