import test from "node:test";
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

test("marketing production scope preserves explicit production intent across planned actuators", () => {
    const planningOnly = resolveMarketingMissionProductionScope({
        productionRequested: true,
        productionArtifacts: []
    }, {
        requiredToolNames: ["web.research", "marketing.plan", "reel.plan"]
    });
    assert.equal(planningOnly.productionRequested, true);
    assert.deepEqual(
        planningOnly.productionArtifacts.map(item => item.toolName),
        ["reel.create"]
    );

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
