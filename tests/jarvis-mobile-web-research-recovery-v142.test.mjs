import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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

test("v142 full ci runs the real loopback browser contract only once", () => {
    const packageJson = JSON.parse(
        fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")
    );
    assert.match(
        packageJson.scripts["test:nexo"],
        /tests\/nexo-terminal-bootstrap\.test\.mjs/
    );
    assert.doesNotMatch(
        packageJson.scripts.test,
        /tests\/nexo-terminal-bootstrap\.test\.mjs/
    );
});

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


test("v142 hard domain scope never relaxes an unrelated allowedDomain", async () => {
    const previousAuth = globalThis.auth;
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;
    const calls = [];
    globalThis.auth = { currentUser: { getIdToken: async () => "firebase-user-token" } };
    globalThis.window = globalThis.window || {};
    globalThis.JarvisLocalBridge = undefined;
    globalThis.fetch = async (_url, options = {}) => {
        const body = JSON.parse(String(options.body || "{}"));
        calls.push(body?.data || {});
        return {
            ok: false,
            status: 200,
            json: async () => ({ result: { ok: false, grounded: false, status: "WEB_RESEARCH_NOT_GROUNDED", message: "scope unavailable", sources: [] } })
        };
    };
    try {
        const result = await fetchGroundedWebResearch(
            "Facebook oficial de la empresa",
            {
                allowedDomain: "multiserviciospeninsulareshmh.com",
                seedUrl,
                exactEntity: "Taquería El Dorado"
            }
        );
        assert.equal(calls.length, 1);
        assert.equal(calls[0].allowedDomain, "multiserviciospeninsulareshmh.com");
        assert.equal(result.ok, false);
        assert.equal(result.error, "WEB_RESEARCH_UNAVAILABLE");
    } finally {
        if (previousAuth === undefined) delete globalThis.auth; else globalThis.auth = previousAuth;
        if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
        if (previousFetch === undefined) delete globalThis.fetch; else globalThis.fetch = previousFetch;
        if (previousBridge === undefined) delete globalThis.JarvisLocalBridge; else globalThis.JarvisLocalBridge = previousBridge;
    }
});


test("v142 entity-not-verified cloud recovery gives the existing local research bridge a chance", async () => {
    const previousAuth = globalThis.auth;
    const previousWindow = globalThis.window;
    const previousFetch = globalThis.fetch;
    const previousBridge = globalThis.JarvisLocalBridge;
    const cloudCalls = [];
    const localCalls = [];

    globalThis.auth = {
        currentUser: {
            getIdToken: async () => "firebase-user-token"
        }
    };
    globalThis.window = globalThis.window || {};
    globalThis.fetch = async (_url, options = {}) => {
        const body = JSON.parse(String(options.body || "{}"));
        cloudCalls.push(body?.data || {});
        return {
            ok: true,
            status: 200,
            json: async () => ({
                result: {
                    ok: true,
                    grounded: false,
                    status: "ENTITY_NOT_VERIFIED",
                    message: "No pude verificar la identidad exacta con las fuentes cloud consultadas.",
                    answer: "",
                    sources: [],
                    facts: [],
                    supports: []
                }
            })
        };
    };
    globalThis.JarvisLocalBridge = {
        requestJson: async (path, payload, options) => {
            localCalls.push({ path, payload, options });
            return {
                ok: true,
                grounded: true,
                status: "GROUNDED_LOCAL_SEARCH",
                query: payload.query,
                answer: "Identidad recuperada con fuentes web locales atribuibles.",
                sources: [
                    {
                        id: 1,
                        title: "Taquería El Dorado Cancún",
                        url: "https://example.com/taqueria-el-dorado-cancun"
                    }
                ],
                supports: [
                    {
                        text: "Fuente atribuible a Taquería El Dorado.",
                        sourceIds: [1]
                    }
                ]
            };
        }
    };

    try {
        const result = await fetchGroundedWebResearch(
            "Taquería El Dorado @taqueria.eldorado Cancún",
            {
                objectiveId: "OBJ-V142-LOCAL",
                caseId: "CASE-V142-LOCAL",
                allowedDomain: "tiktok.com",
                exactEntity: "Taquería El Dorado",
                seedUrl
            }
        );

        assert.equal(cloudCalls.length, 2);
        assert.equal(localCalls.length, 1);
        assert.equal(localCalls[0].path, "/research");
        assert.equal(localCalls[0].payload.allowedDomain, "");
        assert.equal(localCalls[0].payload.exactEntity, "Taquería El Dorado");
        assert.equal(localCalls[0].payload.seedUrl, seedUrl);
        assert.doesNotMatch(localCalls[0].payload.query, /https?:\/\//i);
        assert.match(localCalls[0].payload.query, /Taquería El Dorado/i);
        assert.equal(result.ok, true);
        assert.equal(result.executionOk, true);
        assert.equal(result.objectiveSatisfied, true);
        assert.equal(result.requiresInput, false);
        assert.equal(result.status, "GROUNDED_LOCAL_FALLBACK");
        assert.equal(result.source, "JARVIS_LOCAL_GROUNDED_WEB_RESEARCH");
        assert.equal(result.sourceScopeRecovered, true);
        assert.equal(result.exactAnchorVerified, false);
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


test("v142 physical reel reuses completed marketing evidence before semantic argument audit", () => {
    const core = fs.readFileSync(
        new URL("../gestia-core/gestia-core.js", import.meta.url),
        "utf8"
    );
    const speechIndex = core.indexOf(
        'call?.name === "speech.synthesize"'
    );
    const reelIndex = core.indexOf(
        'call?.name === "reel.plan"'
    );
    const genericAuditIndex = core.indexOf(
        "toolDefinition?.inputSchema &&",
        reelIndex
    );

    assert.ok(speechIndex >= 0);
    assert.ok(reelIndex > speechIndex);
    assert.ok(genericAuditIndex > reelIndex);
    assert.match(core, /!String\(\s*executionCall\.args\?\.output/);
    assert.match(core, /\.jarvis-artifacts\/audio\//);
    assert.match(core, /reelArtifactArgsFromCompletedTasks\(/);
    assert.match(core, /marketingReelScenes/);
    assert.match(core, /marketing\.plan:videoPackage/);
});

test("V142 reel media dependency evaluates the verified reel-plan handoff before external recovery", () => {
    const source = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.mission.orchestrator.js", import.meta.url),
        "utf8"
    ).replace(/\r\n/g, "\n");
    const handoffIndex = source.indexOf("const reelDependencyTask =");
    const dependencyIndex = source.indexOf("reelMediaDependencyCall(\n                reelDependencyTask");
    const recoveryIndex = source.indexOf("reelMediaRecoveryState(\n                reelDependencyTask");
    const executionHandoffIndex = source.indexOf("const reelPlanHandoff =", dependencyIndex);

    assert.ok(handoffIndex >= 0);
    assert.ok(dependencyIndex > handoffIndex);
    assert.ok(recoveryIndex > dependencyIndex);
    assert.ok(executionHandoffIndex > recoveryIndex);
});

test("V142 mini-drama consolidates semantic scene calls into one video.generate execution", () => {
    const videoTool = {
        name: "video.generate",
        mutates: true,
        requiresApproval: false,
        userArtifact: true,
        missionDedupeBy: ["output"],
        inputSchema: {}
    };
    const calls = plannerTest.trustedPlanCalls({
        planKind: "MISSION_CONTRACT",
        toolCalls: [
            { name: "video.generate", args: { prompt: "escena uno", output: ".jarvis-artifacts/videos/scene-1.mp4" } },
            { name: "video.generate", args: { prompt: "escena dos", output: ".jarvis-artifacts/videos/scene-2.mp4" } },
            { name: "video.generate", args: { prompt: "escena tres", output: ".jarvis-artifacts/videos/scene-3.mp4" } },
            { name: "video.generate", args: { prompt: "escena cuatro", output: ".jarvis-artifacts/videos/scene-4.mp4" } }
        ]
    }, [videoTool], {
        originalInstruction: "Produce un mini drama continuo con cuatro escenas.",
        missionState: { phase: "MISSION_CONTRACT" }
    });

    const videos = calls.filter(call => call.name === "video.generate");
    assert.equal(videos.length, 1);
    assert.equal(videos[0].reason, "SEMANTIC_MINIDRAMA_SCENES_CONSOLIDATED");
    assert.equal(videos[0].args.scenes.length, 4);
    assert.deepEqual(
        videos[0].args.scenes.map(scene => scene.prompt),
        ["escena uno", "escena dos", "escena tres", "escena cuatro"]
    );
});

test("V142 video actuator keeps the same Veo operation across transient poll failures", () => {
    const source = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url),
        "utf8"
    );
    assert.match(source, /transientPollFailures/);
    assert.match(source, /lastPollFailure/);
    assert.match(source, /structuredDetails\?\.retryable/);
    assert.match(source, /VIDEO_GENERATION_POLL_TRANSPORT_TIMEOUT/);
    assert.doesNotMatch(source, /consecutivePollFailures <= 3/);
    assert.match(source, /started.operationName/);
});

test("V142 video import accepts only the controlled Firebase Storage download URL", () => {
    const source = fs.readFileSync(
        new URL("../jarvis-fs-bridge.js", import.meta.url),
        "utf8"
    );
    assert.match(source, /host === "firebasestorage\.googleapis\.com"/);
    assert.match(source, /fixgo-44e4d\.firebasestorage\.app/);
    assert.match(source, /parsed\.searchParams\.get\("alt"\) === "media"/);
    assert.match(source, /parsed\.searchParams\.get\("token"\)/);
    assert.match(source, /VIDEO_IMPORT_SHA256_REQUIRED/);
});

test("V142 video cloud cleanup happens only after the physical import succeeds", () => {
    const source = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url),
        "utf8"
    );
    const importIndex = source.indexOf('const artifact = await bridgeRequest("/video/import"');
    const cleanupIndex = source.indexOf('action: "cleanup"', importIndex);
    assert.ok(importIndex >= 0);
    assert.ok(cleanupIndex > importIndex);
    assert.doesNotMatch(
        source.slice(importIndex, cleanupIndex),
        /finallys*{/
    );
});

test("V142 video engine resolver receives semantic media requirements before local start", () => {
    const actuator = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url),
        "utf8"
    );
    const bridge = fs.readFileSync(
        new URL("../jarvis-fs-bridge.js", import.meta.url),
        "utf8"
    );
    assert.match(actuator, /referenceCount: referenceImages\.length/);
    assert.match(actuator, /requiresImageToVideo: referenceImages\.length > 0/);
    assert.match(bridge, /videoEngine\.resolve\(req\.body \|\| \{\}\)/);
});
