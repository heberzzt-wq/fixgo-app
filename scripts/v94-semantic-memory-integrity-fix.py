from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{path}: expected at least {count} matches, found {actual}: {old[:120]!r}")
    text = text.replace(old, new, count)
    p.write_text(text, encoding="utf-8")


memory_source = r'''const VERSION = "1.0.0-durable-semantic-conversations";
const STORAGE_PREFIX = "jarvis.semantic.memory.v1";
const SESSION_KEY = "jarvis.semantic.memory.activeConversation.v1";
const MAX_FALLBACK_RECORDS = 2000;
const fallbackMemory = new Map();

function clean(value = "", maximum = 120000) {
    return String(value ?? "").trim().slice(0, maximum);
}

function id(prefix = "MEM") {
    const generated = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${generated}`;
}

function scopeIdentity(identity = {}) {
    return {
        userId: clean(identity.userId, 180) || "anonymous",
        workspaceId: clean(identity.workspaceId, 180) || "UXMAL39",
        projectId: clean(identity.projectId, 180) || "adjunto"
    };
}

function scopeKey(identity = {}) {
    const scope = scopeIdentity(identity);
    return `${STORAGE_PREFIX}::${scope.userId}::${scope.workspaceId}::${scope.projectId}`;
}

function activeConversationId(sessionStorage = globalThis.sessionStorage) {
    try {
        const existing = clean(sessionStorage?.getItem?.(SESSION_KEY), 240);
        if (existing) return existing;
        const created = id("CONVERSATION");
        sessionStorage?.setItem?.(SESSION_KEY, created);
        return created;
    } catch {
        return id("CONVERSATION");
    }
}

function fallbackLoad(storage, key) {
    try {
        if (storage?.getItem) {
            const parsed = JSON.parse(storage.getItem(key) || "[]");
            return Array.isArray(parsed) ? parsed : [];
        }
    } catch {}
    return [...(fallbackMemory.get(key) || [])];
}

function fallbackSave(storage, key, records) {
    const bounded = records.slice(-MAX_FALLBACK_RECORDS);
    fallbackMemory.set(key, bounded);
    try {
        storage?.setItem?.(key, JSON.stringify(bounded));
    } catch {
        const reduced = bounded.slice(-500);
        fallbackMemory.set(key, reduced);
        try {
            storage?.setItem?.(key, JSON.stringify(reduced));
        } catch {}
    }
}

function recordBase(identity, conversationId, kind, now) {
    const scope = scopeIdentity(identity);
    return {
        id: id(kind),
        kind,
        ...scope,
        conversationId: clean(conversationId, 240) || activeConversationId(),
        createdAt: now()
    };
}

export function createJarvisSemanticMemory({
    storage = globalThis.localStorage,
    sessionStorage = globalThis.sessionStorage,
    now = () => new Date().toISOString()
} = {}) {
    const conversationId = () => activeConversationId(sessionStorage);

    function records(identity = {}) {
        return fallbackLoad(storage, scopeKey(identity));
    }

    function write(identity = {}, next = []) {
        fallbackSave(storage, scopeKey(identity), next);
    }

    async function rememberTurn({ identity = {}, role = "", content = "", missionId = "", status = "", evidenceRefs = [] } = {}) {
        const body = clean(content);
        if (!body) return { ok: false, status: "SEMANTIC_MEMORY_EMPTY_TURN" };
        const current = records(identity);
        const record = {
            ...recordBase(identity, conversationId(), "TURN", now),
            role: clean(role, 40) || "unknown",
            content: body,
            missionId: clean(missionId, 240),
            status: clean(status, 120),
            evidenceRefs: Array.isArray(evidenceRefs)
                ? evidenceRefs.map(value => clean(value, 500)).filter(Boolean).slice(0, 30)
                : []
        };
        current.push(record);
        write(identity, current);
        return { ok: true, status: "SEMANTIC_MEMORY_TURN_STORED", record };
    }

    async function rememberLesson({ identity = {}, missionId = "", instruction = "", status = "", errors = [], completedTools = [], blockedTools = [] } = {}) {
        const normalizedErrors = Array.isArray(errors)
            ? errors.map(item => clean(item?.status || item?.error || item, 800)).filter(Boolean).slice(0, 20)
            : [];
        if (normalizedErrors.length === 0 && blockedTools.length === 0) {
            return { ok: false, status: "SEMANTIC_MEMORY_NO_FAILURE_TO_LEARN" };
        }
        const current = records(identity);
        const record = {
            ...recordBase(identity, conversationId(), "LESSON", now),
            missionId: clean(missionId, 240),
            instruction: clean(instruction, 12000),
            status: clean(status, 120),
            errors: normalizedErrors,
            completedTools: Array.isArray(completedTools) ? completedTools.map(value => clean(value, 120)).filter(Boolean).slice(0, 40) : [],
            blockedTools: Array.isArray(blockedTools) ? blockedTools.map(value => clean(value, 120)).filter(Boolean).slice(0, 40) : [],
            policy: "STRUCTURAL_OUTCOME_LEARNING_ONLY"
        };
        current.push(record);
        write(identity, current);
        return { ok: true, status: "SEMANTIC_MEMORY_LESSON_STORED", record };
    }

    async function rememberMission({ identity = {}, instruction = "", mission = null, finalResponse = null } = {}) {
        if (!mission || typeof mission !== "object") return { ok: false, status: "SEMANTIC_MEMORY_MISSION_REQUIRED" };
        const current = records(identity);
        const completedTools = Array.isArray(mission.completedTasks)
            ? mission.completedTasks.map(item => clean(item?.name, 120)).filter(Boolean)
            : [];
        const blockedTools = Array.isArray(mission.blockedTasks)
            ? mission.blockedTasks.map(item => clean(item?.name, 120)).filter(Boolean)
            : [];
        const errors = Array.isArray(mission.errors) ? mission.errors : [];
        const record = {
            ...recordBase(identity, conversationId(), "MISSION", now),
            missionId: clean(mission.missionId, 240),
            caseId: clean(mission.caseId, 240),
            objectiveId: clean(mission.objectiveId, 240),
            instruction: clean(instruction, 12000),
            missionStatus: clean(mission.status, 120),
            missionReason: clean(mission.reason, 160),
            completedTools,
            blockedTools,
            finalText: clean(finalResponse?.text || finalResponse?.message || "", 20000),
            producedArtifacts: Array.isArray(finalResponse?.producedArtifacts)
                ? finalResponse.producedArtifacts.map(item => ({
                    label: clean(item?.label, 240),
                    output: clean(item?.output, 800)
                })).slice(0, 30)
                : []
        };
        current.push(record);
        write(identity, current);
        await rememberLesson({
            identity,
            missionId: record.missionId,
            instruction,
            status: record.missionReason || record.missionStatus,
            errors,
            completedTools,
            blockedTools
        });
        return { ok: true, status: "SEMANTIC_MEMORY_MISSION_STORED", record };
    }

    async function recall({ identity = {}, maximumTurns = 40, maximumMissions = 16, maximumLessons = 20 } = {}) {
        const current = records(identity);
        const ordered = [...current].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
        const turns = ordered.filter(item => item?.kind === "TURN").slice(-maximumTurns);
        const missions = ordered.filter(item => item?.kind === "MISSION").slice(-maximumMissions);
        const lessons = ordered.filter(item => item?.kind === "LESSON").slice(-maximumLessons);
        const conversations = [];
        const seen = new Set();
        for (const item of [...turns, ...missions]) {
            const key = clean(item?.conversationId, 240);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            conversations.push(key);
        }
        return {
            ok: true,
            version: VERSION,
            authority: "ADVISORY_SEMANTIC_MEMORY",
            currentConversationId: conversationId(),
            conversations: conversations.slice(-30),
            turns,
            missions,
            lessons,
            policy: {
                currentInstructionPrimary: true,
                memoryNeverBecomesCurrentMissionEvidence: true,
                noLexicalRouting: true,
                noLocalIntentDictionaries: true,
                relevanceDecidedBySemanticModel: true
            }
        };
    }

    async function clear(identity = {}) {
        write(identity, []);
        return { ok: true, status: "SEMANTIC_MEMORY_CLEARED" };
    }

    return {
        version: VERSION,
        conversationId,
        rememberTurn,
        rememberMission,
        rememberLesson,
        recall,
        clear
    };
}

export const JarvisSemanticMemory = createJarvisSemanticMemory();
export const JARVIS_SEMANTIC_MEMORY_VERSION = VERSION;

if (typeof globalThis !== "undefined") {
    globalThis.JarvisSemanticMemory = JarvisSemanticMemory;
}
'''
Path("gestia-core/jarvis/jarvis.semantic.memory.js").write_text(memory_source, encoding="utf-8")

# Terminal HTML: one active runtime path and no lexical context memory.
p = Path("gestia-terminal.html")
text = p.read_text(encoding="utf-8")
old_intro = "Cada conversación empieza aislada; no reutilizo ideas de otra misión como si fueran parte de la solicitud actual."
new_intro = "Cada conversación conserva su propio expediente. ADJUNTO puede recuperar memoria semántica de sesiones anteriores sin convertir recuerdos en evidencia de la misión actual."
if old_intro not in text:
    raise SystemExit("gestia-terminal.html: intro anchor missing")
text = text.replace(old_intro, new_intro, 1)
for line in [
    '<script type="module" src="/gestia-core/tools.runtime.js?v=v94-marketing-real-delivery-v109-20260809"></script>\n',
    '<script type="module" src="/gestia-core/response.composer.js?v=jarvis-tools-v7-20260725-semantic-envelope-v64"></script>\n',
    '<script type="module" src="/gestia-core/tools.bridge.js?v=jarvis-tools-bridge-v7-20260726-chief-review-response-v93"></script>\n',
    '<script type="module" src="/gestia-core/jarvis/jarvis.context.memory.v6.js"></script>\n',
]:
    if line not in text:
        raise SystemExit(f"gestia-terminal.html missing bootstrap line: {line.strip()}")
    text = text.replace(line, "", 1)
p.write_text(text, encoding="utf-8")

# Terminal auth boot must initialize authority exactly once per successful hydration.
replace(
    "gestia-terminal.js",
    '''        if (user) {\n           /* window.KernelHeberto\n                .inicializarAutoridad();*/\n            return;\n        }\n''',
    '''        if (user) {\n            if (!window.KernelHeberto.__authorityBootPromise) {\n                window.KernelHeberto.__authorityBootPromise =\n                    Promise.resolve(\n                        window.KernelHeberto.inicializarAutoridad()\n                    ).catch(error => {\n                        window.KernelHeberto.__authorityBootPromise = null;\n                        console.error(\n                            "[TERMINAL_AUTHORITY_BOOT_FAIL]",\n                            error\n                        );\n                        return false;\n                    });\n            }\n            return;\n        }\n''',
)

# Mission orchestrator carries memory as advisory context and evidence as factual authority.
replace(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    'const VERSION = "1.10.0-diagnostic-error-normalization";',
    'const VERSION = "1.11.0-semantic-memory-canonical-evidence";',
)
marker = "function mediaOnlyRequiredContractSatisfied(mission = {}) {\n"
helper = '''function canonicalMissionEvidence(mission = {}) {\n    const completed = Array.isArray(mission?.completedTasks)\n        ? mission.completedTasks\n        : [];\n    return completed\n        .filter(item => {\n            const name = text(item?.name, 120);\n            const observation = item?.observation || {};\n            return name === "media.analyze" ||\n                name === "web.research" ||\n                name.startsWith("repo.") ||\n                Boolean(observation?.verifiedRead) ||\n                (Array.isArray(observation?.validSources) && observation.validSources.length > 0);\n        })\n        .map(item => ({\n            tool: text(item?.name, 120),\n            status: text(item?.observation?.status, 120),\n            summary: text(item?.observation?.summary, 3000),\n            validSources: compactEvidence(item?.observation?.validSources || []),\n            verifiedRead: compactEvidence(item?.observation?.verifiedRead || null),\n            evidence: compactEvidence(item?.observation?.evidence || null)\n        }))\n        .slice(-20);\n}\n\n'''
replace("gestia-core/jarvis/jarvis.mission.orchestrator.js", marker, helper + marker)
replace(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    '''    resumeMissionId,\n    continuationContext = {}\n} = {}) {''',
    '''    resumeMissionId,\n    continuationContext = {},\n    memoryContext = null\n} = {}) {''',
)
replace(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    '''                plan = await planner({\n                    originalInstruction,\n                    routingInstruction: mission.routingInstruction,\n                    mission: structuredClone(mission)\n                });''',
    '''                plan = await planner({\n                    originalInstruction,\n                    routingInstruction: mission.routingInstruction,\n                    mission: structuredClone(mission),\n                    memoryContext: memoryContext && typeof memoryContext === "object"\n                        ? structuredClone(memoryContext)\n                        : null\n                });''',
)
replace(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    '''                marketingContext: continuationContext,\n                writeAllowed: false,''',
    '''                marketingContext: continuationContext,\n                semanticMemory: memoryContext && typeof memoryContext === "object"\n                    ? structuredClone(memoryContext)\n                    : null,\n                canonicalEvidence: canonicalMissionEvidence(mission),\n                writeAllowed: false,''',
)
replace(
    "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    "export const __test = { callSignature, compactRoutingInstruction, isFailureStatus, safeObservation, trustedCalls };",
    "export const __test = { callSignature, compactRoutingInstruction, isFailureStatus, safeObservation, trustedCalls, canonicalMissionEvidence };",
)

# Semantic argument completion receives mission evidence.
replace(
    "gestia-core/jarvis/jarvis.multifunction.planner.js",
    '''    currentArgs = {},\n    validSources = [],\n    semanticPlanner = null\n} = {}) {''',
    '''    currentArgs = {},\n    validSources = [],\n    missionEvidence = [],\n    semanticPlanner = null\n} = {}) {''',
)
replace(
    "gestia-core/jarvis/jarvis.multifunction.planner.js",
    '''        `FUENTES_VERIFICADAS=${JSON.stringify(sources).slice(0, 12000)}`,\n        `ESQUEMA_DE_ARGUMENTOS=${JSON.stringify(inputSchema || {}).slice(0, 12000)}`''',
    '''        `FUENTES_VERIFICADAS=${JSON.stringify(sources).slice(0, 12000)}`,\n        `EVIDENCIA_CANONICA_DE_MISION=${JSON.stringify(Array.isArray(missionEvidence) ? missionEvidence : []).slice(0, 20000)}`,\n        "La evidencia canónica manda sobre memoria, borradores y propuestas. No inventes teléfonos, direcciones, fechas, certificaciones, métricas, URLs, testimonios ni resultados. Si un dato no aparece en la evidencia o en la solicitud actual, debe quedar como propuesta explícita, nunca como hecho.",\n        `ESQUEMA_DE_ARGUMENTOS=${JSON.stringify(inputSchema || {}).slice(0, 12000)}`''',
)

# Multitool gets compact advisory memory and canonical mission evidence.
p = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
text = p.read_text(encoding="utf-8")
anchor = "const DOCUMENT_SEGMENT_COUNT = 3;\n"
addition = '''const DOCUMENT_SEGMENT_COUNT = 3;\n\nfunction semanticMemoryEnvelope(context = {}) {\n    const memory = context?.semanticMemory;\n    if (!memory || typeof memory !== "object") return "";\n    try {\n        return JSON.stringify(memory).slice(0, 24000);\n    } catch {\n        return "";\n    }\n}\n\nfunction canonicalEvidenceEnvelope(context = {}) {\n    const evidence = Array.isArray(context?.canonicalEvidence)\n        ? context.canonicalEvidence\n        : [];\n    try {\n        return JSON.stringify(evidence).slice(0, 30000);\n    } catch {\n        return "[]";\n    }\n}\n'''
if anchor not in text:
    raise SystemExit("jarvis.multitool.pack.js: helper anchor missing")
text = text.replace(anchor, addition, 1)
old = '''                const result =\n                    await fetchSemanticConversation(\n                        instruction,\n                        {\n                            maxOutputTokens:\n                                args.maxOutputTokens\n                        }\n                    );'''
new = '''                const memoryEnvelope =\n                    semanticMemoryEnvelope(context);\n                const semanticInstruction =\n                    memoryEnvelope\n                        ? [\n                            "Responde la instrucción actual usando memoria semántica únicamente como contexto asesor.",\n                            "La instrucción actual manda. La memoria ayuda a recordar conversaciones, decisiones y errores previos, pero nunca se convierte por sí sola en evidencia factual de la misión actual.",\n                            "No uses diccionarios locales, regex ni reglas léxicas para decidir relevancia; razona semánticamente sobre el contexto recibido.",\n                            `MEMORIA_SEMANTICA_ADVISORY=${memoryEnvelope}`,\n                            `INSTRUCCION_ACTUAL=${instruction}`\n                        ].join("\\n")\n                        : instruction;\n\n                const result =\n                    await fetchSemanticConversation(\n                        semanticInstruction,\n                        {\n                            maxOutputTokens:\n                                args.maxOutputTokens\n                        }\n                    );'''
if old not in text:
    raise SystemExit("jarvis.multitool.pack.js: conversation anchor missing")
text = text.replace(old, new, 1)
old = '''                const instruction =\n                    [\n                        boundedOriginalInstruction,\n                        boundedPlannedInstruction &&\n                        boundedPlannedInstruction !==\n                            boundedOriginalInstruction\n                            ? `DETALLE_DEL_PLAN=${boundedPlannedInstruction}`\n                            : ""\n                    ]\n                        .filter(Boolean)\n                        .join("\\n\\n") ||\n                    fallbackInstruction;'''
new = old + '''\n                const canonicalEvidence =\n                    canonicalEvidenceEnvelope(context);\n                const modelInstruction = [\n                    instruction,\n                    canonicalEvidence !== "[]"\n                        ? `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`\n                        : "",\n                    "REGLA_FACTUAL: todos los hechos concretos del documento deben estar en la solicitud actual o en la evidencia canónica. La memoria, un plan previo y una propuesta creativa no prueban hechos. Lo desconocido debe declararse como propuesta o dato no disponible; nunca inventes teléfonos, direcciones, fechas, certificaciones, métricas, URLs, personas ni resultados."\n                ].filter(Boolean).join("\\n\\n");'''
if old not in text:
    raise SystemExit("jarvis.multitool.pack.js: document instruction anchor missing")
text = text.replace(old, new, 1)
text = text.replace(
    '''                            instruction,\n                            title,\n                            format,\n                            contract''',
    '''                            instruction: modelInstruction,\n                            title,\n                            format,\n                            contract''',
    1,
)
text = text.replace('''                                `SOLICITUD=${instruction}`''', '''                                `SOLICITUD=${modelInstruction}`''', 1)
text = text.replace(
    '''                                `SOLICITUD_ORIGINAL=${boundedOriginalInstruction}`,\n                                `CONTENIDO_YA_REDACTADO_CONTEXTO_ACOTADO=${boundedComposedContext}`''',
    '''                                `SOLICITUD_ORIGINAL=${boundedOriginalInstruction}`,\n                                `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`,\n                                `CONTENIDO_YA_REDACTADO_CONTEXTO_ACOTADO=${boundedComposedContext}`''',
    1,
)
old = '''                let semantic = await fetchSemanticConversation(\n                    [\n                        "Diseña un libro XLSX completo y ejecutable como JSON estricto.",'''
new = '''                const canonicalEvidence =\n                    canonicalEvidenceEnvelope(context);\n                let semantic = await fetchSemanticConversation(\n                    [\n                        "Diseña un libro XLSX completo y ejecutable como JSON estricto.",'''
if old not in text:
    raise SystemExit("jarvis.multitool.pack.js: spreadsheet anchor missing")
text = text.replace(old, new, 1)
old = '''                        "No inventes datos de mercado: cualquier valor de ejemplo debe rotularse claramente como SUPUESTO y las formulas deben conservar la trazabilidad del calculo.",\n                        "Incluye todos los conceptos, subtotales, porcentajes y resultado final pedidos. No agregues explicaciones fuera del JSON.",\n                        `TITULO=${title}`,\n                        `SOLICITUD=${instruction}`'''
new = '''                        "No inventes datos de mercado ni datos del negocio. Cualquier proyección creativa debe rotularse claramente como SUPUESTO o PROPUESTA y nunca confundirse con un hecho observado.",\n                        "Teléfonos, direcciones, fechas, certificaciones, métricas históricas, URLs, nombres de personas y resultados solo pueden copiarse de la solicitud actual o de EVIDENCIA_CANONICA_DE_MISION.",\n                        "Incluye todos los conceptos, subtotales, porcentajes y resultado final pedidos. No agregues explicaciones fuera del JSON.",\n                        `TITULO=${title}`,\n                        `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`,\n                        `SOLICITUD=${instruction}`'''
if old not in text:
    raise SystemExit("jarvis.multitool.pack.js: spreadsheet factual anchor missing")
text = text.replace(old, new, 1)
text = text.replace(
    '''                                `SOLICITUD_ORIGINAL=${instruction}`,\n                                `INTENTO_DE_REPARACION=${repairCount}`,''',
    '''                                `SOLICITUD_ORIGINAL=${instruction}`,\n                                `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`,\n                                `INTENTO_DE_REPARACION=${repairCount}`,''',
    1,
)
p.write_text(text, encoding="utf-8")

# Marketing requires semantic content instead of generic local prose.
p = Path("gestia-core/jarvis/jarvis.marketing.engine.js")
text = p.read_text(encoding="utf-8")
text = text.replace('''        "horizon"\n    ]) {''', '''        "horizon",\n        "tone"\n    ]) {''', 1)
text = text.replace(
    '''    if (strings(context.channels).length === 0) missing.push("channels");\n    return missing;''',
    '''    if (strings(context.channels).length === 0) missing.push("channels");\n    if (strings(context.metrics).length === 0) missing.push("metrics");\n    return missing;''',
    1,
)
text = text.replace(
    '''function inferAudience(_instruction, context = {}) {\n    return (\n        clean(context.audience) ||\n        "clientes potenciales relevantes para la oferta de la marca"\n    );\n}''',
    '''function inferAudience(_instruction, context = {}) {\n    return clean(context.audience);\n}''',
    1,
)
text = text.replace(
    '''        offer:\n            clean(context.offer) ||\n            `Estrategia integral para presentar, posicionar y convertir la oferta de ${brandName}`,\n        pain:\n            clean(context.pain) ||\n            "fricción entre una necesidad real del cliente y una decisión de compra clara",\n        promise:\n            clean(context.promise) ||\n            "una propuesta de valor clara, fácil de entender y orientada a conversión",\n        differentiator:\n            clean(context.differentiator) ||\n            "una experiencia de marca consistente, medible y optimizable",\n        cta:\n            clean(context.cta) ||\n            `Conoce la propuesta de ${brandName}`,\n        tone:\n            clean(context.tone) ||\n            clean(context.voice) ||\n            "directo, confiable y profesional",''',
    '''        offer: clean(context.offer),\n        pain: clean(context.pain),\n        promise: clean(context.promise),\n        differentiator: clean(context.differentiator),\n        cta: clean(context.cta),\n        tone: clean(context.tone) || clean(context.voice),''',
    1,
)
text = text.replace('''        export: { preview: true, webm: true, mp4: "WHEN_INFRASTRUCTURE_AVAILABLE" },''', '''        export: { preview: true, webm: true, mp4: false, mp4Status: "NOT_PRODUCED_BY_PLANNING" },''', 1)
text = text.replace('''    const budget = clean(context.budget) || "presupuesto piloto por definir";\n    const horizon = clean(context.horizon) || "90 días como supuesto inicial de planificación";''', '''    const budget = clean(context.budget);\n    const horizon = clean(context.horizon);''', 1)
text = text.replace(
    '''        competitiveAnalysis: {\n            alternatives: strings(context.competitors).length ? strings(context.competitors) : ["proveedores informales", "búsqueda directa", "directorios sin seguimiento"],\n            advantage: campaign.differentiator\n        },''',
    '''        competitiveAnalysis: {\n            alternatives: strings(context.competitors),\n            advantage: campaign.differentiator,\n            note: strings(context.competitors).length\n                ? "Competidores proporcionados en el contexto semántico."\n                : "No se proporcionó ni verificó una lista factual de competidores; no se inventan alternativas."\n        },''',
    1,
)
text = text.replace(
    '''        budgetScenarios: [\n            { scenario: "low", allocation: budget, mix: "60% captación, 25% contenido, 15% pruebas" },\n            { scenario: "medium", allocation: clean(context.mediumBudget) || "escenario de escalamiento condicionado a resultados", mix: "65% captación, 20% contenido, 15% experimentos" }\n        ],''',
    '''        budgetScenarios: budget\n            ? [\n                { scenario: "base", allocation: budget, note: "Distribución por canal debe decidirse con datos de rendimiento." },\n                ...(clean(context.mediumBudget)\n                    ? [{ scenario: "expanded", allocation: clean(context.mediumBudget), note: "Escalamiento condicionado a resultados medidos." }]\n                    : [])\n            ]\n            : [{ scenario: "pending", note: "No se proporcionó un presupuesto factual; definirlo antes de comprar medios." }],''',
    1,
)
text = text.replace(
    '''        hashtags: strings(context.hashtags).length\n            ? strings(context.hashtags)\n            : [\n                hashtag(brand.name),\n                hashtag(context.market || "México"),\n                "#ServicioProfesional",\n                "#SeguridadOperativa"\n            ].filter(Boolean),\n        metrics: strings(context.metrics).length\n            ? strings(context.metrics)\n            : ["qualified_conversations", "landing_conversion", "cost_per_lead", "appointments"],''',
    '''        hashtags: strings(context.hashtags).length\n            ? strings(context.hashtags)\n            : [hashtag(brand.name), hashtag(context.market)].filter(Boolean),\n        metrics: strings(context.metrics),''',
    1,
)
text = text.replace('source: "instruction_inference",', 'source: "semantic_proposal",')
p.write_text(text, encoding="utf-8")

# Marketing tool schema must ask semantic planner for tone and metrics.
p = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
text = p.read_text(encoding="utf-8")
old = '''        "horizon",\n        "channels",\n        "productionRequested"'''
new = '''        "horizon",\n        "tone",\n        "channels",\n        "metrics",\n        "productionRequested"'''
if old not in text:
    raise SystemExit("jarvis.multitool.pack.js: marketing schema required anchor missing")
text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")

# Core wiring: memory before planning, mission storage, and grounded artifact arguments.
p = Path("gestia-core/gestia-core.js")
text = p.read_text(encoding="utf-8")
old = '''import {\n    buildJarvisMultifunctionToolCalls\n} from '/gestia-core/jarvis/jarvis.multifunction.planner.js?v=v94-marketing-real-delivery-v109-20260809';'''
new = '''import {\n    buildJarvisMultifunctionToolCalls,\n    completeJarvisPlanningArguments\n} from '/gestia-core/jarvis/jarvis.multifunction.planner.js?v=v94-semantic-memory-integrity-v110-20260809';'''
if old not in text:
    raise SystemExit("gestia-core.js: multifunction import anchor missing")
text = text.replace(old, new, 1)
anchor = "import '/gestia-core/jarvis/jarvis.autonomy.engine.js?v=agent-loop-learning-41-35';\n"
addition = '''import {\n    JarvisSemanticMemory\n} from '/gestia-core/jarvis/jarvis.semantic.memory.js?v=v94-semantic-memory-v1-20260809';\n'''
if anchor not in text:
    raise SystemExit("gestia-core.js: semantic memory import anchor missing")
text = text.replace(anchor, addition + anchor, 1)
old = '''        const lightMultifunctionCalls =\n            await buildJarvisMultifunctionToolCalls(\n                inputRaw,\n                { state }\n            );'''
new = '''        const semanticMemory =\n            await JarvisSemanticMemory.recall({\n                identity: {\n                    userId: auth.currentUser?.uid || "anonymous",\n                    workspaceId: state?.tenantId || "UXMAL39",\n                    projectId: "adjunto"\n                }\n            });\n        const lightMultifunctionCalls =\n            await buildJarvisMultifunctionToolCalls(\n                inputRaw,\n                {\n                    state,\n                    missionState: {\n                        phase: "CURRENT_TURN",\n                        semanticMemory,\n                        writeAllowed: false\n                    }\n                }\n            );'''
if old not in text:
    raise SystemExit("gestia-core.js: light planner anchor missing")
text = text.replace(old, new, 1)
old = '''        const verifiedAuthorityId =\n            String(\n                user.email ||\n                ""\n            )\n                .trim()\n                .toLowerCase() ===\n            GESTIA_MASTER_EMAIL\n                ? "HEBERTO_MENDOZA"\n                : null;\n'''
if old not in text:
    raise SystemExit("gestia-core.js: authority anchor missing")
new = old + '''\n        const semanticMemoryIdentity = {\n            userId: user.uid,\n            workspaceId: tenantId,\n            projectId: "adjunto"\n        };\n        try {\n            await JarvisSemanticMemory.rememberTurn({\n                identity: semanticMemoryIdentity,\n                role: "user",\n                content: inputRaw\n            });\n        }\n        catch(memoryWriteError) {\n            console.warn(\n                "[SEMANTIC_MEMORY_USER_TURN_FAIL]",\n                memoryWriteError?.message || String(memoryWriteError)\n            );\n        }\n        const semanticMemoryContext =\n            await JarvisSemanticMemory.recall({\n                identity: semanticMemoryIdentity\n            });\n'''
text = text.replace(old, new, 1)
old = '''                        existingInitialTools: operationalInitialToolCalls.map(call => call?.name).filter(Boolean)\n                    }'''
new = '''                        existingInitialTools: operationalInitialToolCalls.map(call => call?.name).filter(Boolean),\n                        semanticMemory: semanticMemoryContext\n                    }'''
if old not in text:
    raise SystemExit("gestia-core.js: mission contract anchor missing")
text = text.replace(old, new, 1)
old = '''            continuationContext,\n            maximumSteps:'''
new = '''            continuationContext,\n            memoryContext: semanticMemoryContext,\n            maximumSteps:'''
if old not in text:
    raise SystemExit("gestia-core.js: run mission anchor missing")
text = text.replace(old, new, 1)
text = text.replace(
    '''                                            userArtifactAllowed:\n                                                true\n                                        }''',
    '''                                            userArtifactAllowed:\n                                                true,\n                                            semanticMemory:\n                                                semanticMemoryContext\n                                        }''',
    1,
)
text = text.replace(
    '''                                    userArtifactAllowed: true\n                                }''',
    '''                                    userArtifactAllowed: true,\n                                    semanticMemory: semanticMemoryContext\n                                }''',
    1,
)
old = '''                            const groundedCalls =\n                                await buildJarvisMultifunctionToolCalls(\n                                    missionContext.rawInput.slice(0, 120000),\n                                    {\n                                        ...context,\n                                        throwOnUnavailable:\n                                            true,\n                                        toolCatalog:\n                                            [\n                                                toolDefinition\n                                            ],\n                                        missionState: {\n                                            phase:\n                                                "EXECUTION_ARGUMENT_AUDIT",\n                                            missionId:\n                                                missionContext.missionId,\n                                            caseId:\n                                                missionContext.caseId,\n                                            objectiveId:\n                                                missionContext.objectiveId,\n                                            toolName:\n                                                call.name,\n                                            currentArgs:\n                                                call.args || {},\n                                            completedTasks:\n                                                missionContext.completedTasks,\n                                            blockedTasks:\n                                                missionContext.blockedTasks || [],\n                                            writeAllowed:\n                                                false,\n                                            userArtifactAllowed:\n                                                toolDefinition?.userArtifact === true\n                                        }\n                                    }\n                                );\n                            const groundedCall =\n                                groundedCalls.find(candidate =>\n                                    candidate?.name === call.name\n                                ) ||\n                                null;\n\n                            if (groundedCall) {\n                                executionCall =\n                                    {\n                                        ...executionCall,\n                                        args: {\n                                            ...executionCall.args,\n                                            ...(groundedCall.args || {})\n                                        },\n                                        approved:\n                                            false\n                                    };\n                                argumentGrounded =\n                                    true;\n                            }'''
new = '''                            const grounded =\n                                await completeJarvisPlanningArguments({\n                                    toolName: call.name,\n                                    description: toolDefinition?.description || "",\n                                    inputSchema: toolDefinition?.inputSchema || null,\n                                    instruction: missionContext.rawInput.slice(0, 120000),\n                                    currentArgs: executionCall.args,\n                                    validSources: missionContext.validSources || [],\n                                    missionEvidence: missionContext.canonicalEvidence || []\n                                });\n\n                            if (grounded?.ok === true && grounded?.args) {\n                                executionCall = {\n                                    ...executionCall,\n                                    args: {\n                                        ...executionCall.args,\n                                        ...grounded.args\n                                    },\n                                    approved: false\n                                };\n                                argumentGrounded = true;\n                            }'''
if old not in text:
    raise SystemExit("gestia-core.js: execution argument audit anchor missing")
text = text.replace(old, new, 1)
old = '''                    return {\n                        status:\n                            "success",\n                        type:\n                            "AGENT_TOOL_RESULT",'''
new = '''                    try {\n                        await JarvisSemanticMemory.rememberMission({\n                            identity: semanticMemoryIdentity,\n                            instruction: inputRaw,\n                            mission: atomicState.agentResult?.mission || null,\n                            finalResponse: atomicState.agentResult?.finalResponse || null\n                        });\n                        const memoryResponseText =\n                            atomicState.agentResult?.finalResponse?.text ||\n                            atomicState.agentResult?.finalResponse?.message ||\n                            "";\n                        if (memoryResponseText) {\n                            await JarvisSemanticMemory.rememberTurn({\n                                identity: semanticMemoryIdentity,\n                                role: "assistant",\n                                content: memoryResponseText,\n                                missionId: atomicState.agentResult?.mission?.missionId || "",\n                                status: atomicState.agentResult?.mission?.reason || ""\n                            });\n                        }\n                    }\n                    catch(memoryCommitError) {\n                        console.warn(\n                            "[SEMANTIC_MEMORY_MISSION_COMMIT_FAIL]",\n                            memoryCommitError?.message || String(memoryCommitError)\n                        );\n                    }\n\n                    return {\n                        status:\n                            "success",\n                        type:\n                            "AGENT_TOOL_RESULT",'''
if old not in text:
    raise SystemExit("gestia-core.js: agent response memory anchor missing")
text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")

# Add regression to ci:test through test:multifunction.
p = Path("package.json")
text = p.read_text(encoding="utf-8")
old = 'tests/jarvis-case-ledger.test.mjs tests/repo-source-structure.test.mjs"'
new = 'tests/jarvis-case-ledger.test.mjs tests/repo-source-structure.test.mjs tests/jarvis-semantic-memory-integrity.test.mjs"'
if old not in text:
    raise SystemExit("package.json: test:multifunction anchor missing")
text = text.replace(old, new, 1)
p.write_text(text, encoding="utf-8")


test_source = r'''import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    createJarvisSemanticMemory
} from "../gestia-core/jarvis/jarvis.semantic.memory.js";
import {
    planMarketingRequest
} from "../gestia-core/jarvis/jarvis.marketing.engine.js";

class Storage {
    constructor() { this.map = new Map(); }
    getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
    setItem(key, value) { this.map.set(key, String(value)); }
    removeItem(key) { this.map.delete(key); }
}

test("semantic memory persists conversations and structural failure lessons without lexical routing", async () => {
    const storage = new Storage();
    const session = new Storage();
    const identity = { userId: "owner", workspaceId: "peninsula", projectId: "adjunto" };
    let sequence = 0;
    const first = createJarvisSemanticMemory({
        storage,
        sessionStorage: session,
        now: () => `2026-08-09T22:00:${String(sequence++).padStart(2, "0")}Z`
    });
    await first.rememberTurn({ identity, role: "user", content: "Primera conversación" });
    await first.rememberTurn({ identity, role: "assistant", content: "Resultado real" });
    await first.rememberMission({
        identity,
        instruction: "crear paquete",
        mission: {
            missionId: "m-1",
            caseId: "c-1",
            objectiveId: "o-1",
            status: "PARTIAL",
            reason: "TOOL_FAILED",
            completedTasks: [{ name: "media.analyze" }],
            blockedTasks: [{ name: "image.generate" }],
            errors: [{ status: "IMAGE_TOOL_FAILED" }]
        },
        finalResponse: { text: "La imagen quedó bloqueada." }
    });
    const rebuilt = createJarvisSemanticMemory({ storage, sessionStorage: session });
    const recalled = await rebuilt.recall({ identity });
    assert.equal(recalled.turns.length, 2);
    assert.equal(recalled.missions.length, 1);
    assert.equal(recalled.lessons.length, 1);
    assert.equal(recalled.lessons[0].blockedTools[0], "image.generate");
    assert.equal(recalled.policy.memoryNeverBecomesCurrentMissionEvidence, true);
    assert.equal(recalled.policy.relevanceDecidedBySemanticModel, true);
    const other = await rebuilt.recall({ identity: { ...identity, userId: "other" } });
    assert.equal(other.turns.length, 0);
});

test("active terminal boot no longer loads lexical context memory or duplicate runtime module URLs", () => {
    const html = fs.readFileSync(new URL("../gestia-terminal.html", import.meta.url), "utf8");
    const terminal = fs.readFileSync(new URL("../gestia-terminal.js", import.meta.url), "utf8");
    assert.doesNotMatch(html, /jarvis\.context\.memory\.v6\.js/);
    assert.doesNotMatch(html, /<script type="module" src="\/gestia-core\/tools\.runtime\.js/);
    assert.match(terminal, /KernelHeberto\.inicializarAutoridad\(\)/);
    assert.match(html, /memoria semántica de sesiones anteriores/);
});

test("artifact composers receive canonical mission evidence and semantic memory stays advisory", () => {
    const pack = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url), "utf8");
    const planner = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
    const mission = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.mission.orchestrator.js", import.meta.url), "utf8");
    assert.match(pack, /EVIDENCIA_CANONICA_DE_MISION/);
    assert.match(pack, /MEMORIA_SEMANTICA_ADVISORY/);
    assert.match(planner, /missionEvidence/);
    assert.match(mission, /canonicalMissionEvidence/);
    assert.match(mission, /semanticMemory: memoryContext/);
});

test("marketing engine cannot fall back to generic false-green phrases", () => {
    const source = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.marketing.engine.js", import.meta.url), "utf8");
    for (const residue of [
        "clientes potenciales relevantes para la oferta de la marca",
        "fricción entre una necesidad real del cliente y una decisión de compra clara",
        "proveedores informales",
        "presupuesto piloto por definir",
        "WHEN_INFRASTRUCTURE_AVAILABLE",
        "instruction_inference"
    ]) {
        assert.equal(source.includes(residue), false, residue);
    }
    const result = planMarketingRequest("Prepara marketing", {
        brandName: "Multiservicios Peninsulares HMH",
        productionRequested: false
    });
    assert.equal(result.status, "MARKETING_SEMANTIC_BRIEF_INCOMPLETE");
    assert.equal(result.objectiveSatisfied, false);
    assert.ok(result.missingSemanticFields.includes("tone"));
    assert.ok(result.missingSemanticFields.includes("metrics"));
});
'''
Path("tests/jarvis-semantic-memory-integrity.test.mjs").write_text(test_source, encoding="utf-8")

print("V94 semantic memory + artifact integrity patch applied")
