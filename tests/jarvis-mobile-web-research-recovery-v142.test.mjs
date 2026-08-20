import test from "node:test";
import assert from "node:assert/strict";

import {
    buildCrossSourceResearchRecoveryQuery,
    fetchGroundedWebResearch
} from "../gestia-core/jarvis/jarvis.multitool.pack.js";
import { __test as plannerTest } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

// Production restoration sentinel: V94 ADJUNTO remains the deploy authority after CI cleanup.
const seedUrl =
    "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004?q=taqueria%20el%20dorado%20cancun";

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

function groundedCrossSourceResult() {
    return {
        ok: true,
        status: "GROUNDED",
        grounded: true,
        query: "Taquería El Dorado Cancún",
        answer: "Taquería El Dorado cuenta con fuentes públicas atribuibles.",
        sources: [
            {
                id: 1,
                title: "Taquería El Dorado Cancún",
                url: "https://example.com/taqueria-el-dorado-cancun"
            }
        ],
        facts: [
            {
                id: 1,
                type: "VERIFIED_FACT",
                claim: "Fuente atribuible a Taquería El Dorado.",
                sourceIds: [1]
            }
        ],
        supports: [
            {
                text: "Fuente atribuible a Taquería El Dorado.",
                sourceIds: [1]
            }
        ],
        inferences: [],
        searchQueries: ["Taquería El Dorado Cancún"],
        sourceCount: 1,
        objectiveId: "OBJ-V142",
        caseId: "CASE-V142"
    };
}

test("v142 recovery query removes the inaccessible source anchor but preserves identity", () => {
    const query = buildCrossSourceResearchRecoveryQuery(
        `Taquería El Dorado @taqueria.eldorado Cancún ${seedUrl}`,
        {
            allowedDomain: "tiktok.com",
            exactEntity: "Taquería El Dorado"
        }
    );

    assert.match(query, /Taquería El Dorado/i);
    assert.match(query, /@taqueria\.eldorado/i);
    assert.match(query, /Cancún/i);
    assert.doesNotMatch(query, /https?:\/\//i);
    assert.doesNotMatch(query, /site:tiktok\.com/i);
});

test("v142 mobile web research retries the same authenticated cloud tool cross-source when TikTok scope fails", async () => {
    const previousAuth = globalThis.auth;
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;
    const calls = [];

    globalThis.auth = {
        currentUser: {
            getIdToken: async () => "firebase-user-token"
        }
    };
    globalThis.window = globalThis.window || {};
    globalThis.JarvisLocalBridge = undefined;
    globalThis.fetch = async (_url, options = {}) => {
        const body = JSON.parse(String(options.body || "{}"));
        calls.push(body?.data || {});

        if (calls.length === 1) {
            return {
                ok: false,
                status: 500,
                json: async () => ({
                    error: {
                        message: "No fue posible completar la investigacion web con fuentes."
                    }
                })
            };
        }

        return {
            ok: true,
            status: 200,
            json: async () => ({
                result: groundedCrossSourceResult()
            })
        };
    };

    try {
        const result = await fetchGroundedWebResearch(
            "Taquería El Dorado @taqueria.eldorado Cancún",
            {
                objectiveId: "OBJ-V142",
                caseId: "CASE-V142",
                allowedDomain: "tiktok.com",
                exactEntity: "Taquería El Dorado",
                seedUrl
            }
        );

        assert.equal(calls.length, 2);
        assert.equal(calls[0].allowedDomain, "tiktok.com");
        assert.match(calls[0].query, /tiktok\.com/i);
        assert.equal(calls[1].allowedDomain, "");
        assert.equal(calls[1].exactEntity, "Taquería El Dorado");
        assert.doesNotMatch(calls[1].query, /https?:\/\//i);
        assert.equal(result.ok, true);
        assert.equal(result.grounded, true);
        assert.equal(result.status, "GROUNDED_CROSS_SOURCE_RECOVERY");
        assert.equal(result.source, "JARVIS_CROSS_SOURCE_WEB_RESEARCH_RECOVERY");
        assert.equal(result.exactAnchorVerified, false);
        assert.equal(result.sourceScopeRecovered, true);
        assert.equal(
            result.anchorStatus,
            "EXACT_ANCHOR_UNAVAILABLE_CROSS_SOURCE_GROUNDED"
        );
        assert.equal(result.anchor.seedUrl, seedUrl);
        assert.equal(result.sources[0].url, "https://example.com/taqueria-el-dorado-cancun");
    }
    finally {
        if (previousAuth === undefined) delete globalThis.auth;
        else globalThis.auth = previousAuth;
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
        if (previousFetch === undefined) delete globalThis.fetch;
        else globalThis.fetch = previousFetch;
        if (previousBridge === undefined) delete globalThis.JarvisLocalBridge;
        else globalThis.JarvisLocalBridge = previousBridge;
    }
});

test("v142 seedUrl argument alone never proves that the exact publication was verified", () => {
    const instruction =
        `Investiga la publicación exacta ${seedUrl} de Taquería El Dorado y luego cruza otras fuentes públicas.`;
    const missionState = {
        completedTasks: [
            {
                name: "web.research",
                args: {
                    query: "Taquería El Dorado @taqueria.eldorado Cancún",
                    researchGoal: "RESEARCH_1",
                    exactEntity: "Taquería El Dorado",
                    seedUrl,
                    allowedDomain: "tiktok.com"
                },
                observation: {
                    objectiveSatisfied: true,
                    status: "GROUNDED",
                    validSources: [
                        {
                            url: "https://example.com/taqueria-el-dorado-cancun"
                        }
                    ]
                }
            }
        ]
    };

    const calls = plannerTest.trustedPlanCalls({
        planKind: "MISSION_CONTRACT",
        toolCalls: [
            {
                name: "web.research",
                args: {
                    query: "Taquería El Dorado teléfono horarios redes",
                    researchGoal: "RESEARCH_1",
                    exactEntity: "Taquería El Dorado"
                }
            }
        ]
    }, [webTool], {
        originalInstruction: instruction,
        missionState
    });

    const research = calls.find(call => call.name === "web.research");
    assert.ok(research);
    assert.equal(research.args.seedUrl, seedUrl);
    assert.equal(research.args.allowedDomain, "tiktok.com");
});

test("v142 explicit anchor marked unavailable after cross-source recovery is resolved without being called verified", () => {
    const instruction =
        `Investiga la publicación exacta ${seedUrl} de Taquería El Dorado y luego cruza otras fuentes públicas.`;
    const missionState = {
        completedTasks: [
            {
                name: "web.research",
                args: {
                    query: "Taquería El Dorado @taqueria.eldorado Cancún",
                    researchGoal: "RESEARCH_1",
                    exactEntity: "Taquería El Dorado",
                    seedUrl,
                    allowedDomain: "tiktok.com"
                },
                observation: {
                    objectiveSatisfied: true,
                    status: "GROUNDED_CROSS_SOURCE_RECOVERY",
                    validSources: [
                        {
                            url: "https://example.com/taqueria-el-dorado-cancun"
                        }
                    ]
                }
            }
        ]
    };

    const calls = plannerTest.trustedPlanCalls({
        planKind: "MISSION_CONTRACT",
        toolCalls: [
            {
                name: "web.research",
                args: {
                    query: "Taquería El Dorado teléfono horarios redes",
                    researchGoal: "RESEARCH_1",
                    exactEntity: "Taquería El Dorado"
                }
            }
        ]
    }, [webTool], {
        originalInstruction: instruction,
        missionState
    });

    const research = calls.find(call => call.name === "web.research");
    assert.ok(research);
    assert.equal(research.args.researchGoal, "RESEARCH_1");
    assert.equal(research.args.exactEntity, "Taquería El Dorado");
    assert.equal(research.args.seedUrl, undefined);
    assert.equal(research.args.allowedDomain, undefined);
});
