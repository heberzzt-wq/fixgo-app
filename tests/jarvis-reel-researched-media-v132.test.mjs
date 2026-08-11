import test from "node:test";
import assert from "node:assert/strict";
import { __test as plannerTest } from "../gestia-core/jarvis/jarvis.multifunction.planner.js";

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
        },
        additionalProperties: false
    }
};

function completedResearch(urls = []) {
    return { completedTasks: [{ name: "web.research", observation: {
        objectiveSatisfied: true,
        validSources: urls.map(url => ({ url, title: "Fuente verificada" }))
    } }] };
}

test("v132 promotes one verified researched URL into web.media.collect", () => {
    const calls = plannerTest.trustedPlanCalls({ planKind: "MISSION_CONTRACT_AUDIT", toolCalls: [{
        name: "web.media.collect", args: { requireImages: true, requireVideos: true }
    }] }, [mediaTool], {
        originalInstruction: "Investiga la entidad y crea un reel con medios reales.",
        missionState: completedResearch(["https://example.com/reel-source"])
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args.url, "https://example.com/reel-source");
});

test("v132 never promotes unverified research", () => {
    const missionState = completedResearch(["https://example.com/reel-source"]);
    missionState.completedTasks[0].observation.objectiveSatisfied = false;
    assert.deepEqual(plannerTest.verifiedResearchSourceUrls(missionState), []);
});

test("v132 stays fail-closed when researched sources are ambiguous", () => {
    const calls = plannerTest.trustedPlanCalls({ planKind: "MISSION_CONTRACT_AUDIT", toolCalls: [{
        name: "web.media.collect", args: { requireImages: true, requireVideos: true }
    }] }, [mediaTool], {
        originalInstruction: "Investiga la entidad y crea un reel con medios reales.",
        missionState: completedResearch(["https://one.example/source", "https://two.example/source"])
    });
    assert.equal(calls.length, 0);
});

test("v132 accepts semantic selection only when it matches verified research", () => {
    const calls = plannerTest.trustedPlanCalls({ planKind: "MISSION_CONTRACT_AUDIT", toolCalls: [{
        name: "web.media.collect", args: { url: "https://two.example/source", requireImages: true }
    }] }, [mediaTool], {
        originalInstruction: "Investiga la entidad y crea un reel con medios reales.",
        missionState: completedResearch(["https://one.example/source", "https://two.example/source"])
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args.url, "https://two.example/source");
});

test("v132 explicit user source remains authoritative", () => {
    const calls = plannerTest.trustedPlanCalls({ planKind: "MISSION_CONTRACT_AUDIT", toolCalls: [{
        name: "web.media.collect", args: { requireImages: true }
    }] }, [mediaTool], {
        originalInstruction: "Usa https://user.example/source para crear el reel.",
        missionState: completedResearch(["https://research.example/source"])
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args.url, "https://user.example/source");
});
