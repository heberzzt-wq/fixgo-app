from pathlib import Path
import json
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, value):
    (ROOT / path).write_text(value, encoding='utf-8')


def replace_once(value, old, new, label):
    count = value.count(old)
    if count != 1:
        raise SystemExit(f'{label}_COUNT:{count}')
    return value.replace(old, new, 1)


def regex_once(value, pattern, replacement, label, flags=re.S):
    updated, count = re.subn(pattern, replacement, value, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}_COUNT:{count}')
    return updated


OLD_RELEASE = 'v94-page-evidence-failclosed-v123-20260810'
NEW_RELEASE = 'v94-source-grounded-research-v124-20260810'

# -----------------------------------------------------------------------------
# 1) Semantic planner: explicit user URLs are source anchors, not new objectives.
# -----------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.multifunction.planner.js'
source = read(path)
source = replace_once(
    source,
    'const VERSION = "4.16.0-generalist-current-turn";',
    'const VERSION = "4.17.0-source-grounded-research-v124";',
    'PLANNER_VERSION'
)

helper = r'''
function explicitHttpSourceUrls(
    input = ""
) {
    const source =
        instructionBeforeAttachmentManifest(
            input
        );
    const matches =
        source.match(
            /https?:\/\/[^\s<>"'`]+/gi
        ) || [];
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

function normalizeExplicitSourceCandidates(
    candidates = [],
    catalog = [],
    context = {}
) {
    const sourceCandidates =
        Array.isArray(candidates)
            ? candidates
            : [];
    const anchors =
        explicitHttpSourceUrls(
            context?.originalInstruction ||
            ""
        );
    if (anchors.length === 0) {
        return sourceCandidates;
    }
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
        const args =
            candidateArgumentObject(candidate);
        const anchor =
            sourceAnchorForCandidate(
                args,
                anchors
            );
        if (!anchor) return candidate;

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

'''
source = replace_once(
    source,
    'function extractGroundedAttachments(\n',
    helper + 'function extractGroundedAttachments(\n',
    'PLANNER_SOURCE_HELPERS'
)

old_candidates = '''    const candidates =\n        normalizeGroundedImageReferenceCandidates(\n            Array.isArray(\n                plan?.toolCalls\n            )\n                ? plan.toolCalls\n                : [],\n            catalog,\n            context\n        );'''
new_candidates = '''    const candidates =\n        normalizeExplicitSourceCandidates(\n            normalizeGroundedImageReferenceCandidates(\n                Array.isArray(\n                    plan?.toolCalls\n                )\n                    ? plan.toolCalls\n                    : [],\n                catalog,\n                context\n            ),\n            catalog,\n            context\n        );'''
source = replace_once(source, old_candidates, new_candidates, 'PLANNER_CANDIDATE_PIPELINE')

source_anchor_rule = (
    '        "Una URL explicita proporcionada por el usuario es una FUENTE ANCLA del objetivo semantico al que acompana, no un objetivo independiente. '
    'Para web.research copia esa URL exacta en seedUrl, deriva allowedDomain de su host cuando corresponda, conserva exactEntity de la entidad nombrada y usa la misma researchGoal para validar la fuente y ampliar la investigacion. '
    'Investiga primero desde la fuente ancla y despues cruza otras fuentes; no empieces por homonimos no vinculados a las senales distintivas de esa fuente.",\n'
    '        "En web.media.collect usa una URL explicita del usuario como fuente directa. Marca requireImages o requireVideos=true solamente si esa familia de medios es un entregable obligatorio; una busqueda exploratoria u opcional de material no debe convertirse en requisito bloqueante.",\n'
)
mission_anchor = '        "Para web.research usa researchGoal=RESEARCH_1, RESEARCH_2, etc. segun el orden inmutable de objetivos de investigacion en la instruccion. Reutiliza la misma identidad al auditar el mismo objetivo y no dupliques llamadas para simples reformulaciones.",\n'
source = replace_once(
    source,
    mission_anchor,
    mission_anchor + source_anchor_rule + '        `FUENTES_EXPLICITAS_USUARIO=${JSON.stringify(explicitHttpSourceUrls(instruction))}`,\n',
    'MISSION_SOURCE_POLICY'
)
semantic_anchor = '        "Para web.research usa researchGoal=RESEARCH_1, RESEARCH_2, etc. segun el orden de objetivos independientes en la instruccion y reutiliza exactamente esa identidad para el mismo objetivo.",\n'
source = replace_once(
    source,
    semantic_anchor,
    semantic_anchor + source_anchor_rule + '        `FUENTES_EXPLICITAS_USUARIO=${JSON.stringify(explicitHttpSourceUrls(instruction))}`,\n',
    'SEMANTIC_SOURCE_POLICY'
)

source = replace_once(
    source,
    '    normalizeGroundedImageReferenceCandidates\n};',
    '    normalizeGroundedImageReferenceCandidates,\n    explicitHttpSourceUrls,\n    sourceAnchorDescriptor,\n    normalizeExplicitSourceCandidates\n};',
    'PLANNER_TEST_EXPORTS'
)
write(path, source)

# -----------------------------------------------------------------------------
# 2) Tool pack: web research keeps seed metadata and marketing production scope
#    is reconciled against executable mission tools.
# -----------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.multitool.pack.js'
source = read(path)
source = replace_once(
    source,
    'const VERSION = "1.51.0-test-outcome-evidence";',
    'const VERSION = "1.52.0-source-grounded-research-v124";',
    'TOOLPACK_VERSION'
)
source = replace_once(
    source,
    '    "image.edit": "image",\n    "reel.create": "reel"',
    '    "image.edit": "image",\n    "reel.create": "reel",\n    "marketing.package.real-media": "campaign_package"',
    'MARKETING_PRODUCTION_TYPES'
)

scope_replacement = '''export function resolveMarketingMissionProductionScope(\n    args = {},\n    context = {}\n) {\n    const current =\n        args && typeof args === "object" && !Array.isArray(args)\n            ? { ...args }\n            : {};\n    const requiredToolNames =\n        Array.isArray(context?.requiredToolNames)\n            ? context.requiredToolNames.map(String).filter(Boolean)\n            : [];\n    if (requiredToolNames.length === 0) {\n        return current;\n    }\n\n    const productionToolNames =\n        [...new Set(\n            requiredToolNames.filter(name =>\n                Object.prototype.hasOwnProperty.call(\n                    MARKETING_PRODUCTION_TOOL_TYPES,\n                    name\n                )\n            )\n        )];\n    const productionRequested =\n        productionToolNames.length > 0;\n    const declaredArtifacts =\n        (Array.isArray(current.productionArtifacts)\n            ? current.productionArtifacts\n            : [])\n            .filter(item =>\n                item &&\n                typeof item === "object" &&\n                !Array.isArray(item) &&\n                productionToolNames.includes(String(item.toolName || ""))\n            );\n    const productionArtifacts =\n        productionRequested\n            ? (declaredArtifacts.length > 0\n                ? declaredArtifacts\n                : productionToolNames.map(toolName => ({\n                    id: `mission-${toolName.replaceAll(".", "-")}`,\n                    type: MARKETING_PRODUCTION_TOOL_TYPES[toolName],\n                    toolName,\n                    label: toolName\n                })))\n            : [];\n\n    return {\n        ...current,\n        productionRequested,\n        productionArtifacts\n    };\n}\n\nconst MARKETING_ARGUMENT_SCHEMA ='''
source = regex_once(
    source,
    r'export function resolveMarketingMissionProductionScope\([\s\S]*?\n}\n\nconst MARKETING_ARGUMENT_SCHEMA =',
    scope_replacement,
    'MARKETING_SCOPE_FUNCTION'
)

source = replace_once(
    source,
    '                    exactEntity: {\n                        type:\n                            "string"\n                    }',
    '                    exactEntity: {\n                        type:\n                            "string"\n                    },\n                    seedUrl: {\n                        type:\n                            "string"\n                    }',
    'WEB_RESEARCH_SEED_SCHEMA'
)
source = replace_once(
    source,
    '                        allowedDomain: args.allowedDomain || "",\n                        exactEntity: args.exactEntity || ""',
    '                        allowedDomain: args.allowedDomain || "",\n                        exactEntity: args.exactEntity || "",\n                        seedUrl: args.seedUrl || ""',
    'WEB_RESEARCH_SEED_TRACE'
)
source = replace_once(
    source,
    '    const normalizedQuery =\n        String(query || "")\n            .trim()\n            .slice(0, 600);',
    '    const normalizedQuery =\n        [query, trace?.seedUrl]\n            .map(value => String(value || "").trim())\n            .filter(Boolean)\n            .filter((value, index, list) => list.indexOf(value) === index)\n            .join(" ")\n            .replace(/\\s+/g, " ")\n            .trim()\n            .slice(0, 600);',
    'WEB_RESEARCH_SEEDED_QUERY'
)
source = replace_once(
    source,
    '                    {\n                        query: normalizedQuery,\n                        timeoutMs: 20000\n                    },',
    '                    {\n                        query: normalizedQuery,\n                        timeoutMs: 20000,\n                        allowedDomain: trace.allowedDomain || "",\n                        exactEntity: trace.exactEntity || "",\n                        seedUrl: trace.seedUrl || ""\n                    },',
    'WEB_RESEARCH_LOCAL_CONTEXT'
)
write(path, source)

# -----------------------------------------------------------------------------
# 3) Local research fallback respects domain/entity/source anchor.
# -----------------------------------------------------------------------------
path = 'jarvis-fs-bridge.js'
source = read(path)
source = replace_once(
    source,
    '    "2.40.0-page-evidence-failclosed-v123";',
    '    "2.41.0-source-grounded-research-v124";',
    'FS_BRIDGE_VERSION'
)
old_start = '''export async function runLocalWebResearch(query = "", timeoutMs = 20000) {\n    const normalizedQuery = String(query || "")\n        .replace(/\\s+/g, " ")\n        .trim()\n        .slice(0, 500);'''
new_start = '''export function buildLocalResearchQuery(\n    query = "",\n    {\n        allowedDomain = "",\n        exactEntity = "",\n        seedUrl = ""\n    } = {}\n) {\n    const values = [String(query || "").trim()];\n    const entity = String(exactEntity || "").trim();\n    if (entity && !values.join(" ").toLowerCase().includes(entity.toLowerCase())) {\n        values.push(entity);\n    }\n    let domain = String(allowedDomain || "")\n        .trim()\n        .toLowerCase()\n        .replace(/^https?:\\/\\//, "")\n        .replace(/^www\\./, "")\n        .split("/")[0];\n    const sourceUrl = String(seedUrl || "").trim();\n    if (sourceUrl) {\n        try {\n            const url = new URL(sourceUrl);\n            if (!domain) domain = url.hostname.toLowerCase().replace(/^www\\./, "");\n            const handle = url.pathname\n                .split("/")\n                .map(value => {\n                    try { return decodeURIComponent(value); }\n                    catch { return value; }\n                })\n                .find(value => value.startsWith("@") && value.length > 1);\n            if (handle && !values.join(" ").toLowerCase().includes(handle.toLowerCase())) {\n                values.push(handle);\n            }\n            for (const key of ["q", "query", "search_query", "keyword", "keywords"]) {\n                const term = String(url.searchParams.get(key) || "")\n                    .replace(/\\+/g, " ")\n                    .replace(/\\s+/g, " ")\n                    .trim();\n                if (term && !values.join(" ").toLowerCase().includes(term.toLowerCase())) {\n                    values.push(term);\n                }\n            }\n        }\n        catch {}\n    }\n    if (domain && !values.join(" ").toLowerCase().includes(`site:${domain}`)) {\n        values.push(`site:${domain}`);\n    }\n    return values\n        .filter(Boolean)\n        .join(" ")\n        .replace(/\\s+/g, " ")\n        .trim()\n        .slice(0, 500);\n}\n\nexport async function runLocalWebResearch(\n    query = "",\n    timeoutMs = 20000,\n    options = {}\n) {\n    const normalizedQuery = buildLocalResearchQuery(query, options);'''
source = replace_once(source, old_start, new_start, 'LOCAL_RESEARCH_QUERY')

source = replace_once(
    source,
    '            const result = await runLocalWebResearch(\n                req.body?.query || req.body?.prompt || "",\n                req.body?.timeoutMs || 20000\n            );',
    '            const result = await runLocalWebResearch(\n                req.body?.query || req.body?.prompt || "",\n                req.body?.timeoutMs || 20000,\n                {\n                    allowedDomain: req.body?.allowedDomain || "",\n                    exactEntity: req.body?.exactEntity || "",\n                    seedUrl: req.body?.seedUrl || ""\n                }\n            );',
    'LOCAL_RESEARCH_ROUTE_CONTEXT'
)
write(path, source)

# -----------------------------------------------------------------------------
# 4) NEXO preserves canonical marketing executor, not only canonical schema.
# -----------------------------------------------------------------------------
path = 'gestia-core/nexo/nexo.real-media.tools.js'
source = read(path)
source = replace_once(
    source,
    '../jarvis/jarvis.marketing.engine.js?v=v94-generalist-execution-contract-v122-20260810',
    '../jarvis/jarvis.marketing.engine.js?v=v94-source-grounded-research-v124-20260810',
    'NEXO_MARKETING_IMPORT_CACHE'
)
source = replace_once(
    source,
    '    "1.1.0-generalist-execution-contract-v122";',
    '    "1.2.0-source-grounded-research-v124";',
    'NEXO_VERSION'
)
source = replace_once(
    source,
    '    registerOrReplace(runtime, {\n        name: "marketing.plan",',
    '    const canonicalMarketingDefinition =\n        previousDefinition(runtime, "marketing.plan");\n\n    registerOrReplace(runtime, {\n        name: "marketing.plan",',
    'NEXO_CANONICAL_CAPTURE'
)
old_execute = '''        execute: async (args = {}, context = {}) => {\n            const instruction = instructionFrom(args, context);\n            const result = planMarketingRequest(instruction, {\n                ...context,\n                ...args,\n                authorityId: args.authorityId || context.authorityId || "HEBERTO_MENDOZA",\n                controllerId: args.controllerId || context.controllerId || "PENINSULA_NEXO"\n            });\n            return {\n                ...result,\n                objectiveSatisfied: result?.readyForProduction === true,\n                requiresInput: result?.requiresInput === true,\n                blocked: result?.blocked === true || result?.requiresInput === true,\n                retryable: result?.retryable === true,\n                error:\n                    result?.ok === false\n                        ? (result?.error || result?.status || "MARKETING_PLAN_FAILED")\n                        : (result?.error || null),\n                runtimeOverride: NEXO_REAL_MEDIA_TOOLS_VERSION\n            };\n        }'''
new_execute = '''        execute: async (args = {}, context = {}) => {\n            const instruction = instructionFrom(args, context);\n            const canonicalExecute =\n                typeof canonicalMarketingDefinition?.execute === "function"\n                    ? canonicalMarketingDefinition.execute\n                    : null;\n            const result = canonicalExecute\n                ? await canonicalExecute(args, context)\n                : planMarketingRequest(instruction, {\n                    ...context,\n                    ...args,\n                    authorityId: args.authorityId || context.authorityId || "HEBERTO_MENDOZA",\n                    controllerId: args.controllerId || context.controllerId || "PENINSULA_NEXO"\n                });\n            return {\n                ...result,\n                objectiveSatisfied:\n                    typeof result?.objectiveSatisfied === "boolean"\n                        ? result.objectiveSatisfied\n                        : result?.readyForProduction === true,\n                requiresInput: result?.requiresInput === true,\n                blocked: result?.blocked === true || result?.requiresInput === true,\n                retryable: result?.retryable === true,\n                error:\n                    result?.ok === false\n                        ? (result?.error || result?.status || "MARKETING_PLAN_FAILED")\n                        : (result?.error || null),\n                canonicalExecutorUsed: Boolean(canonicalExecute),\n                runtimeOverride: NEXO_REAL_MEDIA_TOOLS_VERSION\n            };\n        }'''
source = replace_once(source, old_execute, new_execute, 'NEXO_MARKETING_EXECUTOR')
write(path, source)

# -----------------------------------------------------------------------------
# 5) Conversation composition cannot contradict tool completion statuses and
#    asks only for factual gaps that truly remain after research.
# -----------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.conversation.composer.js'
source = read(path)
outcome_helper = '''\nexport function buildAuthoritativeToolOutcomeMatrix(evidenceItems = []) {\n    return (Array.isArray(evidenceItems) ? evidenceItems : [])\n        .filter(item => String(item?.name || item?.tool || "") !== "conversation.respond")\n        .slice(0, 30)\n        .map(item => {\n            const observation =\n                item?.observation ||\n                item?.response ||\n                item?.data ||\n                {};\n            return {\n                tool: String(item?.name || item?.tool || "").slice(0, 120),\n                status: String(observation?.status || "").slice(0, 160),\n                ok: observation?.ok === true,\n                executionOk: observation?.executionOk !== false,\n                objectiveSatisfied: observation?.objectiveSatisfied === true,\n                blocked: observation?.blocked === true,\n                requiresInput: observation?.requiresInput === true,\n                retryable: observation?.retryable === true,\n                error: String(observation?.error || "").slice(0, 500)\n            };\n        });\n}\n\n'''
source = replace_once(
    source,
    'export async function composeEvidenceGroundedConversation({\n',
    outcome_helper + 'export async function composeEvidenceGroundedConversation({\n',
    'CONVERSATION_OUTCOME_HELPER'
)
source = replace_once(
    source,
    '    const evidence = buildBoundedConversationEvidence(evidenceItems);\n    const capabilityBriefing =',
    '    const evidence = buildBoundedConversationEvidence(evidenceItems);\n    const authoritativeOutcomes =\n        buildAuthoritativeToolOutcomeMatrix(evidenceItems);\n    const capabilityBriefing =',
    'CONVERSATION_OUTCOME_STATE'
)
source = replace_once(
    source,
    '        "Si una herramienta fallo o falta evidencia, dilo una sola vez y no marques la mision como completada.",\n',
    '        "Si una herramienta fallo o falta evidencia, dilo una sola vez y no marques la mision como completada.",\n'
    '        "RESULTADOS_HERRAMIENTAS_AUTORITATIVOS es el estado operativo definitivo: nunca describas como bloqueada una herramienta con objectiveSatisfied=true ni como completada una herramienta marcada blocked=true o requiresInput=true.",\n'
    '        "La falta de un dato factual no bloquea entregables independientes que si tienen evidencia suficiente. Despues de agotar la investigacion disponible, enumera solamente los datos realmente faltantes que impiden una parte solicitada y pregunta al usuario si puede proporcionarlos o si prefiere continuar sin ellos; conserva todo lo ya verificado.",\n',
    'CONVERSATION_STATUS_POLICY'
)
source = replace_once(
    source,
    '        `RESUMEN_CAPACIDADES_Y_LIMITES=${capabilityBriefing}`,\n        `EVIDENCIA_ESTRUCTURADA=${evidence}`',
    '        `RESUMEN_CAPACIDADES_Y_LIMITES=${capabilityBriefing}`,\n        `RESULTADOS_HERRAMIENTAS_AUTORITATIVOS=${JSON.stringify(authoritativeOutcomes)}`,\n        `EVIDENCIA_ESTRUCTURADA=${evidence}`',
    'CONVERSATION_STATUS_MATRIX'
)
write(path, source)

# -----------------------------------------------------------------------------
# 6) Marketing direct presenter includes successfully planned reels instead of
#    hiding them when marketing.plan also succeeded.
# -----------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.marketing.presenter.js'
source = read(path)
reel_helper = '''\nfunction renderCompletedReelPlans(completedTasks = []) {\n    const plans = (Array.isArray(completedTasks) ? completedTasks : [])\n        .filter(item =>\n            item?.name === "reel.plan" &&\n            item?.observation?.objectiveSatisfied === true &&\n            item?.observation?.status === "REEL_PLAN_READY" &&\n            item?.observation?.preparedArtifact?.kind === "reel"\n        )\n        .map(item => item.observation.preparedArtifact);\n    if (plans.length === 0) return [];\n    return [\n        "",\n        "## Propuestas de reels planificadas",\n        ...plans.flatMap((plan, index) => [\n            `### Reel ${index + 1}: ${plan.title || "Propuesta"}`,\n            `- Duración: ${Number(plan.durationSeconds) || 0} segundos`,\n            `- CTA: ${plan.cta || "Pendiente"}`,\n            ...(Array.isArray(plan.scenes)\n                ? plan.scenes.slice(0, 18).map((scene, sceneIndex) =>\n                    `- Escena ${sceneIndex + 1}: ${scene?.overlay || scene?.visual || "Escena planificada"}`\n                )\n                : [])\n        ])\n    ];\n}\n\n'''
source = replace_once(
    source,
    'export function marketingFinalResponseFromMission(missionResult = {}) {\n',
    reel_helper + 'export function marketingFinalResponseFromMission(missionResult = {}) {\n',
    'MARKETING_REEL_PRESENTER'
)
source = replace_once(
    source,
    '    const artifactLines = productionRequested\n',
    '    const plannedReelLines =\n        renderCompletedReelPlans(completed);\n\n    const artifactLines = productionRequested\n',
    'MARKETING_REEL_LINES'
)
source = replace_once(
    source,
    '        text: [marketing.observation.userVisible, ...artifactLines].join("\\n"),',
    '        text: [marketing.observation.userVisible, ...plannedReelLines, ...artifactLines].join("\\n"),',
    'MARKETING_REEL_TEXT'
)
write(path, source)

# -----------------------------------------------------------------------------
# 7) Cache/release chain. No Functions files are touched.
# -----------------------------------------------------------------------------
cache_files = [
    'gestia-terminal.html',
    'gestia-core/gestia-core.js',
    'gestia-core/tools.runtime.js',
    'modules/terminal/nexo-bootstrap.js',
    'modules/terminal/proposal-state.js'
]
for file in cache_files:
    value = read(file)
    if OLD_RELEASE not in value:
        raise SystemExit(f'CACHE_TOKEN_MISSING:{file}')
    write(file, value.replace(OLD_RELEASE, NEW_RELEASE))

# Explicit module versions that are user-visible diagnostics.
path = 'modules/terminal/nexo-bootstrap.js'
source = read(path)
source = source.replace(
    '1.3.0-page-evidence-failclosed-v123',
    '1.4.0-source-grounded-research-v124'
)
write(path, source)

contract_path = ROOT / 'jarvis-runtime-contract.json'
contract = json.loads(contract_path.read_text(encoding='utf-8'))
if contract.get('branch') != 'v94-media-v4n-negative-claims':
    raise SystemExit('RUNTIME_BRANCH_CHANGED')
contract['releaseId'] = NEW_RELEASE
contract_path.write_text(json.dumps(contract, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

# -----------------------------------------------------------------------------
# 8) Generic regression tests. No real business/site is embedded in production.
# -----------------------------------------------------------------------------
test = r'''import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { __test as plannerTest } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";
import { resolveMarketingMissionProductionScope } from "../gestia-core/jarvis/jarvis.multitool.pack.js";
import { registerNexoRealMediaTools } from "../gestia-core/nexo/nexo.real-media.tools.js";
import { buildAuthoritativeToolOutcomeMatrix, composeEvidenceGroundedConversation } from "../gestia-core/jarvis/jarvis.conversation.composer.js";
import { marketingFinalResponseFromMission, MARKETING_PLAN_SECTIONS } from "../gestia-core/jarvis/jarvis.marketing.presenter.js";
import { buildLocalResearchQuery } from "../jarvis-fs-bridge.js";

const webTool = {
    name: "web.research",
    mutates: false,
    requiresApproval: false,
    missionDedupeBy: ["researchGoal"],
    inputSchema: {
        type: "object",
        required: ["query", "researchGoal"],
        properties: {
            query: { type: "string" },
            researchGoal: { type: "string" },
            allowedDomain: { type: "string" },
            exactEntity: { type: "string" },
            seedUrl: { type: "string" }
        },
        additionalProperties: false
    }
};

const mediaTool = {
    name: "web.media.collect",
    mutates: true,
    requiresApproval: false,
    userArtifact: true,
    missionDedupeBy: ["url"],
    inputSchema: {
        type: "object",
        required: ["url"],
        properties: {
            url: { type: "string" },
            requireImages: { type: "boolean" },
            requireVideos: { type: "boolean" }
        }
    }
};

test("explicit user URL anchors research and media without becoming a separate objective", () => {
    const instruction = "Investiga Acme Norte usando https://social.example/@acme.norte/video/123?q=acme%20norte%20merida y prepara ideas";
    const calls = plannerTest.trustedPlanCalls({
        planKind: "MISSION_CONTRACT",
        toolCalls: [
            {
                name: "web.research",
                args: {
                    query: "Acme Norte",
                    researchGoal: "RESEARCH_1",
                    exactEntity: "Acme Norte"
                }
            },
            {
                name: "web.media.collect",
                args: {
                    requireImages: false,
                    requireVideos: false
                }
            }
        ]
    }, [webTool, mediaTool], { originalInstruction: instruction });

    const research = calls.find(call => call.name === "web.research");
    const media = calls.find(call => call.name === "web.media.collect");
    assert.equal(research.args.seedUrl, "https://social.example/@acme.norte/video/123?q=acme%20norte%20merida");
    assert.equal(research.args.allowedDomain, "social.example");
    assert.match(research.args.query, /@acme\.norte/);
    assert.match(research.args.query, /acme norte merida/i);
    assert.equal(research.args.researchGoal, "RESEARCH_1");
    assert.equal(media.args.url, research.args.seedUrl);
});

test("local fallback preserves source scope, entity and URL hints", () => {
    const query = buildLocalResearchQuery("Acme Norte", {
        allowedDomain: "social.example",
        exactEntity: "Acme Norte",
        seedUrl: "https://social.example/@acme.norte/video/123?q=acme%20norte%20merida"
    });
    assert.match(query, /site:social\.example/);
    assert.match(query, /@acme\.norte/);
    assert.match(query, /acme norte merida/i);
});

test("marketing production scope follows executable mission tools, not a stray boolean", () => {
    const planningOnly = resolveMarketingMissionProductionScope({
        productionRequested: true,
        productionArtifacts: []
    }, {
        requiredToolNames: ["web.research", "marketing.plan", "reel.plan"]
    });
    assert.equal(planningOnly.productionRequested, false);
    assert.deepEqual(planningOnly.productionArtifacts, []);

    const production = resolveMarketingMissionProductionScope({
        productionRequested: false
    }, {
        requiredToolNames: ["marketing.plan", "reel.create", "marketing.package.real-media"]
    });
    assert.equal(production.productionRequested, true);
    assert.deepEqual(
        production.productionArtifacts.map(item => item.toolName).sort(),
        ["marketing.package.real-media", "reel.create"]
    );
});

test("NEXO delegates marketing.plan to the canonical runtime executor", async () => {
    const registry = new Map();
    let canonicalCalls = 0;
    const required = [
        "brandName", "audience", "offer", "pain", "promise", "differentiator",
        "cta", "market", "campaignObjective", "horizon", "tone", "channels",
        "metrics", "productionRequested"
    ];
    registry.set("marketing.plan", {
        name: "marketing.plan",
        inputSchema: {
            type: "object",
            required,
            properties: Object.fromEntries(required.map(field => [field, { type: field === "channels" || field === "metrics" ? "array" : field === "productionRequested" ? "boolean" : "string" }]))
        },
        execute: async () => {
            canonicalCalls += 1;
            return {
                ok: true,
                status: "MARKETING_PACKAGE_READY",
                objectiveSatisfied: true,
                readyForProduction: true,
                blocked: false
            };
        }
    });
    const runtime = {
        get: name => registry.get(name),
        register: definition => {
            registry.set(definition.name, definition);
            return definition;
        }
    };
    registerNexoRealMediaTools(runtime);
    const result = await registry.get("marketing.plan").execute({}, {});
    assert.equal(canonicalCalls, 1);
    assert.equal(result.canonicalExecutorUsed, true);
    assert.equal(result.objectiveSatisfied, true);
});

test("conversation composer receives an authoritative completed/blocked matrix and gap policy", async () => {
    const evidenceItems = [
        {
            name: "reel.plan",
            observation: {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                blocked: false,
                status: "REEL_PLAN_READY"
            }
        },
        {
            name: "marketing.plan",
            observation: {
                ok: false,
                executionOk: false,
                objectiveSatisfied: false,
                blocked: true,
                status: "MARKETING_INPUT_REQUIRED",
                requiresInput: true,
                error: "MISSING_OWNER_FACT"
            }
        }
    ];
    const matrix = buildAuthoritativeToolOutcomeMatrix(evidenceItems);
    assert.equal(matrix[0].objectiveSatisfied, true);
    assert.equal(matrix[1].requiresInput, true);

    let prompt = "";
    const result = await composeEvidenceGroundedConversation({
        instruction: "Prepara la estrategia y pregunta sólo por lo que falte",
        evidenceItems,
        executeConversation: async value => {
            prompt = value;
            return { ok: true, message: "Respuesta sustentada" };
        }
    });
    assert.equal(result.ok, true);
    assert.match(prompt, /RESULTADOS_HERRAMIENTAS_AUTORITATIVOS=/);
    assert.match(prompt, /REEL_PLAN_READY/);
    assert.match(prompt, /MARKETING_INPUT_REQUIRED/);
    assert.match(prompt, /pregunta al usuario si puede proporcionarlos/);
});

test("marketing final response surfaces completed reel plans instead of calling them blocked", () => {
    const plan = Object.fromEntries(
        MARKETING_PLAN_SECTIONS.map(({ key }) => [key, key === "assumptions" ? [] : { summary: key }])
    );
    const mission = {
        completedTasks: [
            {
                name: "marketing.plan",
                observation: {
                    status: "MARKETING_PACKAGE_READY",
                    objectiveSatisfied: true,
                    planReady: true,
                    productionRequested: false,
                    userVisible: "# Plan estratégico verificado",
                    plan
                }
            },
            {
                name: "reel.plan",
                observation: {
                    status: "REEL_PLAN_READY",
                    objectiveSatisfied: true,
                    preparedArtifact: {
                        kind: "reel",
                        title: "Idea A",
                        durationSeconds: 30,
                        cta: "Conoce más",
                        scenes: [
                            { overlay: "Escena verificada 1" },
                            { overlay: "Escena verificada 2" },
                            { overlay: "Escena verificada 3" }
                        ]
                    }
                }
            }
        ],
        blockedTasks: [],
        pendingTasks: []
    };
    const response = marketingFinalResponseFromMission(mission);
    assert.ok(response);
    assert.match(response.text, /Propuestas de reels planificadas/);
    assert.match(response.text, /Idea A/);
    assert.doesNotMatch(response.text, /reels bloqueados/i);
});

test("production code contains generic source-anchor rules and no fixture-specific business", () => {
    const planner = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
    for (const marker of [
        "FUENTE ANCLA",
        "seedUrl",
        "FUENTES_EXPLICITAS_USUARIO",
        "web.media.collect"
    ]) {
        assert.equal(planner.includes(marker), true, marker);
    }
    const productionFiles = [
        "../gestia-core/jarvis/jarvis.multifunction.planner.js",
        "../gestia-core/jarvis/jarvis.multitool.pack.js",
        "../gestia-core/nexo/nexo.real-media.tools.js",
        "../jarvis-fs-bridge.js",
        "../gestia-core/jarvis/jarvis.conversation.composer.js"
    ].map(file => fs.readFileSync(new URL(file, import.meta.url), "utf8").toLowerCase()).join("\n");
    assert.equal(productionFiles.includes("taquería el dorado"), false);
    assert.equal(productionFiles.includes("taqueria el dorado"), false);
    assert.equal(productionFiles.includes("multiservicios peninsulares hmh"), false);
});
'''
write('tests/jarvis-source-grounded-research-v124.test.mjs', test)

print('V124_PATCH_APPLIED=TRUE')
print(f'RELEASE={NEW_RELEASE}')
