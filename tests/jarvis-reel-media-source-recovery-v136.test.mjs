import assert from "node:assert/strict";
import { test } from "node:test";

import { runJarvisMission } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";

const uber = "https://www.ubereats.com/mx/store/takos-el-dorado-cancun/DmKfCVrVW9W46Zx3LBI8jw";

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

test("failed reel media closes on the existing obligation without semantic replanning", async () => {
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
            return { missionComplete: true, toolCalls: [] };
        },
        execute: async call => {
            executed.push(`${call.name}:${String(call.args?.url || call.args?.researchGoal || "")}`);
            if (call.name === "web.research") {
                researchCount += 1;
                return researchResult(uber, "Takos El Dorado (Cancun)");
            }
            if (call.name === "web.media.collect") {
                return failedMedia(uber);
            }
            if (call.name === "reel.create") throw new Error("REEL_CREATE_MUST_NOT_EXECUTE");
            throw new Error(`UNEXPECTED_TOOL:${call.name}`);
        }
    });

    assert.deepEqual(executed, [
        "web.research:RESEARCH_1",
        `web.media.collect:${uber}`
    ]);
    assert.equal(plannerStates.some(state => state?.phase === "REEL_MEDIA_SOURCE_RECOVERY"), false);
    assert.equal(mission.completedTasks.some(task => task.name === "reel.create"), false);
    assert.equal(mission.blockedTasks.some(task => task.name === "web.media.collect"), true);
    assert.equal(mission.reelMediaRecovery?.active, false);
    assert.equal(mission.reelMediaRecovery?.attempts, 0);
    assert.equal(mission.reelMediaRecovery?.exhausted, true);
});

test("blocked reel media never creates retry-driven semantic obligations", async () => {
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
            plannerCalls += 1;
            return { missionComplete: true, toolCalls: [] };
        },
        execute: async call => {
            executed.push(call.name);
            if (call.name === "web.research") return researchResult(uber);
            if (call.name === "web.media.collect") return failedMedia(uber);
            if (call.name === "reel.create") throw new Error("REEL_CREATE_MUST_NOT_EXECUTE");
            throw new Error(`UNEXPECTED_TOOL:${call.name}`);
        }
    });

    assert.equal(plannerCalls, 0);
    assert.deepEqual(executed, ["web.research", "web.media.collect"]);
    assert.equal(mission.completedTasks.some(task => task.name === "reel.create"), false);
    assert.equal(mission.blockedTasks.some(task => task.name === "web.media.collect"), true);
});

test("legacy reel media semantic recovery is absent from the active browser chain", async () => {
    const fs = await import("node:fs");
    const planner = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
    const core = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
    const pack = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url), "utf8");
    const html = fs.readFileSync(new URL("../gestia-terminal.html", import.meta.url), "utf8");
    assert.doesNotMatch(planner, /REEL_MEDIA_SOURCE_RECOVERY/);
    assert.doesNotMatch(planner, /reelMediaRecovery/);
    assert.doesNotMatch(core, /REEL_MEDIA_SOURCE_RECOVERY/);
    assert.doesNotMatch(pack, /REEL_MEDIA_SOURCE_RECOVERY/);
    assert.doesNotMatch(html, /REEL_MEDIA_SOURCE_RECOVERY/);
});
// v139-transient-resilience-20260813
