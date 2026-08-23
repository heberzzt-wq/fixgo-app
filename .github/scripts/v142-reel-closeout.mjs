import fs from "node:fs/promises";

const paths = {
    core: "gestia-core/gestia-core.js",
    planner: "gestia-core/jarvis/jarvis.multifunction.planner.js",
    dependencies: "gestia-core/jarvis/jarvis.mission.dependencies.js",
    mediaBinder: "gestia-core/jarvis/jarvis.reel.media-binder.js",
    actuator: "gestia-core/jarvis/jarvis.actuator.pack.js",
    orchestrator: "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    bridge: "jarvis-fs-bridge.js",
    reelArtifact: "jarvis-reel-artifact.js",
    reelTest: "tests/jarvis-reel-native-mp4-v138.test.mjs",
    binderTest: "tests/jarvis-reel-media-binder-v131.test.mjs",
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

let planner = await read(paths.planner);
planner = replaceOnce(
    planner,
`    "Cuando la instruccion actual aporte material de produccion listo para ejecutar y el contexto semantico asesor de esta conversacion confirme de forma inequivoca una produccion activa, interpreta ese material como continuacion de la misma produccion y selecciona las herramientas necesarias sin exigir que el usuario repita un verbo de ejecucion. El contenido o su formato, por si solos y sin esa continuidad semantica, no autorizan ejecutar nada.",
    "Selecciona solamente las herramientas necesarias para satisfacer la intencion actual y conserva cada objetivo independiente pedido por el usuario.",`,
`    "Cuando la instruccion actual aporte material de produccion listo para ejecutar y el contexto semantico asesor de esta conversacion confirme de forma inequivoca una produccion activa, interpreta ese material como continuacion de la misma produccion y selecciona las herramientas necesarias sin exigir que el usuario repita un verbo de ejecucion. El contenido o su formato, por si solos y sin esa continuidad semantica, no autorizan ejecutar nada.",
    "Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia. Cuando la intencion semantica actual pide una pieza nueva u original basada en esa evidencia y no pide reutilizar literalmente el medio fuente, conserva los hechos verificados pero selecciona las capacidades existentes de generacion para crear visuales nuevos; usa image.edit solamente cuando la intencion sea transformar o adaptar un medio existente.",
    "Cuando el usuario aporta adjuntos y pide transformarlos, editarlos o producir una pieza a partir de ellos, trata esos adjuntos como objetos de entrada y selecciona las capacidades existentes de analisis, edicion o produccion necesarias; un adjunto no convierte una solicitud ejecutable en una conversacion vacia.",
    "Selecciona solamente las herramientas necesarias para satisfacer la intencion actual y conserva cada objetivo independiente pedido por el usuario.",`,
    "V142_ORIGINAL_CREATIVE_AND_ATTACHMENT_POLICY"
);
planner = replaceOnce(
    planner,
`        .then(plan => {
            planCache.set(key, { plan, savedAt: Date.now() });
            return plan;
        })`,
`        .then(plan => {
            const executablePlan =
                plan?.missionComplete === true ||
                (
                    Array.isArray(plan?.toolCalls) &&
                    plan.toolCalls.some(call => call && typeof call.name === "string" && call.name.trim())
                );
            if (executablePlan) {
                planCache.set(key, { plan, savedAt: Date.now() });
            }
            return plan;
        })`,
    "V142_DO_NOT_CACHE_EMPTY_SEMANTIC_PLAN"
);
await write(paths.planner, planner);

let core = await read(paths.core);
core = replaceOnce(
    core,
`            terminalSemanticPlan =
                await this.analizarIntencionLigera(
                    inputRaw,
                    {
                        ...context,
                        tenantId
                    }
                );`,
`            terminalSemanticPlan =
                await this.analizarIntencionLigera(
                    inputRaw,
                    {
                        ...context,
                        tenantId
                    }
                );
            for (let semanticEmptyAttempt = 1; semanticEmptyAttempt <= 2; semanticEmptyAttempt += 1) {
                const executableToolCalls =
                    Array.isArray(terminalSemanticPlan?.toolCalls)
                        ? terminalSemanticPlan.toolCalls.filter(call =>
                            call &&
                            typeof call.name === "string" &&
                            call.name.trim()
                        )
                        : [];
                if (
                    executableToolCalls.length > 0 ||
                    terminalSemanticPlan?.missionComplete === true
                ) {
                    break;
                }
                const retryDelayMs = semanticEmptyAttempt === 1 ? 350 : 900;
                console.warn(
                    "[CURRENT_TURN_SEMANTIC_EMPTY_RETRY]",
                    semanticEmptyAttempt,
                    retryDelayMs
                );
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                terminalSemanticPlan =
                    await this.analizarIntencionLigera(
                        inputRaw,
                        {
                            ...context,
                            tenantId
                        }
                    );
            }`,
    "V142_CURRENT_TURN_SEMANTIC_EMPTY_RETRY"
);
for (const marker of [
    "missionContractAttempt <= 3",
    "[MISSION_CONTRACT_SEMANTIC_PLANNER_TRANSIENT_RETRY]",
    "const incompleteProductionFallback = recoveredInitialToolCalls.some"
]) {
    if (!core.includes(marker)) throw new Error(`V142_CORE_STATE_REQUIRED:${marker}`);
}
await write(paths.core, core);

let dependencies = await read(paths.dependencies);
dependencies = replaceOnce(
    dependencies,
`    "image.generate": 40,
    "image.edit": 40,`,
`    "image.generate": 28,
    "image.edit": 28,`,
    "V142_CREATIVE_MEDIA_BEFORE_REEL_PLAN"
);
await write(paths.dependencies, dependencies);

let actuator = await read(paths.actuator);
actuator = replaceOnce(
    actuator,
`                const finalResult = {
                    ...result,
                    persisted: artifact?.ok === true,
                    output: artifact?.output || null,
                    bytes: artifact?.bytes || null,
                    persistenceStatus: artifact?.status || null,
                    persistenceError: artifact?.ok === false ? artifact.error : null
                };`,
`                const finalResult = {
                    ...result,
                    persisted: artifact?.ok === true,
                    output: artifact?.output || null,
                    bytes: artifact?.bytes || null,
                    mimeType: result?.mimeType || artifact?.mimeType || null,
                    sha256:
                        result?.ok === true && result?.imageBase64
                            ? await sha256Base64(result.imageBase64)
                            : null,
                    persistenceStatus: artifact?.status || null,
                    persistenceError: artifact?.ok === false ? artifact.error : null
                };`,
    "V142_GENERATED_IMAGE_PHYSICAL_HASH"
);
await write(paths.actuator, actuator);

let mediaBinder = await read(paths.mediaBinder);
mediaBinder = replaceOnce(
    mediaBinder,
`        !output.startsWith(".jarvis-artifacts/web-media/") ||`,
`        !(
            output.startsWith(".jarvis-artifacts/web-media/") ||
            output.startsWith(".jarvis-artifacts/images/")
        ) ||`,
    "V142_BINDER_ACCEPTS_VERIFIED_GENERATED_IMAGES"
);
mediaBinder = replaceOnce(
    mediaBinder,
`        sourceUrl: clean(asset?.sourceUrl),
        sourceTag: clean(asset?.sourceTag),
        alt: clean(asset?.alt)`,
`        sourceUrl: clean(asset?.sourceUrl),
        sourceTag: clean(asset?.sourceTag),
        origin:
            clean(asset?.origin) ||
            (output.startsWith(".jarvis-artifacts/images/")
                ? clean(asset?.sourceTag) || "image.generate"
                : "web.media.collect"),
        alt: clean(asset?.alt)`,
    "V142_BINDER_PRESERVES_MEDIA_ORIGIN"
);
mediaBinder = replaceOnce(
    mediaBinder,
`export function reelMediaCollectionState(context = {}) {
    const tasks = [
        ...(Array.isArray(context?.completedTasks) ? context.completedTasks : []),
        ...(Array.isArray(context?.blockedTasks) ? context.blockedTasks : [])
    ].filter(task => String(task?.name || "") === "web.media.collect");
    const assets = [];
    for (const task of tasks) {
        assets.push(...payloadAssets(task?.observation || {}));
        assets.push(...payloadAssets(task?.observation?.evidence || {}));
    }
    return {
        attempted: tasks.length > 0,
        assets: dedupeAssets(
            assets
                .map(verifiedSceneAsset)
                .filter(Boolean)
        )
    };
}`,
`export function reelMediaCollectionState(context = {}) {
    const allTasks = [
        ...(Array.isArray(context?.completedTasks) ? context.completedTasks : []),
        ...(Array.isArray(context?.blockedTasks) ? context.blockedTasks : [])
    ];
    const collectionTasks = allTasks.filter(task =>
        String(task?.name || "") === "web.media.collect"
    );
    const creativeTasks = allTasks.filter(task =>
        ["image.generate", "image.edit"].includes(String(task?.name || ""))
    );
    const collectedAssets = [];
    for (const task of collectionTasks) {
        collectedAssets.push(...payloadAssets(task?.observation || {}));
        collectedAssets.push(...payloadAssets(task?.observation?.evidence || {}));
    }
    const verifiedCreativeAssets = creativeTasks
        .map(task => {
            const observation = task?.observation && typeof task.observation === "object"
                ? task.observation
                : {};
            const toolName = String(task?.name || "");
            return verifiedSceneAsset({
                kind: "image",
                output: observation.output,
                mimeType: observation.mimeType || observation.outputMimeType,
                bytes: observation.bytes || observation.outputBytes,
                sha256: observation.sha256 || observation.outputSha256,
                mediaRole: "scene",
                sourceTag: toolName,
                origin: toolName,
                alt:
                    clean(observation.prompt) ||
                    clean(observation.variantId) ||
                    "Visual creativo generado y verificado"
            });
        })
        .filter(Boolean);
    const verifiedCollectedAssets = collectedAssets
        .map(verifiedSceneAsset)
        .filter(Boolean);
    return {
        attempted: collectionTasks.length > 0 || creativeTasks.length > 0,
        assets: dedupeAssets(
            verifiedCreativeAssets.length > 0
                ? verifiedCreativeAssets
                : verifiedCollectedAssets
        )
    };
}`,
    "V142_PREFER_ORIGINAL_CREATIVE_MEDIA"
);
mediaBinder = replaceOnce(
    mediaBinder,
`                origin: "web.media.collect",`,
`                origin: binding.asset.origin || "web.media.collect",`,
    "V142_BOUND_SCENE_ORIGIN"
);
await write(paths.mediaBinder, mediaBinder);

let bridge = await read(paths.bridge);
bridge = replaceOnce(
    bridge,
`            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--autoplay-policy=no-user-gesture-required",`,
`            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
            "--disable-features=CalculateNativeWinOcclusion",
            "--disable-dev-shm-usage",
            "--autoplay-policy=no-user-gesture-required",`,
    "V142_HEADLESS_REEL_FRAME_THROTTLING_DISABLED"
);
bridge = replaceOnce(
    bridge,
`        const actualMimeType = String(payload.mimeType || "").trim();
        const container = assertReelVideoContainer(buffer, actualMimeType);`,
`        const actualMimeType = String(payload.mimeType || "").trim();
        const renderedFrameCount = Number(payload.renderedFrameCount || 0);
        const averageRenderedFps = Number(payload.averageRenderedFps || 0);
        if (
            renderedFrameCount < Math.floor(duration * 20) ||
            averageRenderedFps < 20
        ) {
            throw new Error(
                "REEL_VIDEO_FRAME_DENSITY_LOW:" +
                renderedFrameCount + ":" +
                averageRenderedFps.toFixed(2)
            );
        }
        const container = assertReelVideoContainer(buffer, actualMimeType);`,
    "V142_PHYSICAL_FRAME_DENSITY_GATE"
);
bridge = replaceOnce(
    bridge,
`            audioMixMode: String(payload.audioMixMode || "silent_visual"),
            audioTracksAdded: Number(payload.audioTracksAdded || 0),
            audioGraphAvailable: payload.audioGraphAvailable === true,
            artifact`,
`            audioMixMode: String(payload.audioMixMode || "silent_visual"),
            audioTracksAdded: Number(payload.audioTracksAdded || 0),
            audioGraphAvailable: payload.audioGraphAvailable === true,
            renderedFrameCount,
            averageRenderedFps,
            artifact`,
    "V142_FRAME_DENSITY_EXPORT_EVIDENCE"
);
await write(paths.bridge, bridge);

let reelArtifact = await read(paths.reelArtifact);
reelArtifact = replaceOnce(
    reelArtifact,
`let animation=0,startedAt=0,exporting=false,mediaReadinessPromise=null,audioGraphPromise=null;`,
`let animation=0,startedAt=0,exporting=false,renderedFrameCount=0,mediaReadinessPromise=null,audioGraphPromise=null;`,
    "V142_REEL_RENDERED_FRAME_COUNTER"
);
reelArtifact = replaceOnce(
    reelArtifact,
`function frame(now){const seconds=(now-startedAt)/1000;draw(seconds);if(seconds<spec.durationSeconds)animation=requestAnimationFrame(frame);else{draw(spec.durationSeconds-.001);media.forEach(item=>item?.tagName==='VIDEO'&&!item.paused&&item.pause());if(audio&&!audio.paused)audio.pause();statusEl.textContent='Vista previa finalizada.'}}async function play(){const readiness=await waitForMediaReady();if(readiness.mediaFailedCount>0){statusEl.textContent='No se puede previsualizar: faltan medios visuales por cargar.';return false}const audioGraph=await ensureAudioGraph();if(audioGraph.context?.state==='suspended')await audioGraph.context.resume().catch(()=>{});cancelAnimationFrame(animation);startedAt=performance.now();if(audio&&readiness.audioReady){audio.currentTime=0;audio.play().catch(()=>{})}animation=requestAnimationFrame(frame);return true}`,
`function frame(now){const seconds=(now-startedAt)/1000;draw(seconds);renderedFrameCount+=1;if(seconds<spec.durationSeconds){animation=exporting?setTimeout(()=>frame(performance.now()),1000/30):requestAnimationFrame(frame)}else{draw(spec.durationSeconds-.001);renderedFrameCount+=1;media.forEach(item=>item?.tagName==='VIDEO'&&!item.paused&&item.pause());if(audio&&!audio.paused)audio.pause();statusEl.textContent='Vista previa finalizada.'}}async function play(){const readiness=await waitForMediaReady();if(readiness.mediaFailedCount>0){statusEl.textContent='No se puede previsualizar: faltan medios visuales por cargar.';return false}const audioGraph=await ensureAudioGraph();if(audioGraph.context?.state==='suspended')await audioGraph.context.resume().catch(()=>{});cancelAnimationFrame(animation);clearTimeout(animation);renderedFrameCount=0;startedAt=performance.now();if(audio&&readiness.audioReady){audio.currentTime=0;audio.play().catch(()=>{})}animation=exporting?setTimeout(()=>frame(performance.now()),0):requestAnimationFrame(frame);return true}`,
    "V142_FIXED_RATE_EXPORT_FRAME_PUMP"
);
reelArtifact = replaceOnce(
    reelArtifact,
`formatFallback:extension!=='mp4',qualityGatePassed,...readiness,...audioRouting};`,
`formatFallback:extension!=='mp4',qualityGatePassed,renderedFrameCount,averageRenderedFps:renderedFrameCount/spec.durationSeconds,...readiness,...audioRouting};`,
    "V142_REEL_FRAME_DENSITY_DETAIL"
);
await write(paths.reelArtifact, reelArtifact);

const orchestrator = await read(paths.orchestrator);
for (const marker of [
    "verifiedSpeechArtifactForReel",
    "REEL_PLAN_RETRY_AFTER_MEDIA_RECOVERY",
    "reelCreateArgsFromVerifiedPlan"
]) {
    if (!orchestrator.includes(marker)) throw new Error(`V142_ORCHESTRATOR_STATE_REQUIRED:${marker}`);
}

let reelTest = await read(paths.reelTest);
reelTest = appendOnce(
    reelTest,
    "V142 keeps one semantic brain when the current-turn plan is empty",
`test("V142 keeps one semantic brain when the current-turn plan is empty", () => {
  const coreSource = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");
  const plannerSource = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");
  assert.equal(coreSource.includes("[CURRENT_TURN_SEMANTIC_EMPTY_RETRY]"), true);
  assert.equal(coreSource.includes("semanticEmptyAttempt <= 2"), true);
  assert.equal(plannerSource.includes("const executablePlan ="), true);
  assert.equal(plannerSource.includes("if (executablePlan)"), true);
  assert.equal(plannerSource.includes("Los medios recopilados desde publicaciones o fuentes externas son evidencia y referencia"), true);
  assert.equal(plannerSource.includes("un adjunto no convierte una solicitud ejecutable en una conversacion vacia"), true);
});`
);
reelTest = appendOnce(
    reelTest,
    "V142 reel export enforces continuous physical frame density",
`test("V142 reel export enforces continuous physical frame density", () => {
  const bridgeSource = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  const reelSource = fs.readFileSync(new URL("../jarvis-reel-artifact.js", import.meta.url), "utf8");
  assert.equal(bridgeSource.includes("--disable-background-timer-throttling"), true);
  assert.equal(bridgeSource.includes("--disable-renderer-backgrounding"), true);
  assert.equal(bridgeSource.includes("REEL_VIDEO_FRAME_DENSITY_LOW:"), true);
  assert.equal(bridgeSource.includes("averageRenderedFps < 20"), true);
  assert.equal(reelSource.includes("renderedFrameCount=0"), true);
  assert.equal(reelSource.includes("exporting?setTimeout(()=>frame(performance.now()),1000/30):requestAnimationFrame(frame)"), true);
  assert.equal(reelSource.includes("averageRenderedFps:renderedFrameCount/spec.durationSeconds"), true);
});`
);
reelTest = appendOnce(
    reelTest,
    "V142 original creative image is physically verifiable before reel planning",
`test("V142 original creative image is physically verifiable before reel planning", () => {
  const dependenciesSource = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.mission.dependencies.js", import.meta.url), "utf8");
  const actuatorSource = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
  assert.equal(dependenciesSource.includes('"image.generate": 28'), true);
  assert.equal(dependenciesSource.includes('"image.edit": 28'), true);
  assert.equal(actuatorSource.includes("? await sha256Base64(result.imageBase64)"), true);
  assert.equal(actuatorSource.includes("mimeType: result?.mimeType || artifact?.mimeType || null"), true);
});`
);
await write(paths.reelTest, reelTest);

let binderTest = await read(paths.binderTest);
binderTest = appendOnce(
    binderTest,
    "v142 prefers verified original creative media over collected source evidence",
`test("v142 prefers verified original creative media over collected source evidence", () => {
    const generatedOutput = ".jarvis-artifacts/images/original-taco-macho.png";
    const state = reelMediaCollectionState({
        completedTasks: [
            {
                name: "web.media.collect",
                observation: { mediaAssets: sceneAssets }
            },
            {
                name: "image.generate",
                observation: {
                    output: generatedOutput,
                    mimeType: "image/png",
                    bytes: 480000,
                    sha256: "e".repeat(64),
                    prompt: "Escena original de Taco Macho creada para la campaña"
                }
            }
        ]
    });
    assert.equal(state.attempted, true);
    assert.equal(state.assets.length, 1);
    assert.equal(state.assets[0].output, generatedOutput);
    assert.equal(state.assets[0].origin, "image.generate");
    const validated = validateReelMediaBindings({
        scenes,
        assets: state.assets,
        decision: {
            bindings: scenes.map(scene => ({
                sceneId: scene.id,
                mediaId: "MEDIA_1",
                reason: "Visual original verificado"
            }))
        }
    });
    assert.equal(validated.ok, true);
    assert.equal(validated.scenes.every(scene => scene.assetOutput === generatedOutput), true);
    assert.equal(validated.scenes.every(scene => scene.sourceMedia.origin === "image.generate"), true);
});`
);
await write(paths.binderTest, binderTest);

let semanticPlannerTest = await read(paths.semanticPlannerTest);
semanticPlannerTest = semanticPlannerTest.replace(
    /(\} = require\("\.\.\/functions\/jarvis-semantic-planner"\);\n)\n+(const catalog = \[)/,
    "$1\n$2"
);
await write(paths.semanticPlannerTest, semanticPlannerTest);

console.log(JSON.stringify({
    ok: true,
    status: "V142_REEL_CLOSEOUT_APPLIED",
    sameSemanticAuthority: true,
    semanticEmptyRetry: true,
    sourceMediaEvidenceOnlyWhenOriginalCreativeExists: true,
    verifiedGeneratedMediaPreferred: true,
    continuousExportFramePump: true,
    minimumRenderedFps: 20,
    newFiles: false,
    newContracts: false,
    newBrains: false
}));