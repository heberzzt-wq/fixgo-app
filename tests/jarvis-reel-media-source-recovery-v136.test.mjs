import assert from "node:assert/strict";
import { test } from "node:test";

import { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";

const uber = "https://www.ubereats.com/mx/store/takos-el-dorado-cancun/DmKfCVrVW9W46Zx3LBI8jw";
const tiktok = "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004";
const verifiedVideo = {
    kind: "video",
    output: ".jarvis-artifacts/web-media/taqueria/01-primary.mp4",
    mimeType: "video/mp4",
    bytes: 565016,
    sha256: "7".repeat(64),
    sourceUrl: tiktok,
    sourceTag: "browser-network"
};

function researchResult(url, title = "Taquería El Dorado") {
    return {
        ok: true,
        executionOk: true,
        objectiveSatisfied: true,
        status: "WEB_RESEARCH_COMPLETED",
        sources: [{ url, title }]
    };
}

function failedMedia(url) {
    return {
        ok: false,
        executionOk: true,
        objectiveSatisfied: false,
        blocked: true,
        retryable: false,
        requiresInput: false,
        status: "WEB_REAL_MEDIA_REQUIREMENTS_UNMET",
        error: "WEB_REAL_MEDIA_REQUIREMENTS_UNMET",
        sourceUrl: url,
        requirementsMet: false,
        mediaAssets: []
    };
}

function successfulMedia() {
    return {
        ok: true,
        executionOk: true,
        objectiveSatisfied: true,
        status: "WEB_REAL_MEDIA_COLLECTED",
        requirementsMet: true,
        mediaAssets: [verifiedVideo]
    };
}

function successfulReel() {
    return {
        ok: true,
        executionOk: true,
        objectiveSatisfied: true,
        status: "REEL_VIDEO_CREATED_VERIFIED",
        output: ".jarvis-artifacts/reels/taqueria.webm",
        mimeType: "video/webm;codecs=vp9",
        bytes: 900000,
        sha256: "a".repeat(64)
    };
}

test("v136 failed text source triggers semantic media-source recovery before reel creation", async () => {
    const executed = [];
    const plannerStates = [];
    let researchCount = 0;

    const mission = await runJarvisMission({
        instruction: "Investiga Taquería El Dorado en Cancún y créame un reel profesional de 30 segundos para promocionarla.",
        initialToolCalls: [
            {
                name: "web.research",
                args: {
                    query: "Taquería El Dorado Cancún",
                    exactEntity: "Taquería El Dorado",
                    researchGoal: "RESEARCH_1"
                }
            },
            {
                name: "reel.create",
                args: {
                    brandName: "Taquería El Dorado",
                    durationSeconds: 30,
                    scenes: [
                        { durationSeconds: 10, overlay: "Tacos" },
                        { durationSeconds: 10, overlay: "Sabor" },
                        { durationSeconds: 10, overlay: "Visítanos" }
                    ]
                }
            }
        ],
        requiredToolNames: ["web.research", "reel.create"],
        maximumSteps: 12,
        planner: async input => {
            plannerStates.push(input?.mission || null);
            if (input?.mission?.phase === "REEL_MEDIA_SOURCE_RECOVERY") {
                assert.deepEqual(input.mission.reelMediaRecovery.attemptedUrls, [uber]);
                return {
                    missionComplete: false,
                    toolCalls: [{
                        name: "web.research",
                        args: {
                            query: "Taquería El Dorado Cancún TikTok sitio oficial publicaciones",
                            exactEntity: "Taquería El Dorado",
                            researchGoal: "RESEARCH_2"
                        },
                        missionDedupeKey: "web.research:RESEARCH_2"
                    }]
                };
            }
            return { missionComplete: true, toolCalls: [] };
        },
        execute: async call => {
            executed.push(`${call.name}:${String(call.args?.url || call.args?.researchGoal || "")}`);
            if (call.name === "web.research") {
                researchCount += 1;
                return researchCount === 1
                    ? researchResult(uber, "Takos El Dorado (Cancun)")
                    : researchResult(tiktok, "Taqueria ElDorado en TikTok");
            }
            if (call.name === "web.media.collect") {
                return call.args.url === uber
                    ? failedMedia(uber)
                    : successfulMedia();
            }
            if (call.name === "reel.create") return successfulReel();
            throw new Error(`UNEXPECTED_TOOL:${call.name}`);
        }
    });

    assert.deepEqual(executed, [
        "web.research:RESEARCH_1",
        `web.media.collect:${uber}`,
        "web.research:RESEARCH_2",
        `web.media.collect:${tiktok}`,
        "reel.create:"
    ]);
    assert.equal(plannerStates.some(state => state?.phase === "REEL_MEDIA_SOURCE_RECOVERY"), true);
    assert.equal(mission.completedTasks.some(task => task.name === "reel.create"), true);
    assert.equal(mission.completedTasks.some(task => task.name === "web.media.collect" && task.args.url === tiktok), true);
    assert.equal(mission.blockedTasks.some(task => task.name === "web.media.collect"), false);
    assert.equal(Array.isArray(mission.recoveredMediaSourceAttempts), true);
    assert.equal(mission.recoveredMediaSourceAttempts.some(task => task.args.url === uber), true);
    assert.equal(mission.reelMediaRecovery?.recovered, true);
});

test("v136 repeated blocked media source exhausts recovery without executing reel.create", async () => {
    const executed = [];
    let plannerCalls = 0;
    const mission = await runJarvisMission({
        instruction: "Investiga Taquería El Dorado en Cancún y crea un reel profesional.",
        initialToolCalls: [
            {
                name: "web.research",
                args: {
                    query: "Taquería El Dorado Cancún",
                    exactEntity: "Taquería El Dorado",
                    researchGoal: "RESEARCH_1"
                }
            },
            {
                name: "reel.create",
                args: {
                    brandName: "Taquería El Dorado",
                    durationSeconds: 30,
                    scenes: [{ durationSeconds: 30, overlay: "Tacos" }]
                }
            }
        ],
        requiredToolNames: ["web.research", "reel.create"],
        maximumSteps: 12,
        planner: async input => {
            if (input?.mission?.phase !== "REEL_MEDIA_SOURCE_RECOVERY") {
                return { missionComplete: true, toolCalls: [] };
            }
            plannerCalls += 1;
            return {
                missionComplete: false,
                toolCalls: [{
                    name: "web.media.collect",
                    args: {
                        url: uber,
                        requireAnyVisual: true,
                        maxImages: 8,
                        maxVideos: 4
                    }
                }]
            };
        },
        execute: async call => {
            executed.push(call.name);
            if (call.name === "web.research") return researchResult(uber);
            if (call.name === "web.media.collect") return failedMedia(uber);
            if (call.name === "reel.create") throw new Error("REEL_CREATE_MUST_NOT_EXECUTE");
            throw new Error(`UNEXPECTED_TOOL:${call.name}`);
        }
    });

    assert.equal(plannerCalls, 3);
    assert.deepEqual(executed, ["web.research", "web.media.collect"]);
    assert.equal(mission.reason, "REEL_MEDIA_SOURCE_RECOVERY_EXHAUSTED");
    assert.equal(mission.status, "PARTIAL");
    assert.equal(mission.blockedTasks.some(task =>
        task.name === "reel.create" &&
        task.reason === "REEL_MEDIA_SOURCE_RECOVERY_EXHAUSTED"
    ), true);
});

test("v136 reel media recovery remains reachable through the current browser cache chain", async () => {
    const fs = await import("node:fs");
    const planner = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
    const core = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
    const pack = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../gestia-terminal.html", import.meta.url), "utf8");
    assert.match(planner, /REEL_MEDIA_SOURCE_RECOVERY/);
    assert.match(planner, /No reutilices URLs de reelMediaRecovery\.attemptedUrls/);
    assert.match(core, /jarvis\.multifunction\.planner\.js\?v=v136-reel-media-source-recovery-20260812/);
    assert.match(core, /jarvis\.mission\.orchestrator\.js\?v=v137-local-speech-synthesis-20260812/);
    assert.match(pack, /jarvis\.multifunction\.planner\.js\?v=v136-reel-media-source-recovery-20260812/);
    assert.match(html, /gestia-core\/gestia-core\.js\?v=v139-real-reel-e2e-20260812/);
});
