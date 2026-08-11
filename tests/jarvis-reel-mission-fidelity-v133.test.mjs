import assert from "node:assert/strict";
import { test } from "node:test";

import { __test as plannerTest } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";
import { __test as orchestratorTest } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import { reelArtifactArgsFromCompletedTasks } from "../gestia-core/jarvis/jarvis.reel.presenter.js";

const missionInstruction =
    "Investiga Taquería El Dorado en Cancún y créame un reel profesional de 30 segundos para promocionarla.";

const researchCatalog = [{
    name: "web.research",
    description: "Investiga información actual con fuentes.",
    mutates: false,
    requiresApproval: false,
    missionDedupeBy: ["researchGoal"],
    inputSchema: {
        type: "object",
        required: ["query", "researchGoal"],
        properties: {
            query: { type: "string" },
            researchGoal: { type: "string" },
            exactEntity: { type: "string" },
            allowedDomain: { type: "string" },
            seedUrl: { type: "string" }
        },
        additionalProperties: false
    }
}];

test("v133 repairs a generic research query back to the immutable mission instead of researching 'negocio'", () => {
    const calls = plannerTest.trustedPlanCalls(
        {
            toolCalls: [{
                name: "web.research",
                args: {
                    query: "negocio",
                    researchGoal: "RESEARCH_1"
                }
            }]
        },
        researchCatalog,
        {
            originalInstruction: missionInstruction
        }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "web.research");
    assert.match(calls[0].args.query, /Taquería El Dorado/);
    assert.match(calls[0].args.query, /Cancún/);
    assert.notEqual(calls[0].args.query, "negocio");
    assert.equal(calls[0].reason, "SEMANTIC_RESEARCH_MISSION_FIDELITY_REPAIRED");
});

test("v133 injects an explicit semantic exactEntity into an underspecified research query", () => {
    const normalized = plannerTest.normalizeResearchMissionFidelity(
        {
            query: "información y medios reales",
            exactEntity: "Taquería El Dorado"
        },
        missionInstruction
    );

    assert.equal(normalized.repaired, true);
    assert.match(normalized.args.query, /^Taquería El Dorado /);
});

function readyReelPayload() {
    return {
        ok: true,
        status: "REEL_PLAN_READY",
        brandName: "Taquería El Dorado",
        title: "Sabor dorado en Cancún",
        cta: "Visítanos hoy",
        durationSeconds: 30,
        timelineSeconds: 30,
        scenes: [
            {
                durationSeconds: 10,
                visual: "Fachada y llegada",
                overlay: "Taquería El Dorado",
                voiceover: "Descubre sabor en Cancún.",
                evidence: "Fuente verificada",
                transition: "fade"
            },
            {
                durationSeconds: 10,
                visual: "Preparación del platillo",
                overlay: "Preparado al momento",
                voiceover: "Cada escena se apoya en evidencia real.",
                evidence: "Fuente verificada",
                transition: "cut"
            },
            {
                durationSeconds: 10,
                visual: "Cierre con identidad del negocio",
                overlay: "Visítanos hoy",
                voiceover: "Conoce Taquería El Dorado.",
                evidence: "Fuente verificada",
                transition: "fade"
            }
        ]
    };
}

test("v133 unwraps nested generic runtime SUCCESS envelopes into REEL_PLAN_READY", () => {
    const observation = orchestratorTest.safeObservation({
        ok: true,
        status: "SUCCESS",
        result: {
            ok: true,
            status: "SUCCESS",
            data: readyReelPayload()
        }
    });

    assert.equal(observation.status, "REEL_PLAN_READY");
    assert.equal(observation.objectiveSatisfied, true);
    assert.equal(observation.preparedArtifact?.kind, "reel");
    assert.equal(observation.preparedArtifact?.scenes?.length, 3);

    const args = reelArtifactArgsFromCompletedTasks([
        {
            name: "reel.plan",
            observation
        }
    ]);
    assert.ok(args);
    assert.equal(args.brandName, "Taquería El Dorado");
    assert.equal(args.durationSeconds, 30);
    assert.equal(args.scenes.length, 3);
    assert.equal(
        args.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
        30
    );
});

test("v133 does not schedule a second reel.plan after one reel plan completed successfully", () => {
    const completed = {
        name: "reel.plan",
        signature: "completed-reel-plan",
        args: { title: "Plan A" },
        observation: {
            objectiveSatisfied: true,
            status: "REEL_PLAN_READY"
        }
    };
    const accepted = orchestratorTest.trustedCalls(
        [{
            name: "reel.plan",
            args: { title: "Plan B" }
        }],
        {
            completedTasks: [completed],
            pendingTasks: [],
            blockedTasks: []
        }
    );

    assert.deepEqual(accepted, []);
});
