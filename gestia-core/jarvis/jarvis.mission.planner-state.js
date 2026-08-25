const MAX_PLANNER_TEXT = 700;
const MAX_PLANNER_SOURCES = 3;
const MAX_PLANNER_MEDIA_ASSETS = 8;
const MAX_PLANNER_PERSISTED_ARTIFACTS = 8;

function object(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}

function text(value, max = MAX_PLANNER_TEXT) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function compactSource(source = {}) {
    const item = object(source);
    const title = text(item.title || item.name || item.label, 180);
    const url = text(item.url || item.href || item.link, 500);
    return {
        ...(title ? { title } : {}),
        ...(url ? { url } : {})
    };
}

function compactMediaAsset(asset = {}) {
    const item = object(asset);
    const kind = text(item.kind, 20).toLowerCase();
    const output = text(item.output, 500);
    const mimeType = text(item.mimeType, 100).toLowerCase();
    const sha256 = text(item.sha256, 80).toLowerCase();
    const sourceUrl = text(item.sourceUrl, 500);
    const sourceTag = text(item.sourceTag, 80);
    const alt = text(item.alt, 220);
    const bytes = Number(item.bytes || 0) || 0;

    if (
        !["image", "video", "audio"].includes(kind) ||
        !output ||
        !mimeType.startsWith(`${kind}/`)
    ) {
        return null;
    }

    return {
        kind,
        output,
        mimeType,
        ...(bytes > 0 ? { bytes } : {}),
        ...(sha256 ? { sha256 } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
        ...(sourceTag ? { sourceTag } : {}),
        ...(alt ? { alt } : {})
    };
}

export function compactMissionPlannerObservation(observation = {}) {
    const source = object(observation);
    const evidence = object(source.evidence);
    const sources = (
        Array.isArray(source.sources)
            ? source.sources
            : Array.isArray(evidence.sources)
                ? evidence.sources
                : []
    ).slice(0, MAX_PLANNER_SOURCES).map(compactSource);
    const rawMediaAssets =
        Array.isArray(source.mediaAssets)
            ? source.mediaAssets
            : Array.isArray(evidence.mediaAssets)
                ? evidence.mediaAssets
                : [];
    const mediaAssets = rawMediaAssets
        .slice(0, MAX_PLANNER_MEDIA_ASSETS)
        .map(compactMediaAsset)
        .filter(Boolean);
    const rawPersistedArtifacts =
        Array.isArray(source.persistedArtifacts)
            ? source.persistedArtifacts
            : Array.isArray(evidence.persistedArtifacts)
                ? evidence.persistedArtifacts
                : [];
    const persistedArtifacts = rawPersistedArtifacts
        .map(value => text(value, 500))
        .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
        .slice(0, MAX_PLANNER_PERSISTED_ARTIFACTS);
    const sourceCount = Number(
        source.sourceCount ??
        source.sourcesCount ??
        evidence.sourceCount ??
        evidence.sourcesCount ??
        (Array.isArray(source.sources) ? source.sources.length : 0) ??
        (Array.isArray(evidence.sources) ? evidence.sources.length : 0)
    ) || 0;
    const summary = text(
        source.summary ||
        source.message ||
        source.answer ||
        source.result ||
        evidence.summary ||
        evidence.answer ||
        ""
    );
    const output = text(
        typeof source.output === "string" ? source.output : "",
        420
    );
    const sha256 = text(source.sha256 || evidence.sha256, 80);
    const mimeType = text(source.mimeType || evidence.mimeType, 100);
    const bytes = Number(source.bytes ?? evidence.bytes ?? 0) || 0;
    const requirementsMet =
        typeof source.requirementsMet === "boolean"
            ? source.requirementsMet
            : typeof evidence.requirementsMet === "boolean"
                ? evidence.requirementsMet
                : null;
    const rawCounts = object(source.counts || evidence.counts);
    const counts = {
        images: Number(rawCounts.images || 0) || 0,
        videos: Number(rawCounts.videos || 0) || 0,
        total: Number(rawCounts.total || mediaAssets.length) || mediaAssets.length
    };

    return {
        status: text(source.status || evidence.status, 120) || null,
        ok: source.ok === true,
        executionOk: source.executionOk === true || source.ok === true,
        objectiveSatisfied: source.objectiveSatisfied === true,
        blocked: source.blocked === true,
        requiresInput: source.requiresInput === true,
        retryable: source.retryable === true,
        sourceCount,
        ...(summary ? { summary } : {}),
        ...(sources.length ? { sources } : {}),
        ...(mediaAssets.length ? { mediaAssets } : {}),
        ...(persistedArtifacts.length ? { persistedArtifacts } : {}),
        ...(mediaAssets.length || requirementsMet !== null
            ? { counts }
            : {}),
        ...(requirementsMet !== null ? { requirementsMet } : {}),
        ...(output ? { output } : {}),
        ...(sha256 ? { sha256 } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(bytes > 0 ? { bytes } : {})
    };
}

export function compactMissionPlannerTasks(tasks = []) {
    return (Array.isArray(tasks) ? tasks : []).map(item => ({
        name: String(item?.name || ""),
        args: item?.args && typeof item.args === "object" ? item.args : {},
        observation: compactMissionPlannerObservation(item?.observation)
    }));
}

export function plannerStateBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value || {})).byteLength;
}
