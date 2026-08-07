"use strict";

const crypto = require("crypto");

const VERSION = "1.4.0-verified-visual-claims";
const DEFAULT_MODEL = "gemini-2.5-flash";
const ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const MAX_FILES = 8;
const MAX_FILE_BYTES = 7 * 1024 * 1024;
const MAX_TOTAL_BYTES = 9 * 1024 * 1024;
const MAX_REPAIR_ATTEMPTS = 1;
const SENSITIVE_NARRATIVE_LITERAL_PATTERN = /(?:https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+(?:com|net|org|app|dev|io|mx|ai|co|es|tech|cloud|web)\b|\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b(?:19|20)\d{2}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b)/i;
const QUOTED_NARRATIVE_LITERAL_PATTERN = /["'`“”‘’]([^"'`“”‘’\n]{2,1000})["'`“”‘’]/g;
const PROPER_UI_LITERAL_PATTERN = /\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*|[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*)+)\b/g;
const STANDALONE_UI_LITERAL_PATTERN = /\b[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]{2,}\b/g;
const STANDALONE_UI_LITERAL_STOPWORDS = new Set([
    "The", "This", "That", "These", "Those", "Screenshot", "Interface", "Menu", "Source", "File", "Both", "One", "Another", "Primary", "Application", "Differences", "Recommendations", "Analysis", "Verified", "Visual", "If", "No", "Yes", "While", "Based", "For", "With", "From", "And", "Or",
    "La", "El", "Los", "Las", "Una", "Un", "Se", "En", "Para", "Con", "Sin", "Esto", "Esta", "Este", "Estas", "Estos", "Archivo", "Fuente", "Interfaz", "Menu", "Menú", "Analisis", "Análisis", "Diferencias", "Mejoras", "Lectura", "Lecturas", "Verificado", "Visual", "Si", "Sí", "No", "Al", "Del"
]);
const NON_VISUAL_RECOMMENDATION_PATTERN = /\b(?:investigat(?:e|es|ed|ing|ion)|explor(?:e|es|ed|ing|ation)|document(?:ar|e|es|ed|ing|ation)|clarif(?:y|ies|ied|ying)|evaluat(?:e|es|ed|ing|ion)|confirm(?:s|ed|ing|ation)?|determin(?:e|es|ed|ing|ation)|investigar|explorar|documentar|aclarar|evaluar|confirmar|determinar|ecosystem|workflow|purpose|context)\b/i;
const CAPTURE_CONTEXT_CLAIM_PATTERN = /\b(?:same date(?: and time)?|same time|system tray|captured (?:at|around) the same time|same user|misma fecha(?: y hora)?|misma hora|bandeja del sistema|capturad[oa]s? (?:a|alrededor de) la misma hora|mismo usuario)\b/i;
const CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN = /\b(?:prompt|message|response|text block|assistant response|chat history|conversation history|instructs|states|says|mensaje|respuesta|bloque de texto|historial de (?:chat|conversaci[oó]n)|indica|dice)\b/i;

function normalizeMediaFiles(files = []) {
    if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) {
        throw new Error("MEDIA_FILES_COUNT_INVALID");
    }

    let totalBytes = 0;

    return files.map((file, index) => {
        const sourceId = `SOURCE_${index + 1}`;
        const name = String(file?.name || `archivo-${index + 1}`).trim().slice(0, 180);
        const mimeType = String(file?.mimeType || "").toLowerCase().trim();
        const dataBase64 = String(file?.dataBase64 || "").trim();

        if (!ALLOWED_TYPES.has(mimeType)) {
            throw new Error("MEDIA_TYPE_UNSUPPORTED");
        }

        if (!dataBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) {
            throw new Error("MEDIA_BASE64_INVALID");
        }

        const binary = Buffer.from(dataBase64, "base64");
        const bytes = binary.length;

        if (bytes < 1 || bytes > MAX_FILE_BYTES) {
            throw new Error("MEDIA_FILE_SIZE_INVALID");
        }

        totalBytes += bytes;

        if (totalBytes > MAX_TOTAL_BYTES) {
            throw new Error("MEDIA_TOTAL_SIZE_INVALID");
        }

        return {
            sourceId,
            name,
            fileName: name,
            mimeType,
            dataBase64,
            bytes,
            sha256: crypto
                .createHash("sha256")
                .update(binary)
                .digest("hex")
        };
    });
}

function sourceManifest(files = []) {
    return files.map((file, index) => ({
        sourceId: String(file?.sourceId || `SOURCE_${index + 1}`),
        fileName: String(file?.fileName || file?.name || `archivo-${index + 1}`),
        mimeType: String(file?.mimeType || ""),
        bytes: Number(file?.bytes || 0),
        sha256: String(file?.sha256 || "")
    }));
}

function receivedSourceIdentities(sources = []) {
    return sources.map(source => ({
        sourceId: String(source?.sourceId || ""),
        fileName: String(source?.fileName || source?.name || ""),
        mimeType: String(source?.mimeType || ""),
        sha256: String(source?.sha256 || "")
    }));
}

function createAnalysisError(code, files = [], sources = []) {
    const error = new Error(code);
    error.code = code;
    error.expectedSources = files.length;
    error.receivedSources = Array.isArray(sources) ? sources.length : 0;
    error.expectedSourceIdentities = sourceManifest(files);
    error.receivedSourceIdentities = receivedSourceIdentities(
        Array.isArray(sources) ? sources : []
    );
    return error;
}

function resolveSourcesByIdentity(sources, files) {
    if (sources.length !== files.length) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_SOURCE_COUNT_MISMATCH",
            files,
            sources
        );
    }

    if (files.length === 1) {
        const file = files[0];
        const source = sources[0];
        const returnedSourceId = String(source?.sourceId || "").trim();
        const returnedFileName = String(
            source?.fileName || source?.name || ""
        ).trim();

        if (
            (returnedSourceId && returnedSourceId !== file.sourceId) ||
            (returnedFileName && returnedFileName !== file.name)
        ) {
            throw createAnalysisError(
                "MEDIA_ANALYSIS_SOURCE_IDENTITY_MISMATCH",
                files,
                sources
            );
        }

        return [source];
    }

    const expectedById = new Map(
        files.map(file => [file.sourceId, file])
    );
    const receivedById = new Map();

    for (const source of sources) {
        const sourceId = String(source?.sourceId || "").trim();
        const fileName = String(
            source?.fileName || source?.name || ""
        ).trim();

        if (!sourceId || !fileName) {
            throw createAnalysisError(
                "MEDIA_ANALYSIS_SOURCE_IDENTITY_REQUIRED",
                files,
                sources
            );
        }

        const expected = expectedById.get(sourceId);

        if (!expected || expected.name !== fileName) {
            throw createAnalysisError(
                "MEDIA_ANALYSIS_SOURCE_IDENTITY_MISMATCH",
                files,
                sources
            );
        }

        if (receivedById.has(sourceId)) {
            throw createAnalysisError(
                "MEDIA_ANALYSIS_SOURCE_IDENTITY_DUPLICATE",
                files,
                sources
            );
        }

        const returnedMimeType = String(source?.mimeType || "").trim();
        const returnedSha256 = String(source?.sha256 || "").trim();

        if (
            (returnedMimeType && returnedMimeType !== expected.mimeType) ||
            (returnedSha256 && returnedSha256 !== expected.sha256)
        ) {
            throw createAnalysisError(
                "MEDIA_ANALYSIS_SOURCE_IDENTITY_MISMATCH",
                files,
                sources
            );
        }

        receivedById.set(sourceId, source);
    }

    if (receivedById.size !== files.length) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_SOURCE_IDENTITY_MISMATCH",
            files,
            sources
        );
    }

    return files.map(file => receivedById.get(file.sourceId));
}

function normalizeVisibleData(items = []) {
    return (Array.isArray(items) ? items : [])
        .slice(0, 100)
        .map(item => {
            const confidence = Math.max(0, Math.min(1, Number(item?.confidence) || 0));
            const evidence = String(item?.evidence || "").trim().slice(0, 1000);
            const requestedLegibility = String(item?.legibility || "").trim().toUpperCase();
            const verified =
                requestedLegibility === "VERIFIED" &&
                confidence >= 0.98 &&
                Boolean(evidence);
            return {
                kind: String(item?.kind || "text").trim().slice(0, 40),
                value: verified ? String(item?.value || "").trim().slice(0, 1000) : "",
                page: Number.isInteger(item?.page) && item.page > 0 ? item.page : 1,
                confidence,
                evidence,
                legibility: verified ? "VERIFIED" : "UNCERTAIN"
            };
        });
}

function normalizeSensitiveLiteral(value = "") {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[),.;!?]+$/g, "");
}

function extractSensitiveNarrativeLiterals(value = "") {
    const pattern = new RegExp(
        SENSITIVE_NARRATIVE_LITERAL_PATTERN.source,
        "gi"
    );
    return Array.from(
        String(value || "").matchAll(pattern),
        match => String(match?.[0] || "").trim()
    ).filter(Boolean);
}

function extractQuotedNarrativeLiterals(value = "") {
    const pattern = new RegExp(
        QUOTED_NARRATIVE_LITERAL_PATTERN.source,
        "g"
    );
    return Array.from(
        String(value || "").matchAll(pattern),
        match => String(match?.[1] || "").trim()
    ).filter(Boolean);
}

function extractProperUiNarrativeLiterals(value = "") {
    const pattern = new RegExp(
        PROPER_UI_LITERAL_PATTERN.source,
        "g"
    );
    return Array.from(
        String(value || "").matchAll(pattern),
        match => String(match?.[0] || "").trim()
    ).filter(Boolean);
}

function extractStandaloneUiNarrativeLiterals(value = "") {
    const source = String(value || "");
    const pattern = new RegExp(
        STANDALONE_UI_LITERAL_PATTERN.source,
        "g"
    );
    return Array.from(source.matchAll(pattern))
        .filter(match => {
            const literal = String(match?.[0] || "").trim();
            const index = Number(match?.index || 0);
            if (!literal || index === 0) return false;
            if (STANDALONE_UI_LITERAL_STOPWORDS.has(literal)) return false;
            if (/^[A-ZÁÉÍÓÚÑ]{2,}$/.test(literal)) return false;
            return true;
        })
        .map(match => String(match?.[0] || "").trim())
        .filter(Boolean);
}

function groundingRequiredNarrativeLiterals(value = "") {
    return [...new Set([
        ...extractSensitiveNarrativeLiterals(value),
        ...extractQuotedNarrativeLiterals(value),
        ...extractProperUiNarrativeLiterals(value),
        ...extractStandaloneUiNarrativeLiterals(value)
    ].filter(Boolean))];
}

function verifiedVisibleLiteralValues(sources = []) {
    const values = [];

    for (const source of Array.isArray(sources) ? sources : []) {
        for (const item of Array.isArray(source?.visibleData) ? source.visibleData : []) {
            const value = String(item?.value || "").trim();
            const evidence = String(item?.evidence || "").trim();
            const legibility = String(item?.legibility || "").trim().toUpperCase();
            const confidence = Number(item?.confidence || 0);

            if (
                value &&
                evidence &&
                legibility === "VERIFIED" &&
                confidence >= 0.98
            ) {
                values.push(normalizeSensitiveLiteral(value));
            }
        }
    }

    return [...new Set(values.filter(Boolean))];
}

function containsUnverifiedSensitiveNarrativeLiteral(value, verifiedValues = []) {
    if (value == null) return false;

    if (typeof value === "string") {
        const literals = groundingRequiredNarrativeLiterals(value);
        return literals.some(literal => {
            const candidate = normalizeSensitiveLiteral(literal);
            if (!candidate) return false;
            return !verifiedValues.some(verified =>
                verified === candidate ||
                verified.includes(candidate)
            );
        });
    }

    if (Array.isArray(value)) {
        return value.some(item =>
            containsUnverifiedSensitiveNarrativeLiteral(
                item,
                verifiedValues
            )
        );
    }

    if (typeof value !== "object") return false;

    return Object.values(value).some(item =>
        containsUnverifiedSensitiveNarrativeLiteral(
            item,
            verifiedValues
        )
    );
}

function assertNoSensitiveNarrativeLiteralLeaks(parsed, files, sources) {
    for (const source of sources) {
        const sourceVerifiedValues = verifiedVisibleLiteralValues([source]);
        const sourceCandidates = [
            source?.description,
            source?.observations,
            source?.inferences,
            source?.objects,
            source?.composition,
            source?.pages,
            source?.marketingUse,
            source?.quality,
            source?.uncertainty,
            source?.evidence
        ];
        if (sourceCandidates.some(candidate =>
            containsUnverifiedSensitiveNarrativeLiteral(candidate, sourceVerifiedValues)
        )) {
            throw createAnalysisError(
                "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
                files,
                sources
            );
        }
    }

    const comparisonVerifiedValues = verifiedVisibleLiteralValues(sources);
    if ([parsed?.comparison, parsed?.recommendations].some(candidate =>
        containsUnverifiedSensitiveNarrativeLiteral(candidate, comparisonVerifiedValues)
    )) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
            files,
            sources
        );
    }
}

function sanitizePrecisionNarrative(parsed) {
    const sources = Array.isArray(parsed?.sources)
        ? parsed.sources
        : [];
    const globalVerifiedValues = verifiedVisibleLiteralValues(sources);
    let removedCount = 0;

    function sanitizeValue(value, activeVerifiedValues) {
        if (value == null) return value;
        if (typeof value === "string") {
            if (containsUnverifiedSensitiveNarrativeLiteral(value, activeVerifiedValues)) {
                removedCount += 1;
                return "";
            }
            return value;
        }
        if (Array.isArray(value)) {
            return value
                .map(item => sanitizeValue(item, activeVerifiedValues))
                .filter(item => {
                    if (item == null || item === "") return false;
                    if (Array.isArray(item)) return item.length > 0;
                    if (typeof item === "object") return Object.keys(item).length > 0;
                    return true;
                });
        }
        if (typeof value !== "object") return value;
        const sanitized = {};
        for (const [key, item] of Object.entries(value)) {
            const clean = sanitizeValue(item, activeVerifiedValues);
            if (clean == null || clean === "") continue;
            if (Array.isArray(clean) && clean.length === 0) {
                sanitized[key] = clean;
                continue;
            }
            sanitized[key] = clean;
        }
        return sanitized;
    }

    const sanitizedSources = sources.map(source => {
        const sourceVerifiedValues = verifiedVisibleLiteralValues([source]);
        return {
            ...source,
            description: sanitizeValue(source?.description, sourceVerifiedValues),
            observations: sanitizeValue(source?.observations, sourceVerifiedValues),
            inferences: sanitizeValue(source?.inferences, sourceVerifiedValues),
            objects: sanitizeValue(source?.objects, sourceVerifiedValues),
            composition: sanitizeValue(source?.composition, sourceVerifiedValues),
            pages: sanitizeValue(source?.pages, sourceVerifiedValues),
            marketingUse: sanitizeValue(source?.marketingUse, sourceVerifiedValues),
            quality: sanitizeValue(source?.quality, sourceVerifiedValues),
            uncertainty: sanitizeValue(source?.uncertainty, sourceVerifiedValues),
            evidence: sanitizeValue(source?.evidence, sourceVerifiedValues)
        };
    });

    const sanitizedRecommendations =
        (Array.isArray(parsed?.recommendations) ? parsed.recommendations : [])
            .filter(item => {
                const text = String(item || "");
                const rejected =
                    NON_VISUAL_RECOMMENDATION_PATTERN.test(text) ||
                    CAPTURE_CONTEXT_CLAIM_PATTERN.test(text);
                if (rejected) removedCount += 1;
                return !rejected;
            });
    const comparison =
        parsed?.comparison && typeof parsed.comparison === "object"
            ? {
                ...parsed.comparison,
                differences: (Array.isArray(parsed.comparison.differences)
                    ? parsed.comparison.differences
                    : [])
                    .filter(item => {
                        const rejected = CAPTURE_CONTEXT_CLAIM_PATTERN.test(
                            String(item || "")
                        );
                        if (rejected) removedCount += 1;
                        return !rejected;
                    })
            }
            : parsed?.comparison;

    return {
        parsed: {
            ...parsed,
            sources: sanitizedSources,
            comparison: sanitizeValue(comparison, globalVerifiedValues),
            recommendations: sanitizeValue(
                sanitizedRecommendations,
                globalVerifiedValues
            )
        },
        removedCount
    };
}

function assertConcreteVisualRecommendations(parsed, files, sources) {
    const recommendations = Array.isArray(parsed?.recommendations)
        ? parsed.recommendations
        : [];

    if (
        recommendations.some(item =>
            NON_VISUAL_RECOMMENDATION_PATTERN.test(
                String(item || "")
            )
        )
    ) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION",
            files,
            sources
        );
    }
}

function assertNoCaptureContextClaims(parsed, files, sources) {
    const claims = [
        ...(Array.isArray(parsed?.comparison?.differences)
            ? parsed.comparison.differences
            : []),
        ...(Array.isArray(parsed?.recommendations)
            ? parsed.recommendations
            : [])
    ];

    if (
        claims.some(item =>
            CAPTURE_CONTEXT_CLAIM_PATTERN.test(
                String(item || "")
            )
        )
    ) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_CAPTURE_CONTEXT_CLAIM",
            files,
            sources
        );
    }
}

function validateAnalysis(parsed, files) {
    const sources = Array.isArray(parsed?.sources)
        ? parsed.sources
        : [];

    const orderedSources =
        resolveSourcesByIdentity(sources, files);

    assertNoSensitiveNarrativeLiteralLeaks(
        parsed,
        files,
        orderedSources
    );

    assertConcreteVisualRecommendations(
        parsed,
        files,
        orderedSources
    );

    assertNoCaptureContextClaims(
        parsed,
        files,
        orderedSources
    );

    return {
        ok: true,
        status: "MEDIA_ANALYSIS_GROUNDED",
        engine: "jarvis_gemini_multimodal_analysis",
        version: VERSION,
        expectedSources: files.length,
        receivedSources: sources.length,
        sources: orderedSources.map((source, index) => {
            const file = files[index];
            const visibleData = normalizeVisibleData(source?.visibleData);
            const precisionUncertainty = visibleData
                .filter(item => item.legibility !== "VERIFIED")
                .map(item =>
                    `Lectura ${item.kind || "text"} no confirmada; el valor se omitio por precision insuficiente.`
                );

            return {
                sourceId: file.sourceId,
                fileName: file.name,
                name: file.name,
                mimeType: file.mimeType,
                bytes: file.bytes,
                sha256: file.sha256,
                description:
                    String(source?.description || "")
                        .slice(0, 4000),
                observations:
                    Array.isArray(source?.observations)
                        ? source.observations.slice(0, 120)
                        : [],
                inferences:
                    Array.isArray(source?.inferences)
                        ? source.inferences.slice(0, 120)
                        : [],
                objects:
                    Array.isArray(source?.objects)
                        ? source.objects.slice(0, 60)
                        : [],
                composition:
                    source?.composition &&
                    typeof source.composition === "object"
                        ? source.composition
                        : {},
                visibleData:
                    visibleData,
                pages:
                    Array.isArray(source?.pages)
                        ? source.pages.slice(0, 100)
                        : [],
                marketingUse:
                    Array.isArray(source?.marketingUse)
                        ? source.marketingUse.slice(0, 20)
                        : [],
                quality:
                    source?.quality &&
                    typeof source.quality === "object"
                        ? source.quality
                        : {},
                uncertainty:
                    [...new Set([
                        ...(Array.isArray(source?.uncertainty) ? source.uncertainty : []),
                        ...precisionUncertainty
                    ])].slice(0, 50),
                evidence:
                    Array.isArray(source?.evidence)
                        ? source.evidence.slice(0, 120)
                        : []
            };
        }),
        comparison:
            parsed?.comparison &&
            typeof parsed.comparison === "object"
                ? parsed.comparison
                : null,
        recommendations:
            Array.isArray(parsed?.recommendations)
                ? parsed.recommendations.slice(0, 50)
                : [],
        policy: {
            readOnly: true,
            evidenceRequired: true,
            identityBindingRequired: true,
            deterministicSourceOrder: true,
            illegibleContentMustRemainUnknown: true,
            literalReadingsRequireStructuredEvidence: true,
            exactTextMinimumConfidence: 0.98,
            unverifiedLiteralValuesAreWithheld: true,
            narrativeUiLiteralsRequireVisibleData: true,
            conversationContentCannotProveUiCapability: true,
            deterministicPrecisionSanitizer: true,
            standaloneUiLiteralsRequireVisibleData: true,
            sourceScopedNarrativeGrounding: true,
            longQuotedTranscriptGuard: true,
            strictVisualConversationTranscriptSuppressed: true,
            strictVisualNarrativeDescriptionSuppressed: true,
            authenticatedAdminOnly: true
        }
    };
}

function buildAnalysisPrompt(
    files,
    question,
    {
        repairAttempt = 0,
        previousOutput = "",
        previousError = ""
    } = {}
) {
    const manifest = sourceManifest(files);

    const repairInstruction =
        repairAttempt > 0
            ? [
                "La respuesta anterior incumplió el contrato multimodal.",
                `ERROR_ANTERIOR=${previousError}`,
                "Regenera el objeto JSON completo. No rellenes, dupliques, trunques ni mezcles sources.",
                "Vuelve a analizar todos los archivos adjuntos y vincula cada resultado únicamente mediante sourceId y fileName exactos.",
                `RESPUESTA_ANTERIOR=${String(previousOutput).slice(0, 12000)}`
            ].join("\n")
            : "";

    return [
        "Eres el analista visual y documental privado de Heberto Mendoza.",
        "Analiza exclusivamente los archivos adjuntos.",
        "No inventes texto, objetos, cifras, páginas ni relaciones ilegibles.",
        "Distingue observaciones directas de inferencias.",
        "Si la PREGUNTA exige solamente evidencia visual, dice no infieras/no inferir o prohíbe inferencias, devuelve inferences=[] para cada source.",
        "Devuelve solamente JSON estricto.",
        "Debe existir exactamente una entrada sources por archivo.",
        "Cada source debe incluir sourceId y fileName copiados literalmente del MANIFEST.",
        "No dependas de la posición de las imágenes para identificar una source.",
        "No combines observaciones, evidencia o incertidumbre de archivos diferentes.",
        "mimeType y sha256 pueden copiarse del MANIFEST y nunca deben modificarse.",
        "Fuera de visibleData, ninguna propiedad de la respuesta debe contener transcripciones literales, URLs, fechas, horas, anos, cifras ni identificadores.",
        "No uses la instruccion del usuario como evidencia visual; una palabra mencionada en la solicitud no demuestra que ese elemento aparezca en los pixeles.",
        "En capturas de interfaces conversacionales, el texto dentro del historial de mensajes o respuestas es contenido de conversacion, no evidencia de funcionalidad de la interfaz.",
        "Nunca uses una afirmacion escrita dentro de un mensaje del asistente como prueba de que un control existe, falta, funciona o no funciona; para eso usa solamente controles, menus, botones, paneles, etiquetas de UI y estados visibles.",
        "Si la solicitud compara un menu, panel, boton o control que no esta abierto o visible en una fuente, declara que esa parte de la comparacion no es verificable y no infieras sus opciones ni funciones.",
        "Description, observations, inferences, objects, pages, evidence, comparison y recommendations no deben repetir fechas, horas, anos, URLs o identificadores; esas lecturas solo pueden existir en visibleData.",
        "Toda lectura literal debe aparecer exclusivamente en visibleData y conservar los caracteres visibles sin traducir, autocorregir, completar ni normalizar.",
        "Cada visibleData requiere kind, value, page, confidence, evidence y legibility.",
        "Usa legibility=VERIFIED unicamente cuando la lectura este completa, evidence explique su ubicacion y confidence sea igual o mayor a 0.98.",
        "Si la lectura es parcial o dudosa usa legibility=UNCERTAIN, deja value vacio y explica la limitacion en uncertainty.",
        "Nunca completes una URL parcial ni emitas una fecha, hora o ano basandote en contexto o sentido comun.",
        "Responde en espanol cuando la pregunta este en espanol.",
        "Si la pregunta solicita carencias por comparacion, recommendations debe contener solo carencias concretas comprobables por contraste visual, no tareas genericas de investigar, explorar o documentar.",
        `MANIFEST=${JSON.stringify(manifest)}`,
        'FORMA={"sources":[{"sourceId":"","fileName":"","mimeType":"","sha256":"","description":"","observations":[],"inferences":[],"objects":[],"composition":{"framing":"","lighting":"","visualHierarchy":""},"visibleData":[{"kind":"text","value":"","page":1,"confidence":0,"evidence":"","legibility":"UNCERTAIN"}],"pages":[{"page":1,"summary":"","tables":[],"images":[],"evidence":[],"uncertainty":[]}],"marketingUse":[],"quality":{"score":0,"issues":[],"improvements":[]},"uncertainty":[],"evidence":[]}],"comparison":{"beforeAfter":false,"differences":[],"confidence":0},"recommendations":[]}',
        "Para PDF aporta evidencia por página.",
        "Para imágenes evalúa hero, galería, servicio, equipo, testimonio y antes/después solamente cuando exista evidencia.",
        "Si algo no se lee o no puede vincularse con certeza, colócalo en uncertainty.",
        `PREGUNTA=${question}`,
        repairInstruction
    ]
        .filter(Boolean)
        .join("\n");
}

function buildComparisonResponseJsonSchema() {
    return {
        type: "object",
        additionalProperties: false,
        required: [
            "comparison",
            "recommendations"
        ],
        properties: {
            comparison: {
                type: "object",
                additionalProperties: false,
                required: [
                    "beforeAfter",
                    "differences",
                    "confidence"
                ],
                properties: {
                    beforeAfter: {
                        type: "boolean"
                    },
                    differences: {
                        type: "array",
                        items: {
                            type: "string"
                        }
                    },
                    confidence: {
                        type: "number"
                    }
                }
            },
            recommendations: {
                type: "array",
                items: {
                    type: "string"
                }
            }
        }
    };
}

function buildAnalysisResponseJsonSchema(files) {
    const sourceIds =
        files.map(file => file.sourceId);

    const fileNames =
        files.map(file => file.name);

    const mimeTypes =
        Array.from(
            new Set(
                files.map(file => file.mimeType)
            )
        );

    const schema = {
        type: "object",
        additionalProperties: false,
        required: [
            "sources"
        ],
        properties: {
            sources: {
                type: "array",
                minItems: files.length,
                maxItems: files.length,
                items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                        "sourceId",
                        "fileName",
                        "mimeType",
                        "description",
                        "observations",
                        "inferences",
                        "visibleData",
                        "evidence",
                        "uncertainty"
                    ],
                    properties: {
                        sourceId: {
                            type: "string",
                            enum: sourceIds
                        },
                        fileName: {
                            type: "string",
                            enum: fileNames
                        },
                        mimeType: {
                            type: "string",
                            enum: mimeTypes
                        },
                        description: {
                            type: "string"
                        },
                        observations: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        },
                        inferences: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        },
                        visibleData: {
                            type: "array",
                            items: {
                                type: "object",
                                additionalProperties: false,
                                required: [
                                    "kind",
                                    "value",
                                    "page",
                                    "confidence",
                                    "evidence",
                                    "legibility"
                                ],
                                properties: {
                                    kind: {
                                        type: "string",
                                        enum: ["text", "url", "date", "time", "number", "identifier"]
                                    },
                                    value: {
                                        type: "string"
                                    },
                                    page: {
                                        type: "integer",
                                        minimum: 1
                                    },
                                    confidence: {
                                        type: "number",
                                        minimum: 0,
                                        maximum: 1
                                    },
                                    evidence: {
                                        type: "string"
                                    },
                                    legibility: {
                                        type: "string",
                                        enum: ["VERIFIED", "UNCERTAIN"]
                                    }
                                }
                            }
                        },
                        evidence: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        },
                        uncertainty: {
                            type: "array",
                            items: {
                                type: "string"
                            }
                        }
                    }
                }
            }
        }
    };

    if (files.length > 1) {
        const comparisonSchema =
            buildComparisonResponseJsonSchema();

        schema.required.push(
            "comparison",
            "recommendations"
        );

        schema.properties.comparison =
            comparisonSchema.properties.comparison;

        schema.properties.recommendations =
            comparisonSchema.properties.recommendations;
    }

    return schema;
}

async function generateAnalysisText({
    ai,
    model,
    files,
    prompt,
    responseJsonSchema = null
}) {
    const modernClient =
        Boolean(ai?.models?.generateContent);

    const legacyClient =
        Boolean(ai?.getGenerativeModel);

    if (!modernClient && !legacyClient) {
        throw new Error("MEDIA_AI_REQUIRED");
    }

    const parts = [
        prompt,
        ...files.map(file => ({
            inlineData: {
                mimeType: file.mimeType,
                data: file.dataBase64
            }
        }))
    ];

    const effectiveSchema =
        responseJsonSchema ||
        (
            files.length > 0
                ? buildAnalysisResponseJsonSchema(files)
                : buildComparisonResponseJsonSchema()
        );

    if (modernClient) {
        const generated =
            await ai.models.generateContent({
                model,
                contents: [{
                    role: "user",
                    parts
                }],
                config: {
                    temperature: 0.05,
                    maxOutputTokens: 8192,
                    responseMimeType:
                        "application/json",
                    responseJsonSchema:
                        effectiveSchema
                }
            });

        return String(generated?.text || "");
    }

    const generator =
        ai.getGenerativeModel({
            model,
            generationConfig: {
                temperature: 0.05,
                maxOutputTokens: 8192,
                responseMimeType:
                    "application/json",
                responseSchema:
                    effectiveSchema
            }
        });

    const generated =
        await generator.generateContent(parts);

    return String(
        generated?.response?.text?.() || ""
    );
}

function parseAnalysisJson(text, files) {
    if (!text) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_OUTPUT_MISSING",
            files,
            []
        );
    }

    try {
        return JSON.parse(text);
    }
    catch {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_JSON_INVALID",
            files,
            []
        );
    }
}

function isRepairableAnalysisError(error) {
    return new Set([
        "MEDIA_ANALYSIS_JSON_INVALID",
        "MEDIA_ANALYSIS_SOURCE_COUNT_MISMATCH",
        "MEDIA_ANALYSIS_SOURCE_IDENTITY_REQUIRED",
        "MEDIA_ANALYSIS_SOURCE_IDENTITY_MISMATCH",
        "MEDIA_ANALYSIS_SOURCE_IDENTITY_DUPLICATE",
        "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
        "MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION",
        "MEDIA_ANALYSIS_CAPTURE_CONTEXT_CLAIM"
    ]).has(error?.message);
}


function buildIsolatedAnalysisPrompt(file, question) {
    return [
        buildAnalysisPrompt([file], question),
        "MODO_ANALISIS_AISLADO=TRUE",
        "Analiza ?nicamente este archivo.",
        "Devuelve exactamente una source.",
        "sourceId y fileName son obligatorios y deben coincidir literalmente con el MANIFEST.",
        "No hagas comparaciones con archivos no adjuntos en esta llamada."
    ].join("\n");
}

function validateIsolatedAnalysis(parsed, file) {
    const sources =
        Array.isArray(parsed?.sources)
            ? parsed.sources
            : [];

    if (sources.length !== 1) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_ISOLATED_SOURCE_COUNT_MISMATCH",
            [file],
            sources
        );
    }

    const source = sources[0];
    const sourceId =
        String(source?.sourceId || "").trim();
    const fileName =
        String(source?.fileName || source?.name || "").trim();

    if (
        sourceId !== file.sourceId ||
        fileName !== file.name
    ) {
        throw createAnalysisError(
            "MEDIA_ANALYSIS_ISOLATED_SOURCE_IDENTITY_MISMATCH",
            [file],
            sources
        );
    }

    return validateAnalysis(parsed, [file]);
}

function buildValidatedComparisonPrompt(sources, question) {
    const groundedSources =
        sources.map(source => ({
            sourceId: source.sourceId,
            fileName: source.fileName,
            mimeType: source.mimeType,
            bytes: source.bytes,
            sha256: source.sha256,
            description: source.description,
            observations: source.observations,
            inferences: source.inferences,
            objects: source.objects,
            visibleData: source.visibleData,
            pages: source.pages,
            quality: source.quality,
            uncertainty: source.uncertainty,
            evidence: source.evidence
        }));

    return [
        "COMPARACION_GLOBAL_VALIDADA",
        "Compara exclusivamente las fuentes ya analizadas y validadas incluidas en FUENTES_VALIDADAS.",
        "No inventes contenido visual nuevo.",
        "No reasignes evidencia, observaciones ni incertidumbre entre archivos.",
        "Devuelve solamente JSON estricto con esta forma:",
        '{"comparison":{"beforeAfter":false,"differences":[],"confidence":0},"recommendations":[]}',
        "beforeAfter s?lo puede ser true cuando exista evidencia inequ?voca.",
        "Cada diferencia debe ser rastreable a los sourceId y fileName entregados.",
        `FUENTES_VALIDADAS=${JSON.stringify(groundedSources)}`,
        `PREGUNTA=${question}`
    ].join("\n");
}

async function runIsolatedMediaFallback({
    ai,
    model,
    files,
    question,
    repairCount
}) {
    const isolatedSources = [];

    for (const file of files) {
        try {
            const text =
                await generateAnalysisText({
                    ai,
                    model,
                    files: [file],
                    prompt:
                        buildIsolatedAnalysisPrompt(
                            file,
                            question
                        )
                });

            const parsed =
                applyQuestionGroundingPolicy(
                    parseAnalysisJson(text, [file]),
                    question
                );

            const validated =
                validateIsolatedAnalysis(
                    parsed,
                    file
                );

            isolatedSources.push(
                validated.sources[0]
            );
        }
        catch (error) {
            const failure =
                createAnalysisError(
                    "MEDIA_ANALYSIS_ISOLATED_SOURCE_FAILED",
                    files,
                    isolatedSources
                );

            failure.causeCode =
                error?.message ||
                "MEDIA_ANALYSIS_ISOLATED_SOURCE_INVALID";
            failure.failedSourceId =
                file.sourceId;
            failure.failedFileName =
                file.name;
            failure.repairCount =
                repairCount;

            throw failure;
        }
    }

    let comparisonPayload;

    try {
        const comparisonText =
            await generateAnalysisText({
                ai,
                model,
                files: [],
                prompt:
                    buildValidatedComparisonPrompt(
                        isolatedSources,
                        question
                    )
            });

        comparisonPayload =
            parseAnalysisJson(
                comparisonText,
                files
            );
    }
    catch (error) {
        const failure =
            createAnalysisError(
                "MEDIA_ANALYSIS_COMPARISON_INVALID",
                files,
                isolatedSources
            );

        failure.causeCode =
            error?.message ||
            "MEDIA_ANALYSIS_COMPARISON_JSON_INVALID";
        failure.repairCount =
            repairCount;

        throw failure;
    }

    if (
        !comparisonPayload?.comparison ||
        typeof comparisonPayload.comparison !== "object" ||
        Array.isArray(comparisonPayload.comparison)
    ) {
        const failure =
            createAnalysisError(
                "MEDIA_ANALYSIS_COMPARISON_INVALID",
                files,
                isolatedSources
            );

        failure.repairCount =
            repairCount;
        throw failure;
    }

    const assembled =
        validateAnalysis(
            {
                sources:
                    isolatedSources,
                comparison:
                    comparisonPayload.comparison,
                recommendations:
                    Array.isArray(
                        comparisonPayload.recommendations
                    )
                        ? comparisonPayload.recommendations
                        : []
            },
            files
        );

    return {
        ...assembled,
        analysisMode:
            "ISOLATED_PER_FILE_FALLBACK",
        combinedAnalysisFailed:
            true,
        strictVisualOnly: strictVisualOnlyRequested(question),
        repairCount,
        provider:
            String(
                ai.lastProvider ||
                (
                    ai?.models?.generateContent
                        ? "gemini-modern"
                        : "gemini-legacy"
                )
            ),
        model,
        analyzedAt:
            new Date().toISOString()
    };
}

function strictVisualOnlyRequested(question = "") {
    const value = String(question || "").toLowerCase();
    return (
        /(?:no\s+infier|no\s+infer|sin\s+inferencias?)/i.test(value) ||
        /(?:solamente|únicamente|unicamente|solo|sólo)[\s\S]{0,120}(?:verific|visible|visual)/i.test(value) ||
        /(?:describe|compara)[\s\S]{0,180}(?:solamente|únicamente|unicamente)[\s\S]{0,120}(?:verific|visible|visual)/i.test(value)
    );
}

function applyQuestionGroundingPolicy(parsed, question = "") {
    if (!strictVisualOnlyRequested(question)) return parsed;
    const strictParsed = {
        ...parsed,
        sources: (Array.isArray(parsed?.sources) ? parsed.sources : [])
            .map(source => ({
                ...source,
                description: "",
                observations: (Array.isArray(source?.observations)
                    ? source.observations
                    : [])
                    .filter(item => {
                        const value = String(item || "");
                        const verifiedValues = verifiedVisibleLiteralValues([source]);
                        return (
                            !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(value) &&
                            !containsUnverifiedSensitiveNarrativeLiteral(
                                value,
                                verifiedValues
                            )
                        );
                    }),
                inferences: []
            })),
        comparison: parsed?.comparison && typeof parsed.comparison === "object"
            ? {
                ...parsed.comparison,
                differences: (Array.isArray(parsed.comparison?.differences)
                    ? parsed.comparison.differences
                    : [])
                    .filter(item =>
                        !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                            String(item || "")
                        )
                    )
            }
            : parsed?.comparison,
        recommendations: (Array.isArray(parsed?.recommendations)
            ? parsed.recommendations
            : [])
            .filter(item =>
                !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                    String(item || "")
                )
            )
    };

    return strictParsed;
}

async function runJarvisMediaAnalysis({
    ai,
    input = {},
    model = DEFAULT_MODEL
} = {}) {
    const files =
        normalizeMediaFiles(input.files);

    const question =
        String(
            input.question ||
            input.instruction ||
            "Analiza los materiales entregados."
        )
            .trim()
            .slice(0, 3000);

    let repairAttempt = 0;
    let previousOutput = "";
    let previousError = "";
    let terminalError = null;

    while (repairAttempt <= MAX_REPAIR_ATTEMPTS) {
        const prompt =
            buildAnalysisPrompt(
                files,
                question,
                {
                    repairAttempt,
                    previousOutput,
                    previousError
                }
            );

        const text =
            await generateAnalysisText({
                ai,
                model,
                files,
                prompt
            });

        let parsed = null;

        try {
            parsed =
                applyQuestionGroundingPolicy(
                    parseAnalysisJson(text, files),
                    question
                );

            const validated =
                validateAnalysis(parsed, files);

            return {
                ...validated,
                analysisMode: "COMBINED",
                combinedAnalysisFailed: false,
                strictVisualOnly: strictVisualOnlyRequested(question),
                repairCount: repairAttempt,
                precisionSanitized: false,
                precisionSanitizedCount: 0,
                provider:
                    String(
                        ai.lastProvider ||
                        (
                            ai?.models?.generateContent
                                ? "gemini-modern"
                                : "gemini-legacy"
                        )
                    ),
                model,
                analyzedAt:
                    new Date().toISOString()
            };
        }
        catch (error) {
            error.repairCount =
                repairAttempt;
            previousOutput =
                text;
            previousError =
                error?.message ||
                "MEDIA_ANALYSIS_VALIDATION_FAILED";

            if (
                repairAttempt < MAX_REPAIR_ATTEMPTS &&
                isRepairableAnalysisError(error)
            ) {
                repairAttempt += 1;
                continue;
            }

            const canSanitizePrecisionFailure =
                parsed &&
                new Set([
                    "MEDIA_ANALYSIS_PRECISION_LITERAL_LEAK",
                    "MEDIA_ANALYSIS_NON_VISUAL_RECOMMENDATION",
                    "MEDIA_ANALYSIS_CAPTURE_CONTEXT_CLAIM"
                ]).has(error?.message);

            if (canSanitizePrecisionFailure) {
                try {
                    const sanitized =
                        sanitizePrecisionNarrative(parsed);
                    const validated =
                        validateAnalysis(
                            sanitized.parsed,
                            files
                        );

                    return {
                        ...validated,
                        analysisMode:
                            "COMBINED_PRECISION_SANITIZED",
                        combinedAnalysisFailed: false,
                        strictVisualOnly: strictVisualOnlyRequested(question),
                        repairCount: repairAttempt,
                        precisionSanitized: true,
                        precisionSanitizedCount:
                            sanitized.removedCount,
                        provider:
                            String(
                                ai.lastProvider ||
                                (
                                    ai?.models?.generateContent
                                        ? "gemini-modern"
                                        : "gemini-legacy"
                                )
                            ),
                        model,
                        analyzedAt:
                            new Date().toISOString()
                    };
                }
                catch (sanitizationError) {
                    sanitizationError.repairCount =
                        repairAttempt;
                    terminalError =
                        sanitizationError;
                    break;
                }
            }

            terminalError = error;
            break;
        }
    }

    const canUseIsolatedFallback =
        files.length > 1 &&
        terminalError &&
        terminalError.receivedSources === 0 &&
        isRepairableAnalysisError(
            terminalError
        );

    if (canUseIsolatedFallback) {
        return await runIsolatedMediaFallback({
            ai,
            model,
            files,
            question,
            repairCount:
                repairAttempt
        });
    }

    if (terminalError) {
        if (
            typeof terminalError.expectedSources !==
            "number"
        ) {
            terminalError.expectedSources =
                files.length;
        }

        if (
            typeof terminalError.receivedSources !==
            "number"
        ) {
            terminalError.receivedSources =
                0;
        }

        terminalError.repairCount =
            repairAttempt;

        throw terminalError;
    }

    const unavailable =
        createAnalysisError(
            "MEDIA_ANALYSIS_UNAVAILABLE",
            files,
            []
        );

    unavailable.repairCount =
        repairAttempt;

    throw unavailable;
}

module.exports = {
    VERSION,
    DEFAULT_MODEL,
    ALLOWED_TYPES,
    MAX_FILES,
    MAX_FILE_BYTES,
    MAX_TOTAL_BYTES,
    MAX_REPAIR_ATTEMPTS,
    normalizeMediaFiles,
    sourceManifest,
    validateAnalysis,
    buildAnalysisPrompt,
    buildAnalysisResponseJsonSchema,
    buildComparisonResponseJsonSchema,
    buildIsolatedAnalysisPrompt,
    buildValidatedComparisonPrompt,
    validateIsolatedAnalysis,
    runIsolatedMediaFallback,
    strictVisualOnlyRequested,
    applyQuestionGroundingPolicy,
    runJarvisMediaAnalysis
};
