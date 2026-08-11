from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


planner_path = Path("gestia-core/jarvis/jarvis.multifunction.planner.js")
planner = planner_path.read_text(encoding="utf-8")
planner = replace_once(
    planner,
    'const VERSION = "4.17.0-source-grounded-research-v124";',
    'const VERSION = "4.18.0-reel-mission-fidelity-v133";',
    "planner version",
)

research_helpers = r'''
function normalizedMissionFidelityTerms(
    value = ""
) {
    return [
        ...String(value || "")
            .normalize("NFC")
            .toLocaleLowerCase()
            .matchAll(/[\p{L}\p{N}]+/gu)
    ]
        .map(match => match[0])
        .filter(term => term.length >= 3)
        .slice(0, 1200);
}

function researchQueryPreservesMissionIdentity(
    query = "",
    instruction = ""
) {
    const queryTerms =
        new Set(
            normalizedMissionFidelityTerms(
                query
            )
        );
    const instructionTerms =
        new Set(
            normalizedMissionFidelityTerms(
                instruction
            )
        );
    if (
        queryTerms.size === 0 ||
        instructionTerms.size === 0
    ) {
        return false;
    }
    const overlap =
        [...queryTerms]
            .filter(term =>
                instructionTerms.has(term)
            );
    return (
        overlap.length >= 2 ||
        overlap.some(term =>
            term.length >= 6
        )
    );
}

function normalizeResearchMissionFidelity(
    args = {},
    instruction = ""
) {
    const next = {
        ...(args &&
        typeof args === "object" &&
        !Array.isArray(args)
            ? args
            : {})
    };
    const missionInstruction =
        instructionBeforeAttachmentManifest(
            instruction
        )
            .replace(/\s+/g, " ")
            .trim();
    let query =
        String(
            next.query ||
            next.prompt ||
            ""
        )
            .replace(/\s+/g, " ")
            .trim();
    const exactEntity =
        String(next.exactEntity || "")
            .replace(/\s+/g, " ")
            .trim();
    let repaired =
        false;

    if (exactEntity) {
        const queryTerms =
            new Set(
                normalizedMissionFidelityTerms(
                    query
                )
            );
        const entityTerms =
            normalizedMissionFidelityTerms(
                exactEntity
            );
        if (
            entityTerms.length > 0 &&
            !entityTerms.every(term =>
                queryTerms.has(term)
            )
        ) {
            query =
                `${exactEntity} ${query}`
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 600);
            repaired =
                true;
        }
    }

    if (
        !exactEntity &&
        missionInstruction &&
        explicitHttpSourceUrls(
            instruction
        ).length === 0 &&
        !researchQueryPreservesMissionIdentity(
            query,
            missionInstruction
        )
    ) {
        query =
            missionInstruction
                .slice(0, 600);
        repaired =
            true;
    }

    if (query) {
        next.query =
            query;
    }

    return {
        args:
            next,
        repaired
    };
}
'''
planner = replace_once(
    planner,
    "\nfunction verifiedResearchSourceUrls(\n",
    f"\n{research_helpers}\nfunction verifiedResearchSourceUrls(\n",
    "research fidelity helpers",
)

planner = replace_once(
    planner,
    '''    if (\n        explicitAnchors.length === 0 &&\n        researchedAnchors.length === 0\n    ) {\n        return sourceCandidates;\n    }\n    const available =\n''',
    '''    const available =\n''',
    "remove source-only early return",
)

old_args = '''        const args =\n            candidateArgumentObject(candidate);\n        if (\n            name === "web.media.collect" &&\n'''
new_args = '''        let args =\n            candidateArgumentObject(candidate);\n        let missionFidelityRepaired =\n            false;\n        if (\n            name === "web.research"\n        ) {\n            const fidelity =\n                normalizeResearchMissionFidelity(\n                    args,\n                    context?.originalInstruction ||\n                    ""\n                );\n            args =\n                fidelity.args;\n            missionFidelityRepaired =\n                fidelity.repaired ===\n                true;\n        }\n        if (\n            name === "web.media.collect" &&\n'''
planner = replace_once(
    planner,
    old_args,
    new_args,
    "normalize research args",
)

planner = replace_once(
    planner,
    '''        if (!anchor) return candidate;\n\n        if (name === "web.research") {\n''',
    '''        if (!anchor) {\n            return {\n                ...candidate,\n                args,\n                ...(\n                    missionFidelityRepaired\n                        ? {\n                            reason:\n                                "SEMANTIC_RESEARCH_MISSION_FIDELITY_REPAIRED"\n                        }\n                        : {}\n                )\n            };\n        }\n\n        if (name === "web.research") {\n''',
    "preserve repaired research without source anchor",
)

planner = replace_once(
    planner,
    '''    verifiedResearchSourceUrls,\n    normalizeExplicitSourceCandidates\n};\n''',
    '''    verifiedResearchSourceUrls,\n    normalizeExplicitSourceCandidates,\n    normalizedMissionFidelityTerms,\n    researchQueryPreservesMissionIdentity,\n    normalizeResearchMissionFidelity\n};\n''',
    "export fidelity helpers",
)
planner_path.write_text(planner, encoding="utf-8")


orchestrator_path = Path("gestia-core/jarvis/jarvis.mission.orchestrator.js")
orchestrator = orchestrator_path.read_text(encoding="utf-8")
orchestrator = replace_once(
    orchestrator,
    'const VERSION = "1.11.0-semantic-memory-canonical-evidence";',
    'const VERSION = "1.12.0-reel-mission-fidelity-v133";',
    "orchestrator version",
)
orchestrator = replace_once(
    orchestrator,
    'const SINGLETON_MISSION_TOOLS = new Set(["marketing.plan"]);',
    'const SINGLETON_MISSION_TOOLS = new Set(["marketing.plan"]);\nconst COMPLETED_SINGLETON_MISSION_TOOLS = new Set(["reel.plan"]);',
    "completed singleton declaration",
)

unwrap_helper = r'''
function genericRuntimeEnvelopeStatus(
    value = ""
) {
    const status =
        text(value, 120)
            .toUpperCase();
    return (
        !status ||
        status === "SUCCESS" ||
        status === "COMPLETED" ||
        status === "OK"
    );
}

function unwrapObservationPayload(
    result = {}
) {
    let current =
        result;
    const seen =
        new Set();

    for (
        let depth = 0;
        depth < 8;
        depth += 1
    ) {
        if (
            !current ||
            typeof current !== "object" ||
            Array.isArray(current) ||
            seen.has(current)
        ) {
            break;
        }
        seen.add(current);

        const observation =
            current
                ?.observations
                ?.[0]
                ?.data;
        if (
            observation &&
            typeof observation === "object" &&
            !Array.isArray(observation)
        ) {
            current =
                observation;
            continue;
        }

        if (
            !genericRuntimeEnvelopeStatus(
                current?.status
            )
        ) {
            break;
        }

        const nested =
            [
                current?.result,
                current?.data,
                current?.response
            ].find(value =>
                value &&
                typeof value === "object" &&
                !Array.isArray(value)
            );
        if (!nested) {
            break;
        }
        current =
            nested;
    }

    return current &&
        typeof current === "object" &&
        !Array.isArray(current)
        ? current
        : result;
}
'''
orchestrator = replace_once(
    orchestrator,
    "\nfunction safeObservation(result = {}) {\n",
    f"\n{unwrap_helper}\nfunction safeObservation(result = {{}}) {{\n",
    "nested payload helper",
)

old_payload = '''    const payload =\n        result?.observations?.[0]?.data ||\n        result?.data?.observations?.[0]?.data ||\n        result?.result?.observations?.[0]?.data ||\n        result?.result ||\n        result?.data ||\n        result?.response ||\n        result;\n'''
orchestrator = replace_once(
    orchestrator,
    old_payload,
    '''    const payload =\n        unwrapObservationPayload(\n            result\n        );\n''',
    "safe observation payload unwrap",
)

orchestrator = replace_once(
    orchestrator,
    '''    const scheduledNames = new Set([\n        ...mission.completedTasks,\n        ...mission.pendingTasks,\n        ...mission.blockedTasks\n    ].map(item => item.name));\n''',
    '''    const scheduledNames = new Set([\n        ...mission.completedTasks,\n        ...mission.pendingTasks,\n        ...mission.blockedTasks\n    ].map(item => item.name));\n    const completedNames = new Set(\n        mission.completedTasks\n            .map(item => item.name)\n    );\n''',
    "completed tool names",
)

orchestrator = replace_once(
    orchestrator,
    '''        if (!name) continue;\n        if (SINGLETON_MISSION_TOOLS.has(name) && scheduledNames.has(name)) continue;\n        const call = { name, args: candidate?.args && typeof candidate.args === "object" ? candidate.args : {}, approved: false };\n''',
    '''        if (!name) continue;\n        if (SINGLETON_MISSION_TOOLS.has(name) && scheduledNames.has(name)) continue;\n        if (COMPLETED_SINGLETON_MISSION_TOOLS.has(name) && completedNames.has(name)) continue;\n        const call = { name, args: candidate?.args && typeof candidate.args === "object" ? candidate.args : {}, approved: false };\n''',
    "completed reel plan singleton guard",
)

orchestrator = replace_once(
    orchestrator,
    '''export const __test = { callSignature, compactRoutingInstruction, isFailureStatus, safeObservation, trustedCalls, canonicalMissionEvidence };\n''',
    '''export const __test = { callSignature, compactRoutingInstruction, isFailureStatus, safeObservation, trustedCalls, canonicalMissionEvidence, unwrapObservationPayload };\n''',
    "export payload unwrap",
)
orchestrator_path.write_text(orchestrator, encoding="utf-8")


test_path = Path("tests/jarvis-reel-mission-fidelity-v133.test.mjs")
test_path.write_text(r'''import assert from "node:assert/strict";
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
''', encoding="utf-8")

print("V133_PATCH_APPLIED=true")
