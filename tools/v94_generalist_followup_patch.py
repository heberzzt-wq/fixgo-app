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


# ---------------------------------------------------------------------------
# 1) Conversation composer: preserve bounded repository evidence instead of
#    deleting the very search/read/diagnose/impact data the model must explain.
# ---------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.conversation.composer.js'
text = read(path)

text = replace_once(
    text,
    '''    const lines = [\n        `Pariente, revisé visualmente ${sources.length} archivos y esto es lo que sí pude confirmar.`\n    ];''',
    '''    const fileLabel =\n        sources.length === 1\n            ? "archivo"\n            : "archivos";\n    const lines = [\n        `Pariente, revisé visualmente ${sources.length} ${fileLabel} y esto es lo que sí pude confirmar.`\n    ];''',
    'media-singular-plural'
)

anchor = '''export function buildBoundedConversationEvidence(evidenceItems = []) {\n'''
helper = '''function compactRepositoryObservation(\n    observation = {},\n    {\n        readLimit = 8000,\n        stringLimit = 1200,\n        arrayLimit = 16\n    } = {}\n) {\n    const source =\n        observation &&\n        typeof observation === "object" &&\n        !Array.isArray(observation)\n            ? observation\n            : {};\n    const verifiedRead =\n        source?.verifiedRead &&\n        typeof source.verifiedRead === "object" &&\n        !Array.isArray(source.verifiedRead)\n            ? source.verifiedRead\n            : null;\n    const repositoryEvidence = {\n        file: source?.file,\n        path: source?.path,\n        requestedFile: source?.requestedFile,\n        resolvedFile: source?.resolvedFile,\n        totalMatches: source?.totalMatches,\n        matches: source?.matches,\n        findings: source?.findings,\n        references: source?.references,\n        dependents: source?.dependents,\n        dependencies: source?.dependencies,\n        totalDependents: source?.totalDependents,\n        sourceStructure: source?.sourceStructure,\n        evidence: source?.evidence,\n        repositoryEvidence: source?.repositoryEvidence\n    };\n\n    return {\n        ok: source?.ok,\n        executionOk: source?.executionOk,\n        objectiveSatisfied: source?.objectiveSatisfied,\n        status: source?.status,\n        summary: compactEvidenceText(source?.summary || "", stringLimit),\n        error: compactEvidenceText(source?.error || "", Math.min(stringLimit, 800)),\n        artifact: compactEvidenceText(source?.artifact || "", 500),\n        verifiedRead: verifiedRead\n            ? {\n                tool: "repo.read",\n                file: compactEvidenceText(verifiedRead?.file || "", 500),\n                path: compactEvidenceText(verifiedRead?.path || "", 500),\n                partial: verifiedRead?.partial === true,\n                startLine: verifiedRead?.startLine ?? null,\n                endLine: verifiedRead?.endLine ?? null,\n                totalLines: verifiedRead?.totalLines ?? null,\n                numberedContent: String(\n                    verifiedRead?.numberedContent ||\n                    ""\n                ).slice(0, readLimit),\n                sourceStructure: constrainCompactEvidence(\n                    verifiedRead?.sourceStructure || {},\n                    {\n                        stringLimit: Math.min(stringLimit, 700),\n                        arrayLimit: Math.min(arrayLimit, 10)\n                    }\n                )\n            }\n            : null,\n        repositoryEvidence: constrainCompactEvidence(\n            repositoryEvidence,\n            {\n                stringLimit,\n                arrayLimit\n            }\n        )\n    };\n}\n\n'''
text = replace_once(text, anchor, helper + anchor, 'repo-evidence-helper')

old_bounded = '''    const bounded = (Array.isArray(evidenceItems) ? evidenceItems : [])\n        .slice(0, MAX_EVIDENCE_ITEMS)\n        .map(item => ({\n            tool: String(item?.name || item?.tool || "unknown").slice(0, 120),\n            observation: boundedEvidenceValue(\n                item?.observation ??\n                item?.response ??\n                item?.data ??\n                item\n            )\n        }));'''
new_bounded = '''    const bounded = (Array.isArray(evidenceItems) ? evidenceItems : [])\n        .slice(0, MAX_EVIDENCE_ITEMS)\n        .map(item => {\n            const tool =\n                String(\n                    item?.name ||\n                    item?.tool ||\n                    "unknown"\n                ).slice(0, 120);\n            const observation =\n                item?.observation ??\n                item?.response ??\n                item?.data ??\n                item;\n\n            return {\n                tool,\n                observation:\n                    tool.startsWith("repo.")\n                        ? compactRepositoryObservation(\n                            observation\n                        )\n                        : boundedEvidenceValue(\n                            observation\n                        )\n            };\n        });'''
text = replace_once(text, old_bounded, new_bounded, 'repo-evidence-initial')

old_compact_head = '''    let compact = bounded.map(item => {\n        const observation =\n            item.observation &&\n            typeof item.observation === "object" &&\n            !Array.isArray(item.observation)\n                ? item.observation\n                : {};\n\n        const isMediaAnalysis ='''
new_compact_head = '''    let compact = bounded.map(item => {\n        const observation =\n            item.observation &&\n            typeof item.observation === "object" &&\n            !Array.isArray(item.observation)\n                ? item.observation\n                : {};\n\n        if (item.tool.startsWith("repo.")) {\n            return {\n                tool: item.tool,\n                observation:\n                    compactRepositoryObservation(\n                        observation,\n                        {\n                            readLimit: 6000,\n                            stringLimit: 800,\n                            arrayLimit: 12\n                        }\n                    )\n            };\n        }\n\n        const isMediaAnalysis ='''
text = replace_once(text, old_compact_head, new_compact_head, 'repo-evidence-oversize')

old_emergency = '''        compact =\n            compact.map(item => {\n                const observation =\n                    item.observation &&\n                    typeof item.observation ===\n                        "object" &&\n                    !Array.isArray(\n                        item.observation\n                    )\n                        ? item.observation\n                        : {};\n\n                return {\n                    tool: item.tool,\n                    observation: {'''
new_emergency = '''        compact =\n            compact.map(item => {\n                const observation =\n                    item.observation &&\n                    typeof item.observation ===\n                        "object" &&\n                    !Array.isArray(\n                        item.observation\n                    )\n                        ? item.observation\n                        : {};\n\n                if (item.tool.startsWith("repo.")) {\n                    return {\n                        tool: item.tool,\n                        observation:\n                            compactRepositoryObservation(\n                                observation,\n                                {\n                                    readLimit: 900,\n                                    stringLimit: 180,\n                                    arrayLimit: 3\n                                }\n                            )\n                    };\n                }\n\n                return {\n                    tool: item.tool,\n                    observation: {'''
text = replace_once(text, old_emergency, new_emergency, 'repo-evidence-emergency')

prompt_anchor = '''        "Resume resultados y limitaciones reales. No muestres JSON, nombres de campos internos, telemetria ni payloads de herramientas.",\n'''
prompt_new = prompt_anchor + '''        "Cuando la evidencia provenga de repo.*, usa las rutas, coincidencias, lecturas numeradas, diagnósticos y dependencias preservadas; si esos datos están presentes, no afirmes que los resultados del repositorio no están disponibles.",\n'''
text = replace_once(text, prompt_anchor, prompt_new, 'repo-composer-prompt')
write(path, text)


# ---------------------------------------------------------------------------
# 2) Page composition: contact information is optional and must be grounded in
#    the user's actual instruction. A missing contact channel cannot invalidate
#    otherwise complete page content.
# ---------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.multitool.pack.js'
text = read(path)

text = replace_once(
    text,
    '''        campaignObjective: { type: "string" },\n        durationSeconds: { type: "number" }''',
    '''        campaignObjective: { type: "string" },\n        budget: { type: "string" },\n        mediumBudget: { type: "string" },\n        horizon: { type: "string" },\n        durationSeconds: { type: "number" }''',
    'marketing-schema-planning-fields'
)

page_anchor = '''function normalizedPageArtifactInput(value = {}, fallbackTitle = "") {\n'''
page_helper = '''function contactDigits(value = "") {\n    return Array.from(String(value || ""))\n        .filter(character => {\n            const code = character.charCodeAt(0);\n            return code >= 48 && code <= 57;\n        })\n        .join("");\n}\n\nexport function groundPageContactInput(value = {}, instruction = "") {\n    const pageInput =\n        normalizedPageArtifactInput(value);\n    const source =\n        String(instruction || "");\n    const sourceLower =\n        source.toLocaleLowerCase();\n    const requestedEmail =\n        String(pageInput.contactEmail || "").trim();\n    const emailGrounded =\n        requestedEmail &&\n        sourceLower.includes(\n            requestedEmail.toLocaleLowerCase()\n        );\n    const requestedWhatsapp =\n        contactDigits(pageInput.whatsapp);\n    const sourceDigits =\n        contactDigits(source);\n    const whatsappGrounded =\n        requestedWhatsapp.length >= 7 &&\n        sourceDigits.includes(requestedWhatsapp);\n    const whatsappRequestedGrounded =\n        pageInput.whatsappRequested === true &&\n        sourceLower.includes("whatsapp");\n\n    return {\n        ...pageInput,\n        contactEmail:\n            emailGrounded\n                ? requestedEmail\n                : "",\n        whatsapp:\n            whatsappGrounded\n                ? requestedWhatsapp\n                : "",\n        whatsappRequested:\n            whatsappRequestedGrounded\n    };\n}\n\n'''
text = replace_once(text, page_anchor, page_anchor + page_helper, 'page-contact-grounding-helper')
# The helper was inserted after the function signature by the previous replacement;
# move it before the function so declarations are structurally valid.
text = text.replace(
    '''function normalizedPageArtifactInput(value = {}, fallbackTitle = "") {\nfunction contactDigits(value = "") {''',
    '''function contactDigits(value = "") {''',
    1
)
helper_end = '''}\n\n    const services = Array.isArray(value?.services)'''
text = replace_once(
    text,
    helper_end,
    '''}\n\nfunction normalizedPageArtifactInput(value = {}, fallbackTitle = "") {\n    const services = Array.isArray(value?.services)''',
    'page-helper-order'
)

text = replace_once(
    text,
    '''                        "If the user asks for WhatsApp but did not provide a number, use whatsapp empty and whatsappRequested=true; never invent a number.",''',
    '''                        "If the user asks for WhatsApp but did not provide a number, use whatsapp empty and whatsappRequested=true; never invent a number.",\n                        "If the user provided no contact channel at all, leave whatsapp and contactEmail empty; page content is still valid without contact data.",''',
    'page-prompt-contact-optional'
)

old_page_parse = '''                    pageInput =\n                        normalizedPageArtifactInput(\n                            extractSemanticJsonObject(\n                                semantic?.message ||\n                                ""\n                            ),\n                            clean(args.title)\n                        );'''
new_page_parse = '''                    pageInput =\n                        groundPageContactInput(\n                            normalizedPageArtifactInput(\n                                extractSemanticJsonObject(\n                                    semantic?.message ||\n                                    ""\n                                ),\n                                clean(args.title)\n                            ),\n                            instruction\n                        );'''
text = replace_once(text, old_page_parse, new_page_parse, 'page-ground-contact')

old_contact_gate = '''                const contactReady =\n                    pageInput.whatsapp ||\n                    pageInput.contactEmail.includes("@") ||\n                    pageInput.whatsappRequested;\n                const ok =\n                    semantic?.ok === true &&\n                    pageInput.brandName &&\n                    pageInput.title &&\n                    pageInput.description.length >= 20 &&\n                    pageInput.services.length > 0 &&\n                    contactReady;'''
new_contact_gate = '''                const ok =\n                    semantic?.ok === true &&\n                    pageInput.brandName &&\n                    pageInput.title &&\n                    pageInput.description.length >= 20 &&\n                    pageInput.services.length > 0;'''
text = replace_once(text, old_contact_gate, new_contact_gate, 'page-contact-not-required')

text = replace_once(
    text,
    '''                            : "PAGE_CONTENT_OR_CONTACT_REQUIRED"''',
    '''                            : "PAGE_CONTENT_REQUIRED"''',
    'page-error-contact-not-required'
)

old_marketing_execution = '''                let planningArgs = args;\n                let result = planMarketingRequest(\n                    instruction,\n                    {\n                        ...context,\n                        ...planningArgs,\n                        ...resolveAuthority(planningArgs, context)\n                    }\n                );\n                let semanticEnrichment = null;\n                if (\n                    result?.readyForProduction !== true &&\n                    Array.isArray(context.validSources) &&\n                    context.validSources.length > 0\n                ) {\n                    try {\n                        semanticEnrichment = await completeGroundedToolArgs({\n                            toolName: "marketing.plan",\n                            description: "Completa un brief de campaña específico y sustentado para continuar una misión multifunción.",\n                            inputSchema: MARKETING_ARGUMENT_SCHEMA,\n                            args: planningArgs,\n                            context\n                        });\n                        planningArgs = semanticEnrichment?.args || planningArgs;\n                        result = planMarketingRequest(\n                            instruction,\n                            {\n                                ...context,\n                                ...planningArgs,\n                                ...resolveAuthority(planningArgs, context)\n                            }\n                        );\n                    } catch (error) {\n                        return {\n                            ...result,\n                            ok: false,\n                            status: "MARKETING_ARGUMENT_ENRICHMENT_UNAVAILABLE",\n                            objectiveSatisfied: false,\n                            requiresInput: false,\n                            retryable: true,\n                            error: error?.message || String(error)\n                        };\n                    }\n                }'''
new_marketing_execution = '''                let planningArgs = args;\n                let semanticEnrichment = null;\n                let semanticEnrichmentError = null;\n\n                try {\n                    semanticEnrichment = await completeGroundedToolArgs({\n                        toolName: "marketing.plan",\n                        description: "Completa el brief estratégico de la herramienta ya seleccionada usando la intención actual; los campos no factuales pueden ser propuestas editables.",\n                        inputSchema: MARKETING_ARGUMENT_SCHEMA,\n                        args: planningArgs,\n                        context\n                    });\n                    planningArgs =\n                        semanticEnrichment?.args ||\n                        planningArgs;\n                } catch (error) {\n                    semanticEnrichmentError =\n                        error?.message ||\n                        String(error);\n                }\n\n                let result = planMarketingRequest(\n                    instruction,\n                    {\n                        ...context,\n                        ...planningArgs,\n                        ...resolveAuthority(planningArgs, context)\n                    }\n                );'''
text = replace_once(text, old_marketing_execution, new_marketing_execution, 'marketing-semantic-enrichment-first')

old_semantic_meta = '''                        : {\n                            used: false\n                        }'''
new_semantic_meta = '''                        : {\n                            used: false,\n                            error:\n                                semanticEnrichmentError ||\n                                null\n                        }'''
# Replace only the first occurrence after marketing block, not page/image/reel metadata.
marketing_index = text.index('name: "marketing.plan"')
meta_index = text.index(old_semantic_meta, marketing_index)
if meta_index < 0:
    raise SystemExit('PATCH_ANCHOR_FAILED:marketing-semantic-meta:0')
text = text[:meta_index] + new_semantic_meta + text[meta_index + len(old_semantic_meta):]

# Allow selected-tool semantic argument completion even when there are no external
# sources; the original user instruction remains the source of truth.
text = replace_once(
    text,
    '''    const sources = Array.isArray(context.validSources)\n        ? context.validSources.filter(Boolean).slice(0, 12)\n        : [];\n    if (sources.length === 0) return null;\n    const semantic = await completeJarvisPlanningArguments({''',
    '''    const sources = Array.isArray(context.validSources)\n        ? context.validSources.filter(Boolean).slice(0, 12)\n        : [];\n    const semantic = await completeJarvisPlanningArguments({''',
    'semantic-args-without-external-sources'
)
write(path, text)


# ---------------------------------------------------------------------------
# 3) Marketing engine: only identity can truly block. Everything else becomes
#    an explicit editable planning assumption instead of a lexical gate.
# ---------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.marketing.engine.js'
text = read(path)

old_groups = '''const CRITICAL_INPUT_GROUPS = [\n    { id: "business", fields: ["brandName"], question: "¿Cuál es el negocio, marca o producto?" },\n    { id: "goal", fields: ["campaignObjective"], question: "¿Cuál es el objetivo comercial principal?" },\n    { id: "market", fields: ["audience", "market"], question: "¿A qué público y mercado o ubicación se dirige?" },\n    { id: "value", fields: ["offer", "pain", "differentiator"], question: "¿Cuál es la oferta, qué problema resuelve y cuál es su diferenciador?" },\n    { id: "execution", fields: ["budget", "horizon", "cta"], question: "¿Qué presupuesto o escenario, horizonte y llamada a la acción se usarán?" }\n];'''
new_groups = '''const REQUIRED_MARKETING_IDENTITY = {\n    id: "business",\n    fields: ["brandName"],\n    question: "¿Para qué negocio, marca o producto preparo el plan?"\n};'''
text = replace_once(text, old_groups, new_groups, 'marketing-only-identity-required')

old_brand_helpers = '''function inferInstructionBrand(instruction = "") {\n    const source = clean(instruction);\n    const namedPlanTarget = source.match(\n        /\\bplan\\s+de\\s+marketing\\b.{0,120}?\\bpara\\s+(.+?)(?:[.,;]|$)/i\n    )?.[1]?.trim() || "";\n    if (namedPlanTarget) return namedPlanTarget;\n\n    const text = normalized(source);\n    if (text.includes("peninsula tech")) return "Peninsula Tech";\n    if (text.includes("gestiapremium") || text.includes("gestia premium")) return "GestiaPremium";\n    if (text.includes("fixgo") || text.includes("fix go")) return "FixGo";\n    return "";\n}\n\nfunction inferBrandName(instruction, context) {\n    const explicit = inferInstructionBrand(instruction);\n    if (explicit) return explicit;\n    if (clean(context.brandName) || clean(context.name)) {\n        return clean(context.brandName) || clean(context.name);\n    }\n    return "";\n}\n'''
new_brand_helpers = '''function inferBrandName(_instruction, context) {\n    return (\n        clean(context.brandName) ||\n        clean(context.name) ||\n        ""\n    );\n}\n'''
text = replace_once(text, old_brand_helpers, new_brand_helpers, 'marketing-no-lexical-brand-router')

old_isolation = '''function isolateMarketingContext(instruction, context = {}) {\n    const resolved = availableContext(context);\n    const explicitBrand = inferInstructionBrand(instruction);\n    const rememberedBrand = clean(resolved.brandName) || clean(resolved.name);\n    if (\n        !explicitBrand ||\n        !rememberedBrand ||\n        normalized(explicitBrand) === normalized(rememberedBrand)\n    ) {\n        return resolved;\n    }\n\n    const isolated = {};\n    for (const key of [\n        "objectiveId", "caseId", "authorityId", "controllerId",\n        "userId", "workspaceId", "projectId", "conversationId"\n    ]) {\n        if (resolved[key] !== undefined && resolved[key] !== null) {\n            isolated[key] = resolved[key];\n        }\n    }\n    return {\n        ...isolated,\n        brandName: explicitBrand,\n        name: explicitBrand,\n        marketingContext: {},\n        contextIsolation: "EXPLICIT_BRAND_MISSION_ISOLATED"\n    };\n}\n\nfunction missingCriticalInputs(context = {}, instruction = "") {\n    const resolved = availableContext(context);\n    const inferredBrand = inferBrandName(instruction, resolved);\n    const missing = CRITICAL_INPUT_GROUPS.filter(group =>\n        group.fields.every(field => {\n            if (field === "brandName") return !inferredBrand;\n            return !clean(resolved[field]);\n        })\n    );\n    const suppliedGroups = CRITICAL_INPUT_GROUPS.length - missing.length;\n    // A concrete brand plus two substantive groups is enough to continue with\n    // explicit, editable assumptions for non-blocking details.\n    return inferredBrand && suppliedGroups >= 3 ? [] : missing;\n}\n'''
new_isolation = '''function isolateMarketingContext(_instruction, context = {}) {\n    const resolved = availableContext(context);\n    const memory =\n        context.marketingContext &&\n        typeof context.marketingContext === "object"\n            ? context.marketingContext\n            : {};\n    const currentBrand =\n        clean(context.brandName) ||\n        clean(context.name);\n    const rememberedBrand =\n        clean(memory.brandName) ||\n        clean(memory.name);\n\n    if (\n        !currentBrand ||\n        !rememberedBrand ||\n        normalized(currentBrand) === normalized(rememberedBrand)\n    ) {\n        return resolved;\n    }\n\n    const isolated = {};\n    for (const key of [\n        "objectiveId", "caseId", "authorityId", "controllerId",\n        "userId", "workspaceId", "projectId", "conversationId"\n    ]) {\n        if (resolved[key] !== undefined && resolved[key] !== null) {\n            isolated[key] = resolved[key];\n        }\n    }\n    return {\n        ...isolated,\n        brandName: currentBrand,\n        name: currentBrand,\n        marketingContext: {},\n        contextIsolation: "CURRENT_SEMANTIC_BRAND_ISOLATED"\n    };\n}\n\nfunction missingCriticalInputs(context = {}, instruction = "") {\n    const resolved = availableContext(context);\n    const inferredBrand = inferBrandName(instruction, resolved);\n    return inferredBrand\n        ? []\n        : [REQUIRED_MARKETING_IDENTITY];\n}\n'''
text = replace_once(text, old_isolation, new_isolation, 'marketing-current-semantic-brand-isolation')

old_inference = '''function inferAudience(instruction, context) {\n    if (clean(context.audience)) return clean(context.audience);\n    const text = normalized(instruction);\n    if (text.includes("hotel") || text.includes("condominio") || text.includes("empresa")) {\n        return "administradores de inmuebles, hoteles, condominios y empresas";\n    }\n    if (text.includes("hogar") || text.includes("casa") || text.includes("domicilio")) {\n        return "propietarios y residentes que necesitan atención técnica confiable";\n    }\n    return "clientes residenciales y empresariales que valoran seguridad, trazabilidad y respuesta rápida";\n}\n\nfunction inferSubject(instruction) {\n    const text = normalized(instruction);\n    if (text.includes("aire acondicionado") || text.includes("aires acondicionados")) return "servicios de aire acondicionado";\n    if (text.includes("plomer")) return "servicios de plomería";\n    if (text.includes("electric")) return "servicios eléctricos";\n    if (text.includes("mantenimiento")) return "mantenimiento profesional";\n    if (text.includes("seguridad")) return "servicios de alta confianza";\n    return "servicios técnicos y operativos de confianza";\n}\n\nfunction deriveCreativeBrief(instruction, context) {\n    const brandName = inferBrandName(instruction, context);\n    const audience = inferAudience(instruction, context);\n    const subject = inferSubject(instruction);\n\n    return {\n        brandName,\n        audience,\n        offer: clean(context.offer) ||\n            `Programa integral para presentar y convertir la oferta de ${subject} de ${brandName}`,\n        pain: clean(context.pain) ||\n            "la dificultad para encontrar proveedores confiables, transparentes y trazables",\n        promise: clean(context.promise) ||\n            "una experiencia más clara, segura y documentada desde la solicitud hasta el cierre",\n        differentiator: clean(context.differentiator) ||\n            "identidad verificable, evidencia por servicio, seguimiento operativo y revisión humana de incidencias",\n        cta: clean(context.cta) ||\n            `Solicita una evaluación con ${brandName}`,\n        tone: clean(context.tone) || clean(context.voice) ||\n            "directo, confiable y profesional",\n        inferredFields: [\n            ...(!clean(context.brandName) && !clean(context.name) ? ["brandName"] : []),\n            ...(!clean(context.audience) ? ["audience"] : []),\n            ...(!clean(context.offer) ? ["offer"] : []),\n            ...(!clean(context.pain) ? ["pain"] : []),\n            ...(!clean(context.promise) ? ["promise"] : []),\n            ...(!clean(context.differentiator) ? ["differentiator"] : []),\n            ...(!clean(context.cta) ? ["cta"] : [])\n        ]\n    };\n}\n'''
new_inference = '''function inferAudience(_instruction, context) {\n    return (\n        clean(context.audience) ||\n        "clientes potenciales relevantes para la oferta de la marca"\n    );\n}\n\nfunction deriveCreativeBrief(instruction, context) {\n    const brandName = inferBrandName(instruction, context);\n    const audience = inferAudience(instruction, context);\n\n    return {\n        brandName,\n        audience,\n        offer: clean(context.offer) ||\n            `Estrategia integral para presentar, posicionar y convertir la oferta de ${brandName}`,\n        pain: clean(context.pain) ||\n            "fricción entre una necesidad real del cliente y una decisión de compra clara",\n        promise: clean(context.promise) ||\n            "una propuesta de valor clara, fácil de entender y orientada a conversión",\n        differentiator: clean(context.differentiator) ||\n            "una experiencia de marca consistente, medible y optimizable",\n        cta: clean(context.cta) ||\n            `Conoce la propuesta de ${brandName}`,\n        tone: clean(context.tone) || clean(context.voice) ||\n            "directo, confiable y profesional",\n        inferredFields: [\n            ...(!clean(context.audience) ? ["audience"] : []),\n            ...(!clean(context.offer) ? ["offer"] : []),\n            ...(!clean(context.pain) ? ["pain"] : []),\n            ...(!clean(context.promise) ? ["promise"] : []),\n            ...(!clean(context.differentiator) ? ["differentiator"] : []),\n            ...(!clean(context.cta) ? ["cta"] : [])\n        ]\n    };\n}\n'''
text = replace_once(text, old_inference, new_inference, 'marketing-no-lexical-audience-subject-dictionary')

text = replace_once(
    text,
    '''    const budget = clean(context.budget) || "escenario por definir";\n    const horizon = clean(context.horizon) || "90 días";''',
    '''    const budget = clean(context.budget) || "presupuesto piloto por definir";\n    const horizon = clean(context.horizon) || "90 días como supuesto inicial de planificación";''',
    'marketing-editable-budget-horizon'
)
text = replace_once(
    text,
    '''            { scenario: "medium", allocation: clean(context.mediumBudget) || `Aumentar 2-3x ${budget}`, mix: "65% captación, 20% contenido, 15% experimentos" }''',
    '''            { scenario: "medium", allocation: clean(context.mediumBudget) || "escenario de escalamiento condicionado a resultados", mix: "65% captación, 20% contenido, 15% experimentos" }''',
    'marketing-no-fabricated-budget-multiplier'
)

text = replace_once(
    text,
    '''        market: clean(context.market) || "México",''',
    '''        market: clean(context.market) || "mercado prioritario por validar",''',
    'marketing-market-assumption'
)

campaign_anchor = '''    const grounding = buildGrounding(context);\n    const campaign = {'''
campaign_insert = '''    const grounding = buildGrounding(context);\n    const inferredPlanningFields = [\n        ...(!clean(context.campaignObjective) ? ["campaignObjective"] : []),\n        ...(!clean(context.market) ? ["market"] : []),\n        ...(!clean(context.budget) ? ["budget"] : []),\n        ...(!clean(context.horizon) ? ["horizon"] : []),\n        ...(strings(context.channels).length === 0 ? ["channels"] : []),\n        ...(strings(context.assets).length === 0 ? ["assets"] : [])\n    ];\n    const allInferredFields = [\n        ...new Set([\n            ...creativeBrief.inferredFields,\n            ...inferredPlanningFields\n        ])\n    ];\n    const campaign = {'''
text = replace_once(text, campaign_anchor, campaign_insert, 'marketing-planning-assumptions')

text = replace_once(
    text,
    '''        assumptions: creativeBrief.inferredFields.map(field => ({''',
    '''        assumptions: allInferredFields.map(field => ({''',
    'marketing-campaign-all-assumptions'
)
text = replace_once(
    text,
    '''        inferredInputs: creativeBrief.inferredFields,''',
    '''        inferredInputs: allInferredFields,''',
    'marketing-visible-all-assumptions'
)
text = replace_once(
    text,
    '''            `${creativeBrief.inferredFields.length} campos se marcaron como propuestas editables y ` +''',
    '''            `${allInferredFields.length} campos se marcaron como propuestas editables y ` +''',
    'marketing-message-assumption-count'
)
write(path, text)

print('V94_GENERALIST_FOLLOWUP_PATCH_APPLIED')
