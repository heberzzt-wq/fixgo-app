import fs from "node:fs/promises";

const paths = {
    bridge: "jarvis-fs-bridge.js",
    orchestrator: "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    reelTest: "tests/jarvis-reel-native-mp4-v138.test.mjs",
    semanticPlannerTest: "tests/jarvis-semantic-planner.test.cjs"
};

async function read(file) {
    return (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
}

async function write(file, source) {
    await fs.writeFile(file, source, "utf8");
}

function replaceOnce(source, before, after, label) {
    if (source.includes(after)) return source;
    const count = source.split(before).length - 1;
    if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
    return source.replace(before, after);
}

function appendOnce(source, marker, addition) {
    if (source.includes(marker)) return source;
    return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

let bridge = await read(paths.bridge);

bridge = replaceOnce(
    bridge,
`    const recoverableVoiceFailure =
        Boolean(requestedVoice) &&
        (
            /SelectVoice/i.test(message) ||
            /SPEECH_LANGUAGE_VOICE_NOT_FOUND/i.test(message) ||
            /voz coincidente/i.test(message) ||
            /matching voice/i.test(message)
        );

    if (!recoverableVoiceFailure) return [];`,
`    const recoverableVoiceFailure =
        (
            Boolean(requestedVoice) &&
            (
                /SelectVoice/i.test(message) ||
                /SPEECH_LANGUAGE_VOICE_NOT_FOUND/i.test(message) ||
                /voz coincidente/i.test(message) ||
                /matching voice/i.test(message)
            )
        ) ||
        (
            Boolean(requestedLanguage) &&
            /SPEECH_LANGUAGE_VOICE_NOT_FOUND/i.test(message)
        );

    if (!recoverableVoiceFailure) return [];`,
    "SPEECH_LANGUAGE_ONLY_RECOVERY"
);

bridge = replaceOnce(
    bridge,
`    const seedUrl = String(sourceUrl || "").trim();
    const expectedHandle = jarvisTikTokHandleFromUrl(seedUrl);
    if (!expectedHandle || typeof fetchImpl !== "function") return [];

    const boundedTimeout = Math.min(`,
`    const seedUrl = String(sourceUrl || "").trim();
    const canonicalSeedUrl = (() => {
        try {
            const parsed = new URL(seedUrl);
            const segments = parsed.pathname
                .split("/")
                .map(item => item.trim())
                .filter(Boolean);
            const handle = segments.find(item => item.startsWith("@")) || "";
            const videoIndex = segments.findIndex(item => item.toLowerCase() === "video");
            const videoId =
                videoIndex >= 0 && videoIndex + 1 < segments.length
                    ? segments[videoIndex + 1]
                    : "";
            const videoIdValid =
                Boolean(videoId) &&
                [...videoId].every(character =>
                    character >= "0" && character <= "9"
                );
            if (!handle || !videoIdValid) return seedUrl;
            return "https://www.tiktok.com/" + handle + "/video/" + videoId;
        }
        catch {
            return seedUrl;
        }
    })();
    const expectedHandle = jarvisTikTokHandleFromUrl(canonicalSeedUrl);
    if (!expectedHandle || typeof fetchImpl !== "function") return [];

    const boundedTimeout = Math.min(`,
    "TIKTOK_OEMBED_CANONICAL_SEED"
);

bridge = replaceOnce(
    bridge,
`    const oembedUrl =
        "https://www.tiktok.com/oembed?url=" +
        encodeURIComponent(seedUrl);`,
`    const oembedUrl =
        "https://www.tiktok.com/oembed?url=" +
        encodeURIComponent(canonicalSeedUrl);`,
    "TIKTOK_OEMBED_CANONICAL_REQUEST"
);

await write(paths.bridge, bridge);

let orchestrator = await read(paths.orchestrator);

orchestrator = replaceOnce(
    orchestrator,
`    const name = text(toolName, 120);
    if (name !== "speech.synthesize") return;`,
`    const name = text(toolName, 120);
    if (!["speech.synthesize", "reel.plan"].includes(name)) return;`,
    "RECOVERED_REEL_PLAN_ARCHIVE"
);

orchestrator = replaceOnce(
    orchestrator,
`function archiveRecoveredMediaSourceAttempts(mission = {}, now = () => new Date().toISOString()) {
    const blocked = Array.isArray(mission?.blockedTasks) ? mission.blockedTasks : [];
    const recovered = blocked.filter(item => item?.name === "web.media.collect");
    if (recovered.length === 0) return;
    mission.recoveredMediaSourceAttempts = [
        ...(Array.isArray(mission.recoveredMediaSourceAttempts)
            ? mission.recoveredMediaSourceAttempts
            : []),
        ...recovered.map(item => ({
            name: item.name,
            args: item.args,
            reason: item.reason,
            observation: item.observation,
            recoveredAt: now()
        }))
    ].slice(-12);
    mission.blockedTasks = blocked.filter(item => item?.name !== "web.media.collect");
    mission.errors = (Array.isArray(mission?.errors) ? mission.errors : [])
        .filter(item => item?.tool !== "web.media.collect");
    mission.reelMediaRecovery = {
        ...(mission.reelMediaRecovery || {}),
        active: false,
        recovered: true,
        recoveredAt: now()
    };
}`,
`function archiveRecoveredMediaSourceAttempts(mission = {}, now = () => new Date().toISOString()) {
    const blocked = Array.isArray(mission?.blockedTasks) ? mission.blockedTasks : [];
    const recovered = blocked.filter(item => item?.name === "web.media.collect");
    if (recovered.length === 0) return;

    const recoverableReelPlan = [...blocked].reverse().find(item =>
        item?.name === "reel.plan" &&
        [
            "REEL_VERIFIED_SCENE_MEDIA_REQUIRED",
            "REEL_MEDIA_COLLECTION_REQUIRED_BEFORE_PLAN"
        ].includes(String(item?.observation?.status || ""))
    ) || null;

    mission.recoveredMediaSourceAttempts = [
        ...(Array.isArray(mission.recoveredMediaSourceAttempts)
            ? mission.recoveredMediaSourceAttempts
            : []),
        ...recovered.map(item => ({
            name: item.name,
            args: item.args,
            reason: item.reason,
            observation: item.observation,
            recoveredAt: now()
        }))
    ].slice(-12);
    mission.blockedTasks = blocked.filter(item => item?.name !== "web.media.collect");
    mission.errors = (Array.isArray(mission?.errors) ? mission.errors : [])
        .filter(item => item?.tool !== "web.media.collect");

    let reelPlanRequeued = false;
    if (recoverableReelPlan) {
        archiveRecoveredToolAttempts(mission, "reel.plan", now);
        const reelPlanReady = (Array.isArray(mission?.completedTasks) ? mission.completedTasks : [])
            .some(item =>
                item?.name === "reel.plan" &&
                item?.observation?.objectiveSatisfied === true &&
                item?.observation?.status === "REEL_PLAN_READY"
            );
        const reelPlanPending = (Array.isArray(mission?.pendingTasks) ? mission.pendingTasks : [])
            .some(item => item?.name === "reel.plan");
        if (!reelPlanReady && !reelPlanPending) {
            const args =
                recoverableReelPlan?.args &&
                typeof recoverableReelPlan.args === "object" &&
                !Array.isArray(recoverableReelPlan.args)
                    ? { ...recoverableReelPlan.args }
                    : {};
            mission.pendingTasks = Array.isArray(mission?.pendingTasks)
                ? mission.pendingTasks
                : [];
            mission.pendingTasks.unshift({
                name: "reel.plan",
                args,
                approved: false,
                signature: callSignature({ name: "reel.plan", args }),
                attempts: 0,
                status: "PENDING",
                reason: "REEL_PLAN_RETRY_AFTER_MEDIA_RECOVERY"
            });
            reelPlanRequeued = true;
        }
    }

    mission.reelMediaRecovery = {
        ...(mission.reelMediaRecovery || {}),
        active: false,
        recovered: true,
        reelPlanRequeued,
        recoveredAt: now()
    };
}`,
    "REQUEUE_REEL_PLAN_AFTER_MEDIA_RECOVERY"
);

orchestrator = replaceOnce(
    orchestrator,
`function verifiedSpeechArtifactForReel(mission = {}) {
    const completed = Array.isArray(mission?.completedTasks)
        ? mission.completedTasks
        : [];
    const speech = [...completed].reverse().find(item =>
        item?.name === "speech.synthesize" &&
        item?.observation?.objectiveSatisfied === true &&
        item?.observation?.status === "SPEECH_AUDIO_CREATED_VERIFIED"
    );
    const output = text(
        speech?.observation?.artifact ||
        speech?.observation?.evidence?.output ||
        "",
        500
    ).replaceAll("\\\\", "/");
    if (
        !output.startsWith(".jarvis-artifacts/audio/") ||
        output.includes("../") ||
        !output.toLowerCase().endsWith(".wav")
    ) {
        return "";
    }
    return output;
}

export async function runJarvisMission({`,
`function verifiedSpeechArtifactForReel(mission = {}) {
    const completed = Array.isArray(mission?.completedTasks)
        ? mission.completedTasks
        : [];
    const speech = [...completed].reverse().find(item =>
        item?.name === "speech.synthesize" &&
        item?.observation?.objectiveSatisfied === true &&
        item?.observation?.status === "SPEECH_AUDIO_CREATED_VERIFIED"
    );
    const output = text(
        speech?.observation?.artifact ||
        speech?.observation?.evidence?.output ||
        "",
        500
    ).replaceAll("\\\\", "/");
    if (
        !output.startsWith(".jarvis-artifacts/audio/") ||
        output.includes("../") ||
        !output.toLowerCase().endsWith(".wav")
    ) {
        return "";
    }
    return output;
}

function reelCreateArgsFromVerifiedPlan(args = {}, mission = {}) {
    const current =
        args && typeof args === "object" && !Array.isArray(args)
            ? { ...args }
            : {};
    const completed = Array.isArray(mission?.completedTasks)
        ? mission.completedTasks
        : [];
    const task = [...completed].reverse().find(item =>
        item?.name === "reel.plan" &&
        item?.observation?.objectiveSatisfied === true &&
        item?.observation?.status === "REEL_PLAN_READY" &&
        item?.observation?.preparedArtifact?.kind === "reel"
    );
    const prepared = task?.observation?.preparedArtifact || null;
    const scenes = Array.isArray(prepared?.scenes)
        ? prepared.scenes.map(scene =>
            scene && typeof scene === "object" && !Array.isArray(scene)
                ? { ...scene }
                : scene
        )
        : [];
    if (!prepared || scenes.length < 1) {
        return {
            args: current,
            hydrated: false,
            source: null
        };
    }

    const next = {
        ...current,
        scenes
    };
    for (const field of ["brandName", "title", "cta"]) {
        const value = text(prepared?.[field], 500);
        if (value) next[field] = value;
    }
    const durationSeconds = Number(prepared?.durationSeconds || 0);
    if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
        next.durationSeconds = durationSeconds;
    }

    return {
        args: next,
        hydrated: true,
        source: "reel.plan",
        sceneCount: scenes.length
    };
}

export async function runJarvisMission({`,
    "VERIFIED_REEL_PLAN_CREATE_HANDOFF_HELPER"
);

orchestrator = replaceOnce(
    orchestrator,
`        mission.iterations += 1;
        task.attempts += 1;
        if (task.name === "reel.create") {
            const verifiedSpeechOutput = verifiedSpeechArtifactForReel(mission);
            if (verifiedSpeechOutput) {
                task.args = {
                    ...(task.args || {}),
                    audioOutput: verifiedSpeechOutput
                };
                task.signature = callSignature({ name: task.name, args: task.args });
            }
        }
        let result;`,
`        mission.iterations += 1;
        task.attempts += 1;
        if (task.name === "reel.create") {
            const reelPlanHandoff =
                reelCreateArgsFromVerifiedPlan(
                    task.args,
                    mission
                );
            task.args = reelPlanHandoff.args;
            const verifiedSpeechOutput = verifiedSpeechArtifactForReel(mission);
            if (verifiedSpeechOutput) {
                task.args = {
                    ...(task.args || {}),
                    audioOutput: verifiedSpeechOutput
                };
            }
            task.signature = callSignature({ name: task.name, args: task.args });
        }
        let result;`,
    "VERIFIED_REEL_PLAN_CREATE_HANDOFF_CALL"
);

orchestrator = replaceOnce(
    orchestrator,
`    archiveRecoveredMediaSourceAttempts,
    archiveRecoveredToolAttempts,
    verifiedSpeechArtifactForReel
};`,
`    archiveRecoveredMediaSourceAttempts,
    archiveRecoveredToolAttempts,
    verifiedSpeechArtifactForReel,
    reelCreateArgsFromVerifiedPlan
};`,
    "VERIFIED_REEL_PLAN_TEST_EXPORT"
);

await write(paths.orchestrator, orchestrator);

let reelTest = await read(paths.reelTest);

reelTest = replaceOnce(
    reelTest,
`import { buildReelStudioHtml, describeReelStudio } from "../jarvis-reel-artifact.js";
import {`,
`import { buildReelStudioHtml, describeReelStudio } from "../jarvis-reel-artifact.js";
import { __test as missionOrchestratorTest } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import {`,
    "REEL_TEST_ORCHESTRATOR_IMPORT"
);

reelTest = replaceOnce(
    reelTest,
`  const seedUrl = "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004";`,
`  const seedUrl = "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004?q=taqueria%20el%20dorado&t=1786405369711";`,
    "TIKTOK_TEST_QUERY_SEED"
);

reelTest = replaceOnce(
    reelTest,
`  assert.equal(discovered[0].sourcePageUrl, seedUrl);
  assert.equal(calls.length, 2);

  const rejected = await tiktokOembedVisualSeed(`,
`  assert.equal(discovered[0].sourcePageUrl, seedUrl);
  assert.equal(calls.length, 2);
  assert.equal(
    decodeURIComponent(calls[0].split("?url=")[1]),
    "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004"
  );

  const rejected = await tiktokOembedVisualSeed(`,
    "TIKTOK_TEST_CANONICAL_OEMBED_ASSERTION"
);

reelTest = appendOnce(
    reelTest,
    "V142 recovers a language-only speech request when the requested culture is unavailable",
`test("V142 recovers a language-only speech request when the requested culture is unavailable", () => {
  const attempts = speechSynthesisRecoveryInputs(
    {
      text: "Narracion",
      language: "es-MX"
    },
    new Error("SPEECH_LANGUAGE_VOICE_NOT_FOUND")
  );
  assert.deepEqual(
    attempts.map(item => ({
      voice: item.voice,
      language: item.language
    })),
    [
      { voice: "", language: "es-MX" },
      { voice: "", language: "" }
    ]
  );
});`
);

reelTest = appendOnce(
    reelTest,
    "V142 requeues the same reel plan after verified media recovery",
`test("V142 requeues the same reel plan after verified media recovery", () => {
  const blockedPlanArgs = {
    brandName: "Taqueria El Dorado",
    title: "Taco Macho",
    cta: "Visitanos",
    durationSeconds: 30,
    scenes: [
      { durationSeconds: 10, visual: "Taco", overlay: "Uno", voiceover: "Uno", evidence: "post" },
      { durationSeconds: 10, visual: "Queso", overlay: "Dos", voiceover: "Dos", evidence: "post" },
      { durationSeconds: 10, visual: "CTA", overlay: "Tres", voiceover: "Tres", evidence: "post" }
    ]
  };
  const mission = {
    blockedTasks: [
      {
        name: "web.media.collect",
        args: {
          url: "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004",
          requireVideos: true
        },
        reason: "WEB_REAL_MEDIA_REQUIREMENTS_UNMET",
        observation: {
          status: "WEB_REAL_MEDIA_REQUIREMENTS_UNMET",
          objectiveSatisfied: false
        }
      },
      {
        name: "reel.plan",
        args: blockedPlanArgs,
        reason: "REEL_VERIFIED_SCENE_MEDIA_REQUIRED",
        observation: {
          status: "REEL_VERIFIED_SCENE_MEDIA_REQUIRED",
          objectiveSatisfied: false
        }
      }
    ],
    completedTasks: [],
    pendingTasks: [
      {
        name: "reel.create",
        args: { videoOutput: ".jarvis-artifacts/reels/taco.mp4" }
      }
    ],
    errors: [
      { tool: "web.media.collect", status: "WEB_REAL_MEDIA_REQUIREMENTS_UNMET" },
      { tool: "reel.plan", status: "REEL_VERIFIED_SCENE_MEDIA_REQUIRED" }
    ]
  };

  missionOrchestratorTest.archiveRecoveredMediaSourceAttempts(
    mission,
    () => "2026-08-23T01:00:00.000Z"
  );

  assert.equal(mission.blockedTasks.some(item => item.name === "web.media.collect"), false);
  assert.equal(mission.blockedTasks.some(item => item.name === "reel.plan"), false);
  assert.equal(mission.pendingTasks[0].name, "reel.plan");
  assert.deepEqual(mission.pendingTasks[0].args, blockedPlanArgs);
  assert.equal(mission.reelMediaRecovery.reelPlanRequeued, true);
  assert.equal(
    mission.recoveredToolAttempts.some(item => item.name === "reel.plan"),
    true
  );
});`
);

reelTest = appendOnce(
    reelTest,
    "V142 hands verified semantically bound reel-plan scenes to reel.create",
`test("V142 hands verified semantically bound reel-plan scenes to reel.create", () => {
  const verifiedScene = {
    durationSeconds: 30,
    visual: "Taco Macho",
    overlay: "Pruebalo",
    voiceover: "Prueba El Taco Macho",
    evidence: "TikTok exacto",
    assetOutput: ".jarvis-artifacts/web-media/www-tiktok-com/post/taco.jpg",
    mediaType: "image",
    sourceMedia: {
      origin: "web.media.collect",
      sha256: "a".repeat(64)
    }
  };
  const handoff = missionOrchestratorTest.reelCreateArgsFromVerifiedPlan(
    {
      videoOutput: ".jarvis-artifacts/reels/taco.mp4",
      scenes: [{ overlay: "stale" }]
    },
    {
      completedTasks: [
        {
          name: "reel.plan",
          observation: {
            objectiveSatisfied: true,
            status: "REEL_PLAN_READY",
            preparedArtifact: {
              kind: "reel",
              brandName: "Taqueria El Dorado",
              title: "El Taco Macho",
              cta: "Visitanos",
              durationSeconds: 30,
              scenes: [verifiedScene]
            }
          }
        }
      ]
    }
  );

  assert.equal(handoff.hydrated, true);
  assert.equal(handoff.source, "reel.plan");
  assert.equal(handoff.args.videoOutput, ".jarvis-artifacts/reels/taco.mp4");
  assert.equal(handoff.args.title, "El Taco Macho");
  assert.equal(handoff.args.scenes.length, 1);
  assert.equal(handoff.args.scenes[0].assetOutput, verifiedScene.assetOutput);
  assert.equal(handoff.args.scenes[0].sourceMedia.sha256, "a".repeat(64));
});`
);

await write(paths.reelTest, reelTest);

let semanticPlannerTest = await read(paths.semanticPlannerTest);
semanticPlannerTest = semanticPlannerTest.replace(
    /\n{3,}(const catalog = \[)/,
    "\n\n$1"
);
await write(paths.semanticPlannerTest, semanticPlannerTest);

for (const marker of [
    "SPEECH_LANGUAGE_VOICE_NOT_FOUND",
    "canonicalSeedUrl",
    "REEL_PLAN_RETRY_AFTER_MEDIA_RECOVERY"
]) {
    const currentBridge = await read(paths.bridge);
    const currentOrchestrator = await read(paths.orchestrator);
    if (
        !currentBridge.includes(marker) &&
        !currentOrchestrator.includes(marker)
    ) {
        throw new Error(`V142_CLOSEOUT_MARKER_REQUIRED:${marker}`);
    }
}

console.log("V142_REEL_CLOSEOUT_APPLIED=true");
