const VERSION = "1.2.0-page-evidence-failclosed-v123";

const MISSION_STAGE_BY_TOOL = Object.freeze({
    "web.research": 10,
    "web.media.collect": 15,
    "media.analyze": 18,
    "marketing.plan": 20,
    "page.plan": 20,
    "image.plan": 20,
    "page.compose": 30,
    "document.compose": 30,
    "spreadsheet.compose": 30,
    "reel.plan": 30,
    "page.create": 40,
    "reel.create": 40,
    "document.create": 40,
    "document.pdf": 40,
    "image.generate": 40,
    "marketing.package.real-media": 40
});

function object(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}

function directPageReady(args = {}) {
    const source = object(args);
    return Boolean(
        String(source.brandName || "").trim() &&
        String(source.title || "").trim() &&
        String(source.description || "").trim().length >= 20 &&
        Array.isArray(source.services) &&
        (
            source.services.length > 0 ||
            source.evidenceMode === "insufficient"
        )
    );
}

function stableSemanticStageSort(calls = []) {
    const staged = calls
        .map((call, index) => ({
            call,
            index,
            stage: MISSION_STAGE_BY_TOOL[String(call?.name || "")] ?? null
        }))
        .filter(item => item.stage !== null)
        .sort((a, b) => (a.stage - b.stage) || (a.index - b.index))
        .map(item => item.call);

    let stagedIndex = 0;
    return calls.map(call => {
        if (MISSION_STAGE_BY_TOOL[String(call?.name || "")] === undefined) {
            return call;
        }
        const next = staged[stagedIndex];
        stagedIndex += 1;
        return next;
    });
}

export function ensureExecutableArtifactDependencies({
    toolCalls = [],
    catalog = []
} = {}) {
    const calls = Array.isArray(toolCalls)
        ? toolCalls.filter(call => call && typeof call === "object").map(call => ({
            ...call,
            args: { ...object(call.args) }
        }))
        : [];
    const available = new Set(
        (Array.isArray(catalog) ? catalog : [])
            .map(tool => String(tool?.name || ""))
            .filter(Boolean)
    );
    const hasPageCreate = calls.some(call => call.name === "page.create");
    const hasPageCompose = calls.some(call => call.name === "page.compose");

    if (!hasPageCreate || hasPageCompose || !available.has("page.compose")) {
        return stableSemanticStageSort(calls);
    }

    const createIndex = calls.findIndex(call => call.name === "page.create");
    const createCall = calls[createIndex];
    if (directPageReady(createCall?.args)) {
        return stableSemanticStageSort(calls);
    }
    const pagePlan = [...calls]
        .slice(0, Math.max(0, createIndex))
        .reverse()
        .find(call => call?.name === "page.plan") || null;
    const seed = {
        ...object(pagePlan?.args),
        ...object(createCall?.args)
    };
    const composeCall = {
        name: "page.compose",
        args: {
            ...(String(seed.brandName || "").trim() ? { brandName: String(seed.brandName).trim() } : {}),
            ...(String(seed.title || "").trim() ? { title: String(seed.title).trim() } : {}),
            ...(String(seed.contactEmail || "").trim() ? { contactEmail: String(seed.contactEmail).trim() } : {}),
            ...(String(seed.whatsapp || "").trim() ? { whatsapp: String(seed.whatsapp).trim() } : {}),
            ...(seed.whatsappRequested === true ? { whatsappRequested: true } : {})
        },
        approved: false,
        reason: "STRUCTURAL_PAGE_CREATE_DEPENDENCY"
    };
    const expanded = [...calls];
    expanded.splice(createIndex, 0, composeCall);
    return stableSemanticStageSort(expanded);
}

export function describeMissionDependencies() {
    return {
        ok: true,
        version: VERSION,
        architecture: "tool_contract_dependency",
        lexicalRouting: false,
        currentDependency: "evidence -> planning -> composition -> artifact; page.create -> page.compose when direct page input is incomplete",
        stages: { ...MISSION_STAGE_BY_TOOL }
    };
}

export const __test = {
    directPageReady,
    stableSemanticStageSort,
    MISSION_STAGE_BY_TOOL
};
