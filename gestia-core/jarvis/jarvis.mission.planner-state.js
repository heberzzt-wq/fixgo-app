const MAX_PLANNER_TEXT = 700;
const MAX_PLANNER_SOURCES = 3;

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
