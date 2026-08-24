import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import { buildReelStudioHtml, describeReelStudio } from "../jarvis-reel-artifact.js";
import { runJarvisMission, __test as missionOrchestratorTest } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import {
    assertReelVideoContainer,
    createJarvisFsBridgeApp,
    exportReelVideoWithChrome,
    speechSynthesisRecoveryInputs,
    tiktokOembedVisualSeed,
    reelVideoExtensionFromMime,
    reelVideoFormatFromMime,
    reelVideoOutputTarget
} from "../jarvis-fs-bridge.js";

function input(audioDataUrl = "") {
    return {
        brandName: "TaquerÃ­a El Dorado",
        title: "Sabor que sÃ­ se ve",
        cta: "VisÃ­tanos",
        durationSeconds: 30,
        audioDataUrl,
        scenes: [
            { durationSeconds: 10, overlay: "Tacos al momento", subtitle: "CancÃºn", mediaType: "video", assetDataUrl: "data:video/mp4;base64,AAAA" },
            { durationSeconds: 10, overlay: "Sabor dorado", subtitle: "Hecho para antojar", assetDataUrl: "data:image/jpeg;base64,/9j/" },
            { durationSeconds: 10, overlay: "Ven por los tuyos", subtitle: "TaquerÃ­a El Dorado", assetDataUrl: "data:image/jpeg;base64,/9j/" }
        ]
    };
}

function mp4Buffer() {
    const buffer = Buffer.alloc(24);
    buffer.writeUInt32BE(24, 0);
    buffer.write("ftyp", 4, "ascii");
    buffer.write("isom", 8, "ascii");
    buffer.write("avc1", 16, "ascii");
    return buffer;
}

function webmBuffer() {
    return Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
}

test("v138 Reel Studio prefers native H264 AAC MP4 before WebM fallback", () => {
    const html = buildReelStudioHtml(input("data:audio/wav;base64,UklGRg=="));
    const mp4 = html.indexOf("video/mp4;codecs=avc1.42E01E,mp4a.40.2");
    const webm = html.indexOf("video/webm;codecs=vp9");
    assert.ok(mp4 >= 0);
    assert.ok(webm > mp4);
    assert.match(html, /audioRouting\.audioTracksAdded>0/);
    assert.match(html, /recorder\.mimeType\|\|mime/);
    assert.match(html, /extension=actualMime\.startsWith\('video\/mp4'\)\?'mp4':'webm'/);
    assert.match(html, /formatFallback:extension!=='mp4'/);
    const report = describeReelStudio(input("data:audio/wav;base64,UklGRg=="), html);
    assert.equal(report.checks.nativeMp4Preferred, true);
    assert.equal(report.checks.webmFallback, true);
    assert.equal(report.checks.actualRecorderMime, true);
    assert.ok(Object.values(report.checks).every(Boolean));
});

test("v138 silent reel still prefers H264 MP4 and preserves WebM fallback", () => {
    const html = buildReelStudioHtml(input());
    assert.match(html, /mp4Types=audioRouting\.audioTracksAdded>0\?/);
    assert.match(html, /\['video\/mp4;codecs=avc1\.42E01E','video\/mp4'\]/);
    assert.match(html, /fallbackTypes=\['video\/webm;codecs=vp9','video\/webm;codecs=vp8','video\/webm'\]/);
});

test("v138 bridge derives extension only from actual recorder MIME", () => {
    assert.equal(reelVideoFormatFromMime("video/mp4;codecs=avc1.420034,mp4a.40.2"), "mp4");
    assert.equal(reelVideoExtensionFromMime("video/mp4;codecs=avc1.420034"), ".mp4");
    assert.equal(reelVideoFormatFromMime("video/webm;codecs=vp9"), "webm");
    assert.equal(reelVideoExtensionFromMime("video/webm"), ".webm");
    assert.throws(() => reelVideoFormatFromMime("video/quicktime"), /REEL_VIDEO_MIME_UNSUPPORTED/);
});

test("v138 bridge validates physical MP4 and WebM container signatures", () => {
    assert.deepEqual(assertReelVideoContainer(mp4Buffer(), "video/mp4;codecs=avc1.420034"), {
        ok: true,
        format: "mp4",
        extension: ".mp4"
    });
    assert.deepEqual(assertReelVideoContainer(webmBuffer(), "video/webm;codecs=vp9"), {
        ok: true,
        format: "webm",
        extension: ".webm"
    });
    assert.throws(() => assertReelVideoContainer(webmBuffer(), "video/mp4"), /REEL_MP4_SIGNATURE_INVALID/);
    assert.throws(() => assertReelVideoContainer(mp4Buffer(), "video/webm"), /REEL_WEBM_SIGNATURE_INVALID/);
});

test("v138 never writes MP4 bytes under a WebM extension or vice versa", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v138-output-"));
    try {
        const mp4 = reelVideoOutputTarget(
            ".jarvis-artifacts/reels/social.webm",
            "video/mp4;codecs=avc1.420034,mp4a.40.2",
            root
        );
        assert.equal(mp4.relativeOutput, ".jarvis-artifacts/reels/social.mp4");
        assert.equal(path.extname(mp4.target), ".mp4");
        assert.equal(mp4.format, "mp4");

        const webm = reelVideoOutputTarget(
            ".jarvis-artifacts/reels/social.mp4",
            "video/webm;codecs=vp9",
            root
        );
        assert.equal(webm.relativeOutput, ".jarvis-artifacts/reels/social.webm");
        assert.equal(path.extname(webm.target), ".webm");
        assert.equal(webm.format, "webm");
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("v138 actuator advertises MP4 preference without removing verified WebM fallback", () => {
    const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
    const runtime = fs.readFileSync(new URL("../gestia-core/tools.runtime.js", import.meta.url), "utf8");
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.match(actuator, /MP4 H\.264\/AAC cuando Chrome lo soporta/);
    assert.match(actuator, /WebM como fallback verificado/);
    assert.match(runtime, /v139-transient-resilience-20260813/);
    assert.match(bridge, /exportReelVideoWithChrome/);
    assert.match(bridge, /REEL_VIDEO_SHA256_MISMATCH/);
    assert.doesNotMatch(bridge, /REEL_WEBM_BYTE_COUNT_INVALID/);
});

test("V142 waits for the real browser export completion state", () => {
  const source = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  assert.match(source, /2\.47\.0-dual-human-recovery-v142/);
  assert.doesNotMatch(source, /await sleepMs\(duration \* 1000 \+ 2600\)/);
  assert.match(source, /__JARVIS_REEL_EXPORT_ERROR__/);
  assert.match(source, /REEL_EXPORT_COMPLETION_TIMEOUT/);
  assert.match(source, /setTimeout\(finish, 100\)/);
  assert.match(source, /Math\.max\(45000, duration \* 1000 \+ 30000\)/);
});

test("V142 canonicalizes planner speech output at the physical bridge boundary", () => {
  const source = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  assert.match(source, /const requestedSpeechOutput = String\(req\.body\?\.output \|\| ""\)/);
  assert.match(source, /requestedSpeechOutput\.startsWith\("\.jarvis-artifacts\/audio\/"\)/);
  assert.match(source, /requestedSpeechOutput\.toLowerCase\(\)\.endsWith\("\.wav"\)/);
  assert.match(source, /output: speechOutput/);
});

test("V142 accepts detached bridge identity only at the contract remote-tracking head", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v142-detached-identity-"));
  const branch = "v94-media-v4n-negative-claims";
  const releaseId = "v94-source-grounded-research-v124-20260810";
  const runGit = args => execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();

  let server;
  try {
    runGit(["init", "-b", branch]);
    runGit(["config", "user.email", "v142@example.test"]);
    runGit(["config", "user.name", "V142 Test"]);
    fs.writeFileSync(
      path.join(root, "jarvis-runtime-contract.json"),
      JSON.stringify({ projectId: "fixgo-test", branch, releaseId }),
      "utf8"
    );
    const marker = path.join(root, "identity-marker.txt");
    fs.writeFileSync(marker, "certified detached worktree\n", "utf8");
    runGit(["add", "."]);
    runGit(["commit", "-m", "certified head"]);
    const certifiedHead = runGit(["rev-parse", "HEAD"]);
    runGit(["update-ref", `refs/remotes/origin/${branch}`, certifiedHead]);
    runGit(["checkout", "--detach", certifiedHead]);

    server = createJarvisFsBridgeApp({ root }).listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;

    const health = await fetch(`${base}/health`).then(response => response.json());
    assert.equal(health.identity.ok, true);
    assert.equal(health.identity.identityMode, "detached_contract_head");
    assert.equal(health.identity.contractHead, certifiedHead);

    const accepted = await fetch(`${base}/grep`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jarvis-release-id": releaseId
      },
      body: JSON.stringify({ term: "certified", cwd: "." })
    });
    assert.notEqual(accepted.status, 503);

    fs.writeFileSync(marker, "diverged detached worktree\n", "utf8");
    runGit(["add", "identity-marker.txt"]);
    runGit(["commit", "-m", "diverged head"]);

    const rejected = await fetch(`${base}/grep`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jarvis-release-id": releaseId
      },
      body: JSON.stringify({ term: "diverged", cwd: "." })
    });
    const rejectedBody = await rejected.json();
    assert.equal(rejected.status, 503);
    assert.equal(rejectedBody.status, "BRIDGE_IDENTITY_INVALID");
  }
  finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("V142 reuses installed speech capability when semantic voice is unavailable", () => {
  const attempts = speechSynthesisRecoveryInputs(
    {
      text: "Narracion",
      voice: "Voz que no existe",
      language: "es-ES"
    },
    new Error("SelectVoice: No se puede establecer voz. No hay una voz coincidente instalada.")
  );
  assert.deepEqual(
    attempts.map(item => ({
      voice: item.voice,
      language: item.language
    })),
    [
      { voice: "", language: "es-ES" },
      { voice: "", language: "es-MX" },
      { voice: "", language: "" }
    ]
  );
  assert.equal(
    speechSynthesisRecoveryInputs(
      { text: "Narracion", voice: "Voz que no existe", language: "es-MX" },
      new Error("SPEECH_OUTPUT_PATH_INVALID")
    ).length,
    0
  );
});

test("V142 reuses verified TikTok oEmbed thumbnail as input to the existing media collector", async () => {
  const seedUrl = "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004?q=taqueria%20el%20dorado&t=1786405369711";
  const jpeg = Buffer.alloc(22000);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[2] = 0xff;
  const calls = [];
  const fakeFetch = async url => {
    calls.push(String(url));
    if (String(url).startsWith("https://www.tiktok.com/oembed?")) {
      return {
        ok: true,
        status: 200,
        url: String(url),
        async json() {
          return {
            title: "El Taco Macho",
            author_name: "Taqueria ElDorado",
            author_url: "https://www.tiktok.com/@taqueria.eldorado",
            thumbnail_url: "https://1.1.1.1/taco-macho.jpg"
          };
        }
      };
    }
    return {
      ok: true,
      status: 200,
      url: String(url),
      headers: {
        get(name) {
          return String(name).toLowerCase() === "content-type"
            ? "image/jpeg"
            : null;
        }
      },
      async arrayBuffer() {
        return jpeg.buffer.slice(
          jpeg.byteOffset,
          jpeg.byteOffset + jpeg.byteLength
        );
      }
    };
  };

  const discovered = await tiktokOembedVisualSeed(
    seedUrl,
    {
      timeoutMs: 5000,
      fetchImpl: fakeFetch
    }
  );
  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].kind, "image");
  assert.equal(discovered[0].resourceType, "Image");
  assert.equal(discovered[0].bodyCaptured, true);
  assert.equal(discovered[0].bodyBytes, jpeg.length);
  assert.equal(
    Buffer.from(discovered[0].bodyBase64, "base64").length,
    jpeg.length
  );
  assert.equal(discovered[0].sourcePageUrl, seedUrl);
  assert.equal(calls.length, 2);
  assert.equal(
    decodeURIComponent(calls[0].split("?url=")[1]),
    "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004"
  );

  const rejected = await tiktokOembedVisualSeed(
    seedUrl,
    {
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return {
            author_url: "https://www.tiktok.com/@otra.cuenta",
            thumbnail_url: "https://1.1.1.1/otra.jpg"
          };
        }
      })
    }
  );
  assert.equal(rejected.length, 0);
});

test("V142 recovers a language-only speech request when the requested culture is unavailable", () => {
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
});

test("V142 requeues the same reel plan after verified media recovery", () => {
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
});

test("V142 hands verified semantically bound reel-plan scenes to reel.create", () => {
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
});

test("V142 reel Studio does not lexically block user content", () => {
  for (const phrase of [
    "Mostrar todo el taco y el queso derretido",
    "TODO reemplazar esta toma",
    "Lorem ipsum puede ser texto intencional del usuario",
    "ToDo, TODO, todo: cualquier texto es contenido, no un gate fisico"
  ]) {
    const candidate = input();
    candidate.scenes[0].visualDescription = phrase;
    candidate.scenes[0].subtitle = phrase;
    const html = buildReelStudioHtml(candidate);
    const verification = describeReelStudio(candidate, html);
    assert.equal(Object.hasOwn(verification.checks, "noPlaceholders"), false);
    assert.equal(Object.values(verification.checks).every(Boolean), true);
  }
});

test("V142 reel bridge reports the exact failed Studio post-verification checks", () => {
  const source = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  assert.equal(source.includes("const failedChecks = Object.entries(verification.checks)"), true);
  assert.equal(source.includes("REEL_STUDIO_POST_VERIFY_FAILED:"), true);
  assert.equal(source.includes('failedChecks.join(",")'), true);
});

test("V142 structured production continuation reaches the semantic planner and deferred first step", () => {
  const plannerSource = fs.readFileSync(
    new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url),
    "utf8"
  );
  const coreSource = fs.readFileSync(
    new URL("../gestia-core/gestia-core.js", import.meta.url),
    "utf8"
  );
  assert.equal(plannerSource.includes("generalistCurrentTurnPolicy: GENERALIST_CURRENT_TURN_POLICY"), true);
  assert.equal(plannerSource.includes("contexto semantico asesor de esta conversacion confirme de forma inequivoca una produccion activa"), true);
  assert.equal(plannerSource.includes("por si solos y sin esa continuidad semantica, no autorizan ejecutar nada"), true);
  assert.equal(coreSource.includes("const shouldCompletePlanningArguments ="), true);
  assert.equal(coreSource.includes("call?.deferred === true"), true);
  assert.equal(coreSource.includes("SEMANTIC_PLANNER_NO_EXECUTABLE_PLAN"), true);
});

test("V142 bridge release identifies the dual human-red recovery bytes", () => {
  const source = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  assert.equal(source.includes("2.47.0-dual-human-recovery-v142"), true);
});

test("V142 current turn preserves semantic planner outage truth", () => {
  const coreSource = fs.readFileSync(
    new URL("../gestia-core/gestia-core.js", import.meta.url),
    "utf8"
  );
  assert.equal(coreSource.includes("[CURRENT_TURN_SEMANTIC_PLANNER_TRANSIENT_RETRY]"), true);
  assert.equal(coreSource.includes("throwOnUnavailable: true"), true);
  assert.equal(coreSource.includes("[CURRENT_TURN_SEMANTIC_PLANNER_UNAVAILABLE]"), true);
  assert.equal(coreSource.includes('reason: "SEMANTIC_PLANNER_UNAVAILABLE"'), true);
  assert.equal(coreSource.includes("no se degradara este fallo a un falso plan vacio"), true);
});

test("V142 mission contract retries the same semantic authority and rejects amputated production fallback", () => {
  const coreSource = fs.readFileSync(
    new URL("../gestia-core/gestia-core.js", import.meta.url),
    "utf8"
  );
  assert.equal(coreSource.includes("missionContractAttempt <= 3"), true);
  assert.equal(coreSource.includes("[MISSION_CONTRACT_SEMANTIC_PLANNER_TRANSIENT_RETRY]"), true);
  assert.equal(coreSource.includes("const incompleteProductionFallback = recoveredInitialToolCalls.some"), true);
  assert.equal(coreSource.includes('call?.name === "marketing.plan"'), true);
  assert.equal(coreSource.includes("call?.args?.productionRequested === true"), true);
  assert.equal(coreSource.includes("call.args.productionArtifacts.length === 0"), true);
  assert.equal(coreSource.includes("throw lastMissionContractError"), true);
});

test("V142 keeps one semantic brain when the current-turn plan is empty", () => {
  const coreSource = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
  const plannerSource = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
  assert.equal(coreSource.includes("[CURRENT_TURN_SEMANTIC_EMPTY_RETRY]"), false);
  assert.equal(coreSource.includes("V142 current-turn empty plans are repaired by the same semantic planner"), true);
  assert.equal(plannerSource.includes("[CURRENT_TURN_SEMANTIC_SELF_REPAIR]"), true);
  assert.equal(plannerSource.includes("currentTurnValidationFeedback"), true);
  assert.equal(plannerSource.includes("CURRENT_TURN_SILENT_COMPLETION_REJECTED"), true);
  assert.equal(plannerSource.includes("CURRENT_TURN_PLAN_REJECTED_AFTER_CATALOG_VALIDATION"), true);
  assert.equal(plannerSource.includes("planCache.delete("), true);
  assert.equal(plannerSource.includes("plan?.missionComplete === true && !currentTurn"), true);
  assert.equal(plannerSource.includes("SEMANTIC_AUTHENTICATED_PROVIDER_SEMANTIC_PLAN_EMPTY"), true);
  assert.equal(plannerSource.includes("Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia"), true);
  assert.equal(plannerSource.includes("un adjunto no convierte una solicitud ejecutable en una conversacion vacia"), true);
});

test("V142 reel export enforces continuous physical frame density", () => {
  const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  const reelSource = fs.readFileSync(new URL("../jarvis-reel-artifact.js", import.meta.url), "utf8");
  assert.equal(bridgeSource.includes("--disable-background-timer-throttling"), true);
  assert.equal(bridgeSource.includes("--disable-renderer-backgrounding"), true);
  assert.equal(bridgeSource.includes("REEL_VIDEO_FRAME_DENSITY_LOW:"), true);
  assert.equal(bridgeSource.includes("averageRenderedFps < 20"), true);
  assert.equal(reelSource.includes("renderedFrameCount=0"), true);
  assert.equal(reelSource.includes("exporting?setTimeout(()=>frame(performance.now()),1000/30):requestAnimationFrame(frame)"), true);
  assert.equal(reelSource.includes("averageRenderedFps:renderedFrameCount/spec.durationSeconds"), true);
  assert.equal(reelSource.includes("async function probeMediaReadiness()"), true);
  assert.equal(reelSource.includes("window.__JARVIS_REEL_EXPORT_ERROR__=null"), true);
  assert.equal(bridgeSource.includes("JSON.stringify(exportError)"), true);
});

test("V142 original creative image is physically verifiable before reel planning", () => {
  const dependenciesSource = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.mission.dependencies.js", import.meta.url), "utf8");
  const actuatorSource = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
  assert.equal(dependenciesSource.includes('"image.generate": 28'), true);
  assert.equal(dependenciesSource.includes('"image.edit": 28'), true);
  assert.equal(actuatorSource.includes("? await sha256Base64(result.imageBase64)"), true);
  assert.equal(actuatorSource.includes("mimeType: result?.mimeType || artifact?.mimeType || null"), true);
});

test("V142 preserves a blocked direct tool payload instead of completing it accidentally", () => {
  const bridgeSource = fs.readFileSync(new URL("../gestia-core/tools.bridge.js", import.meta.url), "utf8");
  const coreSource = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
  assert.equal(bridgeSource.includes("const semanticPayload ="), true);
  assert.equal(bridgeSource.includes("? result.data"), true);
  assert.equal(bridgeSource.includes(": result;"), true);
  assert.equal(bridgeSource.includes("semanticPayload,"), true);
  assert.equal(coreSource.includes("[CURRENT_TURN_CONVERSATION_TOOL_EXECUTION]"), true);
  assert.equal(coreSource.includes("toolCalls: lightMultifunctionCalls"), true);
});

test("V142 exact Taqueria human mission reaches reel.create after verified media recovery", async () => {
  const instruction = "Investiga esta publicaciÃ³n exacta de TikTok: https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004. La empresa es TaquerÃ­a El Dorado, CancÃºn. Quiero que ejecutes la misiÃ³n completa, no sÃ³lo que me expliques cÃ³mo hacerlo. Primero investiga la publicaciÃ³n y el negocio utilizando Ãºnicamente informaciÃ³n que puedas verificar. Identifica correctamente quÃ© negocio corresponde a la publicaciÃ³n y evita confundirlo con otros establecimientos de nombre parecido. Investiga por tu cuenta toda la informaciÃ³n pÃºblica Ãºtil que encuentres y no inventes datos. DespuÃ©s de investigar, crea una propuesta de marketing basada Ãºnicamente en los hechos realmente encontrados. Crea un reel vertical profesional de aproximadamente 30 segundos, incluye voz y produce el archivo final real. No consideres Ã©xito si el archivo final no existe realmente.";
  const sourceUrl = "https://www.tiktok.com/@taqueria.eldorado/video/7629216747131850004";
  const planArgs = {
    brandName: "TaquerÃ­a El Dorado",
    title: "Taco Macho",
    cta: "Prueba el Taco Macho",
    durationSeconds: 30,
    scenes: [
      { durationSeconds: 10, visual: "Taco Macho", overlay: "Sabor sinaloense", voiceover: "Conoce el Taco Macho", evidence: sourceUrl },
      { durationSeconds: 10, visual: "Queso y carne", overlay: "Calientito y rellenito", voiceover: "Queso derretido y carne a elecciÃ³n", evidence: sourceUrl },
      { durationSeconds: 10, visual: "Cierre", overlay: "TaquerÃ­a El Dorado", voiceover: "Prueba el Taco Macho en CancÃºn", evidence: sourceUrl }
    ]
  };
  const initialToolCalls = [
    { name: "web.research", args: { query: "TaquerÃ­a El Dorado CancÃºn Taco Macho", seedUrl: sourceUrl, researchGoal: "RESEARCH_1" } },
    { name: "marketing.plan", args: { brandName: "TaquerÃ­a El Dorado", productionRequested: true, productionArtifacts: [{ id: "reel-main", type: "reel", toolName: "reel.create", label: "Reel vertical 30 segundos" }] } },
    { name: "web.media.collect", args: { url: sourceUrl, requireVideos: true } },
    { name: "reel.plan", args: planArgs },
    { name: "speech.synthesize", args: { text: "Conoce el Taco Macho de TaquerÃ­a El Dorado" } },
    { name: "reel.create", args: { videoOutput: ".jarvis-artifacts/reels/taqueria-el-dorado.mp4" } }
  ];
  const trace = [];
  let mediaAttempts = 0;
  let reelPlanAttempts = 0;
  const store = new Map();
  const storage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); }
  };
  const marketingPlan = Object.fromEntries(Array.from({ length: 25 }, (_, index) => ["section" + (index + 1), index + 1]));
  const mission = await runJarvisMission({
    instruction,
    initialToolCalls,
    requiredToolNames: initialToolCalls.map(call => call.name),
    storage,
    maximumSteps: 20,
    maximumRetries: 0,
    timeoutMs: 120000,
    planner: async ({ originalInstruction }) => {
      assert.equal(originalInstruction, instruction);
      return { toolCalls: [], missionComplete: true };
    },
    execute: async ({ name, args }) => {
      trace.push(name);
      if (name === "web.research") return { ok: true, executionOk: true, objectiveSatisfied: true, status: "GROUNDED_LOCAL_FALLBACK", sources: [{ title: "TaquerÃ­a El Dorado", url: sourceUrl }], sourceCount: 1, summary: "Identidad verificada." };
      if (name === "marketing.plan") return { ok: true, executionOk: true, objectiveSatisfied: true, status: "MARKETING_PACKAGE_READY", productionRequested: true, requiredArtifacts: [{ id: "reel-main", type: "reel", toolName: "reel.create", label: "Reel vertical 30 segundos" }], plan: marketingPlan, userVisible: "Plan de marketing verificado.", planReady: true, readyForProduction: true };
      if (name === "web.media.collect") {
        mediaAttempts += 1;
        if (mediaAttempts === 1) return { ok: true, executionOk: true, objectiveSatisfied: false, blocked: true, retryable: false, requiresInput: false, status: "WEB_REAL_MEDIA_REQUIREMENTS_UNMET" };
        return { ok: true, executionOk: true, objectiveSatisfied: true, blocked: false, retryable: false, requirementsMet: true, status: "WEB_REAL_MEDIA_COLLECTED", mediaAssets: [{ kind: "image", output: ".jarvis-artifacts/web-media/www-tiktok-com/taqueria-el-dorado/taco.jpg", mimeType: "image/jpeg", bytes: 64000, sha256: "b".repeat(64), mediaRole: "scene", sourceUrl }] };
      }
      if (name === "reel.plan") {
        reelPlanAttempts += 1;
        if (reelPlanAttempts === 1) return { ok: true, executionOk: true, objectiveSatisfied: false, blocked: true, retryable: false, requiresInput: false, status: "REEL_VERIFIED_SCENE_MEDIA_REQUIRED" };
        return { ok: true, executionOk: true, objectiveSatisfied: true, status: "REEL_PLAN_READY", ...planArgs, timelineSeconds: 30, scenes: planArgs.scenes.map(scene => ({ ...scene, assetOutput: ".jarvis-artifacts/web-media/www-tiktok-com/taqueria-el-dorado/taco.jpg", mediaType: "image", sourceMedia: { origin: "web.media.collect", sha256: "b".repeat(64) } })) };
      }
      if (name === "speech.synthesize") return { ok: true, executionOk: true, objectiveSatisfied: true, status: "SPEECH_AUDIO_CREATED_VERIFIED", output: ".jarvis-artifacts/audio/narration-taqueria.wav", mimeType: "audio/wav", bytes: 180000, sha256: "a".repeat(64), durationSeconds: 18 };
      if (name === "reel.create") {
        assert.equal(args.audioOutput, ".jarvis-artifacts/audio/narration-taqueria.wav");
        assert.equal(Array.isArray(args.scenes), true);
        assert.equal(args.scenes.length, 3);
        return { ok: true, executionOk: true, objectiveSatisfied: true, status: "REEL_VIDEO_CREATED_VERIFIED", output: ".jarvis-artifacts/reels/taqueria-el-dorado.mp4", mimeType: "video/mp4", bytes: 900000, sha256: "c".repeat(64), durationSeconds: 30, renderedFrameCount: 900, averageRenderedFps: 30 };
      }
      throw new Error("UNEXPECTED_TOOL_" + name);
    }
  });
  assert.equal(mission.status, "COMPLETED");
  assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
  assert.equal(mediaAttempts, 2);
  assert.equal(reelPlanAttempts, 2);
  assert.deepEqual(trace, ["web.research", "marketing.plan", "web.media.collect", "reel.plan", "speech.synthesize", "web.media.collect", "reel.plan", "reel.create"]);
  assert.equal(mission.completedTasks.some(item => item.name === "reel.create" && item.observation.artifact === ".jarvis-artifacts/reels/taqueria-el-dorado.mp4"), true);
  assert.equal(mission.blockedTasks.some(item => item.name === "reel.plan"), false);
  assert.equal(mission.recoveredToolAttempts.some(item => item.name === "reel.plan"), true);
});


test("V142 Windows physical reel export sustains the real 20 fps gate", {
  skip: process.platform !== "win32",
  timeout: 120000
}, async () => {
  const bridgeSource = fs.readFileSync(
    new URL("../jarvis-fs-bridge.js", import.meta.url),
    "utf8"
  );

  const start = bridgeSource.indexOf(
    "export async function exportReelVideoWithChrome({"
  );

  const end = bridgeSource.indexOf(
    "export function readJarvisRuntimeContract",
    start
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const exportSource =
    bridgeSource.slice(start, end);

  assert.equal(
    exportSource.includes('"--enable-gpu"'),
    true
  );

  assert.equal(
    exportSource.includes('"--disable-gpu"'),
    false
  );

  assert.equal(
    exportSource.includes(
      '"--disable-background-timer-throttling"'
    ),
    true
  );

  const root = fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "jarvis-v142-physical-gpu-"
    )
  );

  try {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg"',
      ' width="1080" height="1920"',
      ' viewBox="0 0 1080 1920">',
      '<rect width="1080" height="1920"',
      ' fill="#081525"/>',
      '<circle cx="540" cy="680" r="330"',
      ' fill="#f2b84b"/>',
      '<circle cx="540" cy="680" r="230"',
      ' fill="#6c2f20"/>',
      '<rect x="170" y="1100"',
      ' width="740" height="360"',
      ' rx="80" fill="#111827"/>',
      '</svg>'
    ].join("");

    const image =
      "data:image/svg+xml;base64," +
      Buffer.from(
        svg,
        "utf8"
      ).toString("base64");

    const spec = {
      brandName: "V142 Physical Gate",
      title: "Reel fisico 1080x1920",
      cta: "Verificado",
      durationSeconds: 30,
      scenes: [
        {
          durationSeconds: 10,
          overlay: "Render fisico uno",
          subtitle: "1080 x 1920",
          mediaType: "image",
          assetDataUrl: image,
          backgroundColor: "#07111f",
          transition: "fade"
        },
        {
          durationSeconds: 10,
          overlay: "Render fisico dos",
          subtitle: "Cadencia continua",
          mediaType: "image",
          assetDataUrl: image,
          backgroundColor: "#07111f",
          transition: "zoom"
        },
        {
          durationSeconds: 10,
          overlay: "Render fisico tres",
          subtitle: "Gate minimo 20 fps",
          mediaType: "image",
          assetDataUrl: image,
          backgroundColor: "#07111f",
          transition: "slide"
        }
      ]
    };

    const studioPath =
      path.join(root, "studio.html");

    fs.writeFileSync(
      studioPath,
      buildReelStudioHtml(spec),
      "utf8"
    );

    const result =
      await exportReelVideoWithChrome({
        studioPath,
        output:
          ".jarvis-artifacts/reels/" +
          "v142-physical-frame-gate.mp4",
        durationSeconds: 30,
        root
      });

    console.log(
      "[V142_PHYSICAL_REEL_RESULT]",
      JSON.stringify(result)
    );

    assert.equal(
      result.ok,
      true,
      result.error || JSON.stringify(result)
    );

    assert.ok(
      Number(result.renderedFrameCount) >= 600,
      "renderedFrameCount=" +
      result.renderedFrameCount
    );

    assert.ok(
      Number(result.averageRenderedFps) >= 20,
      "averageRenderedFps=" +
      result.averageRenderedFps
    );

    assert.equal(
      result.durationSeconds,
      30
    );

    assert.equal(result.width, 1080);
    assert.equal(result.height, 1920);

    assert.ok(
      result.output &&
      fs.existsSync(
        path.join(root, result.output)
      ),
      "PHYSICAL_REEL_FILE_MISSING"
    );
  }
  finally {
    fs.rmSync(
      root,
      {
        recursive: true,
        force: true
      }
    );
  }
});
