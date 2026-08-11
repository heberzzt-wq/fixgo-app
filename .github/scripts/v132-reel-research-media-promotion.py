from pathlib import Path

PLANNER = Path("gestia-core/jarvis/jarvis.multifunction.planner.js")
TEST = Path("tests/jarvis-reel-researched-media-v132.test.mjs")

source = PLANNER.read_text(encoding="utf-8")
marker = "function normalizeExplicitSourceCandidates(\n"
if source.count(marker) != 1:
    raise SystemExit(f"V132_NORMALIZER_MARKER_COUNT={source.count(marker)}")

helper = r'''function verifiedResearchSourceUrls(
    missionState = null
) {
    const completedTasks = Array.isArray(missionState?.completedTasks)
        ? missionState.completedTasks
        : [];
    const values = [];
    const seen = new Set();
    for (const task of completedTasks) {
        if (
            String(task?.name || "") !== "web.research" ||
            task?.observation?.objectiveSatisfied !== true ||
            !Array.isArray(task?.observation?.validSources)
        ) continue;
        for (const source of task.observation.validSources) {
            const candidate = String(source?.url || source?.href || "").trim();
            if (!candidate) continue;
            try {
                const url = new URL(candidate);
                if (!["https:", "http:"].includes(url.protocol)) continue;
                url.hash = "";
                const normalized = url.toString();
                if (seen.has(normalized)) continue;
                seen.add(normalized);
                values.push(normalized);
            } catch {}
            if (values.length >= 8) return values;
        }
    }
    return values;
}

'''
source = source.replace(marker, helper + marker, 1)

old_anchors = '''    const anchors =
        explicitHttpSourceUrls(
            context?.originalInstruction ||
            ""
        );
    if (anchors.length === 0) {
        return sourceCandidates;
    }
'''
new_anchors = '''    const explicitAnchors =
        explicitHttpSourceUrls(
            context?.originalInstruction ||
            ""
        );
    const researchedAnchors =
        verifiedResearchSourceUrls(
            context?.missionState ||
            null
        );
    if (
        explicitAnchors.length === 0 &&
        researchedAnchors.length === 0
    ) {
        return sourceCandidates;
    }
'''
if source.count(old_anchors) != 1:
    raise SystemExit(f"V132_ANCHOR_BLOCK_COUNT={source.count(old_anchors)}")
source = source.replace(old_anchors, new_anchors, 1)

old_selection = '''        const anchor =
            sourceAnchorForCandidate(
                args,
                anchors
            );
        if (!anchor) return candidate;
'''
new_selection = '''        if (
            name === "web.media.collect" &&
            explicitAnchors.length === 0 &&
            researchedAnchors.length > 1
        ) {
            const declared = sourceAnchorDescriptor(args.url || "");
            const verifiedSelection = Boolean(declared) && researchedAnchors.some(value =>
                sourceAnchorDescriptor(value)?.url === declared.url
            );
            if (!verifiedSelection) {
                return { ...candidate, name: "" };
            }
        }
        const candidateAnchors =
            explicitAnchors.length > 0
                ? explicitAnchors
                : name === "web.media.collect"
                    ? researchedAnchors
                    : [];
        const anchor =
            sourceAnchorForCandidate(
                args,
                candidateAnchors
            );
        if (!anchor) return candidate;
'''
if source.count(old_selection) != 1:
    raise SystemExit(f"V132_ANCHOR_SELECTION_COUNT={source.count(old_selection)}")
source = source.replace(old_selection, new_selection, 1)

old_export = '''    sourceAnchorDescriptor,
    normalizeExplicitSourceCandidates
};
'''
new_export = '''    sourceAnchorDescriptor,
    verifiedResearchSourceUrls,
    normalizeExplicitSourceCandidates
};
'''
if source.count(old_export) != 1:
    raise SystemExit(f"V132_TEST_EXPORT_COUNT={source.count(old_export)}")
source = source.replace(old_export, new_export, 1)
PLANNER.write_text(source, encoding="utf-8")

TEST.write_text(r'''import test from "node:test";
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
''', encoding="utf-8")
print("V132_RESEARCH_MEDIA_PROMOTION_PATCHED=true")
