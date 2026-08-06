import { runJarvisMission } from "./jarvis.mission.orchestrator.js";
import { planMarketingRequest } from "./jarvis.marketing.engine.js";
import { marketingFinalResponseFromMission } from "./jarvis.marketing.presenter.js";
import { createProjectMemory, PROJECT_MEMORY_VERSION } from "./jarvis.project.memory.js";
import { classifyLocalRequest, selectResumableMarketingMission } from "./jarvis.local.routing.js";

const params = new URLSearchParams(location.search);
const active = ["127.0.0.1", "localhost"].includes(location.hostname) && params.get("jarvisLocal") === "1";
const STORAGE_CONTRACT_VERSION = "jarvis-local-mission-v2";
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
        async handle(input = "") {
            const normalized = String(input).trim();
            const requestKind = classifyLocalRequest(normalized);
            if (requestKind === "PROJECT_MEMORY_QUERY") {
                const remembered = memory.query({ includeSuperseded: true });
                const real = remembered.filter(item => item.dataClass !== "E2E_FIXTURE");
                const fixtures = remembered.filter(item => item.dataClass === "E2E_FIXTURE");
                const beforeToday = real.filter(item => item.effectiveFrom.slice(0, 10) < new Date().toISOString().slice(0, 10));
                const format = item => `- ${item.effectiveFrom} | ${item.type} | ${item.content} | evidencia: ${item.sourceId || item.id}`;
                const text = [
                    "Memoria persistente real:",
                    ...(beforeToday.length ? beforeToday.map(format) : ["- No puedo demostrar recuerdos anteriores a hoy en este namespace manual."]),
                    "", "Datos creados sólo para pruebas:",
                    ...(fixtures.length ? fixtures.map(format) : ["- Ninguno: los fixtures E2E están aislados en otro namespace."]),
                    "", "Información no disponible o no demostrable:",
                    "- No inventaré decisiones, restricciones, commits, expedientes ni resultados que no estén almacenados con evidencia.",
                    "", "Recuerdos almacenados hoy:",
                    ...real.filter(item => item.effectiveFrom.slice(0, 10) >= new Date().toISOString().slice(0, 10)).map(format)
                ].join("\n");
                return { status: "PROJECT_MEMORY_READY", requestKind, missionId: "", executionCount: 0, text };
            }
            if (requestKind === "MONTHLY_MEMORY_QUERY") {
                const month = new Date().toISOString().slice(0, 7);
                const entries = memory.query({ from: `${month}-01`, to: `${month}-31T23:59:59.999Z`, includeSuperseded: true });
                const done = entries.filter(item => !["PENDING_TASK", "MISSION_STATE"].includes(item.type) || item.status === "COMPLETED");
                const completedMissions = new Set(entries.filter(item => item.type === "MISSION_STATE" && item.status === "COMPLETED").map(item => item.missionId));
                const pending = entries.filter(item => item.type === "PENDING_TASK" && item.status !== "COMPLETED" && !completedMissions.has(item.missionId));
                return { status: "MONTHLY_CONTEXT_READY", text: [`Avances de ${month}:`, ...done.map(item => `- ${item.effectiveFrom}: ${item.content} (${item.id})`), "", "Pendiente:", ...pending.map(item => `- ${item.content} (${item.id})`)].join("\n") };
            }
            let pointer = {};
            try { pointer = JSON.parse(localStorage.getItem(pointerKey) || "{}"); } catch { pointer = {}; }
            const pendingMissionId = selectResumableMarketingMission(pointer, id, requestKind, STORAGE_CONTRACT_VERSION);
            if (Object.keys(pointer).length && pointer.contractVersion !== STORAGE_CONTRACT_VERSION) localStorage.removeItem(pointerKey);
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
                localStorage.setItem(pointerKey, JSON.stringify({ contractVersion: STORAGE_CONTRACT_VERSION, status: "WAITING_FOR_INPUT", intent: "marketing", missionId: result.missionId, userId: id.userId, workspaceId: id.workspaceId, projectId: id.projectId, conversationId: id.conversationId, updatedAt: new Date().toISOString() }));
                memory.remember({ type: "MISSION_STATE", subject: "marketing", content: `Misión ${result.missionId} pendiente: ${latest.missingInputs?.join(", ") || "datos críticos"}`, missionId: result.missionId, conversationId: id.conversationId, sourceId: result.objectiveId });
                memory.remember({ type: "PENDING_TASK", subject: "marketing", content: "Completar el contexto y generar el plan de marketing", missionId: result.missionId, conversationId: id.conversationId, sourceId: result.objectiveId });
                return { status: latest.status, missionId: result.missionId, executionCount: 1, text: latest.message || result.blockedTasks[0]?.observation?.summary || "Jarvis necesita información para continuar." };
            }
            const visible = marketingFinalResponseFromMission(result);
            if (visible) {
                localStorage.removeItem(pointerKey);
                for (const pending of memory.query({ types: ["PENDING_TASK", "MISSION_STATE"], subject: "marketing" })) {
                    if (pending.missionId === result.missionId && pending.status !== "COMPLETED") memory.forget(pending.id);
                }
                memory.remember({ type: "TECHNICAL_RESULT", subject: "marketing", content: visible.text, status: "COMPLETED", missionId: result.missionId, conversationId: id.conversationId, sourceId: result.objectiveId, tags: ["marketing", "90-days"] });
                memory.remember({ type: "MISSION_STATE", subject: "marketing", content: `Misión ${result.missionId} completada con plan visible de 25 secciones`, status: "COMPLETED", missionId: result.missionId, conversationId: id.conversationId, sourceId: result.objectiveId });
                return { ...visible, status: "MARKETING_PACKAGE_READY", missionId: result.missionId, executionCount: result.runtimeResults.filter(item => item.status === "MARKETING_PACKAGE_READY").length };
            }
            return { status: latest.status || result.reason, missionId: result.missionId, executionCount: result.runtimeResults.length, text: "La misión no produjo un entregable visible completo." };
        }
    };
}

export { BUILD as FIXGO_RUNTIME_BUILD };
