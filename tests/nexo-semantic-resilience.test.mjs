import assert from "node:assert/strict";
import { test } from "node:test";

import {
    compileNexoMission
} from "../gestia-core/nexo/nexo.mission.compiler.v2.js";
import {
    __test
} from "../gestia-core/nexo/nexo.semantic-planner-resilience.js";

const {
    requiredToolNames,
    cloudPlanCoversLocalMission,
    localCompilerMayAssist,
    responseHasUsefulPlan
} = __test;

function responseFor(result, status = 200) {
    return new Response(
        JSON.stringify({ result }),
        {
            status,
            headers: {
                "Content-Type": "application/json"
            }
        }
    );
}

test("local compiler never owns initial or contract intent", () => {
    assert.equal(localCompilerMayAssist(null), false);
    assert.equal(localCompilerMayAssist({ missionState: null }), false);
    assert.equal(localCompilerMayAssist({
        missionState: { phase: "MISSION_CONTRACT" }
    }), false);
    assert.equal(localCompilerMayAssist({
        missionState: { phase: "COMPLETION_AUDIT" }
    }), false);
});

test("local compiler may assist only an already selected grounded tool", () => {
    assert.equal(localCompilerMayAssist({
        missionState: {
            phase: "GROUNDED_ARGUMENT_COMPLETION",
            toolName: "marketing.plan"
        }
    }), true);
    assert.equal(localCompilerMayAssist({
        missionState: {
            phase: "GROUNDED_ARGUMENT_COMPLETION",
            toolName: ""
        }
    }), false);
});

test("semantic cloud plan is authoritative when no grounded tool requires completion", async () => {
    const cloudPlan = {
        ok: true,
        missionComplete: false,
        toolCalls: [{
            name: "conversation.respond",
            args: { prompt: "Explica el tema solicitado" }
        }]
    };

    assert.equal(cloudPlanCoversLocalMission(cloudPlan, null), true);
    assert.equal(
        await responseHasUsefulPlan(responseFor(cloudPlan), null),
        true
    );
});

test("semantic no-tool completion is valid when no local selected-tool contract exists", async () => {
    const cloudPlan = {
        ok: true,
        missionComplete: true,
        toolCalls: []
    };

    assert.equal(
        await responseHasUsefulPlan(responseFor(cloudPlan), null),
        true
    );
});

test("grounded argument completion still requires the semantically selected tool", async () => {
    const catalog = [
        "marketing.plan",
        "conversation.respond"
    ].map(name => ({ name }));
    const localPlan = compileNexoMission({
        input: [
            "Completa los argumentos de la herramienta ya seleccionada.",
            "INSTRUCCION_ORIGINAL=Haz un plan de marketing para Peninsula Tech"
        ].join("\n"),
        catalog,
        missionState: {
            phase: "GROUNDED_ARGUMENT_COMPLETION",
            toolName: "marketing.plan"
        }
    });

    assert.deepEqual([...requiredToolNames(localPlan)], ["marketing.plan"]);
    assert.equal(
        await responseHasUsefulPlan(
            responseFor({
                ok: true,
                missionComplete: false,
                toolCalls: [{
                    name: "conversation.respond",
                    args: { prompt: "respuesta generica" }
                }]
            }),
            localPlan
        ),
        false
    );
    assert.equal(
        await responseHasUsefulPlan(
            responseFor({
                ok: true,
                missionComplete: false,
                toolCalls: [{
                    name: "marketing.plan",
                    args: { brandName: "Peninsula Tech" }
                }]
            }),
            localPlan
        ),
        true
    );
});
