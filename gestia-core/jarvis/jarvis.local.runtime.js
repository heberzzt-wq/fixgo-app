import { runJarvisMission } from "./jarvis.mission.orchestrator.js";
import { planMarketingRequest } from "./jarvis.marketing.engine.js";
import { marketingFinalResponseFromMission } from "./jarvis.marketing.presenter.js";
import { createProjectMemory, PROJECT_MEMORY_VERSION } from "./jarvis.project.memory.js";
import { classifyLocalRequest, selectResumableMarketingMission } from "./jarvis.local.routing.js";

const params = new URLSearchParams(location.search);
const active = ["127.0.0.1", "localhost"].includes(location.hostname) && params.get("jarvisLocal") === "1";
const STORAGE_CONTRACT_VERSION = "jarvis-local-mission-v3-semantic-only";
const BUILD = Object.freeze({
    buildId: "fixgo-v94-semantic-only-local-runtime-20260809",
    baseCommitId: "v94-media-v4n-negative-claims",
    entrypoint: "/gestia-terminal.html",
    core: "gestia-core-v16",
    orchestrator: "1.10.0-diagnostic-error-normalization",
    marketing: "semantic-only",
    presenter: "1.0.0-marketing-visible",
    memory: PROJECT_MEMORY_VERSION,
    routing: "structured-semantic-envelope-only",
    builtAt: "2026-08-09"
});

function identity() {
    return {
        userId: params.get("userId") || "local-owner",
        workspaceId: params.get("workspaceId") || "fixgo",
        projectId: params.get("projectId") || "local-project",
        conversationId: params.get("conversationId") || "local-conversation"
    };
}

function structuredEnvelope(input = null) {
    if (
        input &&
        typeof input === "object" &&
        !Array.isArray(input)
    ) {
        return {
            instruction:
                typeof input.instruction === "string"
                    ? input.instruction.trim()
                    : "",
            requestKind:
                typeof input.requestKind === "string"
                    ? input.requestKind.trim()
                    : "NEW_REQUEST",
            marketingContext:
                input.marketingContext &&
                typeof input.marketingContext === "object" &&
                !Array.isArray(input.marketingContext)
                    ? { ...input.marketingContext }
                    : {},
            semantic:
                input.semantic &&
                typeof input.semantic === "object" &&
                !Array.isArray(input.semantic)
                    ? input.semantic
                    : null
        };
    }

    return {
        instruction:
            typeof input === "string"
                ? input.trim()
                : "",
        requestKind: "NEW_REQUEST",
        marketingContext: {},
        semantic: null
    };
}

function memoryLine(item = {}) {
    return `- ${item.effectiveFrom} | ${item.type} | ${item.content} | evidencia: ${item.sourceId || item.id}`;
}

if (active) {
    const id = identity();
    const namespace = params.get("storageNamespace") === "e2e" ? "e2e" : "manual";
    const runId = namespace === "e2e" ? params.get("runId") || "default-run" : "";
    const memory = createProjectMemory({ storage: localStorage, identity: id, namespace, runId });
    const pointerKey = `${memory.missionKey}::pending-marketing`;

    globalThis.__FIXGO_BUILD__ = BUILD;
    document.documentElement.dataset.fixgoBuildId = BUILD.buildId;
    globalThis.__JARVIS_LOCAL_IDENTITY__ = id;
    console.info("[FIXGO_RUNTIME_BUILD]", BUILD);

    globalThis.JarvisLocalRuntime = {
        active: true,
        build: BUILD,
        memory,
        async handle(input = null) {
            const envelope = structuredEnvelope(input);
            const requestKind = classifyLocalRequest(
                "",
                envelope
            );

            if (requestKind === "PROJECT_MEMORY_QUERY") {
                const remembered = memory.query({ includeSuperseded: true });
                const real = remembered.filter(item => item.dataClass !== "E2E_FIXTURE");
                const fixtures = remembered.filter(item => item.dataClass === "E2E_FIXTURE");
                const today = new Date().toISOString().slice(0, 10);
                const beforeToday = real.filter(item => item.effectiveFrom.slice(0, 10) < today);
                const todayEntries = real.filter(item => item.effectiveFrom.slice(0, 10) >= today);
                const text = [
                    "Memoria persistente real:",
                    ...(beforeToday.length ? beforeToday.map(memoryLine) : ["- No hay recuerdos anteriores demostrables en este namespace."]),
                    "",
                    "Datos creados sólo para pruebas:",
                    ...(fixtures.length ? fixtures.map(memoryLine) : ["- Ninguno en este namespace."]),
                    "",
                    "Recuerdos almacenados hoy:",
                    ...todayEntries.map(memoryLine)
                ].join("\n");
                return {
                    status: "PROJECT_MEMORY_READY",
                    requestKind,
                    missionId: "",
                    executionCount: 0,
                    text
                };
            }

            if (requestKind === "MONTHLY_MEMORY_QUERY") {
                const month = new Date().toISOString().slice(0, 7);
                const entries = memory.query({
                    from: `${month}-01`,
                    to: `${month}-31T23:59:59.999Z`,
                    includeSuperseded: true
                });
                const done = entries.filter(item =>
                    item.status === "COMPLETED" ||
                    (
                        item.type !== "PENDING_TASK" &&
                        item.type !== "MISSION_STATE"
                    )
                );
                const completedMissions = new Set(
                    entries
                        .filter(item =>
                            item.type === "MISSION_STATE" &&
                            item.status === "COMPLETED"
                        )
                        .map(item => item.missionId)
                );
                const pending = entries.filter(item =>
                    item.type === "PENDING_TASK" &&
                    item.status !== "COMPLETED" &&
                    !completedMissions.has(item.missionId)
                );
                return {
                    status: "MONTHLY_CONTEXT_READY",
                    requestKind,
                    missionId: "",
                    executionCount: 0,
                    text: [
                        `Avances de ${month}:`,
                        ...done.map(item => `- ${item.effectiveFrom}: ${item.content} (${item.id})`),
                        "",
                        "Pendiente:",
                        ...pending.map(item => `- ${item.content} (${item.id})`)
                    ].join("\n")
                };
            }

            if (
                requestKind !== "MARKETING_START" &&
                requestKind !== "MARKETING_CONTINUATION"
            ) {
                return {
                    status: "LOCAL_SEMANTIC_ROUTER_REQUIRED",
                    requestKind,
                    missionId: "",
                    executionCount: 0,
                    text:
                        "El runtime local ya no clasifica lenguaje natural. La capa semántica debe entregar requestKind y argumentos estructurados."
                };
            }

            let pointer = {};
            try {
                pointer = JSON.parse(
                    localStorage.getItem(pointerKey) ||
                    "{}"
                );
            }
            catch {
                pointer = {};
            }

            const pendingMissionId = selectResumableMarketingMission(
                pointer,
                id,
                requestKind,
                STORAGE_CONTRACT_VERSION
            );
            if (
                Object.keys(pointer).length &&
                pointer.contractVersion !== STORAGE_CONTRACT_VERSION
            ) {
                localStorage.removeItem(pointerKey);
            }

            const context = {
                ...envelope.marketingContext
            };
            const firstRequest =
                requestKind === "MARKETING_START" &&
                !pendingMissionId;
            const instruction =
                envelope.instruction ||
                "Crear un plan de marketing con los argumentos semánticos proporcionados.";

            const result = await runJarvisMission({
                instruction,
                initialToolCalls:
                    firstRequest
                        ? [{
                            name: "marketing.plan",
                            args: { ...context }
                        }]
                        : [],
                requiredToolNames: ["marketing.plan"],
                resumeMissionId:
                    pendingMissionId ||
                    undefined,
                continuationContext:
                    context,
                storage:
                    memory.missionStorage,
                planner:
                    async () => ({
                        toolCalls: [],
                        missionComplete: true
                    }),
                execute:
                    async (_call, missionContext) =>
                        planMarketingRequest(
                            instruction,
                            {
                                ...context,
                                ...missionContext.marketingContext
                            }
                        )
            });

            const latest = result.runtimeResults.at(-1) || {};
            if (result.reason === "MISSION_INPUT_REQUIRED") {
                localStorage.setItem(
                    pointerKey,
                    JSON.stringify({
                        contractVersion: STORAGE_CONTRACT_VERSION,
                        status: "WAITING_FOR_INPUT",
                        intent: "marketing",
                        missionId: result.missionId,
                        userId: id.userId,
                        workspaceId: id.workspaceId,
                        projectId: id.projectId,
                        conversationId: id.conversationId,
                        updatedAt: new Date().toISOString()
                    })
                );
                memory.remember({
                    type: "MISSION_STATE",
                    subject: "marketing",
                    content: `Misión ${result.missionId} pendiente de argumentos semánticos requeridos.`,
                    missionId: result.missionId,
                    conversationId: id.conversationId,
                    sourceId: result.objectiveId
                });
                return {
                    status: latest.status,
                    requestKind,
                    missionId: result.missionId,
                    executionCount: 1,
                    text:
                        latest.message ||
                        "Faltan argumentos estructurados para continuar."
                };
            }

            const visible = marketingFinalResponseFromMission(result);
            if (visible) {
                localStorage.removeItem(pointerKey);
                memory.remember({
                    type: "TECHNICAL_RESULT",
                    subject: "marketing",
                    content: visible.text,
                    status: "COMPLETED",
                    missionId: result.missionId,
                    conversationId: id.conversationId,
                    sourceId: result.objectiveId,
                    tags: ["marketing", "semantic"]
                });
                memory.remember({
                    type: "MISSION_STATE",
                    subject: "marketing",
                    content: `Misión ${result.missionId} completada con argumentos estructurados de la capa semántica.`,
                    status: "COMPLETED",
                    missionId: result.missionId,
                    conversationId: id.conversationId,
                    sourceId: result.objectiveId
                });
                return {
                    ...visible,
                    status: "MARKETING_PACKAGE_READY",
                    requestKind,
                    missionId: result.missionId,
                    executionCount: result.runtimeResults.filter(item =>
                        item.status === "MARKETING_PACKAGE_READY"
                    ).length
                };
            }

            return {
                status: latest.status || result.reason,
                requestKind,
                missionId: result.missionId,
                executionCount: result.runtimeResults.length,
                text: "La misión no produjo un entregable visible completo."
            };
        }
    };
}

export { BUILD as FIXGO_RUNTIME_BUILD };
