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

provider = provider.replace(
  'const {\n    assessGroundingSupportFreshness\n} = require("./jarvis-web-fact-freshness");\n\n',
  ''
);

if (!provider.includes('function assessGroundingSupportFreshness(')) {
  const marker = 'function freshnessWindowDays(request = {}) {';
  const helpers = String.raw`const FACT_FRESHNESS_MONTHS = new Map([
    ["enero", 0], ["january", 0], ["jan", 0],
    ["febrero", 1], ["february", 1], ["feb", 1],
    ["marzo", 2], ["march", 2], ["mar", 2],
    ["abril", 3], ["april", 3], ["apr", 3],
    ["mayo", 4], ["may", 4],
    ["junio", 5], ["june", 5], ["jun", 5],
    ["julio", 6], ["july", 6], ["jul", 6],
    ["agosto", 7], ["august", 7], ["aug", 7],
    ["septiembre", 8], ["setiembre", 8], ["september", 8], ["sep", 8], ["sept", 8],
    ["octubre", 9], ["october", 9], ["oct", 9],
    ["noviembre", 10], ["november", 10], ["nov", 10],
    ["diciembre", 11], ["december", 11], ["dec", 11]
]);

function factFreshnessSupportText(value = "") {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function factFreshnessSupportKey(value = "") {
    return factFreshnessSupportText(value)
        .slice(0, 320)
        .toLocaleLowerCase();
}

function pushFactFreshnessDate(target, year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) return;
    if (!Number.isInteger(m) || m < 0 || m > 11) return;
    if (!Number.isInteger(d) || d < 1 || d > 31) return;
    const value = new Date(Date.UTC(y, m, d, 12, 0, 0));
    if (
        value.getUTCFullYear() !== y ||
        value.getUTCMonth() !== m ||
        value.getUTCDate() !== d
    ) return;
    target.push(value.toISOString());
}

function extractExplicitFactDates(value = "") {
    const text = String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const found = [];

    for (const match of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
        pushFactFreshnessDate(found, match[1], Number(match[2]) - 1, match[3]);
    }
    for (const match of text.matchAll(/\b(\d{1,2})(?:\s+de)?\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:\s+de)?\s+(20\d{2})\b/g)) {
        pushFactFreshnessDate(found, match[3], FACT_FRESHNESS_MONTHS.get(match[2]), match[1]);
    }
    for (const match of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/g)) {
        pushFactFreshnessDate(found, match[3], FACT_FRESHNESS_MONTHS.get(match[1]), match[2]);
    }
    for (const match of text.matchAll(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/g)) {
        pushFactFreshnessDate(found, match[3], Number(match[2]) - 1, match[1]);
    }

    return [...new Set(found)]
        .sort((left, right) => Date.parse(right) - Date.parse(left));
}

function isAggregateFactFreshnessUrl(value = "") {
    try {
        const url = new URL(String(value || ""));
        const path = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
        if (path === "/") return true;
        if (/\/(news|changelog|updates|releases?|blog|announcements?)$/.test(path)) return true;
        if (path.includes("/research/index/release")) return true;
        return false;
    } catch {
        return true;
    }
}

function factFreshnessSupportSourceUrls(response = {}, support = {}) {
    const metadata = response?.candidates?.[0]?.groundingMetadata || {};
    const chunks = Array.isArray(metadata?.groundingChunks)
        ? metadata.groundingChunks
        : [];
    const indices = Array.isArray(support?.groundingChunkIndices)
        ? support.groundingChunkIndices
        : [];
    const urls = [];
    for (const index of indices) {
        if (!Number.isInteger(index)) continue;
        const url = String(chunks[index]?.web?.uri || "").trim();
        if (!url || urls.includes(url)) continue;
        urls.push(url);
    }
    return urls.slice(0, 8);
}

function assessGroundingSupportFreshness({
    response = {},
    inspectedSources = [],
    cutoffMs = Number.NaN,
    referenceMs = Date.now()
} = {}) {
    const metadata = response?.candidates?.[0]?.groundingMetadata || {};
    const supports = Array.isArray(metadata?.groundingSupports)
        ? metadata.groundingSupports
        : [];
    const sourceByUrl = new Map(
        (Array.isArray(inspectedSources) ? inspectedSources : [])
            .map(source => [String(source?.url || "").trim(), source])
            .filter(([url]) => Boolean(url))
    );
    const assessments = [];

    for (const support of supports) {
        const text = factFreshnessSupportText(support?.segment?.text || "").slice(0, 320);
        if (!text) continue;
        const urls = factFreshnessSupportSourceUrls(response, support);
        if (urls.length === 0) continue;
        const explicitDates = extractExplicitFactDates(text);
        const explicitTimestamps = explicitDates
            .map(value => Date.parse(value))
            .filter(Number.isFinite);

        let fresh = false;
        let evidence = "UNVERIFIED";
        let verifiedAt = null;

        if (explicitTimestamps.length > 0) {
            const freshExplicit = explicitTimestamps
                .filter(timestamp =>
                    Number.isFinite(cutoffMs) &&
                    timestamp >= cutoffMs &&
                    timestamp <= referenceMs + 86400000
                )
                .sort((left, right) => right - left);
            fresh = freshExplicit.length > 0;
            evidence = fresh
                ? "EXPLICIT_GROUNDED_SUPPORT_DATE"
                : "EXPLICIT_GROUNDED_SUPPORT_DATE_STALE";
            verifiedAt = new Date(
                freshExplicit[0] || Math.max(...explicitTimestamps)
            ).toISOString();
        } else {
            const sourceEvidence = urls
                .map(url => ({ url, source: sourceByUrl.get(url) }))
                .filter(item =>
                    item.source?.fresh === true &&
                    !isAggregateFactFreshnessUrl(item.url)
                )
                .sort((left, right) =>
                    Date.parse(right.source?.publishedAt || 0) -
                    Date.parse(left.source?.publishedAt || 0)
                );
            fresh = sourceEvidence.length > 0;
            evidence = fresh
                ? "FRESH_INDIVIDUAL_SOURCE_DATE"
                : "AGGREGATE_OR_UNDATED_SUPPORT";
            verifiedAt = sourceEvidence[0]?.source?.publishedAt || null;
        }

        assessments.push({
            key: factFreshnessSupportKey(text),
            text,
            fresh,
            evidence,
            verifiedAt,
            explicitDates,
            sourceUrls: urls
        });
    }

    return {
        supports: assessments,
        freshCount: assessments.filter(item => item.fresh).length,
        staleCount: assessments.filter(item => !item.fresh).length,
        datedCount: assessments.filter(item => item.explicitDates.length > 0).length
    };
}

`;
  provider = replaceOnce(provider, marker, helpers + marker, 'provider_fact_freshness_helpers');
}

if (!provider.includes('async function inspectGroundingFreshness(')) {
  throw new Error('V146_EXISTING_FRESHNESS_RUNTIME_MISSING');
}
if (!provider.includes('supportFreshCount: supportFreshness.freshCount')) {
  throw new Error('V146_FACT_LEVEL_GATE_MISSING');
}
if (!provider.includes('response.jarvisFreshness = freshness;')) {
  throw new Error('V146_RESPONSE_FRESHNESS_METADATA_MISSING');
}

fs.writeFileSync(providerPath, provider);

let research = fs.readFileSync(researchPath, 'utf8');

research = research.replace(
  'const {\n    filterGroundingSupportsByFreshness\n} = require("./jarvis-web-fact-freshness");\n\n',
  ''
);

if (!research.includes('function filterGroundingSupportsByFreshness(')) {
  const marker = 'function lexicalTokens(value = "") {';
  const helpers = String.raw`function webFactFreshnessKey(value = "") {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 320)
        .toLocaleLowerCase();
}

function filterGroundingSupportsByFreshness(supports = [], freshness = null) {
    if (!freshness?.required) return Array.isArray(supports) ? supports : [];
    const assessmentByKey = new Map(
        (Array.isArray(freshness?.supports) ? freshness.supports : [])
            .map(item => [
                String(item?.key || webFactFreshnessKey(item?.text)),
                item
            ])
            .filter(([key]) => Boolean(key))
    );

    return (Array.isArray(supports) ? supports : [])
        .map(support => {
            const assessment = assessmentByKey.get(
                webFactFreshnessKey(support?.text)
            );
            return assessment?.fresh === true
                ? { ...support, freshness: assessment }
                : null;
        })
        .filter(Boolean);
}

`;
  research = replaceOnce(research, marker, helpers + marker, 'research_fact_freshness_helpers');
}

if (!research.includes('function directResearchFreshnessWindowDays(')) {
  throw new Error('V146_DIRECT_FRESHNESS_RUNTIME_MISSING');
}
if (!research.includes('const freshnessFilteredSupports =')) {
  throw new Error('V146_FACT_FILTER_MISSING');
}
if (!research.includes('staleFactsFiltered:')) {
  throw new Error('V146_FACT_FILTER_POLICY_MISSING');
}

fs.writeFileSync(researchPath, research);
console.log('V146_SOURCE_FRESHNESS_PATCH_APPLIED=true');
