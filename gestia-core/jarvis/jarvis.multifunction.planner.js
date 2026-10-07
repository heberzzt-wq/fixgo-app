import { semanticPlanBudgetMs } from "./jarvis.semantic.transport.js";
import { advertisingContacts, validateAdvertisingDirection } from "./jarvis.advertising.benchmark.js";
import { documentEvidenceEnvelope, documentExcerpt } from "./jarvis.document.context.js";
import { materialReferencesForPlanning } from "./jarvis.mission.planner-state.js?v=v142-material-handoff-20261002";
import {
    rejectCorruptedIdentityArgs
} from "./jarvis.identity.integrity.js?v=v142-adjunto-flow-alignment-20261001";

const VERSION = "4.22.0-v142-local-only-single-jarvis";
const LOCAL_SEMANTIC_ROUTE = "/semantic/plan";
const CACHE_TTL_MS = 30000;
const planCache = new Map();
const pendingPlans = new Map();
const CONTRACT_SCOPE_FIELDS = ["contractStages", "contractKinds", "dependencies", "dependsOn", "requiredToolNames"];

// CURRENT_TURN already selected this operation. Capability metadata, never
// wording or retrieval rank, determines whether another contract is needed.
export function isBoundedReadOnlyMission(calls = [], catalog = []) {
    if (calls.length !== 1) return false;
    const call = calls[0];
    // This is a model-selected planning scope, never write authorization.
    // A repair starts with measurement but must retain repository discovery.
    if (call?.name === "browser.inspect" && call.args?.followUp === "prepare_repair") return false;
    const tool = catalog.find(item => item.name === call?.name);
    if (!tool || tool.mutates !== false || tool.userArtifact === true ||
        tool.requiresApproval === true || call.approved === true ||
        call.deferred === true || call.name === "conversation.respond") return false;
    const declaresContract = source => [...CONTRACT_SCOPE_FIELDS, "obligationId"].some(key => {
        const value = source?.[key];
        return Array.isArray(value) ? value.length > 0 : Boolean(value);
    });
    return ![calls, tool, call, call.args].some(declaresContract);
}

const LOCAL_MISSION_CONTRACT_TIMEOUT_MS =
    90000;

const GENERALIST_CURRENT_TURN_POLICY = [
    "Interpreta libremente la instruccion actual del usuario; no clasifiques por palabras clave ni por tablas de intencion.",
    "La instruccion actual es la autoridad semantica primaria. Usa historial, memoria, adjuntos y observaciones solo como contexto verificable.",
    "El catalogo runtime y los schemas de sus herramientas son la unica fuente de verdad sobre capacidades, argumentos y restricciones operativas.",
    "Selecciona solamente las herramientas necesarias para satisfacer los objetivos explicitos; no inventes herramientas, rutas, archivos, hechos, resultados ni evidencia.",
    "Para revisar varios tamaños usa browser.inspect con viewports explicitos. Si se solicita tambien corregir, selecciona followUp=prepare_repair: mide primero, localiza y lee la fuente antes de preparar un reemplazo exacto con repo.prepareWrite. Esa seleccion no autoriza escritura ni publicacion. Si solo se solicita analizar, usa followUp=diagnose.",
    "Conserva negaciones, identidades, entidades, adjuntos y objetivos independientes tal como fueron expresados. No arrastres tareas anteriores sin continuidad inequivoca.",
    "Las decisiones de seguridad, permisos, aprobacion, escritura, publicacion y ejecucion pertenecen al runtime determinista; nunca las concedas por lenguaje del usuario.",
    "Cuando exista estado de mision, usa las observaciones reales para decidir el siguiente paso y no repitas trabajo ya satisfecho con la misma evidencia.",
    "Si la solicitud no necesita herramientas, responde conversacionalmente mediante la capacidad disponible en el catalogo; no fabriques trabajo operativo."
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
            name !== "web.media.collect" &&
            name !== "marketing.package.real-media"
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
                            (String(args.allowedDomain || "").includes(".") ? args.allowedDomain : "") ||
                            anchor.host ||
                            ""
                        )
                },
                reason:
                    candidate?.reason ||
                    "SEMANTIC_RESEARCH_EXPLICIT_SOURCE_ANCHORED"
            };
        }

        if (
            name ===
            "marketing.package.real-media"
        ) {
            return {
                ...candidate,
                args: {
                    ...args,
                    sourceUrl:
                        anchor.url
                },
                reason:
                    candidate?.reason ||
                    "SEMANTIC_PACKAGE_EXPLICIT_SOURCE_ANCHORED"
            };
        }

        return {
            ...candidate,
            args: {
                ...args,
                url:
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
            contractStages: tool.contractStages || null,
            contractKinds: tool.contractKinds || null,
            evidenceKinds: Array.isArray(tool.evidenceKinds) ? [...tool.evidenceKinds] : null,
            investigationReadOnly: tool.investigationReadOnly === true,
            requiresEvidence: Array.isArray(tool.requiresEvidence) ? structuredClone(tool.requiresEvidence) : null,
            mutates: tool.mutates === true,
            requiresApproval: tool.requiresApproval === true,
            userArtifact: tool.userArtifact === true,
            semanticArgumentCompletion:
                tool.semanticArgumentCompletion === true,
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

        const originalInstruction =
            String(
                context?.originalInstruction ||
                ""
            ).trim();
        const inputSchema =
            tool?.inputSchema &&
            typeof tool.inputSchema === "object" &&
            !Array.isArray(tool.inputSchema)
                ? tool.inputSchema
                : {};
        const schemaProperties =
            inputSchema?.properties &&
            typeof inputSchema.properties === "object"
                ? inputSchema.properties
                : inputSchema;
        const literalSeedField =
            [
                "instruction",
                "prompt",
                "query",
                "objective"
            ].find(name =>
                Object.prototype.hasOwnProperty.call(
                    schemaProperties || {},
                    name
                )
            ) || "";
        const shouldPreserveLiteralInstruction =
            Boolean(literalSeedField) &&
            (
                literalSeedField === "instruction" ||
                tool?.semanticArgumentCompletion === true
            );

        if (
            shouldPreserveLiteralInstruction &&
            originalInstruction
        ) {
            const turns =
                Array.isArray(
                    context?.missionState
                        ?.advisorySemanticContext
                        ?.turns
                )
                    ? context.missionState
                        .advisorySemanticContext
                        .turns
                    : [];
            const priorTurns =
                turns.filter(turn =>
                    String(turn?.content || "").trim() &&
                    !(
                        String(turn?.role || "").trim() === "user" &&
                        String(turn?.content || "").trim() === originalInstruction
                    )
                );
            const lastAssistantIndex =
                [...priorTurns]
                    .map((turn, index) => ({
                        index,
                        role:
                            String(
                                turn?.role ||
                                ""
                            ).trim(),
                        content:
                            String(
                                turn?.content ||
                                ""
                            ).trim()
                    }))
                    .reverse()
                    .find(item =>
                        item.role ===
                            "assistant" &&
                        item.content.endsWith("?")
                    )
                    ?.index;
            let pendingUserInstruction =
                "";
            if (
                Number.isInteger(
                    lastAssistantIndex
                )
            ) {
                for (
                    let index =
                        lastAssistantIndex - 1;
                    index >= 0;
                    index -= 1
                ) {
                    const turn =
                        priorTurns[index];
                    if (
                        String(
                            turn?.role ||
                            ""
                        ).trim() ===
                        "user"
                    ) {
                        pendingUserInstruction =
                            String(
                                turn?.content ||
                                ""
                            ).trim();
                        break;
                    }
                }
            }

            args[literalSeedField] =
                pendingUserInstruction
                    ? [
                        pendingUserInstruction,
                        originalInstruction
                    ].join("\n\n")
                    : originalInstruction;

            if (
                missionPhase === "CURRENT_TURN" &&
                tool?.semanticArgumentCompletion === true
            ) {
                args = {
                    [literalSeedField]:
                        args[literalSeedField]
                };
            }
        }

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
        const deferredObligation = candidate?.deferred === true ? String(candidate.obligationId || "").slice(0, 300) : "";
        const signature =
            `${tool.name}:${JSON.stringify(args)}:${deferredObligation}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        const dedupeKey = deferredObligation ? "" :
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
        const semanticArgumentCompletion =
            tool?.semanticArgumentCompletion === true;
        if (
            !argumentsComplete &&
            !allowDeferred &&
            !semanticArgumentCompletion
        ) {
            continue;
        }

        calls.push({
            name: tool.name,
            args,
            reason: String(candidate?.reason || "MODEL_SEMANTIC_TOOL_SELECTION").slice(0, 240),
            mutates: tool.mutates,
            approved: tool.mutates === true && context.approved === true,
            // Preserve declared scope so a CURRENT_TURN call with dependencies
            // cannot be mistaken for a self-contained read after normalization.
            ...Object.fromEntries(CONTRACT_SCOPE_FIELDS
                .filter(key => candidate?.[key] !== undefined)
                .map(key => [key, candidate[key]])),
            ...(deferredObligation ? { obligationId: deferredObligation } : {}),
            ...(dedupeKey ? { missionDedupeKey: dedupeKey } : {}),
            ...(
                argumentsComplete && candidate?.deferred !== true
                    ? {}
                    : {
                        deferred:
                            true
                    }
            )
        });
    }

    const isolatedCalls = enforceMissionIsolation(
        calls,
        allowed
    );
    const videoCalls = isolatedCalls.filter(call => call?.name === "video.generate");
    if (videoCalls.length <= 1) {
        return isolatedCalls;
    }
    const videoTool = allowed.get("video.generate");
    const firstVideoIndex = isolatedCalls.findIndex(call => call?.name === "video.generate");
    const scenePrompts = videoCalls.flatMap(call => {
        const args = call?.args || {};
        const declaredScenes = Array.isArray(args.scenes) ? args.scenes : [];
        if (declaredScenes.length > 0) {
            return declaredScenes.map(scene =>
                typeof scene === "string"
                    ? scene.trim()
                    : String(scene?.prompt || scene?.visual || scene?.description || "").trim()
            );
        }
        return [String(args.prompt || args.script || "").trim()];
    }).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index);
    const firstVideo = videoCalls[0];
    const combinedArgs = {
        ...(firstVideo?.args || {}),
        script: String(firstVideo?.args?.script || context?.originalInstruction || firstVideo?.args?.prompt || "").trim(),
        scenes: scenePrompts.map(prompt => ({ prompt }))
    };
    const combinedVideo = {
        ...firstVideo,
        args: combinedArgs,
        reason: "SEMANTIC_MINIDRAMA_SCENES_CONSOLIDATED",
        ...(videoTool ? { missionDedupeKey: missionDedupeKey(videoTool, combinedArgs) } : {})
    };
    const consolidated = isolatedCalls.filter(call => call?.name !== "video.generate");
    consolidated.splice(Math.max(0, firstVideoIndex), 0, combinedVideo);
    return consolidated;
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
        target.toLowerCase().startsWith("http://") ||
        target.toLowerCase().startsWith("https://") ||
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
        ...Object.fromEntries(CONTRACT_SCOPE_FIELDS
            .filter(key => plan?.[key] !== undefined)
            .map(key => [key, { value: plan[key], enumerable: false }])),
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
        },
        planKind: {
            value:
                String(
                    plan?.planKind ||
                    ""
                ).trim(),
            enumerable: false
        }
    });
    return calls;
}

async function callSemanticPlanner(input = "", catalog = [], missionState = null) {
    const timeoutMs = semanticPlanBudgetMs({ input, missionState, timeoutMs:
        [
            "MISSION_CONTRACT",
            "COMPLETION_AUDIT",
            "GROUNDED_ARGUMENT_COMPLETION"
        ].includes(String(missionState?.phase || ""))
            ? LOCAL_MISSION_CONTRACT_TIMEOUT_MS
            : 60000 });

    const bridge =
        globalThis?.JarvisLocalBridge ||
        globalThis?.window?.JarvisLocalBridge ||
        null;

    if (typeof bridge?.requestJson !== "function") {
        const failure = new Error("LOCAL_SEMANTIC_BRIDGE_REQUIRED");
        failure.code = "LOCAL_SEMANTIC_BRIDGE_REQUIRED";
        throw failure;
    }

    const localResult = await bridge.requestJson(
        LOCAL_SEMANTIC_ROUTE,
        {
            input,
            catalog,
            missionState: {
                ...(missionState && typeof missionState === "object" ? missionState : {}),
                generalistCurrentTurnPolicy: GENERALIST_CURRENT_TURN_POLICY
            },
            timeoutMs
        },
        {
            timeoutMs:
                timeoutMs + 10000
        }
    );

    globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
        ...localResult,
        checkedAt: new Date().toISOString(),
        semanticAuthority: "jarvisSemanticPlan",
        localOnly: true,
        alternateBrains: 0
    };

    if (
        localResult?.ok !== true ||
        localResult?.localSemanticInferenceUsed !== true ||
        localResult?.cloudSemanticInferenceUsed === true ||
        localResult?.externalApiUsed === true
    ) {
        const failure = new Error(
            localResult?.error ||
            localResult?.status ||
            "LOCAL_SEMANTIC_PLAN_REQUIRED"
        );
        failure.code = "LOCAL_SEMANTIC_PLAN_REQUIRED";
        if (localResult?.evidence) failure.evidence = localResult.evidence;
        throw failure;
    }

    return localResult;
}

function planCacheKey(input = "", catalog = [], missionState = null) {
    return JSON.stringify({
        input,
        missionState,
        tools: catalog.map(tool => ({
            name: tool.name,
            mutates: tool.mutates,
            requiresApproval: tool.requiresApproval,
            investigationReadOnly: tool.investigationReadOnly === true,
            requiresEvidence: tool.requiresEvidence || null,
            evidenceKinds: tool.evidenceKinds || null,
            inputSchema: tool.inputSchema || null,
            userArtifact: tool.userArtifact === true
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
            const currentTurn =
                String(missionState?.phase || "") === "CURRENT_TURN";
            const hasExecutableToolCalls =
                Array.isArray(plan?.toolCalls) &&
                plan.toolCalls.some(call =>
                    call &&
                    typeof call.name === "string" &&
                    call.name.trim()
                );
            const executablePlan =
                hasExecutableToolCalls ||
                (plan?.missionComplete === true && !currentTurn);
            if (executablePlan) {
                planCache.set(key, { plan, savedAt: Date.now() });
            }
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

export function shouldCompleteJarvisPlanningArguments(call = {}, tool = {}, completedTasks = []) {
    // This capability owns its grounded semantic completion. Running the generic
    // completion first both duplicates inference and pre-fills unverified claims.
    if (tool.semanticArgumentCompletion === true) return false;
    if (call.deferred === true) return true;
    // A validated read already has its executable path. Earlier observations
    // alone do not make that argument incomplete or authorize changing it.
    if (call.name === "repo.read" && tool.name === "repo.read" && tool.mutates !== true &&
        typeof call.args?.file === "string" && call.args.file.trim() &&
        hasRequiredToolArguments(tool, call.args || {})) return false;
    // An exact replacement already selected against this turn's source must
    // not be reauthored by generic argument completion. Preparation still
    // validates current bytes, and grants neither authorization nor writing.
    if (call.name === "repo.prepareWrite" && tool.name === call.name && tool.mutates !== true &&
        hasRequiredToolArguments(tool, call.args || {}) && typeof call.args?.search === "string" && call.args.search &&
        Array.isArray(completedTasks) && completedTasks.some(task => {
            const read = task?.observation?.verifiedRead;
            return task?.name === "repo.read" && task.observation?.ok === true && read?.file === call.args.file &&
                typeof read.content === "string" && read.content.split(call.args.search).length - 1 === call.args.matchCount && call.args.matchCount === 1;
        })) return false;
    return Array.isArray(completedTasks) && completedTasks.length > 0;
}

export function bindVerifiedMaterialArguments(inputSchema, instruction, sources = [], missionEvidence = []) {
    if (!inputSchema?.properties) return inputSchema;
    const schema = structuredClone(inputSchema);
    const references = missionEvidence.flatMap(item => materialReferencesForPlanning(item));
    const roles = {
        sourceOutput: ["input", "produced_artifact"],
        brandLogoOutput: ["official_logo_source"],
        logoOutput: ["official_logo_source"],
        audioOutput: ["audio"]
    };
    for (const [field, allowedRoles] of Object.entries(roles)) {
        const values = [...new Set(references.filter(ref => allowedRoles.includes(ref.role)).map(ref => ref.ref).filter(Boolean))];
        if (schema.properties[field]?.type === "string" && values.length) schema.properties[field].enum = values;
    }
    const benchmarkUrls = [...new Set(missionEvidence.filter(item => item.tool === "advertising.research")
        .flatMap(item => item.evidence?.sources || item.sources || []).map(source => source.url).filter(Boolean))];
    const benchmarkReferences = schema.properties.creativeDirection?.properties?.references;
    if (benchmarkReferences?.items?.type === "string" && benchmarkUrls.length) {
        benchmarkReferences.items.enum = benchmarkUrls;
        benchmarkReferences.uniqueItems = true;
        if (benchmarkUrls.length >= 2) {
            schema.required = [...new Set([...(schema.required || []), "creativeDirection",
                ...(schema.properties.composition ? ["composition"] : []),
                ...(schema.properties.brandLogoOutput?.enum?.length ? ["brandLogoOutput"] : [])])];
        }
    }
    const libraryActions = schema.properties.action?.enum;
    if (Array.isArray(libraryActions) && ["list", "import", "export"].every(action => libraryActions.includes(action)) &&
        schema.properties.output && schema.properties.relativePath) {
        const produced = [...new Set([
            ...references.filter(ref => ref.role === "produced_artifact").map(ref => ref.ref),
            ...missionEvidence.flatMap(item => [item.evidence, item.evidence?.artifact, item.artifact])
                .filter(item => item?.physicallyWritten === true && item.bytes > 0 && item.sha256).map(item => item.output)
        ].filter(ref => typeof ref === "string" && ref.startsWith(".jarvis-artifacts/")))];
        if (produced.length) schema.properties.output.enum = produced;
        schema.anyOf = [
            {properties:{action:{const:"list"}},required:["action"]},
            {properties:{action:{const:"import"}},required:["action","relativePath"]},
            {properties:{action:{const:"export"}},required:["action","output"]}
        ];
    }
    const sourceRefs = schema.properties.sourceOutput?.enum;
    const layout = schema.properties.composition?.properties?.layout;
    const history = missionEvidence.flatMap(item => item.evidence?.advertisingHistory || item.advertisingHistory || []);
    if (Array.isArray(sourceRefs) && Array.isArray(layout?.enum) && history.some(item => item.visual)) {
        const choices = sourceRefs.map(ref => ({ref,layouts:layout.enum.filter(value =>
            !history.some(item => item.visual?.sourceRef === ref && item.visual.layout === value))})).filter(choice => choice.layouts.length);
        if (!choices.length) throw new Error("SEMANTIC_ADVERTISING_ORIGINAL_COMBINATIONS_EXHAUSTED: Los originales y layouts disponibles ya fueron entregados; se requiere material o diseños adicionales.");
        schema.properties.sourceOutput.enum = choices.map(choice => choice.ref);
        schema.properties.composition.required = [...new Set([...(schema.properties.composition.required || []), "layout"])];
        const commonLayouts = layout.enum.filter(value => choices.every(choice => choice.layouts.includes(value)));
        if (commonLayouts.length) layout.enum = commonLayouts;
        else schema.anyOf = choices.map(choice => ({properties:{
            sourceOutput:{const:choice.ref},composition:{properties:{layout:{enum:choice.layouts}},required:["layout"]}
        },required:["sourceOutput","composition"]}));
    }
    const contact = schema.properties.composition?.properties?.contact;
    if (contact?.type === "string") {
        const officialContacts=references.flatMap(ref=>ref.verifiedContacts || []);
        const facts = officialContacts.length ? officialContacts.join("\n") : `${instruction}\n${documentEvidenceEnvelope(sources, 2500)}`;
        const contacts = [...new Set(advertisingContacts(facts))];
        if (contacts.length) contact.enum = contacts;
    }
    return schema;
}

export function validateVerifiedMaterialComposition(args, missionEvidence = [], verifiedContactFacts = "") {
    if (!args.composition) return;
    if (![args.composition.headline,args.composition.body].every(value=>typeof value==="string" && value.trim())) throw new Error("SEMANTIC_COMPOSITION_TEXT_REQUIRED");
    const officialContacts=missionEvidence.flatMap(item=>materialReferencesForPlanning(item)).flatMap(ref=>ref.verifiedContacts || []);
    verifiedContactFacts = officialContacts.length ? officialContacts.join("\n") : verifiedContactFacts;
    if(verifiedContactFacts) {
        const extract = text => advertisingContacts(text, { canonical: true });
        const contacts=new Set(extract(verifiedContactFacts));
        if(extract([args.composition.headline,args.composition.body,args.composition.cta,args.composition.contact].join("\n")).some(value=>!contacts.has(value))) throw new Error("SEMANTIC_CONTACT_UNVERIFIED");
    }
    const references=missionEvidence.flatMap(item=>materialReferencesForPlanning(item));
    const source=references.find(ref=>ref.ref===args.sourceOutput);
    const region=source?.photoRegion, crop=args.composition.photoCrop;
    if(region && (!crop || ![crop.x,crop.y,crop.width,crop.height].every(Number.isFinite) || crop.width<=0 || crop.height<=0 || crop.x<region.x || crop.y<region.y || crop.x+crop.width>region.x+region.width || crop.y+crop.height>region.y+region.height)) {
        throw new Error(`SEMANTIC_PHOTO_REGION_UNVERIFIED: ${args.sourceOutput}; allowed=${JSON.stringify(region)}`);
    }
    const normalize=value=>String(value||"").replace(/(?:https?:\/\/|www\.)[^\s<>"']+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi," ").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
    const history=missionEvidence.flatMap(item=>item.evidence?.advertisingHistory || item.advertisingHistory || []);
    if(history.some(item=>item.visual?.sourceRef && item.visual.sourceRef===args.sourceOutput && item.visual.layout===(args.composition.layout || "split"))) {
        throw new Error("SEMANTIC_ADVERTISING_COMPOSITION_REPEATED: Elige otra fotografía oficial o un layout distinto; cambiar texto, color, recorte o tamaño no cambia esta composición ya entregada.");
    }
    if(history.some(item=>item.creative && (normalize(item.creative.headline)===normalize(args.composition.headline) || normalize(item.creative.body)===normalize(args.composition.body)))) {
        throw new Error("SEMANTIC_ADVERTISING_MESSAGE_REPEATED: Redacta otro titular y cuerpo; cambiar archivo, foto o tamaño no vuelve nuevo el mensaje.");
    }
}

export async function completeJarvisPlanningArguments({
    toolName = "",
    description = "",
    inputSchema = null,
    instruction = "",
    operation = "",
    currentArgs = {},
    validationFeedback = null,
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
        inputSchema: bindVerifiedMaterialArguments(inputSchema, originalInstruction, sources, missionEvidence)
    }];
    const briefingInstruction = [
        `INSTRUCCION_ORIGINAL=${originalInstruction}`,
        `OPERACION_ACTUAL_DEL_PLAN=${String(operation || "").slice(0, 500)}`,
        `ARGUMENTOS_EXISTENTES=${documentExcerpt(JSON.stringify(currentArgs || {}), 800)}`,
        ...(validationFeedback ? [`FALLO_OBSERVADO_DEL_INTENTO_ANTERIOR=${documentExcerpt(JSON.stringify(validationFeedback),1600)}`, "Corrige los argumentos responsables de ese error usando sólo la evidencia real. El fallo no concede nuevos permisos ni cambia el objetivo."] : []),
        `FUENTES_VERIFICADAS=${documentEvidenceEnvelope(sources, 2500)}`,
        `MATERIALES_VERIFICADOS=${JSON.stringify(missionEvidence.flatMap(item => materialReferencesForPlanning(item)))}`,
        `PUBLICIDAD_YA_ENTREGADA=${JSON.stringify(missionEvidence.flatMap(item => item.evidence?.advertisingHistory || item.advertisingHistory || []).filter(item => item.creative).slice(0, 30).map(item => ({createdAt:item.createdAt,visual:item.visual})))}`,
        "No repitas publicidad del historial, aunque sea otro día, conversación, nombre de archivo o formato. Redacta otro mensaje y enfoque publicitario y varía la composición. Conserva el logo original; reutilizar el logo no es repetir un anuncio.",
        `ARTEFACTOS_PRODUCIDOS=${JSON.stringify(missionEvidence.flatMap(item => materialReferencesForPlanning(item).filter(ref => ref.role === "produced_artifact").map(ref => ({ tool: item.tool, status: item.status, output: ref.ref, mimeType: ref.mimeType }))))}`,
        `EVIDENCIA_CANONICA_DE_MISION=${documentEvidenceEnvelope(missionEvidence.filter(item => !Array.isArray(item.evidence?.entries)).map(item => {
            const refs = materialReferencesForPlanning(item);
            return refs.length ? {tool:item.tool,status:item.status,summary:item.summary,evidence:{output:item.evidence?.output,outputs:refs}} : item;
        }), 2500)}`,
        "Las referencias library: son originales del inventario; sourceOutput, brandLogoOutput, assetOutput, logoOutput y audioOutput admiten esas referencias exactas y el runtime realiza la importación. Para composición nueva usa photoRegion como composition.photoCrop. No construyas nombres de archivo ni hashes. Para exportar usa el output del resultado producido, nunca una referencia de original.",
        "Completa los argumentos solamente de la operación actual del plan. Conserva las restricciones de la instrucción original. Las otras operaciones tienen llamadas separadas; no repitas una consulta cuando la operación actual pide exportar un resultado producido."
    ].join("\n");

    let plan, args, repairFeedback="", messageRepair=false;
    const validationFailures = new Set();
    const rejectedMessages = [];
    for(let attempt=0;attempt<3;attempt++) {
        const activeCatalog=messageRepair ? [{...catalog[0],description:"Redacta solamente los campos headline y body de un anuncio nuevo. No copies mensajes ya entregados ni añadas datos de contacto o hechos no aportados.",inputSchema:{type:"object",properties:{composition:{type:"object",properties:{headline:{type:"string",maxLength:140},body:{type:"string",maxLength:240}},required:["headline","body"],additionalProperties:false}},required:["composition"],additionalProperties:false}}] : catalog;
        const activeInstruction=messageRepair ? [
            `INSTRUCCION_ORIGINAL=${originalInstruction}`,
            `IDENTIDAD_Y_MATERIAL_OBSERVADOS=${JSON.stringify({brandName:args.composition?.brandName,materials:missionEvidence.flatMap(item=>materialReferencesForPlanning(item)).filter(ref=>ref.ref===args.sourceOutput).map(ref=>({description:ref.description}))})}`,
            `MENSAJES_YA_ENTREGADOS=${missionEvidence.flatMap(item=>item.evidence?.advertisingHistory || item.advertisingHistory || []).filter(item=>item.creative).length}`,
            `BORRADORES_RECHAZADOS_NO_REUTILIZAR=${rejectedMessages.length}`,
            "Redacta el cuerpo desde cero a partir de la identidad, la escena oficial observada y la solicitud. Los cuerpos anteriores se comparan fuera del modelo; no son material de referencia ni hechos de la marca.",
            "Los medios, logo, formato y contacto ya fueron seleccionados. En esta etapa sólo redactas un titular y cuerpo nuevos; el runtime conservará los demás argumentos observados. AMBOS campos deben cambiar: reutilizar el cuerpo anterior con otro titular también se rechaza."
        ].join("\n") : briefingInstruction;
        plan=await resolveSemanticPlan(activeInstruction+repairFeedback,activeCatalog,semanticPlanner,{
            phase:"GROUNDED_ARGUMENT_COMPLETION",toolName:name,
            creativeCopyRepair: messageRepair,
            currentOperation:messageRepair ? "Redacta un titular y un cuerpo NUEVOS para el anuncio solicitado, con otro enfoque que los mensajes ya entregados. Devuelve solamente composition.headline y composition.body." : String(operation||"").trim(),
            argumentValidationFeedback: repairFeedback || (validationFeedback ? JSON.stringify(validationFeedback) : ""),
            sourceCount:sources.length,writeAllowed:false
        });
        const call=trustedPlanCalls(plan,activeCatalog,{originalInstruction,missionState:{phase:"GROUNDED_ARGUMENT_COMPLETION"}})[0]||null;
        if(messageRepair) {
            const draft=call?.args?.composition;
            args={...args,composition:{...args.composition,headline:draft?.headline,body:draft?.body}};
        } else args=filterSemanticArguments(call?.args||{},inputSchema);
        // Source selection remains semantic. The safe photograph rectangle is
        // authoritative library metadata, not a coordinate to invent or infer.
        const photoRegion = missionEvidence.flatMap(item=>materialReferencesForPlanning(item))
            .find(ref=>ref.ref===args.sourceOutput)?.photoRegion;
        const proposedCrop = args.composition?.photoCrop;
        if (args.composition && photoRegion && (!proposedCrop ||
            ![proposedCrop.x,proposedCrop.y,proposedCrop.width,proposedCrop.height].every(Number.isFinite) ||
            proposedCrop.width<=0 || proposedCrop.height<=0 || proposedCrop.x<photoRegion.x || proposedCrop.y<photoRegion.y ||
            proposedCrop.x+proposedCrop.width>photoRegion.x+photoRegion.width || proposedCrop.y+proposedCrop.height>photoRegion.y+photoRegion.height)) {
            args={...args,composition:{...args.composition,photoCrop:{...photoRegion}}};
        }
        try {
            if(!Object.keys(args).length && (!inputSchema?.properties || inputSchema.required?.length)) throw new Error("SEMANTIC_ARGUMENTS_REQUIRED");
            if (name === "media.library" && args.action === "export" &&
                !missionEvidence.flatMap(item=>materialReferencesForPlanning(item))
                    .some(ref=>ref.role === "produced_artifact" && ref.ref === args.output)) {
                throw Object.assign(new Error("SEMANTIC_EXPORT_ARTIFACT_REQUIRED: No existe un archivo producido verificable para esta exportación."), {retryable:false});
            }
            validateVerifiedMaterialComposition(args,missionEvidence,`${originalInstruction}\n${documentEvidenceEnvelope(sources,2500)}`);
            if(inputSchema?.properties?.creativeDirection && (args.composition || name==="reel.create")) validateAdvertisingDirection(args.creativeDirection,missionEvidence);
            break;
        } catch(error) {
            const failure = String(error.message).split(":",1)[0];
            const repeatedMessage = failure === "SEMANTIC_ADVERTISING_MESSAGE_REPEATED";
            if(error.retryable===false || attempt===2 || (validationFailures.has(failure) && !repeatedMessage)) throw Object.assign(error,{retryable:false});
            if (repeatedMessage) rejectedMessages.push({headline:args.composition?.headline,body:args.composition?.body});
            validationFailures.add(failure);
            messageRepair=String(error.message).startsWith("SEMANTIC_ADVERTISING_MESSAGE_REPEATED");
            repairFeedback=`\nVALIDACION_INDEPENDIENTE_FALLIDA=${error.message}\n${messageRepair ? "" : `ARGUMENTOS_RECHAZADOS=${JSON.stringify(args)}\n`}Corrige sólo los argumentos fallidos. Conserva la misma herramienta, operación y permisos.`;
        }
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
        const key = `${call.name}:${JSON.stringify(call.args || call.arguments || {})}:${call.deferred === true ? call.obligationId || "" : ""}`;
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

    const currentPage = context.currentPage || context.state?.currentPage;
    if (currentPage) {
        context = { ...context, missionState: { ...context.missionState, currentPage } };
    }

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
        let activeMissionState =
            context.missionState || null;
        let plan = await resolveSemanticPlan(
            instruction,
            catalog,
            contractPlanner,
            activeMissionState
        );
        let calls = trustedPlanCalls(
            plan,
            catalog,
            {
                ...context,
                originalInstruction:
                    instruction
            }
        );
        const currentTurn =
            String(activeMissionState?.phase || "") === "CURRENT_TURN";

        if (
            currentTurn &&
            calls.length === 0 &&
            plan?.missionComplete === true &&
            catalog.some(tool => tool?.name === "conversation.respond")
        ) {
            calls = [{
                name: "conversation.respond",
                args: {
                    prompt: instruction
                },
                approved: false,
                reason: "SEMANTIC_CURRENT_TURN_COMPLETE"
            }];
        }

        if (
            currentTurn &&
            calls.length === 0 &&
            context.allowCurrentTurnDelegationOnEmpty === true &&
            plan?.missionComplete !== true
        ) {
            globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
                ok: plan?.ok === true,
                status: plan?.status || "SEMANTIC_PLAN_READY",
                provider: plan?.provider || "ollama-openai-compatible-local",
                model: plan?.model || null,
                toolCount: 0,
                semanticAuthority: "jarvisSemanticPlan",
                localOnly: true,
                alternateBrains: 0,
                delegatedToFullPlanner: true,
                localSemanticInferenceUsed: plan?.localSemanticInferenceUsed === true,
                cloudSemanticInferenceUsed: false,
                externalApiUsed: false,
                checkedAt: new Date().toISOString()
            };
            return attachPlanMetadata([], plan);
        }

        if (currentTurn && calls.length === 0) {
            planCache.delete(
                planCacheKey(
                    instruction,
                    catalog,
                    activeMissionState
                )
            );
            const previousToolNames =
                Array.isArray(plan?.toolCalls)
                    ? plan.toolCalls
                        .map(call => String(call?.name || "").trim())
                        .filter(Boolean)
                        .slice(0, 12)
                    : [];
            activeMissionState = {
                ...(activeMissionState || {}),
                phase: "CURRENT_TURN",
                currentTurnValidationFeedback: {
                    status:
                        plan?.missionComplete === true
                            ? "CURRENT_TURN_SILENT_COMPLETION_REJECTED"
                            : "CURRENT_TURN_PLAN_REJECTED_AFTER_CATALOG_VALIDATION",
                    previousToolNames,
                    previousMissionComplete:
                        plan?.missionComplete === true,
                    requirement:
                        "Reevalua el mismo turno con el mismo catalogo y contexto semantico. Devuelve una toolCall ejecutable con todos sus argumentos requeridos. Si el turno es solamente conversacional usa conversation.respond. Si el contexto semantico confirma una produccion activa, continua esa produccion. No cierres silenciosamente un CURRENT_TURN antes de ejecutar o responder."
                }
            };
            console.warn(
                "[CURRENT_TURN_SEMANTIC_SELF_REPAIR]",
                activeMissionState.currentTurnValidationFeedback
            );
            plan = await resolveSemanticPlan(
                instruction,
                catalog,
                contractPlanner,
                activeMissionState
            );
            calls = trustedPlanCalls(
                plan,
                catalog,
                {
                    ...context,
                    missionState:
                        activeMissionState,
                    originalInstruction:
                        instruction
                }
            );
        }

        if (currentTurn && calls.length === 0) {
            planCache.delete(
                planCacheKey(
                    instruction,
                    catalog,
                    activeMissionState
                )
            );
            throw new Error(
                "SEMANTIC_AUTHENTICATED_PROVIDER_SEMANTIC_PLAN_EMPTY"
            );
        }

        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: plan?.ok === true,
            status: plan?.status || "SEMANTIC_PLAN_READY",
            provider: plan?.provider || "ollama-openai-compatible-local",
            model: plan?.model || null,
            toolCount: calls.length,
            semanticAuthority: "jarvisSemanticPlan",
            localOnly: true,
            alternateBrains: 0,
            localSemanticInferenceUsed: plan?.localSemanticInferenceUsed === true,
            cloudSemanticInferenceUsed: false,
            externalApiUsed: false,
            checkedAt: new Date().toISOString()
        };

        return attachPlanMetadata(calls, plan);
    } catch (error) {
        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
            ok: false,
            status: "SEMANTIC_PLANNER_UNAVAILABLE",
            error: error?.message || String(error),
            semanticAuthority: "jarvisSemanticPlan",
            localOnly: true,
            alternateBrains: 0,
            cloudSemanticInferenceUsed: false,
            externalApiUsed: false,
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
    attachPlanMetadata,
    normalizedMissionFidelityTerms,
    researchQueryPreservesMissionIdentity,
    normalizeResearchMissionFidelity
};
