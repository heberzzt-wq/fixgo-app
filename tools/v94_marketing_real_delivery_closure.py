from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'MARKETING_CLOSURE_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Mission orchestrator: a marketing production mission may not close merely
# because each tool NAME ran once. Repeated document.create requirements are
# distinct by format and every required artifact must expose a real output.
# ---------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.mission.orchestrator.js'
text = read(path)
anchor = '''function callSignature(call = {}) {\n    return JSON.stringify(stable({ name: text(call.name, 100), args: call.args || {} }));\n}\n'''
insert = anchor + '''\nfunction marketingArtifactOutput(task = {}) {\n    return text(\n        task?.observation?.artifact ||\n        task?.observation?.evidence?.output ||\n        task?.observation?.evidence?.artifact?.output ||\n        "",\n        500\n    );\n}\n\nfunction taskMatchesMarketingRequirement(task = {}, requirement = {}) {\n    const toolName = text(requirement?.toolName, 120);\n    if (!toolName || text(task?.name, 120) !== toolName) return false;\n    const requiredFormat = text(requirement?.format, 40).toLowerCase();\n    if (toolName === "document.create" && requiredFormat) {\n        return text(task?.args?.format, 40).toLowerCase() === requiredFormat;\n    }\n    return true;\n}\n\nfunction unresolvedMarketingProductionRequirements(mission = {}) {\n    const completed = Array.isArray(mission?.completedTasks)\n        ? mission.completedTasks\n        : [];\n    const marketing = [...completed].reverse().find(item =>\n        item?.name === "marketing.plan" &&\n        item?.observation?.productionRequested === true\n    );\n    const requirements = Array.isArray(marketing?.observation?.requiredArtifacts)\n        ? marketing.observation.requiredArtifacts\n        : [];\n    return requirements.filter(requirement => {\n        const completedTask = completed.find(item =>\n            taskMatchesMarketingRequirement(item, requirement)\n        );\n        return !completedTask || !marketingArtifactOutput(completedTask);\n    }).map((requirement, index) => ({\n        id: text(requirement?.id || `artifact-${index + 1}`, 120),\n        type: text(requirement?.type, 120),\n        toolName: text(requirement?.toolName, 120),\n        format: text(requirement?.format, 40),\n        label: text(requirement?.label, 200)\n    }));\n}\n'''
text = replace_once(text, anchor, insert, 'orchestrator-production-helper')
old = '''                const contractSatisfied = contractUnaccountedTools.length === 0;\n                const verifiedContractSatisfied =\n                    contractSatisfied &&\n                    mission.requiredToolNames.length > 0 &&\n                    mission.completedTasks.length > 0;\n'''
new = '''                const unresolvedProductionArtifacts =\n                    unresolvedMarketingProductionRequirements(mission);\n                mission.unresolvedProductionArtifacts =\n                    unresolvedProductionArtifacts;\n                const contractSatisfied =\n                    contractUnaccountedTools.length === 0 &&\n                    unresolvedProductionArtifacts.length === 0;\n                const verifiedContractSatisfied =\n                    contractSatisfied &&\n                    mission.requiredToolNames.length > 0 &&\n                    mission.completedTasks.length > 0;\n'''
text = replace_once(text, old, new, 'orchestrator-production-completion-gate')
write(path, text)


# ---------------------------------------------------------------------------
# Migrate the remaining legacy full-suite expectations to the new semantic
# marketing contract. These are contract migrations, not weakened assertions.
# ---------------------------------------------------------------------------
path = 'tests/jarvis-multifunction-tools.test.mjs'
text = read(path)
old_version = '/v94-semantic-only-v108-20260809/'
version_count = text.count(old_version)
if version_count < 2:
    raise SystemExit(f'MARKETING_CLOSURE_ANCHOR_FAILED:legacy-terminal-version:{version_count}')
text = text.replace(
    old_version,
    '/v94-marketing-real-delivery-v109-20260809/'
)
text = replace_once(
    text,
    '''                cta: "Solicita una demostración",\n                channels: ["instagram"],\n                assets: ["reel", "landing_page"],\n''',
    '''                cta: "Solicita una demostración",\n                channels: ["instagram"],\n                market: "México",\n                campaignObjective: "generar demostraciones calificadas",\n                horizon: "90 días",\n                productionRequested: false,\n                assets: ["reel", "landing_page"],\n''',
    'legacy-marketing-plan-semantic-brief'
)
text = replace_once(
    text,
    '''                channels: ["linkedin", "facebook", "instagram"],\n                assets: ["landing_page", "image_brief", "reel"],\n                durationSeconds: 45\n''',
    '''                channels: ["linkedin", "facebook", "instagram"],\n                assets: ["landing_page", "image_brief", "reel"],\n                durationSeconds: 45,\n                market: "México",\n                campaignObjective: "generar reuniones calificadas",\n                horizon: "90 días",\n                productionRequested: false\n''',
    'legacy-grounded-marketing-semantic-scope'
)
write(path, text)


# ---------------------------------------------------------------------------
# End-to-end contract regression: the exact production family requested by the
# user must remain open until MD, PDF, XLSX, PPTX, landing, image and reel all
# have verifiable outputs. It also proves the Terminal core prioritizes the
# marketing delivery response and hydrates plan documents from completed work.
# ---------------------------------------------------------------------------
regression = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { planMarketingRequest } from "../gestia-core/jarvis/jarvis.marketing.engine.js";
import {
    marketingArtifactArgsFromCompletedTasks,
    marketingFinalResponseFromMission
} from "../gestia-core/jarvis/jarvis.marketing.presenter.js";
import { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";

function memoryStorage() {
    const values = new Map();
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    };
}

const productionArtifacts = [
    { id: "plan-md", type: "marketing_plan", toolName: "document.create", format: "md", label: "Plan MD" },
    { id: "plan-pdf", type: "marketing_plan", toolName: "document.create", format: "pdf", label: "Plan PDF" },
    { id: "tracker-xlsx", type: "tracker", toolName: "document.create", format: "xlsx", label: "Tracker XLSX" },
    { id: "deck-pptx", type: "deck", toolName: "document.create", format: "pptx", label: "Deck PPTX" },
    { id: "landing", type: "landing_page", toolName: "page.create", format: "html", label: "Landing HTML" },
    { id: "visual", type: "visual", toolName: "image.generate", format: "png", label: "Visual PNG" },
    { id: "reel", type: "reel", toolName: "reel.create", format: "html", label: "Reel 9:16" }
];

const marketingContext = {
    brandName: "Península Tech",
    audience: "hogares, administradores y pequeños negocios que requieren servicios confiables",
    offer: "coordinación digital de multiservicios con seguimiento",
    pain: "proveedores dispersos y poca trazabilidad del servicio",
    promise: "solicitud y seguimiento claros desde una sola experiencia",
    differentiator: "trazabilidad operativa y evidencia del servicio",
    cta: "Solicita tu servicio",
    market: "Cancún, Quintana Roo",
    campaignObjective: "generar conversaciones calificadas y solicitudes de servicio",
    horizon: "90 días",
    channels: ["Instagram", "Facebook", "TikTok", "WhatsApp"],
    productionRequested: true,
    productionArtifacts
};

function taskMatchesRequirement(item, requirement) {
    if (item?.name !== requirement.toolName) return false;
    if (requirement.toolName === "document.create") {
        return String(item?.args?.format || "").toLowerCase() === requirement.format;
    }
    return true;
}

function artifactArgs(requirement) {
    if (requirement.toolName === "document.create") {
        const args = {
            format: requirement.format,
            title: requirement.label
        };
        if (["md", "pdf"].includes(requirement.format)) {
            args.contentSource = "marketing.plan";
        }
        if (requirement.format === "xlsx") {
            args.sheets = [{ name: "KPIs", rows: [["KPI", "Meta"], ["Leads", 20]] }];
        }
        if (requirement.format === "pptx") {
            args.slides = [{ title: "Península Tech", bullets: ["Plan de 90 días"] }];
        }
        return args;
    }
    if (requirement.toolName === "page.create") {
        return { brandName: "Península Tech", title: "Península Tech", description: "Multiservicios", services: [] };
    }
    if (requirement.toolName === "image.generate") {
        return { prompt: "Visual tecnológico limpio para Península Tech", mimeType: "image/png" };
    }
    if (requirement.toolName === "reel.create") {
        return { brandName: "Península Tech", title: "Servicio con trazabilidad", cta: "Solicita tu servicio", durationSeconds: 30, scenes: [] };
    }
    return {};
}

test("complete marketing production cannot close until every requested artifact format exists", async () => {
    const plan = planMarketingRequest(
        "Ejecuta marketing de punta a punta y entrega MD, PDF, XLSX, PPTX, landing, visual y reel.",
        marketingContext
    );
    assert.equal(plan.status, "MARKETING_PACKAGE_READY");
    assert.equal(plan.productionRequested, true);
    assert.equal(plan.requiredArtifacts.length, 7);

    const executionOrder = [];
    const mission = await runJarvisMission({
        instruction: "Ejecuta marketing de punta a punta y entrega MD, PDF, XLSX, PPTX, landing, visual y reel.",
        initialToolCalls: [{ name: "marketing.plan", args: {} }],
        requiredToolNames: ["marketing.plan"],
        planner: async ({ mission: current }) => {
            const missing = productionArtifacts.find(requirement =>
                !current.completedTasks.some(item =>
                    taskMatchesRequirement(item, requirement) &&
                    Boolean(item?.observation?.artifact)
                )
            );
            return missing
                ? {
                    toolCalls: [{ name: missing.toolName, args: artifactArgs(missing) }],
                    missionComplete: false
                }
                : { toolCalls: [], missionComplete: true };
        },
        execute: async (call, missionContext) => {
            executionOrder.push(`${call.name}:${call.args?.format || ""}`);
            if (call.name === "marketing.plan") {
                return {
                    ok: true,
                    status: plan.status,
                    objectiveSatisfied: true,
                    planReady: true,
                    readyForProduction: true,
                    productionRequested: true,
                    requiredArtifacts: plan.requiredArtifacts,
                    plan: plan.plan,
                    userVisible: plan.userVisible
                };
            }
            const format = String(call.args?.format || "artifact").toLowerCase();
            return {
                ok: true,
                status: "COMPLETED",
                objectiveSatisfied: true,
                output: `.jarvis-artifacts/e2e/${call.name.replaceAll(".", "-")}-${format}.artifact`
            };
        },
        storage: memoryStorage(),
        maximumSteps: 20
    });

    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.deepEqual(mission.unresolvedProductionArtifacts, []);
    assert.equal(executionOrder.filter(item => item.startsWith("document.create:")).length, 4);
    assert.equal(executionOrder.includes("document.create:md"), true);
    assert.equal(executionOrder.includes("document.create:pdf"), true);
    assert.equal(executionOrder.includes("document.create:xlsx"), true);
    assert.equal(executionOrder.includes("document.create:pptx"), true);

    const final = marketingFinalResponseFromMission(mission);
    assert.equal(final.ok, true);
    assert.equal(final.unresolvedArtifacts.length, 0);
    assert.equal(final.producedArtifacts.length, 7);
    assert.equal(final.text.includes("Archivos producidos y verificados"), true);
    for (const label of ["PLAN MD", "PLAN PDF", "TRACKER XLSX", "DECK PPTX", "LANDING HTML", "VISUAL PNG", "REEL 9:16"]) {
        assert.equal(final.text.includes(label), true, label);
    }
});

test("marketing production fails closed when one repeated document format is missing", () => {
    const plan = planMarketingRequest("Producción integral.", marketingContext);
    const completedTasks = [{
        name: "marketing.plan",
        args: {},
        observation: {
            status: plan.status,
            objectiveSatisfied: true,
            planReady: true,
            productionRequested: true,
            requiredArtifacts: plan.requiredArtifacts,
            userVisible: plan.userVisible
        }
    }];

    for (const requirement of productionArtifacts.filter(item => item.format !== "pptx")) {
        completedTasks.push({
            name: requirement.toolName,
            args: artifactArgs(requirement),
            observation: { artifact: `.jarvis-artifacts/e2e/${requirement.id}.artifact` }
        });
    }

    const final = marketingFinalResponseFromMission({
        completedTasks,
        blockedTasks: [],
        pendingTasks: []
    });
    assert.equal(final.ok, false);
    assert.equal(final.unresolvedArtifacts.length, 1);
    assert.equal(final.unresolvedArtifacts[0].label, "DECK PPTX");
    assert.equal(final.text.includes("Producción pendiente"), true);
});

test("Terminal core hydrates marketing documents and gives the direct delivery response highest priority", () => {
    const core = fs.readFileSync(path.join(process.cwd(), "gestia-core", "gestia-core.js"), "utf8");
    const terminal = fs.readFileSync(path.join(process.cwd(), "gestia-terminal.html"), "utf8");

    assert.match(core, /marketingArtifactArgsFromCompletedTasks\(/);
    assert.match(core, /marketingFinalResponseFromMission\(\s*missionResult\s*\)/);
    assert.match(core, /const finalResponse\s*=\s*marketingDeliverableFinalResponse\s*\|\|/);
    assert.match(core, /v94-marketing-real-delivery-v109-20260809/);
    assert.match(terminal, /v94-marketing-real-delivery-v109-20260809/);
});

test("completed marketing plan content is injected into MD and PDF artifact creation", () => {
    const plan = planMarketingRequest("Producción integral.", marketingContext);
    const completed = [{
        name: "marketing.plan",
        args: {},
        observation: {
            status: plan.status,
            objectiveSatisfied: true,
            planReady: true,
            productionRequested: true,
            requiredArtifacts: plan.requiredArtifacts,
            userVisible: plan.userVisible
        }
    }];

    for (const format of ["md", "pdf"]) {
        const args = marketingArtifactArgsFromCompletedTasks(completed, {
            format,
            contentSource: "marketing.plan",
            title: `Plan ${format.toUpperCase()}`
        });
        assert.ok(args);
        assert.equal(args.format, format);
        assert.equal(args.content, plan.userVisible);
        assert.equal(args.content.length > 1000, true);
    }
});
'''
write('tests/jarvis-marketing-terminal-delivery.e2e.test.mjs', regression)


# Permanent full-CI inclusion after the base repair adds its regression.
path = 'package.json'
text = read(path)
text = replace_once(
    text,
    'tests/jarvis-marketing-real-delivery.test.mjs tests/jarvis-daily-supervisor.test.cjs',
    'tests/jarvis-marketing-real-delivery.test.mjs tests/jarvis-marketing-terminal-delivery.e2e.test.mjs tests/jarvis-daily-supervisor.test.cjs',
    'package-terminal-delivery-e2e'
)
write(path, text)

print('V94_MARKETING_REAL_DELIVERY_CLOSURE_APPLIED')
