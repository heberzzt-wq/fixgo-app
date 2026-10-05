// References inform a proposed design. They never become client facts or reusable assets.
// Mechanical contact parsing for grounding only; never selects tools or interprets intent.
export function advertisingContacts(value, { canonical = false } = {}) {
    return (String(value).match(/(?:https?:\/\/|www\.)[^\s<>"']+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
        .map(contact => {
            const trimmed = contact.replace(/[.,;!?]+$/, "");
            return canonical ? trimmed.replace(/^https?:\/\//i, "").toLowerCase() : trimmed;
        });
}

export function advertisingBenchmarkSources(result = {}) {
    return [...new Map((Array.isArray(result.sources) ? result.sources : []).filter(source => {
        try { return ["http:", "https:"].includes(new URL(source.url).protocol) && Boolean(source.title || source.snippet || source.text); }
        catch { return false; }
    }).map(source => [source.url, source])).values()];
}

export function validateAdvertisingDirection(direction, evidence = []) {
    const benchmarks = evidence.filter(item => item.tool === "advertising.research");
    const sources = benchmarks.flatMap(item => advertisingBenchmarkSources(item.evidence || item));
    if (sources.length < 2) throw new Error("ADVERTISING_BENCHMARK_REQUIRED: Investiga al menos dos referencias online con advertising.research antes de crear publicidad.");
    if (!direction || ![direction.insight, direction.distinction, direction.clarity, direction.visualHierarchy, direction.callToAction].every(value => typeof value === "string" && value.trim())) {
        throw new Error("ADVERTISING_DIRECTION_REQUIRED: Define una propuesta propia y mejoras concretas de claridad, jerarquía visual y llamada a la acción; no prometas superioridad demostrada.");
    }
    const allowed = new Set(sources.map(source => source.url));
    if (!Array.isArray(direction.references) || new Set(direction.references).size < 2 || direction.references.some(url => !allowed.has(url))) {
        throw new Error("ADVERTISING_REFERENCE_UNVERIFIED: Cita dos URLs exactas observadas en la investigación; no inventes referencias.");
    }
    return { status: "ADVERTISING_DIRECTION_GROUNDED", references: direction.references, superiorQualityVerified: false };
}

export const ADVERTISING_DIRECTION_SCHEMA = {
    type: "object", properties: {
        insight: {type:"string",maxLength:400}, distinction:{type:"string",maxLength:400},
        clarity:{type:"string",maxLength:240}, visualHierarchy:{type:"string",maxLength:240},
        callToAction:{type:"string",maxLength:240}, references:{type:"array",minItems:2,maxItems:5,items:{type:"string"}}
    }, required:["insight","distinction","clarity","visualHierarchy","callToAction","references"], additionalProperties:false
};
