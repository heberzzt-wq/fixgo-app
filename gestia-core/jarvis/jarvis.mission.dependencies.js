const VERSION = "1.3.0-marketing-artifact-identity-v12";

const MISSION_STAGE_BY_TOOL = Object.freeze({
    "web.research": 10,
    "media.analyze": 18,
    "marketing.plan": 20,
    "page.plan": 20,
    "image.plan": 20,
    "web.media.collect": 25,
    "page.compose": 30,
    "document.compose": 30,
    "spreadsheet.compose": 30,
    "reel.plan": 30,
    "page.create": 40,
    "reel.create": 40,
    "document.create": 40,
    "document.pdf": 40,
    "image.generate": 40,
    "image.edit": 40,
    "marketing.package.real-media": 40
});

function object(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}

function clean(value = "") {
    return String(value || "").trim();
}

function safeRequirementId(value = "", fallback = "artifact") {
    const source = clean(value) || fallback;
    const normalized = source
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
    return normalized || fallback;
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

function marketingProductionRequirements(calls = []) {
    const marketingCall = calls.find(call => call?.name === "marketing.plan") || null;
    const source = Array.isArray(marketingCall?.args?.productionArtifacts)
        ? marketingCall.args.productionArtifacts
        : [];
    return source
        .slice(0, 12)
        .map((item, index) => {
            const entry = object(item);
            const toolName = clean(entry.toolName);
            if (!toolName) return null;
            return {
                id: safeRequirementId(entry.id, `artifact-${index + 1}`),
                type: clean(entry.type),
                toolName,
                format: clean(entry.format).toLowerCase(),
                label: clean(entry.label)
            };
        })
        .filter(Boolean);
}

function requirementCallCompatible(call = {}, requirement = {}) {
    if (clean(call?.name) !== clean(requirement?.toolName)) return false;
    if (requirement.toolName === "document.create" && requirement.format) {
        const callFormat = clean(call?.args?.format).toLowerCase();
        return !callFormat || callFormat === requirement.format;
    }
    return true;
}

function marketingArtifactOutput(requirement = {}) {
    const id = safeRequirementId(requirement?.id, "artifact");
    if (requirement?.toolName === "document.create" && requirement?.format) {
        const extension = requirement.format === "markdown" ? "md" : requirement.format;
        return `.jarvis-artifacts/documents/marketing-${id}.${extension}`;
    }
    return "";
}

function tagMarketingProductionCalls(calls = []) {
    const requirements = marketingProductionRequirements(calls);
    if (requirements.length === 0) return calls;

    const claimedCallIndexes = new Set();
    for (const requirement of requirements) {
        const callIndex = calls.findIndex((call, index) =>
            !claimedCallIndexes.has(index) &&
            requirementCallCompatible(call, requirement)
        );
        if (callIndex < 0) continue;
        claimedCallIndexes.add(callIndex);

        const call = calls[callIndex];
        const args = {
            ...object(call.args),
            marketingRequirementId: requirement.id
        };

        if (requirement.toolName === "document.create") {
            if (requirement.format) args.format = requirement.format;
            args.contentSource = "marketing.plan";
            if (!clean(args.output)) {
                const output = marketingArtifactOutput(requirement);
                if (output) args.output = output;
            }
        }

        if (
            requirement.toolName === "image.generate" ||
            requirement.toolName === "image.edit"
        ) {
            if (!clean(args.variantId)) args.variantId = requirement.id;
        }

        calls[callIndex] = {
            ...call,
            args
        };
    }

    return calls;
}

function removeRedundantMarketingComposers(calls = []) {
    const requirements = marketingProductionRequirements(calls);
    if (requirements.length === 0) return calls;
    const marketingDocumentRequirements = requirements.filter(item =>
        item.toolName === "document.create"
    );
    if (marketingDocumentRequirements.length === 0) return calls;

    const documentCalls = calls.filter(call => call?.name === "document.create");
    const allDocumentCreatesAreMarketing =
        documentCalls.length > 0 &&
        documentCalls.every(call =>
            clean(call?.args?.contentSource) === "marketing.plan"
        );
    if (!allDocumentCreatesAreMarketing) return calls;

    return calls.filter(call =>
        call?.name !== "document.compose" &&
        call?.name !== "spreadsheet.compose"
    );
}

function injectPageComposeDependency(calls = [], available = new Set()) {
    const hasPageCreate = calls.some(call => call.name === "page.create");
    const hasPageCompose = calls.some(call => call.name === "page.compose");

    if (!hasPageCreate || hasPageCompose || !available.has("page.compose")) {
        return calls;
    }

    const createIndex = calls.findIndex(call => call.name === "page.create");
    const createCall = calls[createIndex];
    if (directPageReady(createCall?.args)) {
        return calls;
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
    return expanded;
}

export function ensureExecutableArtifactDependencies({
    toolCalls = [],
    catalog = []
} = {}) {
    let calls = Array.isArray(toolCalls)
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

    calls = tagMarketingProductionCalls(calls);
    calls = removeRedundantMarketingComposers(calls);
    calls = injectPageComposeDependency(calls, available);
    return stableSemanticStageSort(calls);
}

export function describeMissionDependencies() {
    return {
        ok: true,
        version: VERSION,
        architecture: "tool_contract_dependency",
        lexicalRouting: false,
        currentDependency: "research/media evidence -> marketing.plan -> collected media/composition -> uniquely identified physical artifacts",
        marketingArtifactIdentity: true,
        stages: { ...MISSION_STAGE_BY_TOOL }
    };
}

export const __test = {
    directPageReady,
    stableSemanticStageSort,
    marketingProductionRequirements,
    requirementCallCompatible,
    tagMarketingProductionCalls,
    removeRedundantMarketingComposers,
    MISSION_STAGE_BY_TOOL
};
