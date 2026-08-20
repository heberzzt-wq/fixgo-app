import fs from 'node:fs';

const providerPath = 'functions/jarvis-genai-provider-chain.js';
const researchPath = 'functions/jarvis-web-research.js';

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`V146_MARKER_MISSING:${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`V146_MARKER_NOT_UNIQUE:${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

let provider = fs.readFileSync(providerPath, 'utf8');

if (!provider.includes('async function inspectGroundingFreshness(')) {
  const helperMarker = 'function sleep(ms) {';
  const helperBlock = String.raw`function freshnessWindowDays(request = {}) {
    const text = normalizeFreshnessSignalText(
        collectRequestText(request?.contents)
    );
    if (/\b(hoy|today)\b/.test(text)) return 2;
    if (/\b(esta semana|this week|semana|week)\b/.test(text)) return 8;
    if (/\b(este mes|this month|mes|month)\b/.test(text)) return 35;
    if (/\b(este ano|this year|ano|year)\b/.test(text)) return 370;
    return requestNeedsFreshness(request) ? 60 : null;
}

function extractPublicationDatesFromHtml(html = '') {
    const source = String(html || '').slice(0, 900000);
    const patterns = [
        /["']datePublished["']\s*:\s*["']([^"']+)["']/gi,
        /["']dateModified["']\s*:\s*["']([^"']+)["']/gi,
        /<meta[^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|date|datePublished|dateModified)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
        /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|date|datePublished|dateModified)["'][^>]*>/gi,
        /<time[^>]+datetime=["']([^"']+)["'][^>]*>/gi
    ];
    const values = [];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(source)) && values.length < 24) {
            const parsed = new Date(String(match[1] || '').trim());
            if (Number.isFinite(parsed.getTime())) values.push(parsed);
        }
    }
    return values
        .sort((left, right) => right.getTime() - left.getTime())
        .map(value => value.toISOString());
}

function groundingSourceUrls(response = {}) {
    const urls = [];
    const seen = new Set();
    for (const candidate of Array.isArray(response?.candidates) ? response.candidates : []) {
        const chunks = Array.isArray(candidate?.groundingMetadata?.groundingChunks)
            ? candidate.groundingMetadata.groundingChunks
            : [];
        for (const chunk of chunks) {
            const url = String(chunk?.web?.uri || '').trim();
            if (!url || seen.has(url)) continue;
            try {
                if (new URL(url).protocol !== 'https:') continue;
            } catch {
                continue;
            }
            seen.add(url);
            urls.push(url);
            if (urls.length >= 6) return urls;
        }
    }
    return urls;
}

async function inspectGroundingFreshness(
    response = {},
    request = {},
    fetchImpl = globalThis.fetch,
    now = new Date()
) {
    const windowDays = freshnessWindowDays(request);
    if (!windowDays) {
        return {
            required: false,
            verified: true,
            windowDays: null,
            cutoffDate: null,
            freshCount: 0,
            datedCount: 0,
            inspectedCount: 0,
            sources: []
        };
    }

    const reference = now instanceof Date && Number.isFinite(now.getTime())
        ? now
        : new Date();
    const cutoffMs = reference.getTime() - (windowDays * 86400000);
    const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);
    const urls = groundingSourceUrls(response);

    if (typeof fetchImpl !== 'function' || urls.length === 0) {
        return {
            required: true,
            verified: false,
            windowDays,
            cutoffDate,
            freshCount: 0,
            datedCount: 0,
            inspectedCount: urls.length,
            sources: urls.map(url => ({ url, publishedAt: null, fresh: false }))
        };
    }

    const inspected = await Promise.all(
        urls.map(async url => {
            try {
                const page = await fetchImpl(url, {
                    method: 'GET',
                    redirect: 'follow',
                    headers: {
                        'User-Agent': 'JarvisFreshnessVerifier/1.0',
                        'Accept': 'text/html,application/xhtml+xml'
                    },
                    signal: AbortSignal.timeout(2800)
                });
                if (!page?.ok) return { url, publishedAt: null, fresh: false };
                const contentType = String(page.headers?.get?.('content-type') || '').toLowerCase();
                if (contentType && !contentType.includes('html')) {
                    return { url, publishedAt: null, fresh: false };
                }
                const dates = extractPublicationDatesFromHtml(await page.text());
                const publishedAt = dates[0] || null;
                const timestamp = publishedAt ? Date.parse(publishedAt) : Number.NaN;
                const fresh = Number.isFinite(timestamp) &&
                    timestamp >= cutoffMs &&
                    timestamp <= reference.getTime() + 86400000;
                return { url, publishedAt, fresh };
            } catch {
                return { url, publishedAt: null, fresh: false };
            }
        })
    );

    const freshCount = inspected.filter(item => item.fresh).length;
    const datedCount = inspected.filter(item => item.publishedAt).length;
    return {
        required: true,
        verified: freshCount > 0,
        windowDays,
        cutoffDate,
        freshCount,
        datedCount,
        inspectedCount: inspected.length,
        sources: inspected
    };
}

function appendFreshnessSourceRetryDirective(request = {}, freshness = {}) {
    const cutoffDate = String(freshness?.cutoffDate || '').trim();
    const directive = [
        'REINTENTO_DE_FRESCURA_VERIFICABLE:',
        `Las fuentes anteriores no demostraron una fecha suficientemente reciente${cutoffDate ? ` (corte ${cutoffDate})` : ''}.`,
        'Busca resultados mas recientes y prioriza paginas individuales con fecha de publicacion o modificacion verificable.',
        'No uses como novedad una pagina indice o historica sin fecha verificable.',
        'Si no existe una fuente reciente verificable, responde FRESCURA_NO_VERIFICADA en vez de presentar hechos antiguos como actuales.'
    ].join('\n');
    const contents = request?.contents;
    if (typeof contents === 'string') {
        return { ...request, contents: `${contents}\n${directive}` };
    }
    if (Array.isArray(contents)) {
        return { ...request, contents: [...contents, directive] };
    }
    return request;
}

`;
  provider = replaceOnce(provider, helperMarker, helperBlock + helperMarker, 'provider_helpers');
}

provider = provider.replace(
  'const maximumAttempts = 2;\n                    let activeRequest = providerRequest;',
  'const maximumAttempts = wantsGrounding ? 3 : 2;\n                    let activeRequest = providerRequest;'
);

if (!provider.includes('response.jarvisFreshness = freshness;')) {
  const successMarker = `                            await canonicalizeGroundingRedirects(response);\n                            lastProvider = providerName;\n                            return response;`;
  const successReplacement = `                            await canonicalizeGroundingRedirects(response);\n\n                            if (\n                                wantsGrounding &&\n                                requestNeedsFreshness(providerRequest)\n                            ) {\n                                const freshness =\n                                    await inspectGroundingFreshness(\n                                        response,\n                                        providerRequest\n                                    );\n                                if (!freshness.verified) {\n                                    failures.push({\n                                        name: providerName,\n                                        message: \`FRESHNESS_UNVERIFIED:cutoff=\${freshness.cutoffDate || 'unknown'}:dated=\${freshness.datedCount}:fresh=\${freshness.freshCount}\`\n                                    });\n                                    if (attempt < maximumAttempts) {\n                                        activeRequest =\n                                            appendFreshnessSourceRetryDirective(\n                                                appendGroundingRetryDirective(providerRequest),\n                                                freshness\n                                            );\n                                        await sleep(180 * attempt);\n                                        continue;\n                                    }\n                                    break;\n                                }\n                                try {\n                                    response.jarvisFreshness = freshness;\n                                } catch {}\n                            }\n\n                            lastProvider = providerName;\n                            return response;`;
  provider = replaceOnce(provider, successMarker, successReplacement, 'provider_freshness_gate');
}

if (!provider.includes('extractPublicationDatesFromHtml,')) {
  const exportMarker = 'module.exports = {\n';
  provider = replaceOnce(
    provider,
    exportMarker,
    exportMarker + '    appendFreshnessSourceRetryDirective,\n    extractPublicationDatesFromHtml,\n    freshnessWindowDays,\n    groundingSourceUrls,\n    inspectGroundingFreshness,\n',
    'provider_exports'
  );
}

fs.writeFileSync(providerPath, provider);

let research = fs.readFileSync(researchPath, 'utf8');

if (!research.includes('function directResearchFreshnessWindowDays(')) {
  const marker = 'function extractHtmlElements(html = "", tagName = "", maximum = 12) {';
  const helpers = String.raw`function directResearchFreshnessWindowDays(query = '') {
    const text = String(query || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    if (/\b(hoy|today)\b/.test(text)) return 2;
    if (/\b(esta semana|this week|semana|week)\b/.test(text)) return 8;
    if (/\b(este mes|this month|mes|month)\b/.test(text)) return 35;
    if (/\b(este ano|this year|ano|year)\b/.test(text)) return 370;
    return /\b(actual|actuales|actualidad|reciente|recientes|latest|current|recent|novedad|novedades|ultimo|ultima|ultimos|ultimas)\b/.test(text)
        ? 60
        : null;
}

function extractHtmlPublicationDate(html = '') {
    const source = String(html || '').slice(0, 900000);
    const patterns = [
        /["']datePublished["']\s*:\s*["']([^"']+)["']/gi,
        /["']dateModified["']\s*:\s*["']([^"']+)["']/gi,
        /<meta[^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|date|datePublished|dateModified)["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
        /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:article:published_time|article:modified_time|date|datePublished|dateModified)["'][^>]*>/gi,
        /<time[^>]+datetime=["']([^"']+)["'][^>]*>/gi
    ];
    const values = [];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(source)) && values.length < 24) {
            const parsed = new Date(String(match[1] || '').trim());
            if (Number.isFinite(parsed.getTime())) values.push(parsed);
        }
    }
    values.sort((left, right) => right.getTime() - left.getTime());
    return values[0]?.toISOString?.() || null;
}

`;
  research = replaceOnce(research, marker, helpers + marker, 'research_helpers');
}

if (!research.includes('const directFreshnessWindowDays =')) {
  const marker = `    const normalizedQuery = normalizeResearchQuery(query);\n    const domain = requestedDomainFromQuery(normalizedQuery, allowedDomain);`;
  const replacement = `    const normalizedQuery = normalizeResearchQuery(query);\n    const directFreshnessWindowDays =\n        directResearchFreshnessWindowDays(normalizedQuery);\n    const directFreshnessReference = new Date();\n    const directFreshnessCutoffMs =\n        directFreshnessWindowDays\n            ? directFreshnessReference.getTime() -\n                (directFreshnessWindowDays * 86400000)\n            : null;\n    const domain = requestedDomainFromQuery(normalizedQuery, allowedDomain);`;
  research = replaceOnce(research, marker, replacement, 'research_window');
}

if (!research.includes('const publishedAt =\n                extractHtmlPublicationDate(html);')) {
  const marker = `            const html = String(await response.text()).slice(0, 1500000);\n            const title = extractHtmlElements(html, "title", 1)[0] || finalUrl;`;
  const replacement = `            const html = String(await response.text()).slice(0, 1500000);\n            const publishedAt =\n                extractHtmlPublicationDate(html);\n            const title = extractHtmlElements(html, "title", 1)[0] || finalUrl;`;
  research = replaceOnce(research, marker, replacement, 'research_page_date');
}

if (!research.includes('DIRECT_RESEARCH_STALE_OR_UNDATED_PAGE')) {
  const marker = `            if (headings.length === 0 && paragraphs.length === 0) continue;\n            pages.push({ url: finalUrl, title, headings, paragraphs });`;
  const replacement = `            if (headings.length === 0 && paragraphs.length === 0) continue;\n            if (directFreshnessWindowDays) {\n                const publishedMs = publishedAt\n                    ? Date.parse(publishedAt)\n                    : Number.NaN;\n                const freshEnough =\n                    Number.isFinite(publishedMs) &&\n                    publishedMs >= directFreshnessCutoffMs &&\n                    publishedMs <= directFreshnessReference.getTime() + 86400000;\n                if (!freshEnough) {\n                    continue; // DIRECT_RESEARCH_STALE_OR_UNDATED_PAGE\n                }\n            }\n            pages.push({ url: finalUrl, title, headings, paragraphs, publishedAt });`;
  research = replaceOnce(research, marker, replacement, 'research_filter_stale');
}

research = research.replace(
  'const sources = pages.map((page, index) => ({ id: index + 1, title: page.title, url: page.url }));',
  'const sources = pages.map((page, index) => ({ id: index + 1, title: page.title, url: page.url, publishedAt: page.publishedAt || null }));'
);

if (!research.includes('directResearchFreshnessWindowDays,')) {
  const exportMarker = 'module.exports = {\n';
  research = replaceOnce(
    research,
    exportMarker,
    exportMarker + '    directResearchFreshnessWindowDays,\n    extractHtmlPublicationDate,\n',
    'research_exports'
  );
}

fs.writeFileSync(researchPath, research);
console.log('V146_SOURCE_FRESHNESS_PATCH_APPLIED=true');
