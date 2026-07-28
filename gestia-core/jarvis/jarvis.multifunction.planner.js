const VERSION = "4.11.0-browser-retry-isolation";
const ENDPOINT = "https://us-central1-fixgo-44e4d.cloudfunctions.net/jarvisSemanticPlan";
const CACHE_TTL_MS = 30000;
const planCache = new Map();
const pendingPlans = new Map();

const CLOUD_MISSION_CONTRACT_TIMEOUT_MS =
    45000;

const BROWSER_MISSION_ATTEMPT_TIMEOUT_MS =
    20000;

const BROWSER_PLAN_ATTEMPT_TIMEOUT_MS =
    15000;

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

async function fetchBrowserPlanText(
    url = "",
    timeoutMs =
        BROWSER_PLAN_ATTEMPT_TIMEOUT_MS
) {
    const controller =
        new AbortController();

    let timedOut =
        false;

    const timer =
        setTimeout(
            () => {
                timedOut =
                    true;

                controller.abort();
            },
            timeoutMs
        );

    try {
        const response =
            await fetch(
                url,
                {
                    signal:
                        controller.signal
                }
            );

        const responseText =
            await response.text();

        return {
            response,
            responseText
        };
    }
    catch(error) {
        if (
            timedOut ||
            controller.signal.aborted
        ) {
            throw new Error(
                `BROWSER_PLAN_ATTEMPT_TIMEOUT_${timeoutMs}`
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

async function callBrowserMissionContract(
    input = "",
    catalog = [],
    missionState = null
) {
    if (typeof fetch !== "function") throw new Error("CLIENT_MISSION_CONTRACT_FETCH_REQUIRED");
    const instruction = String(input || "");
    const boundedInstruction = instruction.length <= 12000
        ? instruction
        : `${instruction.slice(0, 8000)}\n[PARTE_MEDIA_PERSISTIDA]\n${instruction.slice(-3500)}`;
    const initialToolNames =
        Array.isArray(
            missionState
                ?.existingInitialTools
        )
            ? missionState
                .existingInitialTools
                .map(String)
                .filter(Boolean)
                .slice(0, 20)
            : [];
    const prompt = [
        "Eres el planificador semantico de Jarvis V7.",
        "Devuelve solamente JSON valido.",
        "CONTRATO COMPLETO: enumera en toolCalls todas las herramientas read-only y userArtifact necesarias para TODOS los entregables. Para crear una landing usa page.plan, page.compose y page.create; para crear un documento usa document.compose y document.create; para crear una hoja estructurada usa spreadsheet.compose y document.create. Para EDITAR un PDF existente usa document.pdf.edit; para EDITAR un XLSX existente usa document.xlsx.edit; para EDITAR una imagen existente usa image.edit. Nunca sustituyas una edicion solicitada por document.create, spreadsheet.compose o image.generate. Las ediciones crean una copia nueva y deben preservar el original. system.certify es terminal: no lo incluyas en el contrato inicial; seleccionalo solamente durante COMPLETION_AUDIT cuando los demas objetivos est?n completados o bloqueados. Para cada artefacto usa exactamente una composicion y una creacion salvo que el usuario pida variantes. Conserva el orden y usa missionComplete=false.",
        "Las HERRAMIENTAS_INICIALES son un borrador semantico ya seleccionado para la misma instruccion. Conserva sus entregables y agrega solamente una herramienta que cubra un objetivo independiente pedido de forma explicita y no cubierto por ese borrador. No agregues diagnostico, supervision, forense, repositorio, navegador, conectores, investigacion ni otros artefactos solo porque existan en el catalogo.",
        "No colapses sujetos u objetivos independientes. Repite el mismo nombre de herramienta cuando necesite argumentos distintos para cubrirlos por separado.",
        "agent.delegate no es una optimizacion automatica. Incluyela solamente si la instruccion original pide explicitamente delegar, usar agentes o ejecutar en paralelo, y copia esa frase literal en delegationDirective. En cualquier otra mision conserva las herramientas directas.",
        "repo.architectReview es autocontenida: construye su grafo y ranking y ejecuta los 11 controles sobre el plan recibido. Para una revision de plan no agregues herramientas repo adyacentes salvo que la instruccion pida por separado inspeccionar fuentes adicionales.",
        "Para web.research usa researchGoal=RESEARCH_1, RESEARCH_2, etc. segun el orden inmutable de objetivos de investigacion en la instruccion. Reutiliza la misma identidad al auditar el mismo objetivo y no dupliques llamadas para simples reformulaciones.",
        `HERRAMIENTAS_INICIALES=${initialToolNames.join(",")}`,
        `CATALOGO=${catalog.map(tool => tool.name).join(",")}`,
        `INSTRUCCION=${boundedInstruction}`
    ].join("\n");
    let lastError = null;
    let auditedPlan = null;

    for (const seed of [84, 85, 86]) {
            try {
                const attemptPrompt = auditedPlan
                    ? [
                        prompt,
                        `BORRADOR_DE_CONTRATO=${JSON.stringify(auditedPlan).slice(0, 16000)}`,
                        "AUDITORIA SEMANTICA DE COBERTURA: descompone la instruccion en todos sus sujetos, archivos, entidades, preguntas y entregables independientes. Devuelve solamente toolCalls read-only o userArtifact faltantes. No elimines ni sustituyas el borrador. Si ya cubre todo devuelve toolCalls=[] y missionComplete=false."
                    ].join("\n")
                    : prompt;
                const {
                    response,
                    responseText
                } = await fetchBrowserPlanText(
                    `https://text.pollinations.ai/${encodeURIComponent(attemptPrompt)}?model=openai-fast&seed=${seed}&json=true`,
                    BROWSER_MISSION_ATTEMPT_TIMEOUT_MS
                );

                if (!response.ok) {
                    throw new Error(
                        `CLIENT_MISSION_CONTRACT_HTTP_${response.status}`
                    );
                }

                const plan =
                    extractJsonObject(
                        responseText
                    );
                if (!Array.isArray(plan?.toolCalls)) {
                    throw new Error("CLIENT_MISSION_CONTRACT_EMPTY");
                }
                if (!auditedPlan) {
                    if (plan.toolCalls.length === 0) {
                        throw new Error("CLIENT_MISSION_CONTRACT_EMPTY");
                    }
                    auditedPlan = {
                        ...plan,
                        toolCalls:
                            trustedPlanCalls(
                                {
                                    ...plan,
                                    planKind:
                                        "MISSION_CONTRACT"
                                },
                                catalog,
                                {
                                    originalInstruction:
                                        instruction
                                }
                            )
                    };
                    continue;
                }
                const coverageCalls =
                    trustedPlanCalls(
                        {
                            ...plan,
                            planKind:
                                "MISSION_CONTRACT_AUDIT"
                        },
                        catalog,
                        {
                            originalInstruction:
                                instruction
                        }
                    );
                const merged = mergeJarvisToolCalls(
                    auditedPlan.toolCalls || [],
                    coverageCalls
                );
                return {
                    ...auditedPlan,
                    toolCalls: merged,
                    completionAssessment: {
                        draft: auditedPlan.completionAssessment || null,
                        coverageAudit: plan.completionAssessment || null
                    },
                    missionComplete: false,
                    ok: true,
                    status: "SEMANTIC_PLAN_READY",
                    provider: "pollinations-browser-json",
                    model: "openai-fast",
                    planKind: "MISSION_CONTRACT_AUDITED"
                };
            } catch (error) {
                lastError = error;
            }
        }

    if (auditedPlan) {
        return {
            ...auditedPlan,
            missionComplete: false,
            ok: true,
            status: "SEMANTIC_PLAN_READY",
            provider: "pollinations-browser-json",
            model: "openai-fast",
            planKind: "MISSION_CONTRACT",
            coverageWarning: lastError?.message || "CLIENT_MISSION_COVERAGE_AUDIT_UNAVAILABLE"
        };
    }
    throw lastError || new Error("CLIENT_MISSION_CONTRACT_UNAVAILABLE");
}

async function callBrowserSemanticPlan(input = "", catalog = [], missionState = null) {
    if (typeof fetch !== "function") throw new Error("CLIENT_SEMANTIC_PLAN_FETCH_REQUIRED");
    const instruction = String(input || "");
    const boundedInstruction = instruction.length <= 12000
        ? instruction
        : `${instruction.slice(0, 8000)}\n[PARTE_MEDIA_PERSISTIDA]\n${instruction.slice(-3500)}`;
    const prompt = [
        "Eres el planificador semantico de herramientas de Jarvis V7.",
        "Interpreta significado, typos, negaciones y ordenes mixtas. Selecciona exclusivamente nombres exactos del catalogo.",
        "No autorices escrituras de repositorio, publicacion ni despliegue. Las herramientas userArtifact pueden crear entregables locales y editar copias de artefactos existentes cuando el usuario lo pide explicitamente; deben conservar el original y no equivalen a editar codigo, publicar o desplegar. Para editar PDF, XLSX o imagen usa respectivamente document.pdf.edit, document.xlsx.edit o image.edit y nunca los sustituyas por herramientas de creacion. Conserva todas las intenciones independientes y usa herramientas especializadas para entregables operativos.",
        "agent.delegate no es una optimizacion automatica. Seleccionala solamente si la instruccion original pide explicitamente delegar, usar agentes o ejecutar en paralelo. En ese caso copia literalmente esa frase en delegationDirective. Si solo hay varias herramientas directas, devuelve esas herramientas sin agent.delegate.",
        "repo.architectReview es autocontenida: ya construye el grafo y ranking y ejecuta los 11 controles sobre un plan recibido. Cuando se pida esa revision, no agregues repo.search, repo.read, repo.diagnose o repo.impact salvo que la instruccion pida de forma independiente inspeccionar fuentes adicionales.",
        "Si varios objetivos requieren la misma herramienta con argumentos distintos, devuelve una llamada separada para cada uno.",
        "Si piden referencias, usos o pruebas de un archivo concreto, usa repo.search con la ruta exacta o basename como query, no con una pregunta completa.",
        "Si una investigacion limita fuentes a un dominio, copia el dominio exacto en allowedDomain de web.research.",
        "En web.research, query debe contener solo el objetivo concreto y los terminos distintivos de la investigacion; no copies toda la orden mixta, archivos ni otros entregables. Conserva conceptos tecnicos importantes como custom claims, roles, APIs o normas.",
        "Para web.research usa researchGoal=RESEARCH_1, RESEARCH_2, etc. segun el orden de objetivos independientes en la instruccion y reutiliza exactamente esa identidad para el mismo objetivo.",
        "Si se piden datos oficiales, usa allowedDomain con el dominio oficial de la autoridad identificada y no presentes fuentes secundarias como oficiales.",
        "Si una investigacion pide hechos sobre una entidad nombrada sin dominio, copia el nombre exacto en exactEntity de web.research.",
        missionState?.phase === "COMPLETION_AUDIT"
            ? "AUDITORIA DE CIERRE: compara cada entregable con la evidencia. Si todo esta satisfecho devuelve toolCalls=[] y missionComplete=true. Si falta algo devuelve exactamente una herramienta pertinente con argumentos completos y missionComplete=false. No explores capacidades no solicitadas. Si repo.search entrego sourceDefinitions o definitionFiles, prioriza esas rutas ejecutables sobre archivos que solo mencionan el simbolo y permite repetir lectura o diagnostico cuando el archivo sea distinto."
            : "Devuelve solamente JSON valido con toolCalls, missionComplete=false y explanation.",
        `CATALOGO=${catalog.map(tool => tool.name).join(",")}`,
        missionState ? `ESTADO_DE_MISION=${JSON.stringify(missionState).slice(0, 12000)}` : "",
        `INSTRUCCION=${boundedInstruction}`
    ].join("\n");
    let lastError = null;

    for (const seed of [42, 43, 44]) {
            try {
                const {
                    response,
                    responseText
                } = await fetchBrowserPlanText(
                    `https://text.pollinations.ai/${encodeURIComponent(prompt)}?model=openai-fast&seed=${seed}&json=true`,
                    BROWSER_PLAN_ATTEMPT_TIMEOUT_MS
                );

                if (!response.ok) {
                    throw new Error(
                        `CLIENT_SEMANTIC_PLAN_HTTP_${response.status}`
                    );
                }

                const plan =
                    extractJsonObject(
                        responseText
                    );
                if (
                    !Array.isArray(plan?.toolCalls) ||
                    (
                        plan.toolCalls.length === 0 &&
                        !(
                            missionState?.phase === "COMPLETION_AUDIT" &&
                            plan?.missionComplete === true
                        )
                    )
                ) {
                    throw new Error("CLIENT_SEMANTIC_PLAN_EMPTY");
                }
                return {
                    ...plan,
                    ok: true,
                    status: "SEMANTIC_PLAN_READY",
                    provider: "pollinations-browser-json",
                    model: "openai-fast"
                };
            } catch (error) {
                lastError = error;
            }
        }

    throw lastError ||
        new Error(
            "CLIENT_SEMANTIC_PLAN_UNAVAILABLE"
        );
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
    const candidates = Array.isArray(plan?.toolCalls) ? plan.toolCalls : [];
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
        missionState?.phase ===
            "MISSION_CONTRACT"
            ? CLOUD_MISSION_CONTRACT_TIMEOUT_MS
            : 110000;

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
        `ESQUEMA_DE_ARGUMENTOS=${JSON.stringify(inputSchema || {}).slice(0, 12000)}`
    ].join("\n");

    let plan;
    try {
        plan = await resolveSemanticPlan(
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
    } catch (cloudError) {
        if (typeof semanticPlanner === "function") throw cloudError;
        const fallback = await callBrowserSemanticPlan(
            briefingInstruction,
            catalog,
            {
                phase: "GROUNDED_ARGUMENT_COMPLETION",
                toolName: name,
                sourceCount: sources.length,
                writeAllowed: false
            }
        );
        plan = fallback;
    }

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

    try {
        const contractPlanner = context?.missionState?.phase === "MISSION_CONTRACT" &&
            typeof context.semanticPlanner !== "function"
            ? async ({ input: contractInput, catalog: contractCatalog, missionState }) => {
                try {
                    return await callSemanticPlanner(
                        contractInput,
                        contractCatalog,
                        missionState
                    );
                } catch (cloudError) {
                    try {
                        return await callBrowserMissionContract(
                            contractInput,
                            contractCatalog,
                            missionState
                        );
                    } catch (browserError) {
                        throw new Error(
                            `CLOUD_${cloudError?.message || "FAILED"}__BROWSER_${browserError?.message || "FAILED"}`
                        );
                    }
                }
            }
            : context.semanticPlanner;
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
        if (
            context?.missionState?.phase !== "MISSION_CONTRACT" &&
            typeof context.semanticPlanner !== "function"
        ) {
            try {
                const fallbackPlan = await callBrowserSemanticPlan(
                    instruction,
                    catalog,
                    context.missionState || null
                );
                const fallbackCalls = trustedPlanCalls(
                    fallbackPlan,
                    catalog,
                    {
                        ...context,
                        originalInstruction:
                            instruction
                    }
                );
                globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {
                    ok: true,
                    status: fallbackPlan.status,
                    provider: fallbackPlan.provider,
                    model: fallbackPlan.model,
                    toolCount: fallbackCalls.length,
                    toolNames: fallbackCalls.map(call => call.name),
                    recoveredFrom: error?.message || String(error),
                    checkedAt: new Date().toISOString()
                };
                return attachPlanMetadata(fallbackCalls, fallbackPlan);
            } catch (browserFallbackError) {
                error = new Error(
                    `CLOUD_${error?.message || "FAILED"}__BROWSER_${browserFallbackError?.message || "FAILED"}`
                );
            }
        }
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
    runtimeCatalog,
    trustedPlanCalls,
    enforceMissionIsolation,
    hasRequiredToolArguments,
    planCacheKey,
    extractJsonObject,
    callBrowserMissionContract,
    callBrowserSemanticPlan
};
