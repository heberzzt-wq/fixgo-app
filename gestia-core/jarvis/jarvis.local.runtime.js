import { runJarvisMission } from "./jarvis.mission.orchestrator.js";
import { planMarketingRequest } from "./jarvis.marketing.engine.js";
import { marketingFinalResponseFromMission } from "./jarvis.marketing.presenter.js";
import { createProjectMemory, PROJECT_MEMORY_VERSION } from "./jarvis.project.memory.js";

const params = new URLSearchParams(location.search);
const active = ["127.0.0.1", "localhost"].includes(location.hostname) && params.get("jarvisLocal") === "1";
const BUILD = Object.freeze({
    buildId: "fixgo-v5.9-marketing-memory-20260805",
    baseCommitId: "f20e18aaa6ea6558265052ee3996227e2b959a40",
    entrypoint: "/gestia-terminal.html",
    core: "gestia-core-v16",
    orchestrator: "1.10.0-diagnostic-error-normalization",
    marketing: "8.1.0-nexo-complete-marketing-package",
    presenter: "1.0.0-marketing-visible",
    memory: PROJECT_MEMORY_VERSION,
    builtAt: "2026-08-05T23:30:00-05:00"
});

function identity() {
    return {
        userId: params.get("userId") || "local-owner",
        workspaceId: params.get("workspaceId") || "fixgo",
        projectId: params.get("projectId") || "multiservicios-hmh",
        conversationId: params.get("conversationId") || "marketing-e2e"
    };
}

function extractContext(input = "") {
    const aliases = { negocio: "offer", mercado_inicial: "market", audiencia: "audience", oferta: "offer", problema: "pain", promesa: "promise", diferenciador: "differentiator", objetivo: "campaignObjective", canales: "channels", cta: "cta", presupuesto: "budget", horizonte: "horizon" };
    const result = { brandName: "Multiservicios Peninsulares HMH" };
    for (const segment of String(input).split(/\.\s+(?=[A-ZÁÉÍÓÚÑ][^:]{1,40}:)|\n+/)) {
        const match = segment.match(/^\s*([^:]+):\s*(.+?)\.?\s*$/s);
        if (!match) continue;
        const key = match[1].trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "_");
        const field = aliases[key];
        if (!field) continue;
        result[field] = field === "channels" ? match[2].split(/,|\sy\s/).map(value => value.trim()).filter(Boolean) : match[2].trim();
    }
    if (/escenario bajo/i.test(input)) result.budget = "escenario bajo";
    if (/escenario medio/i.test(input)) result.mediumBudget = "escenario medio";
    return result;
}

if (active) {
    const id = identity();
    const memory = createProjectMemory({ storage: localStorage, identity: id });
    const pointerKey = `${memory.missionKey}::pending-marketing`;
    globalThis.__FIXGO_BUILD__ = BUILD;
    document.documentElement.dataset.fixgoBuildId = BUILD.buildId;
    globalThis.__JARVIS_LOCAL_IDENTITY__ = id;
    console.info("[FIXGO_RUNTIME_BUILD]", BUILD);

    globalThis.JarvisLocalRuntime = {
        active: true,
        build: BUILD,
        memory,
        async handle(input = "") {
            const normalized = String(input).trim();
            if (/que hicimos con el plan de marketing|que recuerdas de este proyecto/i.test(normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
                const remembered = memory.query({ types: ["TECHNICAL_RESULT", "PENDING_TASK", "MISSION_STATE"] });
                return { status: "MEMORY_RECALLED", missionId: remembered.find(item => item.missionId)?.missionId || "", text: remembered.map(item => `${item.type}: ${item.content}`).join("\n\n") || "No hay recuerdos guardados para este proyecto." };
            }
            if (/que avanzamos este mes|que hicimos durante/i.test(normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
                const month = new Date().toISOString().slice(0, 7);
                const entries = memory.query({ from: `${month}-01`, to: `${month}-31T23:59:59.999Z`, includeSuperseded: true });
                const done = entries.filter(item => !["PENDING_TASK", "MISSION_STATE"].includes(item.type) || item.status === "COMPLETED");
                const completedMissions = new Set(entries.filter(item => item.type === "MISSION_STATE" && item.status === "COMPLETED").map(item => item.missionId));
                const pending = entries.filter(item => item.type === "PENDING_TASK" && item.status !== "COMPLETED" && !completedMissions.has(item.missionId));
                return { status: "MONTHLY_CONTEXT_READY", text: [`Avances de ${month}:`, ...done.map(item => `- ${item.effectiveFrom}: ${item.content} (${item.id})`), "", "Pendiente:", ...pending.map(item => `- ${item.content} (${item.id})`)].join("\n") };
            }
            const pendingMissionId = localStorage.getItem(pointerKey) || "";
            const continuationContext = extractContext(normalized);
            const firstRequest = /plan de marketing completo/i.test(normalized) && !pendingMissionId;
            const result = await runJarvisMission({
                instruction: normalized,
                initialToolCalls: firstRequest ? [{ name: "marketing.plan", args: {} }] : [],
                requiredToolNames: ["marketing.plan"],
                resumeMissionId: pendingMissionId || undefined,
                continuationContext,
                storage: memory.missionStorage,
                planner: async () => ({ toolCalls: [], missionComplete: true }),
                execute: async (_call, context) => planMarketingRequest(firstRequest ? normalized : "Crea un plan de marketing completo para Multiservicios Peninsulares HMH.", { ...continuationContext, ...context.marketingContext })
            });
            const latest = result.runtimeResults.at(-1) || {};
            if (result.reason === "MISSION_INPUT_REQUIRED") {
                localStorage.setItem(pointerKey, result.missionId);
                memory.remember({ type: "MISSION_STATE", subject: "marketing", content: `Misión ${result.missionId} pendiente: ${latest.missingInputs?.join(", ") || "datos críticos"}`, missionId: result.missionId, conversationId: id.conversationId, sourceId: result.objectiveId });
                memory.remember({ type: "PENDING_TASK", subject: "marketing", content: "Completar el contexto y generar el plan de marketing", missionId: result.missionId, conversationId: id.conversationId, sourceId: result.objectiveId });
                return { status: latest.status, missionId: result.missionId, executionCount: 1, text: latest.message || result.blockedTasks[0]?.observation?.summary || "Jarvis necesita información para continuar." };
            }
            const visible = marketingFinalResponseFromMission(result);
            if (visible) {
                localStorage.removeItem(pointerKey);
                for (const pending of memory.query({ types: ["PENDING_TASK"], subject: "marketing" })) memory.forget(pending.id);
                memory.remember({ type: "TECHNICAL_RESULT", subject: "marketing", content: visible.text, status: "COMPLETED", missionId: result.missionId, conversationId: id.conversationId, sourceId: result.objectiveId, tags: ["marketing", "90-days"] });
                memory.remember({ type: "MISSION_STATE", subject: "marketing", content: `Misión ${result.missionId} completada con plan visible de 25 secciones`, status: "COMPLETED", missionId: result.missionId, conversationId: id.conversationId, sourceId: result.objectiveId });
                return { ...visible, status: "MARKETING_PACKAGE_READY", missionId: result.missionId, executionCount: result.runtimeResults.filter(item => item.status === "MARKETING_PACKAGE_READY").length };
            }
            return { status: latest.status || result.reason, missionId: result.missionId, executionCount: result.runtimeResults.length, text: "La misión no produjo un entregable visible completo." };
        }
    };
}

export { BUILD as FIXGO_RUNTIME_BUILD };
