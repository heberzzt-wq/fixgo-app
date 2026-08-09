from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'PATCH_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


def replace_between(text, start, end, replacement, label):
    first = text.find(start)
    if first < 0:
        raise SystemExit(f'PATCH_START_NOT_FOUND:{label}')
    last = text.find(end, first + len(start))
    if last < 0:
        raise SystemExit(f'PATCH_END_NOT_FOUND:{label}')
    return text[:first] + replacement + text[last:]


# ---------------------------------------------------------------------------
# Terminal: retire the legacy lexical language parser from the active surface.
# ---------------------------------------------------------------------------
path = 'gestia-terminal.html'
text = read(path)
text = replace_once(
    text,
    '<script type="module" src="/gestia-core/jarvis/jarvis.language.core.v5.js"></script>\n',
    '',
    'terminal-retire-language-core'
)
text = replace_once(
    text,
    '/gestia-core/gestia-core.js?v=sia7-identity-fidelity-v106-20260728',
    '/gestia-core/gestia-core.js?v=v94-semantic-only-v108-20260809',
    'terminal-core-cache'
)
text = replace_once(
    text,
    '/gestia-core/tools.runtime.js?v=jarvis-tools-v7-20260728-identity-fidelity-v106',
    '/gestia-core/tools.runtime.js?v=v94-semantic-only-v108-20260809',
    'terminal-runtime-cache'
)
write(path, text)


# ---------------------------------------------------------------------------
# Planner: semantic model owns meaning. Local code only validates structured
# tool choices and grounds exact artifact identities.
# ---------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.multifunction.planner.js'
text = read(path)

semantic_attachment_block = '''const ATTACHMENT_MANIFEST_MARKER =\n    "Archivos adjuntos reales entregados por el usuario:";\n\nfunction instructionBeforeAttachmentManifest(\n    input = ""\n) {\n    const source =\n        String(input || "");\n    const markerIndex =\n        source.lastIndexOf(\n            ATTACHMENT_MANIFEST_MARKER\n        );\n    return (\n        markerIndex >= 0\n            ? source.slice(0, markerIndex)\n            : source\n    ).trim();\n}\n\nfunction extractGroundedAttachments(\n    input = ""\n) {\n    const source =\n        String(input || "");\n    const markerIndex =\n        source.lastIndexOf(\n            ATTACHMENT_MANIFEST_MARKER\n        );\n\n    if (markerIndex < 0) {\n        return [];\n    }\n\n    const payload =\n        source\n            .slice(\n                markerIndex +\n                ATTACHMENT_MANIFEST_MARKER.length\n            )\n            .trim();\n\n    let manifest;\n    try {\n        manifest = JSON.parse(payload);\n    }\n    catch {\n        return [];\n    }\n\n    return (\n        Array.isArray(manifest)\n            ? manifest\n            : []\n    )\n        .filter(item =>\n            item &&\n            typeof item === "object" &&\n            typeof item.artifact === "string" &&\n            item.artifact.startsWith(\n                ".jarvis-artifacts/"\n            )\n        )\n        .slice(0, 30)\n        .map(item => ({\n            name: String(item.name || ""),\n            mimeType: String(\n                item.mimeType || ""\n            ).trim().toLowerCase(),\n            artifact: String(item.artifact || ""),\n            sha256: String(item.sha256 || "")\n        }));\n}\n\nfunction candidateArgumentObject(\n    candidate = {}\n) {\n    const value =\n        candidate?.args ||\n        candidate?.arguments;\n\n    return (\n        value &&\n        typeof value === "object" &&\n        !Array.isArray(value)\n    )\n        ? { ...value }\n        : {};\n}\n\nfunction imageVariantIdentity(\n    candidate = {}\n) {\n    const args =\n        candidateArgumentObject(candidate);\n    const declared =\n        String(args.variantId || "")\n            .trim()\n            .slice(0, 120);\n    return declared || "PRIMARY";\n}\n\nfunction normalizeAttachmentAnalysisRouteCandidates(\n    candidates = []\n) {\n    return Array.isArray(candidates)\n        ? candidates\n        : [];\n}\n\nfunction normalizeGroundedImageReferenceCandidates(\n    candidates = [],\n    catalog = [],\n    context = {}\n) {\n    const sourceCandidates =\n        Array.isArray(candidates)\n            ? candidates\n            : [];\n    const attachments =\n        extractGroundedAttachments(\n            context?.originalInstruction || ""\n        );\n    const images =\n        attachments.filter(item =>\n            item.mimeType.startsWith("image/")\n        );\n    const availableArtifacts =\n        new Map(\n            images.map(item => [\n                item.artifact,\n                item\n            ])\n        );\n    const imageEditAvailable =\n        catalog.some(tool =>\n            tool?.name === "image.edit"\n        );\n\n    return sourceCandidates.map(candidate => {\n        if (\n            candidate?.name !== "image.edit" ||\n            !imageEditAvailable\n        ) {\n            return candidate;\n        }\n\n        const baseArgs =\n            candidateArgumentObject(candidate);\n        let sourceOutput =\n            String(baseArgs.sourceOutput || "").trim();\n\n        if (!availableArtifacts.has(sourceOutput)) {\n            sourceOutput =\n                images.length === 1\n                    ? images[0].artifact\n                    : sourceOutput;\n        }\n\n        const referenceOutputs =\n            (Array.isArray(baseArgs.referenceOutputs)\n                ? baseArgs.referenceOutputs\n                : [])\n                .map(value =>\n                    String(value || "").trim()\n                )\n                .filter(value =>\n                    availableArtifacts.has(value) &&\n                    value !== sourceOutput\n                )\n                .filter((value, index, list) =>\n                    list.indexOf(value) === index\n                )\n                .slice(0, 4);\n\n        return {\n            ...candidate,\n            name: "image.edit",\n            args: {\n                ...baseArgs,\n                sourceOutput,\n                referenceOutputs,\n                variantId:\n                    imageVariantIdentity(candidate),\n                identityMode:\n                    baseArgs.identityMode ||\n                    "strict",\n                ageMode:\n                    baseArgs.ageMode ||\n                    "preserve",\n                preserveLogos:\n                    baseArgs.preserveLogos !== false,\n                preserveApprovedText:\n                    baseArgs.preserveApprovedText === true\n            },\n            reason:\n                candidate?.reason ||\n                "SEMANTIC_IMAGE_EDIT_GROUNDED"\n        };\n    });\n}\n\n'''

text = replace_between(
    text,
    'const ATTACHMENT_MANIFEST_MARKER =',
    'async function fetchBrowserPlanText(',
    semantic_attachment_block,
    'planner-semantic-attachment-routing'
)

old_attach_metadata = '''function attachPlanMetadata(calls = [], plan = {}) {\n    Object.defineProperties(calls, {\n        missionComplete: {\n            value: plan?.missionComplete === true,\n            enumerable: false\n        },\n        completionAssessment: {\n            value: plan?.completionAssessment || null,\n            enumerable: false\n        }\n    });\n    return calls;\n}'''
new_attach_metadata = '''function attachPlanMetadata(calls = [], plan = {}) {\n    Object.defineProperties(calls, {\n        missionComplete: {\n            value: plan?.missionComplete === true,\n            enumerable: false\n        },\n        completionAssessment: {\n            value: plan?.completionAssessment || null,\n            enumerable: false\n        },\n        responseFormat: {\n            value:\n                String(\n                    plan?.responseFormat ||\n                    "human"\n                ).trim().toLowerCase(),\n            enumerable: false\n        }\n    });\n    return calls;\n}'''
text = replace_once(
    text,
    old_attach_metadata,
    new_attach_metadata,
    'planner-response-format-metadata'
)

text = replace_once(
    text,
    '"Devuelve solamente JSON valido.",\n',
    '"Devuelve solamente JSON valido.",\n        "La comprensión de intención es exclusivamente semántica: no imites ni dependas de listas de palabras, diccionarios locales o patrones de texto del cliente.",\n        "Incluye responseFormat=\\"json\\" solamente cuando el usuario pida explícitamente una salida JSON/machine-readable; en cualquier otro caso usa responseFormat=\\"human\\".",\n',
    'planner-contract-semantic-policy'
)

text = replace_once(
    text,
    '"Interpreta significado, typos, negaciones y ordenes mixtas. Selecciona exclusivamente nombres exactos del catalogo.",\n',
    '"Interpreta significado, typos, negaciones y ordenes mixtas con razonamiento semántico; no delegues comprensión a listas de palabras, diccionarios locales ni patrones de texto. Selecciona exclusivamente nombres exactos del catalogo.",\n        "Devuelve responseFormat=\\"json\\" solamente si el usuario pidió explícitamente salida JSON/machine-readable; en caso contrario responseFormat=\\"human\\".",\n',
    'planner-semantic-plan-policy'
)

old_test_export = '''    extractExplicitGovernedToolPlan,\n    extractGroundedAttachments,\n    requestsGroundedVisualReference,\n    requestsAttachmentAnalysis,\n    requestsVisualArtifactCreation,\n    requestsAdditionalDeliverableBeyondAttachmentAnalysis,\n    normalizeAttachmentAnalysisRouteCandidates,\n    attachmentDateScore,\n    selectPreferredIdentityAttachment,\n    imageVariantIdentity,\n    normalizeGroundedImageReferenceCandidates\n};'''
new_test_export = '''    extractExplicitGovernedToolPlan,\n    extractGroundedAttachments,\n    instructionBeforeAttachmentManifest,\n    normalizeAttachmentAnalysisRouteCandidates,\n    imageVariantIdentity,\n    normalizeGroundedImageReferenceCandidates\n};'''
text = replace_once(
    text,
    old_test_export,
    new_test_export,
    'planner-test-exports'
)
write(path, text)


# ---------------------------------------------------------------------------
# Conversation composer: no local language classification and no regex-based
# narrative policing. Precision media renders only structured verified facts.
# ---------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.conversation.composer.js'
text = read(path)

text = replace_between(
    text,
    'function normalizedText(value = "") {',
    'export function prepareEvidenceGroundedConversationPlan({',
    '''export function isExplicitJsonResponseRequest(\n    planOrCalls = null\n) {\n    if (Array.isArray(planOrCalls)) {\n        if (\n            String(\n                planOrCalls.responseFormat ||\n                ""\n            ).trim().toLowerCase() === "json"\n        ) {\n            return true;\n        }\n        return planOrCalls.some(call =>\n            String(\n                call?.responseFormat ||\n                call?.args?.responseFormat ||\n                ""\n            ).trim().toLowerCase() === "json"\n        );\n    }\n\n    if (\n        planOrCalls &&\n        typeof planOrCalls === "object"\n    ) {\n        return String(\n            planOrCalls.responseFormat ||\n            ""\n        ).trim().toLowerCase() === "json";\n    }\n\n    return false;\n}\n\n''',
    'composer-structured-response-format'
)

text = replace_once(
    text,
    '    const explicitJson = isExplicitJsonResponseRequest(instruction);',
    '    const explicitJson = isExplicitJsonResponseRequest(toolCalls);',
    'composer-no-lexical-json-intent'
)

structured_media_renderer = '''function verifiedVisibleData(\n    source = {},\n    minimumConfidence = 0.98\n) {\n    return (Array.isArray(source?.visibleData)\n        ? source.visibleData\n        : [])\n        .filter(item =>\n            String(\n                item?.legibility ||\n                ""\n            ).trim().toUpperCase() === "VERIFIED" &&\n            Number(item?.confidence || 0) >=\n                minimumConfidence &&\n            Boolean(\n                String(item?.value || "").trim()\n            ) &&\n            Boolean(\n                String(item?.evidence || "").trim()\n            )\n        );\n}\n\nfunction renderPrecisionVerifiedMediaConversation(observation) {\n    const sources =\n        Array.isArray(observation?.sources)\n            ? observation.sources\n            : [];\n    const fileLabel =\n        sources.length === 1\n            ? "archivo"\n            : "archivos";\n    const lines = [\n        `Pariente, revisé ${sources.length} ${fileLabel} y me quedé únicamente con datos estructurados que pasaron la verificación.`\n    ];\n    const minimumConfidence = Number(\n        observation?.precisionAudit\n            ?.exactTextRequiresConfidence ||\n        0.98\n    );\n\n    sources.forEach((source, index) => {\n        const fileName = String(\n            source?.fileName ||\n            source?.name ||\n            `archivo-${index + 1}`\n        ).trim();\n        const visibleData =\n            verifiedVisibleData(\n                source,\n                minimumConfidence\n            );\n\n        lines.push(\n            "",\n            `### Archivo ${index + 1}: ${fileName}`\n        );\n\n        if (visibleData.length === 0) {\n            lines.push(\n                "No quedó una lectura literal con evidencia y confianza suficientes para mostrarla como hecho."\n            );\n            return;\n        }\n\n        lines.push(\n            "Datos verificados:"\n        );\n        for (const item of visibleData) {\n            const kind =\n                String(\n                    item?.kind ||\n                    "text"\n                ).trim();\n            const value =\n                String(item?.value || "").trim();\n            const evidence =\n                String(\n                    item?.evidence ||\n                    ""\n                ).trim();\n            const pageNumber =\n                Number(\n                    item?.page ||\n                    item?.pageNumber\n                );\n            const page =\n                Number.isFinite(pageNumber) &&\n                pageNumber > 0\n                    ? `, página ${pageNumber}`\n                    : "";\n            lines.push(\n                `- ${kind}: ${value} (${evidence}${page})`\n            );\n        }\n\n        const totalVisible =\n            Array.isArray(source?.visibleData)\n                ? source.visibleData.length\n                : 0;\n        if (totalVisible > visibleData.length) {\n            lines.push(\n                "Omití lecturas que no alcanzaron el umbral de verificación."\n            );\n        }\n    });\n\n    lines.push(\n        "",\n        "No añadí descripciones, comparaciones ni conclusiones que no estén representadas como evidencia estructurada verificada."\n    );\n\n    return lines.join("\\n").trim();\n}\n\n'''
text = replace_between(
    text,
    'function naturalEvidenceText(item) {',
    'function constrainCompactEvidence(',
    structured_media_renderer,
    'composer-structured-media-only'
)

repo_helper_anchor = 'export function buildBoundedConversationEvidence(evidenceItems = []) {\n'
repo_helper = '''function compactRepositoryObservation(\n    observation = {},\n    {\n        readLimit = 8000,\n        stringLimit = 1200,\n        arrayLimit = 16\n    } = {}\n) {\n    const source =\n        observation &&\n        typeof observation === "object" &&\n        !Array.isArray(observation)\n            ? observation\n            : {};\n    const verifiedRead =\n        source?.verifiedRead &&\n        typeof source.verifiedRead === "object" &&\n        !Array.isArray(source.verifiedRead)\n            ? source.verifiedRead\n            : null;\n\n    return {\n        ok: source?.ok,\n        executionOk: source?.executionOk,\n        objectiveSatisfied: source?.objectiveSatisfied,\n        status: source?.status,\n        summary:\n            compactEvidenceText(\n                source?.summary ||\n                "",\n                stringLimit\n            ),\n        error:\n            compactEvidenceText(\n                source?.error ||\n                "",\n                Math.min(stringLimit, 800)\n            ),\n        verifiedRead: verifiedRead\n            ? {\n                tool: "repo.read",\n                file: compactEvidenceText(\n                    verifiedRead?.file ||\n                    "",\n                    500\n                ),\n                path: compactEvidenceText(\n                    verifiedRead?.path ||\n                    "",\n                    500\n                ),\n                partial:\n                    verifiedRead?.partial === true,\n                startLine:\n                    verifiedRead?.startLine ?? null,\n                endLine:\n                    verifiedRead?.endLine ?? null,\n                totalLines:\n                    verifiedRead?.totalLines ?? null,\n                numberedContent:\n                    String(\n                        verifiedRead?.numberedContent ||\n                        ""\n                    ).slice(0, readLimit),\n                sourceStructure:\n                    constrainCompactEvidence(\n                        verifiedRead?.sourceStructure || {},\n                        {\n                            stringLimit:\n                                Math.min(\n                                    stringLimit,\n                                    700\n                                ),\n                            arrayLimit:\n                                Math.min(\n                                    arrayLimit,\n                                    10\n                                )\n                        }\n                    )\n            }\n            : null,\n        repositoryEvidence:\n            constrainCompactEvidence(\n                {\n                    file: source?.file,\n                    path: source?.path,\n                    requestedFile:\n                        source?.requestedFile,\n                    resolvedFile:\n                        source?.resolvedFile,\n                    totalMatches:\n                        source?.totalMatches,\n                    matches: source?.matches,\n                    results: source?.results,\n                    sourceDefinitions:\n                        source?.sourceDefinitions,\n                    definitionFiles:\n                        source?.definitionFiles,\n                    findings: source?.findings,\n                    references: source?.references,\n                    dependents: source?.dependents,\n                    dependencies:\n                        source?.dependencies,\n                    totalDependents:\n                        source?.totalDependents,\n                    sourceStructure:\n                        source?.sourceStructure,\n                    evidence: source?.evidence\n                },\n                {\n                    stringLimit,\n                    arrayLimit\n                }\n            )\n    };\n}\n\n'''
text = replace_once(
    text,
    repo_helper_anchor,
    repo_helper + repo_helper_anchor,
    'composer-repo-helper'
)

old_bounded = '''    const bounded = (Array.isArray(evidenceItems) ? evidenceItems : [])\n        .slice(0, MAX_EVIDENCE_ITEMS)\n        .map(item => ({\n            tool: String(item?.name || item?.tool || "unknown").slice(0, 120),\n            observation: boundedEvidenceValue(\n                item?.observation ??\n                item?.response ??\n                item?.data ??\n                item\n            )\n        }));'''
new_bounded = '''    const bounded = (Array.isArray(evidenceItems) ? evidenceItems : [])\n        .slice(0, MAX_EVIDENCE_ITEMS)\n        .map(item => {\n            const tool = String(\n                item?.name ||\n                item?.tool ||\n                "unknown"\n            ).slice(0, 120);\n            const observation =\n                item?.observation ??\n                item?.response ??\n                item?.data ??\n                item;\n            return {\n                tool,\n                observation:\n                    tool.startsWith("repo.")\n                        ? compactRepositoryObservation(\n                            observation\n                        )\n                        : boundedEvidenceValue(\n                            observation\n                        )\n            };\n        });'''
text = replace_once(
    text,
    old_bounded,
    new_bounded,
    'composer-repo-evidence-initial'
)

old_compact = '''        const isMediaAnalysis =\n            item.tool === "media.analyze" ||'''
new_compact = '''        if (item.tool.startsWith("repo.")) {\n            return {\n                tool: item.tool,\n                observation:\n                    compactRepositoryObservation(\n                        observation,\n                        {\n                            readLimit: 6000,\n                            stringLimit: 800,\n                            arrayLimit: 12\n                        }\n                    )\n            };\n        }\n\n        const isMediaAnalysis =\n            item.tool === "media.analyze" ||'''
text = replace_once(
    text,
    old_compact,
    new_compact,
    'composer-repo-evidence-compact'
)

emergency_anchor = '''                return {\n                    tool: item.tool,\n                    observation: {\n                        ok:\n                            observation.ok,'''
emergency_new = '''                if (item.tool.startsWith("repo.")) {\n                    return {\n                        tool: item.tool,\n                        observation:\n                            compactRepositoryObservation(\n                                observation,\n                                {\n                                    readLimit: 900,\n                                    stringLimit: 180,\n                                    arrayLimit: 3\n                                }\n                            )\n                    };\n                }\n\n                return {\n                    tool: item.tool,\n                    observation: {\n                        ok:\n                            observation.ok,'''
text = replace_once(
    text,
    emergency_anchor,
    emergency_new,
    'composer-repo-evidence-emergency'
)

prompt_anchor = '        "Resume resultados y limitaciones reales. No muestres JSON, nombres de campos internos, telemetria ni payloads de herramientas.",\n'
text = replace_once(
    text,
    prompt_anchor,
    prompt_anchor + '        "La interpretación de la intención ya fue resuelta por el planner semántico; no reclasifiques la solicitud con palabras clave ni patrones locales.",\n        "Cuando la evidencia sea de repo.*, usa rutas, sourceDefinitions, coincidencias, lecturas numeradas, diagnósticos y dependencias preservadas. Si esos datos existen, no afirmes que faltan resultados del repositorio.",\n',
    'composer-semantic-only-prompt'
)
write(path, text)


# ---------------------------------------------------------------------------
# Marketing engine: structured semantic fields + editable assumptions only.
# ---------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.marketing.engine.js'
text = read(path)

text = replace_between(
    text,
    'const CRITICAL_INPUT_GROUPS =',
    'function clean(value) {',
    '''const REQUIRED_MARKETING_IDENTITY = {\n    id: "business",\n    fields: ["brandName"],\n    question: "¿Para qué negocio, marca o producto preparo el plan?"\n};\n\n''',
    'marketing-single-required-identity'
)

old_normalized = '''function normalized(value = "") {\n    return clean(value)\n        .normalize("NFD")\n        .replace(/[\\u0300-\\u036f]/g, "")\n        .toLowerCase();\n}'''
new_normalized = '''function normalized(value = "") {\n    const source =\n        clean(value)\n            .normalize("NFD")\n            .toLowerCase();\n    let result = "";\n    for (const character of source) {\n        const code = character.charCodeAt(0);\n        if (code >= 768 && code <= 879) {\n            continue;\n        }\n        result += character;\n    }\n    return result;\n}'''
text = replace_once(
    text,
    old_normalized,
    new_normalized,
    'marketing-normalization-without-regex'
)

text = replace_between(
    text,
    'function inferInstructionBrand(instruction = "") {',
    'function inputRequiredResult(instruction, context, groups) {',
    '''function inferBrandName(_instruction, context = {}) {\n    return (\n        clean(context.brandName) ||\n        clean(context.name) ||\n        ""\n    );\n}\n\nfunction availableContext(context = {}) {\n    const memory =\n        context.marketingContext &&\n        typeof context.marketingContext === "object"\n            ? context.marketingContext\n            : {};\n    return { ...memory, ...context };\n}\n\nfunction isolateMarketingContext(_instruction, context = {}) {\n    const memory =\n        context.marketingContext &&\n        typeof context.marketingContext === "object"\n            ? context.marketingContext\n            : {};\n    const currentBrand =\n        clean(context.brandName) ||\n        clean(context.name);\n    const rememberedBrand =\n        clean(memory.brandName) ||\n        clean(memory.name);\n\n    if (\n        !currentBrand ||\n        !rememberedBrand ||\n        normalized(currentBrand) ===\n            normalized(rememberedBrand)\n    ) {\n        return availableContext(context);\n    }\n\n    const isolated = {};\n    for (const key of [\n        "objectiveId",\n        "caseId",\n        "authorityId",\n        "controllerId",\n        "userId",\n        "workspaceId",\n        "projectId",\n        "conversationId"\n    ]) {\n        if (\n            context[key] !== undefined &&\n            context[key] !== null\n        ) {\n            isolated[key] = context[key];\n        }\n    }\n\n    return {\n        ...isolated,\n        ...context,\n        brandName: currentBrand,\n        name: currentBrand,\n        marketingContext: {},\n        contextIsolation:\n            "CURRENT_SEMANTIC_BRAND_ISOLATED"\n    };\n}\n\nfunction missingCriticalInputs(context = {}, instruction = "") {\n    const brandName =\n        inferBrandName(\n            instruction,\n            availableContext(context)\n        );\n    return brandName\n        ? []\n        : [REQUIRED_MARKETING_IDENTITY];\n}\n\n''',
    'marketing-semantic-context-only'
)

text = replace_between(
    text,
    'function inferAudience(instruction, context) {',
    'function buildHooks(brand, pain, promise, differentiator) {',
    '''function inferAudience(_instruction, context = {}) {\n    return (\n        clean(context.audience) ||\n        "clientes potenciales relevantes para la oferta de la marca"\n    );\n}\n\nfunction deriveCreativeBrief(instruction, context = {}) {\n    const brandName =\n        inferBrandName(instruction, context);\n    const audience =\n        inferAudience(instruction, context);\n\n    return {\n        brandName,\n        audience,\n        offer:\n            clean(context.offer) ||\n            `Estrategia integral para presentar, posicionar y convertir la oferta de ${brandName}`,\n        pain:\n            clean(context.pain) ||\n            "fricción entre una necesidad real del cliente y una decisión de compra clara",\n        promise:\n            clean(context.promise) ||\n            "una propuesta de valor clara, fácil de entender y orientada a conversión",\n        differentiator:\n            clean(context.differentiator) ||\n            "una experiencia de marca consistente, medible y optimizable",\n        cta:\n            clean(context.cta) ||\n            `Conoce la propuesta de ${brandName}`,\n        tone:\n            clean(context.tone) ||\n            clean(context.voice) ||\n            "directo, confiable y profesional",\n        inferredFields: [\n            ...(!clean(context.audience)\n                ? ["audience"]\n                : []),\n            ...(!clean(context.offer)\n                ? ["offer"]\n                : []),\n            ...(!clean(context.pain)\n                ? ["pain"]\n                : []),\n            ...(!clean(context.promise)\n                ? ["promise"]\n                : []),\n            ...(!clean(context.differentiator)\n                ? ["differentiator"]\n                : []),\n            ...(!clean(context.cta)\n                ? ["cta"]\n                : [])\n        ]\n    };\n}\n\n''',
    'marketing-no-lexical-audience-subject'
)

text = replace_once(
    text,
    '    const budget = clean(context.budget) || "escenario por definir";\n    const horizon = clean(context.horizon) || "90 días";',
    '    const budget = clean(context.budget) || "presupuesto piloto por definir";\n    const horizon = clean(context.horizon) || "90 días como supuesto inicial de planificación";',
    'marketing-editable-budget-horizon'
)
text = replace_once(
    text,
    '{ scenario: "medium", allocation: clean(context.mediumBudget) || `Aumentar 2-3x ${budget}`, mix: "65% captación, 20% contenido, 15% experimentos" }',
    '{ scenario: "medium", allocation: clean(context.mediumBudget) || "escenario de escalamiento condicionado a resultados", mix: "65% captación, 20% contenido, 15% experimentos" }',
    'marketing-no-budget-multiplier'
)
text = replace_once(
    text,
    '        market: clean(context.market) || "México",',
    '        market: clean(context.market) || "mercado prioritario por validar",',
    'marketing-market-assumption'
)

campaign_anchor = '    const grounding = buildGrounding(context);\n    const campaign = {'
campaign_new = '''    const grounding = buildGrounding(context);\n    const inferredPlanningFields = [\n        ...(!clean(context.campaignObjective)\n            ? ["campaignObjective"]\n            : []),\n        ...(!clean(context.market)\n            ? ["market"]\n            : []),\n        ...(!clean(context.budget)\n            ? ["budget"]\n            : []),\n        ...(!clean(context.horizon)\n            ? ["horizon"]\n            : []),\n        ...(strings(context.channels).length === 0\n            ? ["channels"]\n            : []),\n        ...(strings(context.assets).length === 0\n            ? ["assets"]\n            : [])\n    ];\n    const allInferredFields = [\n        ...new Set([\n            ...creativeBrief.inferredFields,\n            ...inferredPlanningFields\n        ])\n    ];\n    const campaign = {'''
text = replace_once(
    text,
    campaign_anchor,
    campaign_new,
    'marketing-all-editable-assumptions'
)
text = replace_once(
    text,
    '        assumptions: creativeBrief.inferredFields.map(field => ({',
    '        assumptions: allInferredFields.map(field => ({',
    'marketing-campaign-assumptions'
)
text = replace_once(
    text,
    '        inferredInputs: creativeBrief.inferredFields,',
    '        inferredInputs: allInferredFields,',
    'marketing-result-assumptions'
)
text = replace_once(
    text,
    '${creativeBrief.inferredFields.length} campos se marcaron como propuestas editables y ',
    '${allInferredFields.length} campos se marcaron como propuestas editables y ',
    'marketing-message-assumption-count'
)
text = replace_once(
    text,
    'routing: "natural_instruction_with_semantic_and_local_resilience",',
    'routing: "semantic_fields_with_editable_assumptions",',
    'marketing-routing-label'
)
write(path, text)


# ---------------------------------------------------------------------------
# Multitool pack: semantic business responses, semantic-first marketing args,
# and contact values grounded to exact user-provided literals.
# ---------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.multitool.pack.js'
text = read(path)

text = replace_once(
    text,
    'from "./jarvis.marketing.engine.js?v=sia7-marketing-v10-runtime-source-authority-20260724";',
    'from "./jarvis.marketing.engine.js?v=v94-semantic-only-marketing-v11-20260809";',
    'multitool-marketing-cache'
)
text = replace_once(
    text,
    '''\nimport {\n    runBusinessIntent\n} from "./jarvis.business.engine.js";\n''',
    '\n',
    'multitool-remove-business-parser-import'
)

text = replace_once(
    text,
    '        campaignObjective: { type: "string" },\n        durationSeconds: { type: "number" }',
    '        campaignObjective: { type: "string" },\n        budget: { type: "string" },\n        mediumBudget: { type: "string" },\n        horizon: { type: "string" },\n        durationSeconds: { type: "number" }',
    'multitool-marketing-schema'
)

page_anchor = 'function normalizedPageArtifactInput(value = {}, fallbackTitle = "") {\n'
page_helpers = '''function contactDigits(value = "") {\n    let digits = "";\n    for (const character of String(value || "")) {\n        const code = character.charCodeAt(0);\n        if (code >= 48 && code <= 57) {\n            digits += character;\n        }\n    }\n    return digits;\n}\n\nexport function groundPageContactInput(\n    value = {},\n    instruction = "",\n    declared = {}\n) {\n    const pageInput =\n        normalizedPageArtifactInput(value);\n    const source =\n        String(instruction || "");\n    const sourceLower =\n        source.toLocaleLowerCase();\n    const declaredEmail =\n        String(\n            declared?.contactEmail ||\n            pageInput.contactEmail ||\n            ""\n        ).trim();\n    const declaredWhatsapp =\n        contactDigits(\n            declared?.whatsapp ||\n            pageInput.whatsapp ||\n            ""\n        );\n    const sourceDigits =\n        contactDigits(source);\n    const emailGrounded =\n        Boolean(declaredEmail) &&\n        sourceLower.includes(\n            declaredEmail.toLocaleLowerCase()\n        );\n    const whatsappGrounded =\n        declaredWhatsapp.length >= 7 &&\n        sourceDigits.includes(declaredWhatsapp);\n\n    return {\n        ...pageInput,\n        contactEmail:\n            emailGrounded\n                ? declaredEmail\n                : "",\n        whatsapp:\n            whatsappGrounded\n                ? declaredWhatsapp\n                : "",\n        whatsappRequested:\n            declared?.whatsappRequested === true\n    };\n}\n\n'''
text = replace_once(
    text,
    page_anchor,
    page_helpers + page_anchor,
    'multitool-page-contact-grounding-helper'
)

old_completion_sources = '''    const sources = Array.isArray(context.validSources)\n        ? context.validSources.filter(Boolean).slice(0, 12)\n        : [];\n    if (sources.length === 0) return null;\n    const semantic = await completeJarvisPlanningArguments({'''
new_completion_sources = '''    const sources = Array.isArray(context.validSources)\n        ? context.validSources.filter(Boolean).slice(0, 12)\n        : [];\n    const semantic = await completeJarvisPlanningArguments({'''
text = replace_once(
    text,
    old_completion_sources,
    new_completion_sources,
    'multitool-semantic-args-without-external-sources'
)

business_start = '        register(runtime, {\n            name: "business.assist",'
business_end = '        register(runtime, {\n            name: "marketing.plan",'
business_replacement = '''        register(runtime, {\n            name: "business.assist",\n            description: "Analiza estrategia, operaciones, ventas, costos, riesgos y decisiones empresariales mediante razonamiento semántico; no inventa datos ni modifica sistemas.",\n            output: "SIA7_BUSINESS_RESPONSE",\n            inputSchema: {\n                prompt: "string"\n            },\n            execute: async (args = {}, context = {}) => {\n                const instruction =\n                    resolveInstruction(args, context);\n                const groundedContext =\n                    recentGroundedBusinessContext();\n                const businessPrompt = [\n                    "Actua como asesor empresarial privado del Arqui Heberto Mendoza.",\n                    "Comprende la solicitud por significado; no la reclasifiques con listas de palabras, diccionarios locales ni patrones de texto.",\n                    "Responde la solicitud concreta con diagnostico, recomendacion, riesgos y siguientes acciones.",\n                    "No inventes cifras, clientes, resultados ni hechos; separa hechos proporcionados de supuestos editables.",\n                    "No autorices ni ejecutes cambios. Usa espanol claro y util.",\n                    `SOLICITUD=${instruction}`,\n                    groundedContext\n                        ? `CONTEXTO_VERIFICADO=${groundedContext}`\n                        : "CONTEXTO_VERIFICADO=NO_DISPONIBLE"\n                ].join("\\n").slice(0, 2600);\n                const semantic =\n                    await fetchSemanticConversation(\n                        businessPrompt\n                    );\n\n                if (\n                    semantic?.ok === true &&\n                    semantic?.message\n                ) {\n                    return {\n                        ok: true,\n                        status: "BUSINESS_ADVISORY_READY",\n                        source: "BUSINESS_SEMANTIC_MODEL",\n                        version: VERSION,\n                        message: semantic.message,\n                        provider: semantic.provider || null,\n                        model: semantic.model || null,\n                        instruction,\n                        advisory: true,\n                        factsPolicy: "NO_INVENTED_FACTS"\n                    };\n                }\n\n                return {\n                    ok: false,\n                    status: "BUSINESS_SEMANTIC_UNAVAILABLE",\n                    source: "BUSINESS_SEMANTIC_MODEL",\n                    error:\n                        semantic?.error ||\n                        semantic?.status ||\n                        "SEMANTIC_MODEL_UNAVAILABLE",\n                    instruction,\n                    retryable: true,\n                    factsPolicy: "NO_INVENTED_FACTS"\n                };\n            }\n        }),\n'''
text = replace_between(
    text,
    business_start,
    business_end,
    business_replacement,
    'multitool-business-semantic-only'
)

marketing_start = '''                let planningArgs = args;\n                let result = planMarketingRequest(\n                    instruction,\n                    {\n                        ...context,\n                        ...planningArgs,\n                        ...resolveAuthority(planningArgs, context)\n                    }\n                );\n                let semanticEnrichment = null;\n                if (\n                    result?.readyForProduction !== true &&\n                    Array.isArray(context.validSources) &&\n                    context.validSources.length > 0\n                ) {\n                    try {\n                        semanticEnrichment = await completeGroundedToolArgs({\n                            toolName: "marketing.plan",\n                            description: "Completa un brief de campaña específico y sustentado para continuar una misión multifunción.",\n                            inputSchema: MARKETING_ARGUMENT_SCHEMA,\n                            args: planningArgs,\n                            context\n                        });\n                        planningArgs = semanticEnrichment?.args || planningArgs;\n                        result = planMarketingRequest(\n                            instruction,\n                            {\n                                ...context,\n                                ...planningArgs,\n                                ...resolveAuthority(planningArgs, context)\n                            }\n                        );\n                    } catch (error) {\n                        return {\n                            ...result,\n                            ok: false,\n                            status: "MARKETING_ARGUMENT_ENRICHMENT_UNAVAILABLE",\n                            objectiveSatisfied: false,\n                            requiresInput: false,\n                            retryable: true,\n                            error: error?.message || String(error)\n                        };\n                    }\n                }'''
marketing_new = '''                let planningArgs = args;\n                let semanticEnrichment = null;\n                let semanticEnrichmentError = null;\n\n                try {\n                    semanticEnrichment = await completeGroundedToolArgs({\n                        toolName: "marketing.plan",\n                        description: "Completa el brief estratégico de la herramienta ya seleccionada por significado. Los campos no factuales pueden ser propuestas editables.",\n                        inputSchema: MARKETING_ARGUMENT_SCHEMA,\n                        args: planningArgs,\n                        context\n                    });\n                    planningArgs =\n                        semanticEnrichment?.args ||\n                        planningArgs;\n                }\n                catch(error) {\n                    semanticEnrichmentError =\n                        error?.message ||\n                        String(error);\n                }\n\n                let result = planMarketingRequest(\n                    instruction,\n                    {\n                        ...context,\n                        ...planningArgs,\n                        ...resolveAuthority(planningArgs, context)\n                    }\n                );'''
text = replace_once(
    text,
    marketing_start,
    marketing_new,
    'multitool-marketing-semantic-first'
)

# Only alter the semantic metadata fallback inside marketing.plan.
marketing_name_index = text.index('name: "marketing.plan"')
meta_old = '''                        : {\n                            used: false\n                        }'''
meta_index = text.find(meta_old, marketing_name_index)
if meta_index < 0:
    raise SystemExit('PATCH_ANCHOR_FAILED:multitool-marketing-semantic-meta:0')
meta_new = '''                        : {\n                            used: false,\n                            error:\n                                semanticEnrichmentError ||\n                                null\n                        }'''
text = text[:meta_index] + meta_new + text[meta_index + len(meta_old):]

# Extend page.compose structured args so semantic planning can declare contact intent.
page_compose_schema_old = '''            inputSchema: {\n                brandName: "string",\n                title: "string",\n                instructions: "string"\n            },'''
page_compose_schema_new = '''            inputSchema: {\n                brandName: "string",\n                title: "string",\n                instructions: "string",\n                contactEmail: "string",\n                whatsapp: "string",\n                whatsappRequested: "boolean"\n            },'''
text = replace_once(
    text,
    page_compose_schema_old,
    page_compose_schema_new,
    'multitool-page-compose-schema'
)

page_prompt_anchor = '                        "Si el usuario pide WhatsApp pero no dio número, usa whatsapp vacío y whatsappRequested=true; nunca inventes un número.",\n'
text = replace_once(
    text,
    page_prompt_anchor,
    page_prompt_anchor + '                        "Si el usuario no dio ningún canal de contacto, deja whatsapp y contactEmail vacíos; una página válida no necesita inventarlos.",\n',
    'multitool-page-contact-optional-prompt'
)

page_parse_old = '''                    pageInput =\n                        normalizedPageArtifactInput(\n                            extractSemanticJsonObject(\n                                semantic?.message ||\n                                ""\n                            ),\n                            clean(args.title)\n                        );'''
page_parse_new = '''                    pageInput =\n                        groundPageContactInput(\n                            normalizedPageArtifactInput(\n                                extractSemanticJsonObject(\n                                    semantic?.message ||\n                                    ""\n                                ),\n                                clean(args.title)\n                            ),\n                            instruction,\n                            {\n                                contactEmail:\n                                    args.contactEmail,\n                                whatsapp:\n                                    args.whatsapp,\n                                whatsappRequested:\n                                    args.whatsappRequested === true\n                            }\n                        );'''
text = replace_once(
    text,
    page_parse_old,
    page_parse_new,
    'multitool-page-contact-grounding'
)

page_gate_old = '''                const contactReady =\n                    pageInput.whatsapp ||\n                    pageInput.contactEmail.includes("@") ||\n                    pageInput.whatsappRequested;\n                const ok =\n                    semantic?.ok === true &&\n                    pageInput.brandName &&\n                    pageInput.title &&\n                    pageInput.description.length >= 20 &&\n                    pageInput.services.length > 0 &&\n                    contactReady;'''
page_gate_new = '''                const ok =\n                    semantic?.ok === true &&\n                    pageInput.brandName &&\n                    pageInput.title &&\n                    pageInput.description.length >= 20 &&\n                    pageInput.services.length > 0;'''
text = replace_once(
    text,
    page_gate_old,
    page_gate_new,
    'multitool-page-no-contact-gate'
)
text = replace_once(
    text,
    '                            : "PAGE_CONTENT_OR_CONTACT_REQUIRED"',
    '                            : "PAGE_CONTENT_REQUIRED"',
    'multitool-page-error'
)
write(path, text)


# ---------------------------------------------------------------------------
# Cache chain: make the browser load the semantic-only modules.
# ---------------------------------------------------------------------------
path = 'gestia-core/gestia-core.js'
text = read(path)
text = replace_once(
    text,
    '/gestia-core/jarvis/jarvis.conversation.composer.js?v=sia7-conversation-evidence-v98-20260727',
    '/gestia-core/jarvis/jarvis.conversation.composer.js?v=v94-semantic-only-evidence-v100-20260809',
    'core-composer-cache'
)
text = replace_once(
    text,
    '/gestia-core/tools.runtime.js?v=jarvis-tools-v7-20260728-identity-fidelity-v106',
    '/gestia-core/tools.runtime.js?v=v94-semantic-only-v108-20260809',
    'core-runtime-cache'
)
write(path, text)

path = 'gestia-core/tools.runtime.js'
text = read(path)
text = replace_once(
    text,
    './jarvis/jarvis.multitool.pack.js?v=sia7-test-outcome-evidence-v100-20260727',
    './jarvis/jarvis.multitool.pack.js?v=v94-semantic-only-tools-v102-20260809',
    'runtime-multitool-cache'
)
write(path, text)

print('V94_SEMANTIC_ONLY_FRONT_PATCH_APPLIED')
