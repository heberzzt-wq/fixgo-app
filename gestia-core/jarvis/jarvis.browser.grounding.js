function httpUrl(value) {
    try {
        const url = new URL(String(value || "").trim());
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
            ? url.href : null;
    } catch {
        return null;
    }
}

function instructionUrls(instruction) {
    // Parse URL literals, not natural-language intent. A proposed tool argument
    // or semantic-memory answer is never a source of authority for its own URL.
    return (String(instruction || "").match(/https?:\/\/[^\s<>"'`]+/giu) || [])
        .flatMap(value => [httpUrl(value), httpUrl(value.replace(/[.,;!?)}\]]+$/u, ""))])
        .filter(Boolean);
}

export function validateBrowserUrl(url, context = {}) {
    const target = httpUrl(url);
    const explicit = new Set([
        ...instructionUrls(context.rawInput),
        ...instructionUrls(context.originalInstruction),
        ...instructionUrls(context.rootInstruction)
    ].filter(Boolean));
    const currentPageUrl = httpUrl(context.currentPage?.url);
    const currentPageOrigin = httpUrl(context.currentPage?.origin);
    const grounded = new Set([
        ...explicit,
        currentPageUrl,
        currentPageOrigin
    ].filter(Boolean));

    // Successful observed URLs support browser follow-ups. Do not include task
    // args, failed results, summaries, or arbitrary model-authored strings.
    const collectObservedUrls = (value, depth = 0) => {
        if (!value || typeof value !== "object" || depth > 8 ||
            value.ok === false || value.executionOk === false) return;
        for (const [key, child] of Object.entries(value)) {
            if (["args", "instruction", "prompt", "summary"].includes(key)) continue;
            if (["url", "sourceUrl", "finalUrl", "pageUrl", "href"].includes(key)) {
                const observed = httpUrl(child);
                if (observed) grounded.add(observed);
            } else if (child && typeof child === "object") collectObservedUrls(child, depth + 1);
        }
    };
    for (const task of Array.isArray(context.completedTasks) ? context.completedTasks : []) {
        if (task?.observation?.ok === true) collectObservedUrls(task.observation);
    }

    if (target && explicit.has(target)) return { ok: true, url: target };
    if (
        target &&
        currentPageUrl &&
        (target === currentPageUrl || target === currentPageOrigin)
    ) {
        return { ok: true, url: currentPageUrl };
    }
    if (target && grounded.has(target)) return { ok: true, url: target };
    return {
        ok: false,
        executionOk: false,
        objectiveSatisfied: false,
        blocked: true,
        retryable: false,
        status: "BROWSER_URL_GROUNDING_REQUIRED",
        error: "BROWSER_URL_GROUNDING_REQUIRED",
        message: "Falta una URL fundamentada en la instruccion o en contexto real del runtime. Comparte la URL de la interfaz para poder inspeccionarla; no se ha realizado el analisis visual."
    };
}
