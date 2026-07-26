import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { reviewChiefArchitectPlan } from "../gestia-core/jarvis/jarvis.chief.architect.js";

const instruction = "Corrige app-login.js para evitar la redireccion temporal a cliente.";
const graph = {
    ok: true,
    status: "REPO_GRAPH_READY",
    summary: { dependencyEdges: 4, duplicateEndpoints: 0 },
    nodes: {
        "app-login.js": {
            relatedTests: ["tests/auth-routing.test.mjs"],
            dependencies: ["firebase.js"],
            dependents: ["login.html"]
        }
    }
};
const ranking = {
    ok: true,
    status: "CANDIDATE_RANKING_READY",
    candidates: [{ file: "app-login.js", score: 180 }]
};

function completePlan() {
    return {
        originalInstruction: instruction,
        targetFiles: ["app-login.js"],
        rootCause: "Dos observadores de autenticacion compiten y navegan antes de resolver el rol definitivo.",
        rootCauseEvidence: [{ file: "app-login.js", line: 24 }],
        scope: { included: ["enrutamiento posterior al login"], excluded: ["permisos Firestore"] },
        tests: ["tests/auth-routing.test.mjs"],
        toolCalls: [{
            name: "repo.write",
            args: { file: "app-login.js" },
            mutates: true,
            requiresApproval: true,
            approved: false
        }]
    };
}

test("Chief Architect blocks altered instructions and auto-approved mutations", () => {
    const plan = completePlan();
    plan.originalInstruction = "Cambia cualquier archivo que quieras.";
    plan.toolCalls[0].approved = true;
    const review = reviewChiefArchitectPlan({ instruction, plan, graph, ranking, authority: { authorityId: "heberto_mendoza" } });
    assert.equal(review.decision, "BLOCKED");
    assert.ok(review.blockers.some(item => item.id === "instruction_conservation"));
    assert.ok(review.blockers.some(item => item.id === "security"));
    assert.equal(review.canExecute, false);
    assert.equal(review.grantsApproval, false);
});

test("Chief Architect accepts a grounded plan only for later human approval", () => {
    const review = reviewChiefArchitectPlan({
        instruction,
        plan: completePlan(),
        graph,
        ranking,
        authority: { authorityId: "heberto_mendoza" }
    });
    assert.equal(review.decision, "READY_FOR_HUMAN_APPROVAL");
    assert.equal(review.blockers.length, 0);
    assert.equal(review.requiresHumanApproval, true);
    assert.equal(review.canExecute, false);
    assert.equal(review.grantsApproval, false);
    assert.equal(review.checks.length, 11);
});

test("Chief Architect rejects malformed mutation collections without crashing", () => {
    const malformedPlan =
        completePlan();
    malformedPlan.toolCalls = {
        name:
            "repo.write"
    };
    const review =
        reviewChiefArchitectPlan({
            instruction,
            plan:
                malformedPlan,
            graph,
            ranking,
            authority: {
                authorityId:
                    "heberto_mendoza"
            }
        });

    assert.equal(
        review.ok,
        true
    );
    assert.equal(
        review.checks.length,
        11
    );
});

test("Chief Architect is registered as a real read-only tool and reported honestly", () => {
    const runtime = fs.readFileSync(new URL("../gestia-core/tools.runtime.js", import.meta.url), "utf8");
    const forensic = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url), "utf8");
    assert.match(runtime, /name: "repo\.architectReview"/);
    assert.match(runtime, /reviewChiefArchitectPlan/);
    assert.match(runtime, /recordCapabilityEvidence\(\s*"chief_architect"/);
    assert.match(runtime, /recordCapabilityEvidence\(\s*"one_time_write_authorization"/);
    assert.match(runtime, /required:\s*\[\s*"instruction",\s*"plan"\s*\]/);
    assert.match(runtime, /context\.role\s*\|\|\s*context\.rol/);
    assert.match(runtime, /missionIsolation:\s*"exclusive"/);
    assert.match(runtime, /PLAN_ORIGINAL_INSTRUCTION_NOT_GROUNDED/);
    assert.match(runtime, /instructionSource:\s*"verified_plan_literal"/);
    assert.doesNotMatch(runtime, /args\.authority\s*\|\|/);
    assert.doesNotMatch(runtime, /context\.authority\s*\|\|/);
    assert.doesNotMatch(runtime, /authority:\s*\{\s*type:\s*"object"/);
    const core = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
    assert.match(core, /GESTIA_MASTER_EMAIL/);
    assert.match(core, /verifiedAuthorityId/);
    assert.match(core, /user\.email/);
    assert.match(core, /authorityId:\s*verifiedAuthorityId/);
    assert.match(core, /missionIsIsolated/);
    assert.match(core, /SELF_CONTAINED_MISSION_COMPLETE/);
    assert.match(forensic, /id: "chief_architect"/);
    assert.match(forensic, /readCapabilityEvidence\("chief_architect"\)/);
    assert.match(forensic, /readCapabilityEvidence\("one_time_write_authorization"\)/);
    assert.match(forensic, /falta verificar un plan real completo/i);
});
