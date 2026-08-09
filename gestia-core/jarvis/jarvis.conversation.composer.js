const MAX_EVIDENCE_ITEMS = 12;
const MAX_EVIDENCE_LENGTH = 24000;

function normalizedText(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

export function isExplicitJsonResponseRequest(instruction = "") {
    const normalized = normalizedText(instruction);
    return (
        normalized.includes("json") &&
        (
            normalized.includes("devuelve") ||
            normalized.includes("responde") ||
            normalized.includes("formato") ||
            normalized.includes("salida")
        )
    );
}

export function prepareEvidenceGroundedConversationPlan({
    instruction = "",
    toolCalls = [],
    toolCatalog = []
} = {}) {
    const explicitJson = isExplicitJsonResponseRequest(instruction);
    const operationalCalls = [];
    const seen = new Set();
    let conversationRequested = false;

    for (const call of Array.isArray(toolCalls) ? toolCalls : []) {
        if (!call?.name) continue;
        if (call.name === "conversation.respond") {
            conversationRequested = true;
            continue;
        }
        const signature = `${call.name}:${JSON.stringify(call.args || {})}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        operationalCalls.push(call);
    }

    const hasCapabilities =
        operationalCalls.some(call => call.name === "system.capabilities");
    const hasLimitationEvidence =
        operationalCalls.some(call =>
            call.name === "system.forensics" ||
            call.name === "system.health"
        );
    const forensicsAvailable =
        (Array.isArray(toolCatalog) ? toolCatalog : [])
            .some(tool => tool?.name === "system.forensics");

    if (
        hasCapabilities &&
        !explicitJson &&
        !hasLimitationEvidence &&
        forensicsAvailable
    ) {
        operationalCalls.push({
            name: "system.forensics",
            args: {},
            approved: false,
            reason: "CAPABILITY_LIMITATION_EVIDENCE_REQUIRED"
        });
    }

    return {
        explicitJson,
        conversationRequested,
        operationalCalls,
        requiresFinalConversation:
            operationalCalls.length > 0 &&
            !explicitJson
    };
}

export function mergeEvidenceGroundedToolCalls(...groups) {
    const merged = [];
    const seenSignatures = new Set();
    const singletonEvidenceTools = new Set([
        "system.capabilities",
        "system.forensics",
        "system.health",
        "media.analyze"
    ]);
    const seenSingletons = new Set();

    for (const call of groups.flat()) {
        if (!call?.name || call.name === "conversation.respond") continue;
        if (
            singletonEvidenceTools.has(call.name) &&
            seenSingletons.has(call.name)
        ) {
            continue;
        }
        const signature = `${call.name}:${JSON.stringify(call.args || {})}`;
        if (seenSignatures.has(signature)) continue;
        seenSignatures.add(signature);
        if (singletonEvidenceTools.has(call.name)) {
            seenSingletons.add(call.name);
        }
        merged.push(call);
    }

    return merged;
}

function boundedEvidenceValue(value, depth = 0) {
    if (depth > 5 || value == null) return value ?? null;
    if (typeof value === "string") return value.slice(0, 1600);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) {
        return value
            .slice(0, 30)
            .map(item => boundedEvidenceValue(item, depth + 1));
    }
    if (typeof value !== "object") return String(value).slice(0, 500);

    const allowed = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
        if (
            [
                "raw",
                "bytes",
                "base64",
                "blob",
                "html",
                "content",
                "numberedContent"
            ].includes(key)
        ) {
            continue;
        }
        allowed[key] = boundedEvidenceValue(item, depth + 1);
    }
    return allowed;
}


function compactEvidenceText(value = "", maximum = 800) {
    return String(value ?? "").slice(0, maximum);
}

function compactEvidenceTextArray(
    values = [],
    maximumItems = 8,
    maximumLength = 320
) {
    return (Array.isArray(values) ? values : [])
        .slice(0, maximumItems)
        .map(value =>
            compactEvidenceText(
                typeof value === "string"
                    ? value
                    : JSON.stringify(value),
                maximumLength
            )
        );
}

function compactMediaAnalysisPage(page = {}) {
    return {
        page:
            page?.page ??
            page?.pageNumber ??
            null,
        summary:
            compactEvidenceText(
                page?.summary || "",
                700
            ),
        evidence:
            compactEvidenceTextArray(
                page?.evidence,
                6,
                320
            ),
        uncertainty:
            compactEvidenceTextArray(
                page?.uncertainty,
                4,
                320
            )
    };
}

function compactMediaAnalysisSource(source = {}) {
    return {
        sourceId:
            compactEvidenceText(
                source?.sourceId || "",
                120
            ),
        fileName:
            compactEvidenceText(
                source?.fileName ||
                source?.name ||
                "",
                300
            ),
        mimeType:
            compactEvidenceText(
                source?.mimeType || "",
                120
            ),
        description:
            compactEvidenceText(
                source?.description || "",
                1600
            ),
        observations:
            compactEvidenceTextArray(
                source?.observations,
                8,
                320
            ),
        inferences:
            compactEvidenceTextArray(
                source?.inferences,
                6,
                320
            ),
        visibleData:
            (Array.isArray(source?.visibleData)
                ? source.visibleData
                : [])
                .slice(0, 10)
                .map(item => ({
                    kind:
                        compactEvidenceText(
                            item?.kind || "text",
                            40
                        ),
                    value:
                        compactEvidenceText(
                            item?.value || "",
                            300
                        ),
                    page:
                        item?.page ??
                        null,
                    confidence:
                        item?.confidence ??
                        null,
                    evidence:
                        compactEvidenceText(
                            item?.evidence || "",
                            500
                        ),
                    legibility:
                        compactEvidenceText(
                            item?.legibility || "",
                            40
                        )
                })),
        pages:
            (Array.isArray(source?.pages)
                ? source.pages
                : [])
                .slice(0, 12)
                .map(compactMediaAnalysisPage),
        uncertainty:
            compactEvidenceTextArray(
                source?.uncertainty,
                6,
                320
            ),
        evidence:
            compactEvidenceTextArray(
                source?.evidence,
                10,
                320
            )
    };
}

function compactMediaAnalysisObservation(observation = {}) {
    const sources =
        Array.isArray(
            observation?.sources
        )
            ? observation.sources
            : Array.isArray(
                observation?.validSources
            )
                ? observation.validSources
                : [];

    return {
        ok:
            observation?.ok,
        status:
            observation?.status,
        engine:
            observation?.engine,
        version:
            observation?.version,
        expectedSources:
            observation?.expectedSources,
        receivedSources:
            observation?.receivedSources,
        sources:
            sources
                .slice(0, 12)
                .map(compactMediaAnalysisSource),
        comparison:
            boundedEvidenceValue(
                observation?.comparison
            ),
        recommendations:
            compactEvidenceTextArray(
                observation?.recommendations,
                8,
                320
            ),
        policy:
            boundedEvidenceValue(
                observation?.policy
            ),
        precisionAudit:
            boundedEvidenceValue(
                observation?.precisionAudit
            )
    };
}

function findPrecisionVerifiedMediaObservation(evidenceItems = []) {
    const operational = (Array.isArray(evidenceItems) ? evidenceItems : [])
        .filter(item =>
            String(item?.name || item?.tool || "") !==
            "conversation.respond"
        );

    const mediaItems = operational.filter(item =>
        String(item?.name || item?.tool || "") === "media.analyze"
    );
    const allowedCompanionTools = new Set([
        "system.certify"
    ]);
    const unsupportedCompanions = operational.filter(item => {
        const toolName = String(item?.name || item?.tool || "");
        return toolName !== "media.analyze" &&
            !allowedCompanionTools.has(toolName);
    });

    if (
        mediaItems.length !== 1 ||
        unsupportedCompanions.length > 0
    ) {
        return null;
    }

    const item = mediaItems[0];

    const observation =
        item?.observation ??
        item?.response ??
        item?.data ??
        null;
    const nestedEvidence =
        observation?.evidence &&
        typeof observation.evidence === "object" &&
        !Array.isArray(observation.evidence)
            ? observation.evidence
            : {};
    const sources =
        Array.isArray(observation?.validSources) &&
        observation.validSources.length > 0
            ? observation.validSources
            : Array.isArray(observation?.sources) &&
                observation.sources.length > 0
                ? observation.sources
                : Array.isArray(nestedEvidence?.sources)
                    ? nestedEvidence.sources
                    : [];
    const precisionAudit =
        observation?.precisionAudit ||
        nestedEvidence?.precisionAudit ||
        null;
    const providerVersion = String(
        observation?.version ||
        nestedEvidence?.version ||
        ""
    ).trim();
    const expectedSources = Number(
        observation?.expectedSources ??
        nestedEvidence?.expectedSources
    );
    const receivedSources = Number(
        observation?.receivedSources ??
        nestedEvidence?.receivedSources
    );

    if (
        observation?.ok !== true ||
        observation?.status !== "MEDIA_ANALYSIS_GROUNDED" ||
        providerVersion !== "1.4.0-verified-visual-claims" ||
        precisionAudit?.ok !== true ||
        precisionAudit?.status !==
            "MEDIA_ANALYSIS_PRECISION_VERIFIED" ||
        precisionAudit?.sourceIdentityVerified !== true ||
        precisionAudit?.effectiveToolExecutions !== 1 ||
        sources.length < 1 ||
        expectedSources !== sources.length ||
        receivedSources !== sources.length
    ) {
        return null;
    }

    const identitiesAreComplete = sources.every((source, index) =>
        String(source?.sourceId || "") === `SOURCE_${index + 1}` &&
        Boolean(String(source?.fileName || source?.name || "").trim()) &&
        Boolean(String(source?.sha256 || "").trim())
    );

    return identitiesAreComplete
        ? {
            ...nestedEvidence,
            ...observation,
            sources,
            expectedSources,
            receivedSources,
            precisionAudit
        }
        : null;
}

function naturalEvidenceText(item) {
    if (typeof item === "string") return item.trim();
    if (!item || typeof item !== "object") return "";
    return String(
        item.observation ||
        item.detail ||
        item.summary ||
        item.label ||
        ""
    ).trim();
}

const RENDER_SENSITIVE_LITERAL_PATTERN = /(?:https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+(?:com|net|org|app|dev|io|mx|ai|co|es|tech|cloud|web)\b|\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b(?:19|20)\d{2}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b)/gi;
const RENDER_QUOTED_LITERAL_PATTERN = /["'`“”‘’]([^"'`“”‘’\n]{2,1000})["'`“”‘’]/g;
const RENDER_PROPER_UI_LITERAL_PATTERN = /\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*|[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*)+)\b/g;
const RENDER_STANDALONE_UI_LITERAL_PATTERN = /\b[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]{2,}\b/g;
const RENDER_STANDALONE_UI_STOPWORDS = new Set([
    "The", "This", "That", "These", "Those", "Screenshot", "Interface", "Menu", "Source", "File", "Both", "One", "Another", "Primary", "Application", "Differences", "Recommendations", "Analysis", "Verified", "Visual", "If", "No", "Yes", "While", "Based", "For", "With", "From", "And", "Or",
    "La", "El", "Los", "Las", "Una", "Un", "Se", "En", "Para", "Con", "Sin", "Esto", "Esta", "Este", "Estas", "Estos", "Archivo", "Fuente", "Interfaz", "Menu", "Menú", "Analisis", "Análisis", "Diferencias", "Mejoras", "Lectura", "Lecturas", "Verificado", "Visual", "Si", "Sí", "No", "Al", "Del"
]);
const RENDER_UPPER_UI_LITERAL_STOPWORDS = new Set([
    "SOURCE", "VERIFIED", "UNCERTAIN", "MEDIA", "ANALYSIS", "GROUNDED",
    "UI", "URL", "PDF", "MD", "JSON", "HTML", "HTTP", "HTTPS", "SHA",
    "ID", "API", "GPS", "CI", "DOM"
]);
const RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN = /\b(?:same date(?: and time)?|same time|system tray|captured (?:at|around) the same time|same user|misma fecha(?: y hora)?|misma hora|bandeja del sistema|capturad[oa]s? (?:a|alrededor de) la misma hora|mismo usuario)\b/i;
const RENDER_UNSUPPORTED_NEGATIVE_VISUAL_CLAIM_PATTERN = /\b(?:absent(?:\s+(?:from|in))?|not\s+present(?:\s+in)?|(?:does|do)\s+not\s+appear(?:\s+in)?|missing\s+from|not\s+shown(?:\s+in)?|ausentes?(?:\s+en)?|no\s+(?:esta|está|estan|están)\s+presentes?(?:\s+en)?|no\s+(?:aparece|aparecen|se\s+muestra|se\s+muestran|existe|existen)(?:\s+en)?|faltan?\s+en|carece\s+de)\b/i;
const RENDER_UNSUPPORTED_RELATIVE_UI_SCOPE_PATTERN = /\b(?:fewer\s+(?:menu\s+)?(?:options?|items?|entries?|actions?)|more\s+(?:menu\s+)?(?:options?|items?|entries?|actions?)|more\s+limited\s+(?:menu|options?|interface)|less\s+complete\s+(?:menu|options?|interface)|(?:broader|narrower)\s+(?:menu|set\s+of\s+options)|(?:menos|mas|más)\s+(?:opciones|elementos|acciones)|(?:menu|menú)\s+(?:mas|más)\s+(?:limitado|limitada|amplio|amplia|reducido|reducida))\b/i;
const RENDER_UNSUPPORTED_CONTRADICTION_META_PATTERN = /\b(?:contradict(?:s|ed|ing)?|contradiction|inconsisten(?:cy|t))\b/i;
const RENDER_SPECULATIVE_RECOMMENDATION_PATTERN = /\b(?:investigat(?:e|es|ed|ing|ion)|explor(?:e|es|ed|ing|ation)|document(?:ar|e|es|ed|ing|ation)|clarif(?:y|ies|ied|ying)|evaluat(?:e|es|ed|ing|ion)|confirm(?:s|ed|ing|ation)?|determin(?:e|es|ed|ing|ation)|investigar|explorar|documentar|aclarar|evaluar|confirmar|determinar|ecosystem|workflow|purpose|context)\b/i;
const RENDER_CONVERSATION_TRANSCRIPT_PATTERN = /\b(?:prompt|message|response|text block|assistant response|chat history|conversation history|instructs|states|says|mensaje|respuesta|bloque de texto|historial de (?:chat|conversaci[oó]n)|indica|dice)\b/i;

function normalizedGroundedLiteral(value = "") {
    return normalizedText(value)
        .replace(/[),.;!?]+$/g, "");
}

function verifiedMediaLiteralValues(observation = {}, sourceScope = null) {
    const minimumConfidence = Number(
        observation?.precisionAudit?.exactTextRequiresConfidence ||
        0.98
    );
    const sources = sourceScope
        ? [sourceScope]
        : (Array.isArray(observation?.sources) ? observation.sources : []);
    return [...new Set(
        sources
            .flatMap(source =>
                (Array.isArray(source?.visibleData) ? source.visibleData : [])
                    .filter(item =>
                        String(item?.legibility || "").trim().toUpperCase() === "VERIFIED" &&
                        Number(item?.confidence || 0) >= minimumConfidence &&
                        Boolean(String(item?.value || "").trim()) &&
                        Boolean(String(item?.evidence || "").trim())
                    )
                    .map(item => normalizedGroundedLiteral(item.value))
            )
            .filter(Boolean)
    )];
}

function renderLiteralCandidates(value = "") {
    const source = String(value || "");
    const candidates = [];
    const sensitive = new RegExp(RENDER_SENSITIVE_LITERAL_PATTERN.source, "gi");
    const quoted = new RegExp(RENDER_QUOTED_LITERAL_PATTERN.source, "g");
    const proper = new RegExp(RENDER_PROPER_UI_LITERAL_PATTERN.source, "g");
    const standalone = new RegExp(RENDER_STANDALONE_UI_LITERAL_PATTERN.source, "g");

    for (const match of source.matchAll(sensitive)) {
        candidates.push(String(match?.[0] || "").trim());
    }
    for (const match of source.matchAll(quoted)) {
        candidates.push(String(match?.[1] || "").trim());
    }
    for (const match of source.matchAll(proper)) {
        candidates.push(String(match?.[0] || "").trim());
    }
    for (const match of source.matchAll(standalone)) {
        const literal = String(match?.[0] || "").trim();
        const index = Number(match?.index || 0);
        if (!literal || index === 0) continue;
        if (RENDER_STANDALONE_UI_STOPWORDS.has(literal)) continue;
        if (
            /^[A-ZÁÉÍÓÚÑ]{2,}$/.test(literal) &&
            RENDER_UPPER_UI_LITERAL_STOPWORDS.has(literal)
        ) {
            continue;
        }
        candidates.push(literal);
    }

    return [...new Set(candidates.filter(Boolean))];
}

function isGroundedRenderedNarrative(value, verifiedValues = []) {
    const candidates = renderLiteralCandidates(value);
    if (candidates.length === 0) return true;
    return candidates.every(literal => {
        const candidate = normalizedGroundedLiteral(literal);
        return verifiedValues.some(verified =>
            verified === candidate ||
            verified.includes(candidate) ||
            candidate.includes(verified)
        );
    });
}

function renderContainsUnsupportedNegativeLiteralClaim(
    value,
    verifiedValues = []
) {
    const narrative = String(value || "");
    if (RENDER_UNSUPPORTED_RELATIVE_UI_SCOPE_PATTERN.test(narrative)) {
        return true;
    }
    if (!RENDER_UNSUPPORTED_NEGATIVE_VISUAL_CLAIM_PATTERN.test(narrative)) {
        return false;
    }
    const normalizedNarrative = normalizedGroundedLiteral(narrative);
    return verifiedValues.some(verified =>
        verified.length >= 3 &&
        normalizedNarrative.includes(verified)
    );
}

function renderContainsUnsupportedContradictionClaim(
    value,
    verifiedValues = []
) {
    const narrative = String(value || "");
    if (!RENDER_UNSUPPORTED_CONTRADICTION_META_PATTERN.test(narrative)) {
        return false;
    }
    const normalizedNarrative = normalizedGroundedLiteral(narrative);
    const groundedMentions = new Set(
        verifiedValues.filter(verified =>
            verified.length >= 3 &&
            normalizedNarrative.includes(verified)
        )
    );
    return groundedMentions.size < 2;
}

function renderContainsUnsupportedSourceNarrativeClaim(
    value,
    verifiedValues = []
) {
    return (
        renderContainsUnsupportedNegativeLiteralClaim(
            value,
            verifiedValues
        ) ||
        renderContainsUnsupportedContradictionClaim(
            value,
            verifiedValues
        )
    );
}

function groundedNaturalEvidenceTexts(items = [], verifiedValues = []) {
    return (Array.isArray(items) ? items : [])
        .map(naturalEvidenceText)
        .filter(Boolean)
        .filter(value =>
            isGroundedRenderedNarrative(
                value,
                verifiedValues
            )
        );
}


function appendNaturalList(lines, title, items = []) {
    const values = (Array.isArray(items) ? items : [])
        .map(naturalEvidenceText)
        .filter(Boolean);
    if (values.length === 0) return;
    lines.push(title);
    for (const value of values) {
        lines.push(`- ${value}`);
    }
}

function renderPrecisionVerifiedMediaConversation(observation) {
    const sources = observation.sources;
    const lines = [
        `Pariente, revisé visualmente ${sources.length} archivos y esto es lo que sí pude confirmar.`
    ];
    const minimumConfidence = Number(
        observation?.precisionAudit?.exactTextRequiresConfidence ||
        0.98
    );

    sources.forEach((source, index) => {
        const fileName = String(
            source?.fileName ||
            source?.name ||
            `archivo-${index + 1}`
        ).trim();
        const visibleData = (Array.isArray(source?.visibleData)
            ? source.visibleData
            : [])
            .filter(item =>
                item?.legibility === "VERIFIED" &&
                Number(item?.confidence) >= minimumConfidence &&
                Boolean(String(item?.value || "").trim()) &&
                Boolean(String(item?.evidence || "").trim())
            );
        const verifiedValues =
            verifiedMediaLiteralValues(observation, source);
        const objects = groundedNaturalEvidenceTexts(
            source?.objects,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                !renderContainsUnsupportedSourceNarrativeClaim(
                    value,
                    verifiedValues
                )
            );
        const observations = groundedNaturalEvidenceTexts(
            source?.observations,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CONVERSATION_TRANSCRIPT_PATTERN.test(value) &&
                !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                !renderContainsUnsupportedSourceNarrativeClaim(
                    value,
                    verifiedValues
                )
            );

        lines.push("", `### Archivo ${index + 1}: ${fileName}`);
        appendNaturalList(lines, "Lo que se ve con claridad:", objects);
        appendNaturalList(lines, "Lo que pude confirmar:", observations);

        if (visibleData.length > 0) {
            lines.push("Texto que pude leer con certeza:");
            for (const item of visibleData) {
                const kind = String(item?.kind || "text").trim();
                const value = String(item.value).trim();
                const evidence = String(item.evidence).trim();
                const page = Number.isInteger(item?.page) && item.page > 0
                    ? `, pagina ${item.page}`
                    : "";
                lines.push(`- ${kind}: ${value} (${evidence}${page})`);
            }
        } else {
            lines.push(
                "No pude leer texto con suficiente claridad como para asegurarlo."
            );
        }

        appendNaturalList(
            lines,
            "Lo que prefiero dejar como incierto:",
            groundedNaturalEvidenceTexts(
                source?.uncertainty,
                verifiedValues
            )
                .filter(value =>
                    !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                    !renderContainsUnsupportedSourceNarrativeClaim(
                        value,
                        verifiedValues
                    )
                )
        );
    });

    const verifiedValues =
        verifiedMediaLiteralValues(observation);
    const groundedDifferences =
        groundedNaturalEvidenceTexts(
            observation?.comparison?.differences,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                !renderContainsUnsupportedNegativeLiteralClaim(
                    value,
                    verifiedValues
                )
            );
    const suppressUnrequestedRecommendations =
        observation?.policy?.strictVisualUnrequestedRecommendationsSuppressed === true;
    const groundedRecommendations = suppressUnrequestedRecommendations
        ? []
        : groundedNaturalEvidenceTexts(
            observation?.recommendations,
            verifiedValues
        )
            .filter(value =>
                !RENDER_CAPTURE_CONTEXT_CLAIM_PATTERN.test(value) &&
                !RENDER_SPECULATIVE_RECOMMENDATION_PATTERN.test(value)
            );

    appendNaturalList(
        lines,
        "Diferencias que sí pude comprobar:",
        groundedDifferences
    );
    if (
        Array.isArray(observation?.comparison?.differences) &&
        observation.comparison.differences.length > 0 &&
        groundedDifferences.length === 0
    ) {
        lines.push(
            "Había comparaciones que no quedaron suficientemente respaldadas, así que preferí dejarlas fuera en vez de asumir."
        );
    }
    appendNaturalList(
        lines,
        "Si quieres mejorar esta experiencia:",
        groundedRecommendations
    );
    if (
        !suppressUnrequestedRecommendations &&
        Array.isArray(observation?.recommendations) &&
        observation.recommendations.length > 0 &&
        groundedRecommendations.length === 0
    ) {
        lines.push(
            "Dejé fuera sugerencias que dependían de datos o capacidades que no pude comprobar visualmente."
        );
    }
    lines.push(
        "",
        "Me quedé sólo con lo que pude verificar en las imágenes; lo dudoso lo dejé fuera."
    );

    return lines.join("\n").trim();
}

function constrainCompactEvidence(
    value,
    {
        stringLimit = 800,
        arrayLimit = 12
    } = {},
    depth = 0
) {
    if (
        value == null ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }

    if (typeof value === "string") {
        return value.slice(0, stringLimit);
    }

    if (depth > 8) {
        return null;
    }

    if (Array.isArray(value)) {
        return value
            .slice(0, arrayLimit)
            .map(item =>
                constrainCompactEvidence(
                    item,
                    {
                        stringLimit,
                        arrayLimit
                    },
                    depth + 1
                )
            );
    }

    if (typeof value !== "object") {
        return String(value)
            .slice(0, stringLimit);
    }

    return Object.fromEntries(
        Object.entries(value)
            .slice(0, 40)
            .map(([key, item]) => [
                key,
                constrainCompactEvidence(
                    item,
                    {
                        stringLimit,
                        arrayLimit
                    },
                    depth + 1
                )
            ])
            .filter(([, item]) =>
                item !== null
            )
    );
}

export function buildBoundedConversationEvidence(evidenceItems = []) {
    const bounded = (Array.isArray(evidenceItems) ? evidenceItems : [])
        .slice(0, MAX_EVIDENCE_ITEMS)
        .map(item => ({
            tool: String(item?.name || item?.tool || "unknown").slice(0, 120),
            observation: boundedEvidenceValue(
                item?.observation ??
                item?.response ??
                item?.data ??
                item
            )
        }));

    const serialized = JSON.stringify(bounded);
    if (serialized.length <= MAX_EVIDENCE_LENGTH) {
        return serialized;
    }

    let compact = bounded.map(item => {
        const observation =
            item.observation &&
            typeof item.observation === "object" &&
            !Array.isArray(item.observation)
                ? item.observation
                : {};

        const isMediaAnalysis =
            item.tool === "media.analyze" ||
            observation.status ===
                "MEDIA_ANALYSIS_GROUNDED" ||
            (
                Array.isArray(
                    observation.sources
                ) &&
                observation.sources.some(
                    source =>
                        String(
                            source?.mimeType ||
                            ""
                        ).startsWith(
                            "application/pdf"
                        ) ||
                        String(
                            source?.mimeType ||
                            ""
                        ).startsWith(
                            "image/"
                        )
                )
            );

        if (isMediaAnalysis) {
            return {
                tool: item.tool,
                observation:
                    compactMediaAnalysisObservation(
                        observation
                    )
            };
        }

        return {
            tool: item.tool,
            observation: boundedEvidenceValue({
                ok: observation.ok,
                status: observation.status,
                summary: observation.summary,
                error: observation.error,
                version: observation.version,
                totalTools: observation.totalTools,
                groups: observation.groups,
                readiness: observation.readiness,
                readinessScore:
                    observation.readinessScore,
                parity: observation.parity,
                gaps: observation.gaps,
                policy: observation.policy
            })
        };
    });

    const limits = [
        {
            stringLimit: 1200,
            arrayLimit: 16
        },
        {
            stringLimit: 800,
            arrayLimit: 12
        },
        {
            stringLimit: 500,
            arrayLimit: 8
        },
        {
            stringLimit: 320,
            arrayLimit: 6
        },
        {
            stringLimit: 220,
            arrayLimit: 4
        },
        {
            stringLimit: 160,
            arrayLimit: 3
        },
        {
            stringLimit: 120,
            arrayLimit: 2
        },
        {
            stringLimit: 80,
            arrayLimit: 1
        }
    ];

    let compactSerialized =
        JSON.stringify(compact);

    for (const limit of limits) {
        if (
            compactSerialized.length <=
            MAX_EVIDENCE_LENGTH
        ) {
            break;
        }

        compact =
            compact.map(item => ({
                tool: item.tool,
                observation:
                    constrainCompactEvidence(
                        item.observation,
                        limit
                    )
            }));

        compactSerialized =
            JSON.stringify(compact);
    }

    if (
        compactSerialized.length >
        MAX_EVIDENCE_LENGTH
    ) {
        compact =
            compact.map(item => {
                const observation =
                    item.observation &&
                    typeof item.observation ===
                        "object" &&
                    !Array.isArray(
                        item.observation
                    )
                        ? item.observation
                        : {};

                return {
                    tool: item.tool,
                    observation: {
                        ok:
                            observation.ok,
                        status:
                            observation.status,
                        version:
                            observation.version,
                        sources:
                            (
                                Array.isArray(
                                    observation.sources
                                )
                                    ? observation.sources
                                    : []
                            )
                                .slice(0, 12)
                                .map(source => ({
                                    sourceId:
                                        compactEvidenceText(
                                            source?.sourceId ||
                                            "",
                                            120
                                        ),
                                    fileName:
                                        compactEvidenceText(
                                            source?.fileName ||
                                            "",
                                            240
                                        ),
                                    mimeType:
                                        compactEvidenceText(
                                            source?.mimeType ||
                                            "",
                                            100
                                        ),
                                    description:
                                        compactEvidenceText(
                                            source?.description ||
                                            "",
                                            240
                                        ),
                                    pages:
                                        (
                                            Array.isArray(
                                                source?.pages
                                            )
                                                ? source.pages
                                                : []
                                        )
                                            .slice(0, 2)
                                            .map(page => ({
                                                page:
                                                    page?.page ??
                                                    null,
                                                summary:
                                                    compactEvidenceText(
                                                        page?.summary ||
                                                        "",
                                                        240
                                                    ),
                                                evidence:
                                                    compactEvidenceTextArray(
                                                        page?.evidence,
                                                        2,
                                                        180
                                                    )
                                            }))
                                }))
                    }
                };
            });

        compactSerialized =
            JSON.stringify(compact);
    }

    return compactSerialized;
}

function findEvidenceField(value, field, depth = 0) {
    if (!value || typeof value !== "object" || depth > 6) return null;
    if (Object.prototype.hasOwnProperty.call(value, field)) {
        return value[field];
    }
    for (const nested of Object.values(value)) {
        const found = findEvidenceField(nested, field, depth + 1);
        if (found != null) return found;
    }
    return null;
}

export function buildCapabilityEvidenceBriefing(evidenceItems = []) {
    const items = Array.isArray(evidenceItems) ? evidenceItems : [];
    const capabilities = items.find(item =>
        (item?.name || item?.tool) === "system.capabilities"
    );
    const forensics = items.find(item =>
        (item?.name || item?.tool) === "system.forensics"
    );
    const groups =
        findEvidenceField(capabilities, "groups") ||
        {};
    const policy =
        findEvidenceField(capabilities, "policy") ||
        {};
    const gaps =
        findEvidenceField(forensics, "gaps") ||
        findEvidenceField(capabilities, "gaps") ||
        [];
    const readiness =
        findEvidenceField(forensics, "readinessScore") ??
        findEvidenceField(capabilities, "readiness") ??
        null;

    return JSON.stringify({
        capabilityDomains:
            Object.entries(groups)
                .slice(0, 20)
                .map(([domain, tools]) => ({
                    domain,
                    tools:
                        Array.isArray(tools)
                            ? tools.slice(0, 20)
                            : []
                })),
        policy: boundedEvidenceValue(policy),
        limitations:
            Array.isArray(gaps)
                ? gaps.slice(0, 20)
                : [],
        readiness: boundedEvidenceValue(readiness)
    });
}

export async function composeEvidenceGroundedConversation({
    instruction = "",
    evidenceItems = [],
    executeConversation
} = {}) {
    const precisionVerifiedMedia =
        findPrecisionVerifiedMediaObservation(evidenceItems);

    if (precisionVerifiedMedia) {
        return {
            ok: true,
            status: "MEDIA_ANALYSIS_RESPONSE_VERIFIED",
            text: renderPrecisionVerifiedMediaConversation(
                precisionVerifiedMedia
            ),
            prompt: "",
            evidence: buildBoundedConversationEvidence(evidenceItems),
            provider: "deterministic-grounded-media",
            model: null,
            observation: null
        };
    }

    if (typeof executeConversation !== "function") {
        return {
            ok: false,
            status: "CONVERSATIONAL_COMPOSER_REQUIRED",
            text: "",
            prompt: "",
            evidence: ""
        };
    }

    const evidence = buildBoundedConversationEvidence(evidenceItems);
    const capabilityBriefing =
        buildCapabilityEvidenceBriefing(evidenceItems);
    const prompt = [
        "Responde al usuario como Jarvis en lenguaje natural y directo.",
        "Usa exclusivamente la evidencia estructurada incluida; no inventes capacidades, estados ni ejecuciones.",
        "Conserva saludos y todos los objetivos de la solicitud.",
        "Resume resultados y limitaciones reales. No muestres JSON, nombres de campos internos, telemetria ni payloads de herramientas.",
        "Cuando existan dominios de capacidades, conviértelos en funciones humanas concretas: conversación, investigación web, análisis de archivos o medios, documentos, hojas de cálculo, páginas, imágenes y trabajo controlado de repositorio, únicamente si aparecen en la evidencia.",
        "No reduzcas el resumen a decir que puedes verificar capacidades o hacer forensics; esas son fuentes de evidencia, no el alcance útil para el usuario.",
        "Si una herramienta fallo o falta evidencia, dilo una sola vez y no marques la mision como completada.",
        `SOLICITUD_USUARIO=${String(instruction || "").slice(0, 12000)}`,
        `RESUMEN_CAPACIDADES_Y_LIMITES=${capabilityBriefing}`,
        `EVIDENCIA_ESTRUCTURADA=${evidence}`
    ].join("\n\n");

    try {
        const result = await executeConversation(prompt);
        const payload =
            result?.response?.data ||
            result?.response ||
            result?.data?.response?.data ||
            result?.data?.response ||
            result?.data ||
            result ||
            {};
        const text = String(
            payload?.message ||
            payload?.text ||
            payload?.report ||
            ""
        ).trim();
        const rawJson =
            text.startsWith("{") ||
            text.startsWith("[");

        if (result?.ok === false || payload?.ok === false || !text || rawJson) {
            return {
                ok: false,
                status:
                    rawJson
                        ? "RAW_TOOL_PAYLOAD_REJECTED"
                        : payload?.status ||
                            result?.status ||
                            payload?.error ||
                            result?.error ||
                            "CONVERSATIONAL_COMPOSITION_FAILED",
                text: "",
                prompt,
                evidence,
                observation: result
            };
        }

        return {
            ok: true,
            status: "CONVERSATIONAL_COMPOSITION_COMPLETED",
            text,
            prompt,
            evidence,
            provider: payload?.provider || null,
            model: payload?.model || null,
            observation: result
        };
    }
    catch (error) {
        return {
            ok: false,
            status:
                error?.message ||
                "CONVERSATIONAL_COMPOSITION_FAILED",
            text: "",
            prompt,
            evidence,
            observation: null
        };
    }
}
