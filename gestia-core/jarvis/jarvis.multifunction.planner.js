import {
    rejectCorruptedIdentityArgs
} from "./jarvis.identity.integrity.js?v=v94-generalist-page-integrity-v120-20260810";

const VERSION = "4.19.0-reel-media-source-recovery-v136";
const ENDPOINT = "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisSemanticPlan";
const CACHE_TTL_MS = 30000;
const planCache = new Map();
const pendingPlans = new Map();

const CLOUD_MISSION_CONTRACT_TIMEOUT_MS =
    45000;

const GENERALIST_CURRENT_TURN_POLICY = [
    "Actua como un agente generalista: entiende libremente la instruccion actual antes de elegir herramientas.",
    "La instruccion actual es la autoridad primaria; el historial, el estado previo y los adjuntos aportan contexto, pero no sustituyen ni arrastran una tarea anterior salvo continuidad o referencia inequívoca del usuario.",
    "Los nombres propios y las identidades explícitas de la solicitud actual se conservan fielmente: no los abrevies, renombres ni corrijas por aproximación. La creatividad puede producir identidades nuevas cuando esa sea realmente la intención, pero una copia casi igual de una identidad explícita no es una identidad nueva válida.",
    "Distingue entre objetos de entrada, temas mencionados y resultados realmente solicitados: mencionar una capacidad, formato, archivo o tema no equivale a pedir que se ejecute o produzca.",
    "Selecciona solamente las herramientas necesarias para satisfacer la intencion actual y conserva cada objetivo independiente pedido por el usuario.",
    "Si la solicitud se resuelve conversacionalmente, mediante conocimiento o explicacion, no fabriques artefactos ni operaciones no solicitadas; usa la respuesta semantica disponible o declara la mision completa cuando no haga falta una herramienta."
].join(" ");

function extractJsonObject(value = "") {
    const source = String(value || "");
    let start = -1;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === '"') quoted = false;
            continue;
        }
        if (character === '"') quoted = true;
        else if (character === "{") {
            if (start < 0) start = index;
            depth += 1;
        } else if (character === "}" && start >= 0) {
            depth -= 1;
            if (depth === 0) return JSON.parse(source.slice(start, index + 1));
        }
    }
    throw new Error("CLIENT_MISSION_CONTRACT_JSON_REQUIRED");
}

const EXPLICIT_TOOL_PLAN_START =
    "[[JARVIS_TOOL_PLAN]]";

const EXPLICIT_TOOL_PLAN_END =
    "[[/JARVIS_TOOL_PLAN]]";

function explicitGovernedCallKey(
    name = "",
    args = {}
) {
    return `${String(name || "")}:${JSON.stringify(
        args &&
        typeof args ===
            "object" &&
        !Array.isArray(args)
            ? args
            : {}
    )}`;
}

function explicitGovernedHistoryKeys(
    missionState = null
) {
    const entries = [
        ...(
            Array.isArray(
                missionState
                    ?.completedTasks
            )
                ? missionState
                    .completedTasks
                : []
        ),
        ...(
            Array.isArray(
                missionState
                    ?.blockedTasks
            )
                ? missionState
                    .blockedTasks
                : []
        )
    ];

    return new Set(
        entries.map(item =>
            explicitGovernedCallKey(
                item?.name,
                item?.args
            )
        )
    );
}

function extractExplicitGovernedToolPlan(
    input = "",
    catalog = [],
    missionState = null
) {
    const source =
        String(
            input ||
            ""
        );

    const start =
        source.indexOf(
            EXPLICIT_TOOL_PLAN_START
        );

    if (start < 0) {
        return null;
    }

    if (
        source.indexOf(
            EXPLICIT_TOOL_PLAN_START,
            start +
            EXPLICIT_TOOL_PLAN_START
                .length
        ) >= 0
    ) {
        return null;
    }

    const payloadStart =
        start +
        EXPLICIT_TOOL_PLAN_START
            .length;

    const end =
        source.indexOf(
            EXPLICIT_TOOL_PLAN_END,
            payloadStart
        );

    if (end < payloadStart) {
        return null;
    }

    if (
        source.indexOf(
            EXPLICIT_TOOL_PLAN_END,
            end +
            EXPLICIT_TOOL_PLAN_END
                .length
        ) >= 0
    ) {
        return null;
    }

    let envelope;

    try {
        envelope =
            JSON.parse(
                source
                    .slice(
                        payloadStart,
                        end
                    )
                    .trim()
            );
    }
    catch {
        return null;
    }

    const requestedCalls =
        Array.isArray(
            envelope
                ?.toolCalls
        )
            ? envelope
                .toolCalls
                .slice(
                    0,
                    6
                )
            : [];

    const catalogByName =
        new Map(
            catalog.map(tool => [
                String(
                    tool?.name ||
                    ""
                ),
                tool
            ])
        );

    const validated =
        [];

    for (
        const candidate
        of requestedCalls
    ) {
        const name =
            String(
                candidate?.name ||
                ""
            ).trim();

        const tool =
            catalogByName.get(
                name
            );

        if (!tool) {
            continue;
        }

        const isTerminalCertification =
            name ===
                "system.certify" &&
            candidate
                ?.terminal ===
                true;

        const isGovernedArtifact =
            tool
                ?.userArtifact ===
                true &&
            tool
                ?.requiresApproval !==
                true &&
            !name.startsWith(
                "repo."
            ) &&
            !name.startsWith(
                "codex."
            );

        if (
            !isTerminalCertification &&
            !isGovernedArtifact
        ) {
            continue;
        }

        const rawArgs =
            candidate?.args &&
            typeof candidate.args ===
                "object" &&
            !Array.isArray(
                candidate.args
            )
                ? candidate.args
                : {};

        const args =
            filterSemanticArguments(
                rawArgs,
                tool.inputSchema
            );

        if (
            Object.keys(
                args
            ).length === 0
        ) {
            continue;
        }

        validated.push({
            name,
            args,
            reason:
                "EXPLICIT_GOVERNED_TOOL_ENVELOPE",
            terminal:
                isTerminalCertification
        });
    }

    const artifactCalls =
        validated.filter(call =>
            call.terminal !==
            true
        );

    if (
        artifactCalls.length ===
        0
    ) {
        return null;
    }

    const phase =
        String(
            missionState
                ?.phase ||
            ""
        );

    const history =
        explicitGovernedHistoryKeys(
            missionState
        );

    if (
        phase ===
        "COMPLETION_AUDIT"
    ) {
        const certification =
            validated.find(call =>
                call.terminal ===
                    true &&
                !history.has(
                    explicitGovernedCallKey(
                        call.name,
                        call.args
                    )
                )
            ) ||
            null;

        if (certification) {
            return {
                ok:
                    true,
                status:
                    "EXPLICIT_TOOL_PLAN_READY",
                provider:
                    "local-explicit-envelope",
                model:
                    null,
                planKind:
                    "EXPLICIT_COMPLETION_AUDIT",
                missionComplete:
                    false,
                toolCalls: [
                    certification
                ]
            };
        }

        return {
            ok:
                true,
            status:
                "EXPLICIT_TOOL_PLAN_READY",
            provider:
                "local-explicit-envelope",
            model:
                null,
            planKind:
                "EXPLICIT_COMPLETION_AUDIT",
            missionComplete:
                true,
            toolCalls:
                [],
            completionAssessment: {
                explicitEnvelope:
                    true,
                terminalCertificationAccounted:
                    validated.some(call =>
                        call.terminal ===
                        true
                    )
            }
        };
    }

    const outstandingArtifacts =
        artifactCalls.filter(call =>
            !history.has(
                explicitGovernedCallKey(
                    call.name,
                    call.args
                )
            )
        );

    return {
        ok:
            true,
        status:
            "EXPLICIT_TOOL_PLAN_READY",
        provider:
            "local-explicit-envelope",
        model:
            null,
        planKind:
            phase ===
                "MISSION_CONTRACT"
                ? "MISSION_CONTRACT_EXPLICIT"
                : "EXPLICIT_GOVERNED_TOOL_PLAN",
        missionComplete:
            false,
        toolCalls:
            outstandingArtifacts
    };
}


const ATTACHMENT_MANIFEST_MARKER =
    "Archivos adjuntos reales entregados por el usuario:";

function instructionBeforeAttachmentManifest(
    input = ""
) {
    const source =
        String(input || "");
    const markerIndex =
        source.lastIndexOf(
            ATTACHMENT_MANIFEST_MARKER
        );
    return (
        markerIndex >= 0
            ? source.slice(0, markerIndex)
            : source
    ).trim();
}


function explicitHttpSourceUrls(
    input = ""
) {
    const source =
        instructionBeforeAttachmentManifest(
            input
        );
    const matches = [];
    let cursor = 0;
    while (cursor < source.length) {
        const httpIndex =
            source.indexOf("http://", cursor);
        const httpsIndex =
            source.indexOf("https://", cursor);
        let start = -1;

        if (httpIndex < 0) start = httpsIndex;
        else if (httpsIndex < 0) start = httpIndex;
        else start = Math.min(httpIndex, httpsIndex);
        if (start < 0) break;

        let end = start;
        while (end < source.length) {
            const character = source[end];
            if (
                character.charCodeAt(0) <= 32 ||
                "<>\"'`".includes(character)
            ) {
                break;
            }
            end += 1;
        }
        const candidate =
            source.slice(start, end);
        if (candidate) matches.push(candidate);
        cursor = Math.max(end, start + 1);
        if (matches.length >= 16) break;
    }
    const values = [];
    const seen = new Set();

    for (const raw of matches) {
        let candidate =
            String(raw || "").trim();
        while (
            candidate &&
            ".,;:!?)]}".includes(
                candidate.at(-1)
            )
        ) {
            candidate =
                candidate.slice(0, -1);
        }
        try {
            const url = new URL(candidate);
            if (![
                "http:",
                "https:"
            ].includes(url.protocol)) {
                continue;
            }
            url.hash = "";
            const normalized = url.toString();
            if (!seen.has(normalized)) {
                seen.add(normalized);
                values.push(normalized);
            }
        }
        catch {
            // Ignore malformed text that merely resembles a URL.
        }
        if (values.length >= 8) break;
    }
    return values;
}

function sourceAnchorDescriptor(
    value = ""
) {
    try {
        const url = new URL(String(value || ""));
        const host =
            String(url.hostname || "")
                .toLowerCase()
                .replace(/^www\./, "");
        const segments =
            url.pathname
                .split("/")
                .map(segment => {
                    try {
                        return decodeURIComponent(segment);
                    }
                    catch {
                        return segment;
                    }
                })
                .map(segment => segment.trim())
                .filter(Boolean);
        const handle =
            segments.find(segment =>
                segment.startsWith("@") &&
                segment.length > 1
            ) || "";
        const searchTerms = [];
        for (const key of [
            "q",
            "query",
            "search_query",
            "keyword",
            "keywords"
        ]) {
            const item =
                String(
                    url.searchParams.get(key) ||
                    ""
                )
                    .replace(/\+/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
            if (item) searchTerms.push(item);
        }
        return {
            url: url.toString(),
            host,
            handle,
            searchTerms:
                [...new Set(searchTerms)]
                    .slice(0, 4)
        };
    }
    catch {
        return null;
    }
}

function sourceAnchorForCandidate(
    args = {},
    anchors = []
) {
    const descriptors =
        anchors
            .map(sourceAnchorDescriptor)
            .filter(Boolean);
    if (descriptors.length === 0) return null;

    const declaredSeed =
        String(args.seedUrl || args.url || "").trim();
    if (declaredSeed) {
        const declared =
            sourceAnchorDescriptor(declaredSeed);
        if (declared) {
            const exact =
                descriptors.find(item =>
                    item.url === declared.url
                );
            if (exact) return exact;
            const sameHost =
                descriptors.find(item =>
                    item.host === declared.host
                );
            if (sameHost) return sameHost;
        }
    }

    const candidateText =
        [
            args.query,
            args.prompt,
            args.exactEntity,
            args.allowedDomain
        ]
            .map(value =>
                String(value || "")
                    .toLowerCase()
            )
            .join(" ");
    let best = null;
    let bestScore = 0;
    for (const descriptor of descriptors) {
        let score = 0;
        if (
            descriptor.host &&
            candidateText.includes(
                descriptor.host
            )
        ) {
            score += 5;
        }
        if (
            descriptor.handle &&
            candidateText.includes(
                descriptor.handle.toLowerCase()
            )
        ) {
            score += 5;
        }
        for (const term of descriptor.searchTerms) {
            const normalized =
                term.toLowerCase();
            if (
                normalized.length >= 3 &&
                candidateText.includes(normalized)
            ) {
                score += 3;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            best = descriptor;
        }
    }
    return best ||
        (descriptors.length === 1
            ? descriptors[0]
            : null);
}

function appendSourceAnchorHints(
    query = "",
    descriptor = null
) {
    const base =
        String(query || "")
            .replace(/\s+/g, " ")
            .trim();
    if (!descriptor) return base;
    const pieces = [base];
    const normalizedBase =
        base.toLowerCase();
    if (
        descriptor.handle &&
        !normalizedBase.includes(
            descriptor.handle.toLowerCase()
        )
    ) {
        pieces.push(descriptor.handle);
    }
    for (const term of descriptor.searchTerms) {
        if (
            term &&
            !normalizedBase.includes(
                term.toLowerCase()
            )
        ) {
            pieces.push(term);
        }
    }
    return pieces
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600);
}


function normalizedMissionFidelityTerms(
    value = ""
) {
    const source =
        String(value || "")
            .normalize("NFC")
            .toLocaleLowerCase()
            .trim();
    if (!source) return [];

    if (
        typeof Intl !== "undefined" &&
        typeof Intl.Segmenter === "function"
    ) {
        const segmenter =
            new Intl.Segmenter(
                undefined,
                { granularity: "word" }
            );
        const terms = [];
        for (
            const item
            of segmenter.segment(source)
        ) {
            const term =
                String(item?.segment || "")
                    .trim();
            if (
                item?.isWordLike === true &&
                term.length >= 3
            ) {
                terms.push(term);
            }
            if (terms.length >= 1200) break;
        }
        return terms;
    }

    return source.length >= 3
        ? [source]
        : [];
}

function researchQueryPreservesMissionIdentity(
    query = "",
    instruction = ""
) {
    const queryTerms =
        new Set(
            normalizedMissionFidelityTerms(
                query
            )
        );
    const instructionTerms =
        new Set(
            normalizedMissionFidelityTerms(
                instruction
            )
        );
    if (
        queryTerms.size === 0 ||
        instructionTerms.size === 0
    ) {
        return false;
    }
    const overlap =
        [...queryTerms]
            .filter(term =>
                instructionTerms.has(term)
            );
    return (
        overlap.length >= 2 ||
        overlap.some(term =>
            term.length >= 6
        )
    );
}

function normalizeResearchMissionFidelity(
    args = {},
    instruction = ""
) {
    const next = {
        ...(args &&
        typeof args === "object" &&
        !Array.isArray(args)
            ? args
            : {})
    };
    const missionInstruction =
        instructionBeforeAttachmentManifest(
            instruction
        )
            .replace(/\s+/g, " ")
            .trim();
    let query =
        String(
            next.query ||
            next.prompt ||
            ""
        )
            .replace(/\s+/g, " ")
            .trim();
    const exactEntity =
        String(next.exactEntity || "")
            .replace(/\s+/g, " ")
            .trim();
    let repaired =
        false;

    if (exactEntity) {
        const queryTerms =
            new Set(
                normalizedMissionFidelityTerms(
                    query
                )
            );
        const entityTerms =
            normalizedMissionFidelityTerms(
                exactEntity
            );
        if (
            entityTerms.length > 0 &&
            !entityTerms.every(term =>
                queryTerms.has(term)
            )
        ) {
            query =
                `${exactEntity} ${query}`
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 600);
            repaired =
                true;
        }
    }

    if (
        !exactEntity &&
        missionInstruction &&
        explicitHttpSourceUrls(
            instruction
        ).length === 0 &&
        !researchQueryPreservesMissionIdentity(
            query,
            missionInstruction
        )
    ) {
        query =
            missionInstruction
                .slice(0, 600);
        repaired =
            true;
    }

    if (query) {
        next.query =
            query;
    }

    return {
        args:
            next,
        repaired
    };
}

function researchGoalHasSatisfiedExplicitAnchor(
    missionState = null,
    researchGoal = "",
    explicitAnchors = []
) {
    const goal = String(researchGoal || "").trim();
    const anchorUrls = new Set(
        (Array.isArray(explicitAnchors) ? explicitAnchors : [])
            .map(sourceAnchorDescriptor)
            .filter(Boolean)
            .map(item => item.url)
    );
    if (!goal || anchorUrls.size === 0) return false;
    const completedTasks = Array.isArray(missionState?.completedTasks)
        ? missionState.completedTasks
        : [];
    return completedTasks.some(task => {
        if (
            String(task?.name || "") !== "web.research" ||
            task?.observation?.objectiveSatisfied !== true
        ) return false;
        const completedGoal = String(
            task?.args?.researchGoal ||
            task?.observation?.researchGoal ||
            ""
        ).trim();
        if (completedGoal !== goal) return false;

        const observationStatus =
            String(task?.observation?.status || "")
                .trim()
                .toUpperCase();
        if ([
            "GROUNDED_CROSS_SOURCE_RECOVERY",
            "ENTITY_NOT_VERIFIED_CROSS_SOURCE_RECOVERY",
            "GROUNDED_ANCHOR_UNVERIFIED_DOMAIN_ONLY"
        ].includes(observationStatus)) {
            return true;
        }

        const sources = [
            ...(Array.isArray(task?.observation?.validSources)
                ? task.observation.validSources
                : []),
            ...(Array.isArray(task?.observation?.sources)
                ? task.observation.sources
                : [])
        ];
        return sources.some(item => {
            const descriptor = sourceAnchorDescriptor(
                item?.url || item?.href || ""
            );
            return Boolean(descriptor) && anchorUrls.has(descriptor.url);
        });
    });
}

function verifiedResearchSourceUrls(
    missionState = null
) {
    const completedTasks = Array.isArray(missionState?.completedTasks)
        ? missionState.completedTasks
        : [];
    const values = [];
    const seen = new Set();
    for (const task of completedTasks) {
        if (
            String(task?.name || "") !== "web.research" ||
            task?.observation?.objectiveSatisfied !== true ||
            !Array.isArray(task?.observation?.validSources)
        ) continue;
        for (const source of task.observation.validSources) {
            const candidate = String(source?.url || source?.href || "").trim();
            if (!candidate) continue;
            try {
                const url = new URL(candidate);
                if (!["https:", "http:"].includes(url.protocol)) continue;
                url.hash = "";
                const normalized = url.toString();
                if (seen.has(normalized)) continue;
                seen.add(normalized);
                values.push(normalized);
            } catch {}
            if (values.length >= 8) return values;
        }
    }
    return values;
}

function normalizeExplicitSourceCandidates(
    candidates = [],
    catalog = [],
    context = {}
) {
    const sourceCandidates =
        Array.isArray(candidates)
            ? candidates
            : [];
    const explicitAnchors =
        explicitHttpSourceUrls(
            context?.originalInstruction ||
            ""
        );
    const researchedAnchors =
        verifiedResearchSourceUrls(
            context?.missionState ||
            null
        );
    const available =
        new Set(
            catalog.map(tool =>
                String(tool?.name || "")
            )
        );

    return sourceCandidates.map(candidate => {
        const name =
            String(candidate?.name || "");
        if (
            name !== "web.research" &&
            name !== "web.media.collect"
        ) {
            return candidate;
        }
        if (!available.has(name)) {
            return candidate;
        }
        let args =
            candidateArgumentObject(candidate);
        let missionFidelityRepaired =
            false;
        if (
            name === "web.research"
        ) {
            const fidelity =
                normalizeResearchMissionFidelity(
                    args,
                    context?.originalInstruction ||
                    ""
                );
            args =
                fidelity.args;
            missionFidelityRepaired =
                fidelity.repaired ===
                true;
        }
        if (
            name === "web.media.collect" &&
            explicitAnchors.length === 0 &&
            researchedAnchors.length > 1
        ) {
            const declared = sourceAnchorDescriptor(args.url || "");
            const verifiedSelection = Boolean(declared) && researchedAnchors.some(value =>
                sourceAnchorDescriptor(value)?.url === declared.url
            );
            if (!verifiedSelection) {
                return { ...candidate, name: "" };
            }
        }
        const explicitAnchorAlreadySatisfied =
    name === "web.research" &&
    researchGoalHasSatisfiedExplicitAnchor(
        context?.missionState || null,
        args.researchGoal,
        explicitAnchors
    );
const candidateAnchors =
    name === "web.research"
        ? (
            explicitAnchorAlreadySatisfied
                ? []
                : explicitAnchors
        )
        : explicitAnchors.length > 0
            ? explicitAnchors
            : name === "web.media.collect"
                ? researchedAnchors
                : [];
const anchor =
    sourceAnchorForCandidate(
        args,
        candidateAnchors
    );
        if (!anchor) {
            return {
                ...candidate,
                args,
                ...(
                    missionFidelityRepaired
                        ? {
                            reason:
                                "SEMANTIC_RESEARCH_MISSION_FIDELITY_REPAIRED"
                        }
                        : {}
                )
            };
        }

        if (name === "web.research") {
            return {
                ...candidate,
                args: {
                    ...args,
                    query:
                        appendSourceAnchorHints(
                            args.query ||
                            args.prompt ||
                            "",
                            anchor
                        ),
                    seedUrl:
                        anchor.url,
                    allowedDomain:
                        String(
                            args.allowedDomain ||
                            anchor.host ||
                            ""
                        )
                },
                reason:
                    candidate?.reason ||
                    "SEMANTIC_RESEARCH_EXPLICIT_SOURCE_ANCHORED"
            };
        }

        return {
            ...candidate,
            args: {
                ...args,
                url:
                    String(args.url || "").trim() ||
                    anchor.url
            },
            reason:
                candidate?.reason ||
                "SEMANTIC_MEDIA_EXPLICIT_SOURCE_ANCHORED"
        };
    });
}

function extractGroundedAttachments(
    input = ""
) {
    const source =
        String(input || "");
    const markerIndex =
        source.lastIndexOf(
            ATTACHMENT_MANIFEST_MARKER
        );

    if (markerIndex < 0) {
        return [];
    }

    const payload =
        source
            .slice(
                markerIndex +
                ATTACHMENT_MANIFEST_MARKER.length
            )
            .trim();

    let manifest;
    try {
        manifest = JSON.parse(payload);
    }
    catch {
        return [];
    }

    return (
        Array.isArray(manifest)
            ? manifest
            : []
    )
        .filter(item =>
            item &&
            typeof item === "object" &&
            typeof item.artifact === "string" &&
            item.artifact.startsWith(
                ".jarvis-artifacts/"
            )
        )
        .slice(0, 30)
        .map(item => ({
            name: String(item.name || ""),
            mimeType: String(
                item.mimeType || ""
            ).trim().toLowerCase(),
            artifact: String(item.artifact || ""),
            sha256: String(item.sha256 || "")
        }));
}

function candidateArgumentObject(
    candidate = {}
) {
    const value =
        candidate?.args ||
        candidate?.arguments;

    return (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    )
        ? { ...value }
        : {};
}

function imageVariantIdentity(
    candidate = {}
) {
    const args =
        candidateArgumentObject(candidate);
    const declared =
        String(args.variantId || "")
            .trim()
            .slice(0, 120);
    return declared || "PRIMARY";
}

function normalizeAttachmentAnalysisRouteCandidates(
    candidates = []
) {
    return Array.isArray(candidates)
        ? candidates
        : [];
}

function normalizeGroundedImageReferenceCandidates(
    candidates = [],
    catalog = [],
    context = {}
) {
    const sourceCandidates =
        Array.isArray(candidates)
            ? candidates
            : [];
    const attachments =
        extractGroundedAttachments(
            context?.originalInstruction || ""
        );
    const images =
        attachments.filter(item =>
            item.mimeType.startsWith("image/")
        );
    const availableArtifacts =
        new Map(
            images.map(item => [
                item.artifact,
                item
            ])
        );
    const imageEditAvailable =
        catalog.some(tool =>
            tool?.name === "image.edit"
        );

    return sourceCandidates.map(candidate => {
        if (
            candidate?.name !== "image.edit" ||
            !imageEditAvailable
        ) {
            return candidate;
        }

        const baseArgs =
            candidateArgumentObject(candidate);
        let sourceOutput =
            String(baseArgs.sourceOutput || "").trim();

        if (!availableArtifacts.has(sourceOutput)) {
            sourceOutput =
                images.length === 1
                    ? images[0].artifact
                    : sourceOutput;
        }

        const referenceOutputs =
            (Array.isArray(baseArgs.referenceOutputs)
                ? baseArgs.referenceOutputs
                : [])
                .map(value =>
                    String(value || "").trim()
                )
                .filter(value =>
                    availableArtifacts.has(value) &&
                    value !== sourceOutput
                )
                .filter((value, index, list) =>
                    list.indexOf(value) === index
                )
                .slice(0, 4);

        return {
            ...candidate,
            name: "image.edit",
            args: {
                ...baseArgs,
                sourceOutput,
                referenceOutputs,
                variantId:
                    imageVariantIdentity(candidate),
                identityMode:
                    baseArgs.identityMode ||
                    "strict",
                ageMode:
                    baseArgs.ageMode ||
                    "preserve",
                preserveLogos:
                    baseArgs.preserveLogos !== false,
                preserveApprovedText:
                    baseArgs.preserveApprovedText === true
            },
            reason:
                candidate?.reason ||
                "SEMANTIC_IMAGE_EDIT_GROUNDED"
        };
    });
}

function runtimeCatalog(context = {}) {
    const supplied = Array.isArray(context.toolCatalog)
        ? context.toolCatalog
        : null;
    const registered = globalThis?.JarvisToolRuntime?.list?.();
    const source = supplied || (Array.isArray(registered) ? registered : []);

    return source
        .filter(tool => tool?.name && typeof tool.name === "string")
        .slice(0, 80)
        .map(tool => ({
            name: tool.name,
            description: String(tool.description || "").slice(0, 500),
            mutates: tool.mutates === true,
            requiresApproval: tool.requiresApproval === true,
            userArtifact: tool.userArtifact === true,
            missionIsolation:
                tool.missionIsolation === "exclusive"
                    ? "exclusive"
                    : null,
            missionDedupeBy: Array.isArray(tool.missionDedupeBy)
                ? [...tool.missionDedupeBy]
                : null,
            inputSchema: tool.inputSchema && typeof tool.inputSchema === "object"
                ? tool.inputSchema
                : null
        }));
}

function missionDedupeKey(tool = {}, args = {}) {
    if (!Array.isArray(tool?.missionDedupeBy)) return "";
    return `${tool.name}:${JSON.stringify(
        tool.missionDedupeBy.map(field =>
            Object.prototype.hasOwnProperty.call(args, field)
                ? args[field]
                : null
        )
    )}`;
}

function stableResearchGoal(
    value = "",
    fallbackOrdinal = 1
) {
    const candidate =
        String(value || "")
            .trim()
            .toUpperCase();
    const prefix =
        "RESEARCH_";
    const suffix =
        candidate.startsWith(prefix)
            ? candidate.slice(
                prefix.length
            )
            : "";
    const numericSuffix =
        suffix.length > 0 &&
        [
            ...suffix
        ].every(character => {
            const code =
                character.charCodeAt(0);
            return (
                code >= 48 &&
                code <= 57
            );
        });

    return numericSuffix
        ? `${prefix}${Math.max(
            1,
            Number(suffix)
        )}`
        : `${prefix}${Math.max(
            1,
            Number(fallbackOrdinal) ||
            1
        )}`;
}

function trustedPlanCalls(plan = {}, catalog = [], context = {}) {
    const allowed = new Map(catalog.map(tool => [tool.name, tool]));
    const candidates =
        normalizeExplicitSourceCandidates(
            normalizeGroundedImageReferenceCandidates(
                Array.isArray(
                    plan?.toolCalls
                )
                    ? plan.toolCalls
                    : [],
                catalog,
                context
            ),
            catalog,
            context
        );
    const allowDeferred =
        String(plan?.planKind || "")
            .startsWith("MISSION_CONTRACT");
    const seen = new Set();
    const seenMissionDedupeKeys = new Set();
    const calls = [];
    let webResearchOrdinal = 0;
    const missionPhase =
        String(
            context?.missionState?.phase ||
            ""
        );

    for (const candidate of candidates.slice(0, 12)) {
        const tool = allowed.get(String(candidate?.name || ""));
        let args =
            (candidate?.args || candidate?.arguments) &&
            typeof (candidate.args || candidate.arguments) === "object" &&
            !Array.isArray(candidate.args || candidate.arguments)
                ? {
                    ...(candidate.args || candidate.arguments)
                }
                : {};
        if (!tool) continue;
        args = rejectCorruptedIdentityArgs(
            args,
            context?.originalInstruction || ""
        );
        if (
            tool.name === "system.certify" &&
            missionPhase !== "COMPLETION_AUDIT"
        ) {
            continue;
        }
        if (
            tool.name ===
                "agent.delegate" &&
            !hasGroundedDelegationDirective(
                args,
                context
                    ?.originalInstruction ||
                ""
            )
        ) {
            continue;
        }
        if (
            usesRegisteredToolAsRepositoryFile(
                tool,
                args,
                allowed
            )
        ) {
            continue;
        }
        if (
            tool.name ===
                "web.research" &&
            Array.isArray(
                tool.missionDedupeBy
            ) &&
            tool.missionDedupeBy.includes(
                "researchGoal"
            )
        ) {
            webResearchOrdinal += 1;
            args = {
                ...args,
                researchGoal:
                    stableResearchGoal(
                        args.researchGoal,
                        webResearchOrdinal
                    )
            };
        }
        const signature =
            `${tool.name}:${JSON.stringify(args)}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        const dedupeKey =
            missionDedupeKey(
                tool,
                args
            );
        if (
            dedupeKey &&
            seenMissionDedupeKeys.has(dedupeKey)
        ) {
            continue;
        }
        if (dedupeKey) {
            seenMissionDedupeKeys.add(dedupeKey);
        }

        const argumentsComplete =
            hasRequiredToolArguments(
                tool,
                args
            );
        if (
            !argumentsComplete &&
            !allowDeferred
        ) {
            continue;
        }

        calls.push({
            name: tool.name,
            args,
            reason: String(candidate?.reason || "MODEL_SEMANTIC_TOOL_SELECTION").slice(0, 240),
            mutates: tool.mutates,
            approved: tool.mutates === true && context.approved === true,
            ...(dedupeKey ? { missionDedupeKey: dedupeKey } : {}),
            ...(
                argumentsComplete
                    ? {}
                    : {
                        deferred:
                            true
                    }
            )
        });
    }

    return enforceMissionIsolation(
        calls,
        allowed
    );
}

function enforceMissionIsolation(
    calls = [],
    catalogByName =
        new Map()
) {
    const isolated =
        calls.filter(call =>
            catalogByName
                .get(call?.name)
                ?.missionIsolation ===
            "exclusive"
        );

    return isolated.length > 0
        ? isolated.slice(0, 1)
        : calls;
}

function usesRegisteredToolAsRepositoryFile(
    tool = {},
    args = {},
    catalogByName =
        new Map()
) {
    if (
        !String(
            tool?.name ||
            ""
        ).startsWith(
            "repo."
        )
    ) {
        return false;
    }
    const target =
        String(
            args?.file ||
            args?.path ||
            ""
        ).trim();
    return (
        target.length >
            0 &&
        catalogByName.has(
            target
        )
    );
}

function hasGroundedDelegationDirective(
    args = {},
    instruction = ""
) {
    const directive =
        String(
            args
                ?.delegationDirective ||
            ""
        ).trim();
    const source =
        String(
            instruction ||
            ""
        );
    return (
        directive.length >
            0 &&
        source.includes(
            directive
        )
    );
}

function hasRequiredToolArguments(tool = {}, args = {}) {
    if (!args || typeof args !== "object" || Array.isArray(args)) return false;
    const required = Array.isArray(tool?.inputSchema?.required)
        ? tool.inputSchema.required
        : [];

    return required.every(name => {
        if (!Object.prototype.hasOwnProperty.call(args, name)) return false;
        const value = args[name];
        const fieldSchema =
            tool?.inputSchema
                ?.properties
                ?.[name] ||
            {};
        return schemaValueIsExecutable(
            value,
            fieldSchema
        );
    });
}

function schemaValueIsExecutable(
    value,
    schema = {}
) {
    if (value == null) {
        return false;
    }
    const type =
        String(schema?.type || "")
            .trim()
            .toLowerCase();
    if (
        type ===
            "string" ||
        (
            !type &&
            typeof value ===
                "string"
        )
    ) {
        return (
            typeof value ===
                "string" &&
            value.trim().length >
                0
        );
    }
    if (
        type ===
            "array" ||
        (
            !type &&
            Array.isArray(value)
        )
    ) {
        if (!Array.isArray(value)) {
            return false;
        }
        const minimum =
            Math.max(
                1,
                Number(
                    schema?.minItems
                ) ||
                0
            );
        if (
            value.length <
            minimum
        ) {
            return false;
        }
        return value.every(item =>
            schemaValueIsExecutable(
                item,
                schema?.items ||
                {}
            )
        );
    }
    if (
        type ===
            "object" ||
        (
            !type &&
            typeof value ===
                "object" &&
            !Array.isArray(value)
        )
    ) {
        if (
            typeof value !==
                "object" ||
            Array.isArray(value) ||
            Object.keys(value)
                .length ===
                0
        ) {
            return false;
        }
        const required =
            Array.isArray(
                schema?.required
            )
                ? schema.required
                : [];
        return required.every(name =>
            Object.prototype
                .hasOwnProperty
                .call(
                    value,
                    name
                ) &&
            schemaValueIsExecutable(
                value[name],
                schema
                    ?.properties
                    ?.[name] ||
                {}
            )
        );
    }
    if (
        type ===
            "number" ||
        type ===
            "integer"
    ) {
        return Number.isFinite(
            Number(value)
        );
    }
    if (type === "boolean") {
        return (
            typeof value ===
            "boolean"
        );
    }
    return true;
}

function attachPlanMetadata(calls = [], plan = {}) {
    Object.defineProperties(calls, {
        missionComplete: {
            value: plan?.missionComplete === true,
            enumerable: false
        },
        completionAssessment: {
            value: plan?.completionAssessment || null,
            enumerable: false
        },
        responseFormat: {
            value:
                String(
                    plan?.responseFormat ||
                    "human"
                ).trim().toLowerCase(),
            enumerable: false
        }
    });
    return calls;
}

async function callSemanticPlanner(input = "", catalog = [], missionState = null) {
    const user = globalThis?.auth?.currentUser || globalThis?.window?.auth?.currentUser || null;
    if (!user) {
        throw new Error("SEMANTIC_PLANNER_AUTH_REQUIRED");
    }

    const token =
        await user.getIdToken();

    const controller =
        new AbortController();

    const timeoutMs =
        [
            "MISSION_CONTRACT",
            "COMPLETION_AUDIT",
            "GROUNDED_ARGUMENT_COMPLETION"
        ].includes(String(missionState?.phase || ""))
            ? CLOUD_MISSION_CONTRACT_TIMEOUT_MS
            : 30000;

    const timer =
        setTimeout(
            () =>
                controller.abort(),
            timeoutMs
        );

    try {
        const response = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ data: { input, catalog, missionState } }),
            signal: controller.signal
        });
        const text = await response.text();
        let payload;

        try {
            payload = JSON.parse(text);
        } catch {
            throw new Error(`SEMANTIC_PLANNER_INVALID_RESPONSE_${response.status}`);
        }

        const result = payload?.result || payload?.data;
        if (!response.ok || !result?.ok) {
            throw new Error(
                payload?.error?.message ||
                result?.error ||
                `SEMANTIC_PLANNER_HTTP_${response.status}`
            );
        }

        return result;
    }
    catch(error) {
        if (
            controller.signal.aborted
        ) {
            throw new Error(
                `SEMANTIC_PLANNER_TIMEOUT_${timeoutMs}`
            );
        }

        throw error;
    }
    finally {
        clearTimeout(
            timer
        );
    }
}

function planCacheKey(input = "", catalog = [], missionState = null) {
    return JSON.stringify({
        input,
        missionState,
        tools: catalog.map(tool => ({
            name: tool.name,
            mutates: tool.mutates,
            requiresApproval: tool.requiresApproval
        }))
    });
}

async function resolveSemanticPlan(input = "", catalog = [], semanticPlanner = null, missionState = null) {
    const key = planCacheKey(input, catalog, missionState);
    const cached = planCache.get(key);

    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
        return cached.plan;
    }

    if (pendingPlans.has(key)) {
        return pendingPlans.get(key);
    }

    const request = Promise.resolve()
        .then(() => typeof semanticPlanner === "function"
            ? semanticPlanner({ input, catalog, missionState })
            : callSemanticPlanner(input, catalog, missionState))
        .then(plan => {
            planCache.set(key, { plan, savedAt: Date.now() });
            return plan;
        })
        .finally(() => pendingPlans.delete(key));

    pendingPlans.set(key, request);
    return request;
}

function boundedEvidenceSources(value = []) {
    return (Array.isArray(value) ? value : [])
        .filter(source => source && typeof source === "object")
        .slice(0, 12)
        .map(source => ({
            title: String(source.title || "").slice(0, 180),
            url: String(source.url || "").slice(0, 700),
            snippet: String(source.snippet || source.summary || "").slice(0, 700)
        }));
}

function filterSemanticArguments(args = {}, inputSchema = null) {
    if (!args || typeof args !== "object" || Array.isArray(args)) return {};
    const properties =
        inputSchema?.type === "object" && inputSchema?.properties
            ? inputSchema.properties
            : inputSchema && typeof inputSchema === "object"
                ? inputSchema
                : null;
    if (!properties || Array.isArray(properties)) return { ...args };
    const allowed = new Set(Object.keys(properties));
    return Object.fromEntries(
        Object.entries(args).filter(([key]) => allowed.has(key))
    );
}

export async function completeJarvisPlanningArguments({
    toolName = "",
    description = "",
    inputSchema = null,
    instruction = "",
    currentArgs = {},
    validSources = [],
    missionEvidence = [],
    semanticPlanner = null
} = {}) {
    const name = String(toolName || "").trim();
    const originalInstruction = String(instruction || "").trim();
    const sources = boundedEvidenceSources(validSources);
    if (!name || !originalInstruction) {
        throw new Error("SEMANTIC_ARGUMENT_CONTEXT_REQUIRED");
    }

    const catalog = [{
        name,
        description: [
            String(description || "").trim(),
            "Devuelve argumentos completos para un entregable read-only y específico.",
            "Usa exclusivamente la instrucción original y las fuentes verificadas incluidas.",
            "No inventes hechos, resultados, testimonios ni publicaciones."
        ].filter(Boolean).join(" ").slice(0, 500),
        mutates: false,
        requiresApproval: false,
        inputSchema
    }];
    const briefingInstruction = [
        `Prepara solamente los argumentos ejecutables para ${name}.`,
        "Completa los campos semánticos que puedan derivarse de la orden y la evidencia.",
        "Los mensajes de campaña, problemas, promesas y diferenciadores son propuestas estratégicas; no los presentes como hechos verificados.",
        "Para landing, imagen y reel entrega una especificación concreta y sustentada, sin crear archivos, generar medios, publicar ni desplegar.",
        "Si se pide un reel, la suma de la duración de escenas debe coincidir exactamente con la duración total.",
        `INSTRUCCION_ORIGINAL=${originalInstruction.slice(0, 12000)}`,
        `ARGUMENTOS_EXISTENTES=${JSON.stringify(currentArgs || {}).slice(0, 6000)}`,
        `FUENTES_VERIFICADAS=${JSON.stringify(sources).slice(0, 12000)}`,
        `EVIDENCIA_CANONICA_DE_MISION=${JSON.stringify(Array.isArray(missionEvidence) ? missionEvidence : []).slice(0, 20000)}`,
        "La evidencia canónica manda sobre memoria, borradores y propuestas. No inventes teléfonos, direcciones, fechas, certificaciones, métricas, URLs, testimonios ni resultados. Si un dato no aparece en la evidencia o en la solicitud actual, debe quedar como propuesta explícita, nunca como hecho.",
        `ESQUEMA_DE_ARGUMENTOS=${JSON.stringify(inputSchema || {}).slice(0, 12000)}`
    ].join("\n");

    const plan = await resolveSemanticPlan(
        briefingInstruction,
        catalog,
        semanticPlanner,
        {
            phase: "GROUNDED_ARGUMENT_COMPLETION",
            toolName: name,
            sourceCount: sources.length,
            writeAllowed: false
        }
    );

    const call = trustedPlanCalls(plan, catalog, {})[0] || null;
    const args = filterSemanticArguments(call?.args || {}, inputSchema);
    if (Object.keys(args).length === 0) {
        throw new Error("SEMANTIC_ARGUMENTS_REQUIRED");
    }

    return {
        ok: true,
        status: "GROUNDED_ARGUMENTS_READY",
        toolName: name,
        args,
        provider: plan?.provider || "semantic_planner",
        model: plan?.model || null,
        sourceCount: sources.length
    };
}

export function mergeJarvisToolCalls(...groups) {
    const merged = [];
    const seen = new Set();
    const seenMissionDedupeKeys =
        new Set();

    for (const call of groups.flat()) {
        if (!call?.name) continue;
        if (
            call.missionDedupeKey &&
            seenMissionDedupeKeys.has(
                call.missionDedupeKey
            )
        ) {
            continue;
        }
        const key = `${call.name}:${JSON.stringify(call.args || call.arguments || {})}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (call.missionDedupeKey) {
            seenMissionDedupeKeys.add(
                call.missionDedupeKey
            );
        }
        merged.push(call);
    }

    return merged.slice(0, 12);
}

export function isJarvisTechnicalDiagnosticRequest(planOrCalls = []) {
    const calls = Array.isArray(planOrCalls)
        ? planOrCalls
        : Array.isArray(planOrCalls?.toolCalls)
            ? planOrCalls.toolCalls
            : [];

    return calls.some(call =>
        String(call?.name || "").startsWith("repo.") &&
        call?.name !== "repo.gitStatus" &&
        call?.name !== "repo.gitDiff"
    );
}

export function isJarvisCapabilityForensicsRequest(planOrCalls = []) {
    const calls = Array.isArray(planOrCalls)
        ? planOrCalls
        : Array.isArray(planOrCalls?.toolCalls)
            ? planOrCalls.toolCalls
            : [];
    return calls.some(call => call?.name === "system.forensics");
}

export async function buildJarvisMultifunctionToolCalls(input = "", context = {}) {
    const instruction = String(input || "").trim();
    if (!instruction) return [];

    const catalog = runtimeCatalog(context);
    if (catalog.length === 0) {
        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: false,
            status: "TOOL_CATALOG_REQUIRED",
            checkedAt: new Date().toISOString()
        };
        return [];
    }

    const explicitPlan =
        extractExplicitGovernedToolPlan(
            instruction,
            catalog,
            context.missionState ||
            null
        );

    if (explicitPlan) {
        const explicitCalls =
            trustedPlanCalls(
                explicitPlan,
                catalog,
                {
                    ...context,
                    originalInstruction:
                        instruction
                }
            );

        globalThis
            .__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
                ok:
                    true,
                status:
                    explicitPlan.status,
                provider:
                    explicitPlan.provider,
                model:
                    null,
                toolCount:
                    explicitCalls.length,
                toolNames:
                    explicitCalls.map(
                        call =>
                            call.name
                    ),
                deterministic:
                    true,
                checkedAt:
                    new Date()
                        .toISOString()
            };

        return attachPlanMetadata(
            explicitCalls,
            explicitPlan
        );
    }

    try {
        const contractPlanner = context.semanticPlanner;
        const plan = await resolveSemanticPlan(
            instruction,
            catalog,
            contractPlanner,
            context.missionState || null
        );
        const calls = trustedPlanCalls(
            plan,
            catalog,
            {
                ...context,
                originalInstruction:
                    instruction
            }
        );

        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: plan?.ok === true,
            status: plan?.status || "SEMANTIC_PLAN_READY",
            provider: plan?.provider || "injected",
            model: plan?.model || null,
            toolCount: calls.length,
            checkedAt: new Date().toISOString()
        };

        return attachPlanMetadata(calls, plan);
    } catch (error) {
        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: false,
            status: "SEMANTIC_PLANNER_UNAVAILABLE",
            error: error?.message || String(error),
            checkedAt: new Date().toISOString()
        };
        if (context.throwOnUnavailable === true) throw error;
        return [];
    }
}

export function describeJarvisMultifunctionPlanner() {
    return {
        ok: true,
        version: VERSION,
        maximumToolCalls: 12,
        architecture: "model_selected_runtime_catalog",
        mutates: false,
        failMode: "closed",
        approvalSource: "trusted_runtime_context"
    };
}

export const __test = {
    GENERALIST_CURRENT_TURN_POLICY,
    runtimeCatalog,
    trustedPlanCalls,
    enforceMissionIsolation,
    hasRequiredToolArguments,
    planCacheKey,
    extractJsonObject,
    extractExplicitGovernedToolPlan,
    extractGroundedAttachments,
    instructionBeforeAttachmentManifest,
    normalizeAttachmentAnalysisRouteCandidates,
    imageVariantIdentity,
    normalizeGroundedImageReferenceCandidates,
    explicitHttpSourceUrls,
    sourceAnchorDescriptor,
    verifiedResearchSourceUrls,
    normalizeExplicitSourceCandidates,
    normalizedMissionFidelityTerms,
    researchQueryPreservesMissionIdentity,
    normalizeResearchMissionFidelity
};
