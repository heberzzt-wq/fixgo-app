from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1) Orchestrator: reel.plan is singleton even inside the same initial batch,
# and research-backed reel.create dynamically acquires verified visual media first.
path = "gestia-core/jarvis/jarvis.mission.orchestrator.js"
replace_once(
    path,
    'const VERSION = "1.12.0-reel-mission-fidelity-v133";',
    'const VERSION = "1.13.0-real-reel-production-gate-v134";'
)
replace_once(
    path,
    'const SINGLETON_MISSION_TOOLS = new Set(["marketing.plan"]);',
    'const SINGLETON_MISSION_TOOLS = new Set(["marketing.plan", "reel.plan"]);'
)

helper_marker = "export async function runJarvisMission({"
helper_block = r'''function normalizedHttpSourceUrl(value = "") {
    try {
        const url = new URL(String(value || "").trim());
        if (!["http:", "https:"].includes(url.protocol)) return "";
        if (url.username || url.password) return "";
        url.hash = "";
        return url.toString();
    }
    catch {
        return "";
    }
}

function explicitMissionHttpSourceUrls(input = "") {
    const source = String(input || "");
    const values = [];
    const seen = new Set();
    let cursor = 0;
    while (cursor < source.length && values.length < 8) {
        const httpIndex = source.indexOf("http://", cursor);
        const httpsIndex = source.indexOf("https://", cursor);
        let start = -1;
        if (httpIndex < 0) start = httpsIndex;
        else if (httpsIndex < 0) start = httpIndex;
        else start = Math.min(httpIndex, httpsIndex);
        if (start < 0) break;
        let end = start;
        while (end < source.length) {
            const character = source[end];
            if (character.charCodeAt(0) <= 32 || "<>\"'`".includes(character)) break;
            end += 1;
        }
        let candidate = source.slice(start, end);
        while (candidate && ".,;:!?)]}".includes(candidate.at(-1))) {
            candidate = candidate.slice(0, -1);
        }
        const normalized = normalizedHttpSourceUrl(candidate);
        if (normalized && !seen.has(normalized)) {
            seen.add(normalized);
            values.push(normalized);
        }
        cursor = Math.max(end, start + 1);
    }
    return values;
}

function verifiedResearchMediaSourceUrls(mission = {}) {
    const values = [];
    const seen = new Set();
    for (const task of Array.isArray(mission?.completedTasks) ? mission.completedTasks : []) {
        if (task?.name !== "web.research" || task?.observation?.objectiveSatisfied !== true) continue;
        const sources = Array.isArray(task?.observation?.validSources)
            ? task.observation.validSources
            : [];
        for (const source of sources) {
            const normalized = normalizedHttpSourceUrl(source?.url || source?.href || "");
            if (normalized && !seen.has(normalized)) {
                seen.add(normalized);
                values.push(normalized);
            }
        }
    }
    return values.slice(0, 12);
}

function reelArgsHaveExplicitVisualMedia(args = {}) {
    const scenes = Array.isArray(args?.scenes) ? args.scenes : [];
    return scenes.some(scene =>
        scene &&
        typeof scene === "object" &&
        !Array.isArray(scene) &&
        [scene.assetOutput, scene.assetDataUrl, scene.mediaUrl]
            .some(value => String(value || "").trim().length > 0)
    );
}

function verifiedCollectedVisualAssets(mission = {}) {
    const assets = [];
    for (const task of Array.isArray(mission?.completedTasks) ? mission.completedTasks : []) {
        if (task?.name !== "web.media.collect" || task?.observation?.objectiveSatisfied !== true) continue;
        const candidates = Array.isArray(task?.observation?.evidence?.mediaAssets)
            ? task.observation.evidence.mediaAssets
            : Array.isArray(task?.observation?.mediaAssets)
                ? task.observation.mediaAssets
                : [];
        for (const asset of candidates) {
            const kind = String(asset?.kind || "").trim().toLowerCase();
            const output = String(asset?.output || "").trim().replaceAll("\\", "/");
            const mimeType = String(asset?.mimeType || "").trim().toLowerCase();
            const sha256 = String(asset?.sha256 || "").trim().toLowerCase();
            const bytes = Number(asset?.bytes || 0);
            const hashValid = sha256.length === 64 && [...sha256].every(character =>
                (character >= "0" && character <= "9") ||
                (character >= "a" && character <= "f")
            );
            if (
                ["image", "video"].includes(kind) &&
                output.startsWith(".jarvis-artifacts/web-media/") &&
                mimeType.startsWith(`${kind}/`) &&
                Number.isFinite(bytes) &&
                bytes > 0 &&
                hashValid
            ) {
                assets.push(asset);
            }
        }
    }
    return assets;
}

function reelMediaDependencyCall(task = {}, mission = {}) {
    if (task?.name !== "reel.create") return null;
    if (reelArgsHaveExplicitVisualMedia(task?.args || {})) return null;
    if (verifiedCollectedVisualAssets(mission).length > 0) return null;

    const explicitSources = explicitMissionHttpSourceUrls(mission?.originalInstruction || "");
    const researchedSources = verifiedResearchMediaSourceUrls(mission);
    const sourceUrl = explicitSources.length === 1
        ? explicitSources[0]
        : explicitSources.length === 0 && researchedSources.length === 1
            ? researchedSources[0]
            : "";
    if (!sourceUrl) return null;

    return {
        name: "web.media.collect",
        args: {
            url: sourceUrl,
            requireAnyVisual: true,
            maxImages: 8,
            maxVideos: 4
        },
        reason: "REEL_REAL_MEDIA_DEPENDENCY"
    };
}

'''
replace_once(path, helper_marker, helper_block + helper_marker)

old_task = '''        const task = mission.pendingTasks.shift();
        mission.iterations += 1;
        task.attempts += 1;
'''
new_task = '''        const task = mission.pendingTasks.shift();
        const mediaDependency =
            reelMediaDependencyCall(
                task,
                mission
            );
        if (mediaDependency) {
            const dependencyTasks =
                trustedCalls(
                    [mediaDependency],
                    mission
                );
            if (dependencyTasks.length > 0) {
                if (!mission.requiredToolNames.includes("web.media.collect")) {
                    mission.requiredToolNames.push("web.media.collect");
                }
                mission.pendingTasks.unshift(task);
                mission.pendingTasks.unshift(...dependencyTasks);
                mission.plannedTools.push(...dependencyTasks.map(item => item.name));
                mission.updatedAt = now();
                saveMission(persistence, mission);
                continue;
            }
        }
        mission.iterations += 1;
        task.attempts += 1;
'''
replace_once(path, old_task, new_task)
replace_once(
    path,
    'export const __test = { callSignature, compactRoutingInstruction, isFailureStatus, safeObservation, trustedCalls, canonicalMissionEvidence, unwrapObservationPayload };',
    'export const __test = { callSignature, compactRoutingInstruction, isFailureStatus, safeObservation, trustedCalls, canonicalMissionEvidence, unwrapObservationPayload, explicitMissionHttpSourceUrls, verifiedResearchMediaSourceUrls, reelArgsHaveExplicitVisualMedia, verifiedCollectedVisualAssets, reelMediaDependencyCall };'
)


# 2) NEXO runtime: reel.create cannot claim production success without real visual bytes.
path = "gestia-core/nexo/nexo.real-media.tools.js"
replace_once(
    path,
    '    "1.3.0-real-media-reel-hydration-v127";',
    '    "1.4.0-real-reel-production-gate-v134";'
)

slug_marker = 'function slug(value = "nexo-campaign") {'
visual_helper = r'''function reelVisualMediaEvidence(args = {}, context = {}) {
    const scenes = Array.isArray(args?.scenes) ? args.scenes : [];
    const sceneMedia = scenes.filter(scene =>
        scene &&
        typeof scene === "object" &&
        !Array.isArray(scene) &&
        [scene.assetOutput, scene.assetDataUrl, scene.mediaUrl]
            .some(value => String(value || "").trim().length > 0)
    );
    const verifiedAssets = collectorEvidence(context)
        .assets
        .map(verifiedCollectorAsset)
        .filter(Boolean);
    return {
        hasVisualMedia: sceneMedia.length > 0,
        sceneMediaCount: sceneMedia.length,
        verifiedCollectorAssetCount: verifiedAssets.length,
        sceneCount: scenes.length
    };
}

'''
replace_once(path, slug_marker, visual_helper + slug_marker)

old_wrapper = '''                const hydration =
                    hydrateReelArgsWithCollectorMedia(args, context);
                const result =
                    await canonicalReelDefinition.execute(
                        hydration.args,
                        context
                    );
                return {
                    ...result,
                    mediaHydration: {
                        hydrated: hydration.hydrated,
                        verifiedAssetCount: hydration.assetCount,
                        hydratedSceneCount: hydration.sceneCount,
                        source: hydration.hydrated
                            ? "web.media.collect"
                            : null
                    },
                    missionExecution: {
                        args: hydration.args,
                        mediaHydration: {
                            hydrated: hydration.hydrated,
                            verifiedAssetCount: hydration.assetCount,
                            hydratedSceneCount: hydration.sceneCount
                        }
                    },
                    runtimeOverride: NEXO_REAL_MEDIA_TOOLS_VERSION
                };
'''
new_wrapper = '''                const hydration =
                    hydrateReelArgsWithCollectorMedia(args, context);
                const visualEvidence =
                    reelVisualMediaEvidence(
                        hydration.args,
                        context
                    );
                const mediaHydration = {
                    hydrated: hydration.hydrated,
                    verifiedAssetCount: hydration.assetCount,
                    hydratedSceneCount: hydration.sceneCount,
                    source: hydration.hydrated
                        ? "web.media.collect"
                        : null
                };
                if (!visualEvidence.hasVisualMedia) {
                    return {
                        ok: false,
                        executionOk: true,
                        objectiveSatisfied: false,
                        blocked: true,
                        requiresInput: false,
                        retryable: false,
                        status: "REEL_VISUAL_MEDIA_REQUIRED",
                        error: "REEL_VISUAL_MEDIA_REQUIRED",
                        visualEvidence,
                        mediaHydration,
                        missionExecution: {
                            args: hydration.args,
                            mediaHydration
                        },
                        runtimeOverride: NEXO_REAL_MEDIA_TOOLS_VERSION
                    };
                }
                const result =
                    await canonicalReelDefinition.execute(
                        hydration.args,
                        context
                    );
                return {
                    ...result,
                    visualEvidence,
                    mediaHydration,
                    missionExecution: {
                        args: hydration.args,
                        mediaHydration
                    },
                    runtimeOverride: NEXO_REAL_MEDIA_TOOLS_VERSION
                };
'''
replace_once(path, old_wrapper, new_wrapper)
replace_once(
    path,
    '                requireVideos: { type: "boolean" },\n                maxImages: { type: "number" },',
    '                requireVideos: { type: "boolean" },\n                requireAnyVisual: { type: "boolean" },\n                maxImages: { type: "number" },'
)
replace_once(
    path,
    '    hydrateReelArgsWithCollectorMedia,\n    slug\n};',
    '    hydrateReelArgsWithCollectorMedia,\n    reelVisualMediaEvidence,\n    slug\n};'
)


# 3) Local collector: support an either-image-or-video visual requirement.
path = "nexo-web-media-bridge.js"
replace_once(
    path,
    '    "1.2.0-structured-brand-role-v130";',
    '    "1.3.0-real-reel-production-gate-v134";'
)
replace_once(
    path,
    '    requireVideos = false,\n    maxImages = 12,',
    '    requireVideos = false,\n    requireAnyVisual = false,\n    maxImages = 12,'
)
requirements_old = '''    const requirementsMet =
        (!requireImages || imageCount > 0) &&
        (!requireVideos || videoCount > 0);
'''
requirements_new = '''    const requirementsMet =
        (!requireImages || imageCount > 0) &&
        (!requireVideos || videoCount > 0) &&
        (!requireAnyVisual || imageCount + videoCount > 0);
'''
replace_once(path, requirements_old, requirements_new)
replace_once(
    path,
    '        requirements: { requireImages: Boolean(requireImages), requireVideos: Boolean(requireVideos) },',
    '        requirements: { requireImages: Boolean(requireImages), requireVideos: Boolean(requireVideos), requireAnyVisual: Boolean(requireAnyVisual) },'
)


# 4) Regression reproducing the actual human execution: research + duplicate plan + reel without media.
test_path = Path("tests/jarvis-reel-real-production-v134.test.mjs")
test_path.write_text(r'''import assert from "node:assert/strict";
import { test } from "node:test";

import {
    runJarvisMission,
    __test as orchestratorTest
} from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import {
    registerNexoRealMediaTools,
    __test as nexoToolsTest
} from "../gestia-core/nexo/nexo.real-media.tools.js";

const verifiedImage = {
    kind: "image",
    output: ".jarvis-artifacts/web-media/example.test/1/taco.jpg",
    mimeType: "image/jpeg",
    bytes: 245678,
    sha256: "a".repeat(64),
    sourceUrl: "https://cdn.example.test/taco.jpg",
    sourceTag: "og:image",
    alt: "Taco real verificado"
};

function missionShape() {
    return {
        originalInstruction: "Investiga Taquería El Dorado en Cancún y crea un reel profesional.",
        completedTasks: [],
        pendingTasks: [],
        blockedTasks: []
    };
}

function runtimeFixture() {
    const registry = new Map();
    return {
        registry,
        register(definition) {
            registry.set(definition.name, definition);
            return { ok: true, tool: definition.name };
        },
        has(name) {
            return registry.has(name);
        }
    };
}

test("v134 reel.plan is singleton inside the same semantic batch", () => {
    const accepted = orchestratorTest.trustedCalls([
        { name: "reel.plan", args: { title: "Plan A" } },
        { name: "reel.plan", args: { title: "Plan B" } }
    ], missionShape());

    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].name, "reel.plan");
    assert.equal(accepted[0].args.title, "Plan A");
});

test("v134 derives a real-media dependency from one verified research source", () => {
    const mission = missionShape();
    mission.completedTasks.push({
        name: "web.research",
        observation: {
            objectiveSatisfied: true,
            validSources: [{ url: "https://example.test/taqueria", title: "Fuente" }]
        }
    });

    const dependency = orchestratorTest.reelMediaDependencyCall({
        name: "reel.create",
        args: {
            scenes: [
                { durationSeconds: 10, overlay: "Uno" },
                { durationSeconds: 10, overlay: "Dos" },
                { durationSeconds: 10, overlay: "Tres" }
            ]
        }
    }, mission);

    assert.equal(dependency?.name, "web.media.collect");
    assert.equal(dependency?.args?.url, "https://example.test/taqueria");
    assert.equal(dependency?.args?.requireAnyVisual, true);
});

test("v134 never guesses between multiple verified research media sources", () => {
    const mission = missionShape();
    mission.completedTasks.push({
        name: "web.research",
        observation: {
            objectiveSatisfied: true,
            validSources: [
                { url: "https://one.example/source" },
                { url: "https://two.example/source" }
            ]
        }
    });

    assert.equal(orchestratorTest.reelMediaDependencyCall({
        name: "reel.create",
        args: { scenes: [{ overlay: "Escena" }] }
    }, mission), null);
});

test("v134 explicit source URL has priority as the real-media dependency", () => {
    const mission = missionShape();
    mission.originalInstruction =
        "Usa https://www.tiktok.com/@taqueria.eldorado como fuente y crea un reel profesional.";
    mission.completedTasks.push({
        name: "web.research",
        observation: {
            objectiveSatisfied: true,
            validSources: [{ url: "https://other.example/source" }]
        }
    });

    const dependency = orchestratorTest.reelMediaDependencyCall({
        name: "reel.create",
        args: { scenes: [{ overlay: "Escena" }] }
    }, mission);
    assert.equal(
        dependency?.args?.url,
        "https://www.tiktok.com/@taqueria.eldorado"
    );
});

test("v134 NEXO refuses to render a text-only reel as a completed production artifact", async () => {
    const runtime = runtimeFixture();
    let canonicalCalls = 0;
    runtime.register({
        name: "reel.create",
        async execute() {
            canonicalCalls += 1;
            return { ok: true, objectiveSatisfied: true, status: "REEL_VIDEO_CREATED_VERIFIED" };
        }
    });
    registerNexoRealMediaTools(runtime);

    const result = await runtime.registry.get("reel.create").execute({
        brandName: "Taquería El Dorado",
        durationSeconds: 30,
        scenes: [
            { durationSeconds: 10, overlay: "Tacos" },
            { durationSeconds: 10, overlay: "Sabor" },
            { durationSeconds: 10, overlay: "Visítanos" }
        ]
    }, { completedTasks: [] });

    assert.equal(canonicalCalls, 0);
    assert.equal(result.ok, false);
    assert.equal(result.objectiveSatisfied, false);
    assert.equal(result.blocked, true);
    assert.equal(result.status, "REEL_VISUAL_MEDIA_REQUIRED");
    assert.equal(result.visualEvidence.sceneMediaCount, 0);
});

test("v134 NEXO hydrates verified collected media before invoking the canonical renderer", async () => {
    const runtime = runtimeFixture();
    let renderedArgs = null;
    runtime.register({
        name: "reel.create",
        async execute(args) {
            renderedArgs = args;
            return {
                ok: true,
                objectiveSatisfied: true,
                status: "REEL_VIDEO_CREATED_VERIFIED",
                output: ".jarvis-artifacts/reels/real.webm"
            };
        }
    });
    registerNexoRealMediaTools(runtime);

    const result = await runtime.registry.get("reel.create").execute({
        brandName: "Taquería El Dorado",
        durationSeconds: 30,
        scenes: [
            { durationSeconds: 10, overlay: "Tacos" },
            { durationSeconds: 10, overlay: "Sabor" },
            { durationSeconds: 10, overlay: "Visítanos" }
        ]
    }, {
        completedTasks: [{
            name: "web.media.collect",
            observation: { evidence: { mediaAssets: [verifiedImage] } }
        }]
    });

    assert.equal(result.ok, true);
    assert.equal(result.objectiveSatisfied, true);
    assert.equal(result.mediaHydration.hydrated, true);
    assert.equal(result.visualEvidence.sceneMediaCount, 3);
    assert.equal(renderedArgs.scenes[0].assetOutput, verifiedImage.output);
});

test("v134 end-to-end human mission inserts media collection and eliminates duplicate reel.plan", async () => {
    const executed = [];
    const outcome = await runJarvisMission({
        instruction: "Investiga Taquería El Dorado en Cancún y créame un reel profesional de 30 segundos para promocionarla.",
        initialToolCalls: [
            { name: "web.research", args: { query: "Taquería El Dorado Cancún", researchGoal: "RESEARCH_1" } },
            { name: "reel.plan", args: { title: "Plan A" } },
            { name: "reel.plan", args: { title: "Plan B" } },
            {
                name: "reel.create",
                args: {
                    brandName: "Taquería El Dorado",
                    durationSeconds: 30,
                    scenes: [
                        { durationSeconds: 10, overlay: "Uno" },
                        { durationSeconds: 10, overlay: "Dos" },
                        { durationSeconds: 10, overlay: "Tres" }
                    ]
                }
            }
        ],
        requiredToolNames: ["web.research", "reel.plan", "reel.create"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async (call, context) => {
            executed.push(call.name);
            if (call.name === "web.research") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "WEB_RESEARCH_COMPLETED",
                    sources: [{
                        url: "https://example.test/taqueria",
                        title: "Taquería El Dorado"
                    }]
                };
            }
            if (call.name === "reel.plan") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "REEL_PLAN_READY",
                    brandName: "Taquería El Dorado",
                    title: "Reel",
                    cta: "Visítanos",
                    durationSeconds: 30,
                    timelineSeconds: 30,
                    scenes: [
                        { durationSeconds: 10, overlay: "Uno" },
                        { durationSeconds: 10, overlay: "Dos" },
                        { durationSeconds: 10, overlay: "Tres" }
                    ]
                };
            }
            if (call.name === "web.media.collect") {
                assert.equal(call.args.url, "https://example.test/taqueria");
                assert.equal(call.args.requireAnyVisual, true);
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "WEB_REAL_MEDIA_COLLECTED",
                    requirementsMet: true,
                    mediaAssets: [verifiedImage]
                };
            }
            if (call.name === "reel.create") {
                assert.equal(
                    context.completedTasks.some(task => task.name === "web.media.collect"),
                    true
                );
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "REEL_VIDEO_CREATED_VERIFIED",
                    output: ".jarvis-artifacts/reels/taqueria.webm"
                };
            }
            throw new Error(`Unexpected tool ${call.name}`);
        }
    });

    assert.deepEqual(executed, [
        "web.research",
        "reel.plan",
        "web.media.collect",
        "reel.create"
    ]);
    assert.equal(outcome.status, "COMPLETED");
    assert.equal(outcome.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
    assert.equal(outcome.requiredToolNames.includes("web.media.collect"), true);
    assert.equal(outcome.completedTasks.filter(task => task.name === "reel.plan").length, 1);
});

test("v134 visual evidence helper treats verified collector hydration as production media", () => {
    const hydrated = nexoToolsTest.hydrateReelArgsWithCollectorMedia({
        scenes: [{ overlay: "Uno" }, { overlay: "Dos" }, { overlay: "Tres" }]
    }, {
        completedTasks: [{
            name: "web.media.collect",
            observation: { evidence: { mediaAssets: [verifiedImage] } }
        }]
    });
    const evidence = nexoToolsTest.reelVisualMediaEvidence(hydrated.args, {});
    assert.equal(evidence.hasVisualMedia, true);
    assert.equal(evidence.sceneMediaCount, 3);
});
''', encoding="utf-8")

print("v134 patch staged")
