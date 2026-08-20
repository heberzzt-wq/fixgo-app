"use strict";

const MONTHS = new Map([
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

function normalizeSupportText(value = "") {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function supportFreshnessKey(value = "") {
    return normalizeSupportText(value)
        .slice(0, 320)
        .toLocaleLowerCase();
}

function pushDate(target, year, month, day) {
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

function extractExplicitDatesFromText(value = "") {
    const text = String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    const found = [];

    for (const match of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
        pushDate(found, match[1], Number(match[2]) - 1, match[3]);
    }

    for (const match of text.matchAll(/\b(\d{1,2})(?:\s+de)?\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:\s+de)?\s+(20\d{2})\b/g)) {
        pushDate(found, match[3], MONTHS.get(match[2]), match[1]);
    }

    for (const match of text.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/g)) {
        pushDate(found, match[3], MONTHS.get(match[1]), match[2]);
    }

    for (const match of text.matchAll(/\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/g)) {
        // Jarvis is primarily Spanish/MX: day/month/year is the least surprising interpretation.
        pushDate(found, match[3], Number(match[2]) - 1, match[1]);
    }

    return [...new Set(found)]
        .sort((left, right) => Date.parse(right) - Date.parse(left));
}

function isAggregateFreshnessUrl(value = "") {
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

function groundingMetadata(response = {}) {
    return response?.candidates?.[0]?.groundingMetadata || {};
}

function supportSourceUrls(response = {}, support = {}) {
    const chunks = Array.isArray(groundingMetadata(response)?.groundingChunks)
        ? groundingMetadata(response).groundingChunks
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
    const supports = Array.isArray(groundingMetadata(response)?.groundingSupports)
        ? groundingMetadata(response).groundingSupports
        : [];
    const sourceByUrl = new Map(
        (Array.isArray(inspectedSources) ? inspectedSources : [])
            .map(source => [String(source?.url || "").trim(), source])
            .filter(([url]) => Boolean(url))
    );
    const assessments = [];

    for (const support of supports) {
        const text = normalizeSupportText(support?.segment?.text || "").slice(0, 320);
        if (!text) continue;
        const urls = supportSourceUrls(response, support);
        if (urls.length === 0) continue;
        const explicitDates = extractExplicitDatesFromText(text);
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
                    !isAggregateFreshnessUrl(item.url)
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
            key: supportFreshnessKey(text),
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

function filterGroundingSupportsByFreshness(supports = [], freshness = null) {
    if (!freshness?.required) return Array.isArray(supports) ? supports : [];
    const assessmentByKey = new Map(
        (Array.isArray(freshness?.supports) ? freshness.supports : [])
            .map(item => [String(item?.key || supportFreshnessKey(item?.text)), item])
            .filter(([key]) => Boolean(key))
    );

    return (Array.isArray(supports) ? supports : [])
        .map(support => {
            const assessment = assessmentByKey.get(
                supportFreshnessKey(support?.text)
            );
            return assessment?.fresh === true
                ? { ...support, freshness: assessment }
                : null;
        })
        .filter(Boolean);
}

module.exports = {
    assessGroundingSupportFreshness,
    extractExplicitDatesFromText,
    filterGroundingSupportsByFreshness,
    isAggregateFreshnessUrl,
    normalizeSupportText,
    supportFreshnessKey,
    supportSourceUrls
};
