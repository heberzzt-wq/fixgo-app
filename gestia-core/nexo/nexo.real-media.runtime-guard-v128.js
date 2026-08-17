import {
    reelSceneMediaCoverage
} from "../jarvis/jarvis.reel.media-binder.js?v=v131-semantic-scene-media-authority-20260811";
import {
    NEXO_REAL_MEDIA_TOOLS_VERSION
} from "./nexo.real-media.tools.js?v=v137-local-speech-synthesis-20260812";

export const NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION =
    "1.3.0-synthesized-reel-audio-v137";

const INSTALL_KEY = "__NEXO_REAL_MEDIA_RUNTIME_GUARD_V128__";
const CACHE_KEY = "__NEXO_REAL_MEDIA_MISSION_CACHE_V128__";

function runtimeCandidate() {
    return (
        globalThis.JarvisToolRuntime ||
        globalThis.window?.JarvisToolRuntime ||
        null
    );
}

function previousDefinition(runtime, name) {
    if (typeof runtime?.get === "function") return runtime.get(name);
    return runtime?._registry?.get?.(name) || null;
}

function realMediaToolsReady(runtime) {
    const collector = previousDefinition(runtime, "web.media.collect");
    const reel = previousDefinition(runtime, "reel.create");
    return (
        typeof collector?.execute === "function" &&
        typeof reel?.execute === "function" &&
        String(collector?.version || "") === NEXO_REAL_MEDIA_TOOLS_VERSION &&
        String(reel?.version || "") === NEXO_REAL_MEDIA_TOOLS_VERSION
    );
}

function missionCache() {
    const root = globalThis.window || globalThis;
    if (!(root[CACHE_KEY] instanceof Map)) root[CACHE_KEY] = new Map();
    return root[CACHE_KEY];
}

function missionKeys(args = {}, context = {}) {
    return [
        context.analysisId,
        context.objectiveId,
        args.objectiveId,
        context.caseId,
        args.caseId
    ]
        .map(value => String(value || "").trim())
        .filter(Boolean);
}

function verifiedAsset(asset = {}) {
    const kind = String(asset?.kind || "").trim().toLowerCase();
    const output = String(asset?.output || "").trim().replaceAll("\\", "/");
    const mimeType = String(asset?.mimeType || "").trim().toLowerCase();
    const sha256 = String(asset?.sha256 || "").trim().toLowerCase();
    const bytes = Number(asset?.bytes || 0);
    const hashValid =
        sha256.length === 64 &&
        [...sha256].every(character =>
            (character >= "0" && character <= "9") ||
            (character >= "a" && character <= "f")
        );
    if (
        !["image", "video"].includes(kind) ||
        !output.startsWith(".jarvis-artifacts/web-media/") ||
        output.includes("../") ||
        !mimeType.startsWith(`${kind}/`) ||
        !Number.isFinite(bytes) ||
        bytes <= 0 ||
        !hashValid
    ) {
        return null;
    }
    return {
        kind,
        output,
        mimeType,
        bytes,
        sha256,
        sourceUrl: String(asset?.sourceUrl || "").trim(),
        sourceTag: String(asset?.sourceTag || "").trim(),
        mediaRole: String(asset?.mediaRole || "").trim() === "brand_logo" ? "brand_logo" : "scene",
        alt: String(asset?.alt || "").trim()
    };
}

function payloadAssets(payload = {}) {
    const candidates = [
        payload?.mediaAssets,
        payload?.assets,
        payload?.evidence?.mediaAssets,
        payload?.data?.mediaAssets,
        payload?.runtimeResult?.mediaAssets,
        payload?.runtimeResult?.data?.mediaAssets
    ];
    return candidates
        .filter(Array.isArray)
        .flat()
        .map(verifiedAsset)
        .filter(Boolean);
}

function dedupeAssets(assets = []) {
    const seen = new Set();
    return assets.filter(asset => {
        const key = `${asset.output}:${asset.sha256}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function attachmentManifest(context = {}) {
    const marker = "Archivos adjuntos reales entregados por el usuario:";
    const source = String(context?.rawInput || "");
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) return [];
    try {
        const attachments = JSON.parse(source.slice(markerIndex + marker.length).trim());
        return Array.isArray(attachments) ? attachments.slice(0, 30) : [];
    } catch {
        return [];
    }
}

function verifiedAudioAttachment(attachment = {}) {
    const output = String(attachment?.artifact || attachment?.output || "").trim().replaceAll("\\", "/");
    const mimeType = String(attachment?.mimeType || "").trim().toLowerCase();
    const sha256 = String(attachment?.sha256 || "").trim().toLowerCase();
    const bytes = Number(attachment?.bytes || attachment?.size || 0);
    const hashValid = sha256.length === 64 && [...sha256].every(character =>
        (character >= "0" && character <= "9") ||
        (character >= "a" && character <= "f")
    );
    if (
        !output.startsWith(".jarvis-artifacts/uploads/") ||
        output.includes("../") ||
        !mimeType.startsWith("audio/") ||
        !Number.isFinite(bytes) ||
        bytes <= 0 ||
        !hashValid
    ) return null;
    return { output, mimeType, sha256, bytes };
}


function verifiedSynthesizedAudioTask(task = {}) {
    if (
        String(task?.name || "") !== "speech.synthesize" ||
        task?.observation?.objectiveSatisfied !== true ||
        String(task?.observation?.status || "") !== "SPEECH_AUDIO_CREATED_VERIFIED"
    ) return null;
    const evidence = task?.observation?.evidence || {};
    const output = String(task?.observation?.artifact || evidence?.output || "")
        .trim()
        .replaceAll("\\", "/");
    const mimeType = String(evidence?.mimeType || "").trim().toLowerCase();
    const sha256 = String(evidence?.sha256 || "").trim().toLowerCase();
    const bytes = Number(evidence?.bytes || 0);
    const hashValid = sha256.length === 64 && [...sha256].every(character =>
        (character >= "0" && character <= "9") ||
        (character >= "a" && character <= "f")
    );
    if (
        !output.startsWith(".jarvis-artifacts/audio/") ||
        output.includes("../") ||
        !output.toLowerCase().endsWith(".wav") ||
        mimeType !== "audio/wav" ||
        !Number.isFinite(bytes) ||
        bytes <= 0 ||
        !hashValid
    ) return null;
    return { output, mimeType, sha256, bytes };
}

function hydrateReelAudioArgs(args = {}, context = {}) {
    const current = args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
    const explicit = Boolean(
        String(current.audioOutput || "").trim() ||
        String(current.audioDataUrl || "").trim() ||
        String(current.audioUrl || "").trim()
    );
    if (explicit) {
        return { args: current, hydrated: false, ambiguous: false, candidateCount: 0, source: "explicit" };
    }
    const candidates = attachmentManifest(context)
        .map(verifiedAudioAttachment)
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex(candidate => candidate.output === item.output) === index);
    if (candidates.length > 1) {
        return { args: current, hydrated: false, ambiguous: true, candidateCount: candidates.length, source: "user_attachment" };
    }
    if (candidates.length === 1) {
        return {
            args: { ...current, audioOutput: candidates[0].output },
            hydrated: true,
            ambiguous: false,
            candidateCount: 1,
            source: "user_attachment",
            output: candidates[0].output
        };
    }
    const synthesized = missionTasks(context)
        .map(verifiedSynthesizedAudioTask)
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex(candidate => candidate.output === item.output) === index);
    if (synthesized.length > 1) {
        return { args: current, hydrated: false, ambiguous: true, candidateCount: synthesized.length, source: "speech.synthesize" };
    }
    if (synthesized.length === 1) {
        return {
            args: { ...current, audioOutput: synthesized[0].output },
            hydrated: true,
            ambiguous: false,
            candidateCount: 1,
            source: "speech.synthesize",
            output: synthesized[0].output
        };
    }
    return { args: current, hydrated: false, ambiguous: false, candidateCount: 0, source: null };
}

function hasExplicitSceneMedia(args = {}) {
    return (Array.isArray(args?.scenes) ? args.scenes : []).some(scene =>
        scene && typeof scene === "object" && (
            String(scene.assetOutput || "").trim() ||
            String(scene.assetDataUrl || "").trim() ||
            String(scene.mediaUrl || "").trim()
        )
    );
}

function missionTasks(context = {}) {
    return [
        ...(Array.isArray(context.completedTasks) ? context.completedTasks : []),
        ...(Array.isArray(context.blockedTasks) ? context.blockedTasks : [])
    ];
}

function taskMediaState(context = {}) {
    const tasks = missionTasks(context)
        .filter(task => String(task?.name || "") === "web.media.collect");
    const assets = [];
    for (const task of tasks) {
        assets.push(...payloadAssets(task?.observation || {}));
        assets.push(...payloadAssets(task?.observation?.evidence || {}));
    }
    return {
        attempted: tasks.length > 0,
        assets: dedupeAssets(assets)
    };
}

function memoryMediaState(context = {}) {
    const root = globalThis.window || globalThis;
    const entries = Array.isArray(root.__JARVIS_TOOL_MEMORY__?.entries)
        ? root.__JARVIS_TOOL_MEMORY__.entries
        : [];
    const analysisId = String(context.analysisId || "").trim();
    const matches = entries.filter(entry =>
        entry?.tool === "web.media.collect" &&
        (!analysisId || !entry?.analysisId || String(entry.analysisId) === analysisId)
    );
    const assets = [];
    for (const entry of matches) {
        assets.push(...payloadAssets(entry?.data || {}));
        assets.push(...payloadAssets(entry?.observation || {}));
    }
    return {
        attempted: matches.length > 0,
        assets: dedupeAssets(assets)
    };
}

function cachedMediaState(args = {}, context = {}) {
    const cache = missionCache();
    const assets = [];
    let attempted = false;
    for (const key of missionKeys(args, context)) {
        const entry = cache.get(key);
        if (!entry) continue;
        attempted = attempted || entry.attempted === true;
        assets.push(...(Array.isArray(entry.assets) ? entry.assets : []));
    }
    return {
        attempted,
        assets: dedupeAssets(assets.map(verifiedAsset).filter(Boolean))
    };
}

function availableMediaState(args = {}, context = {}) {
    const taskState = taskMediaState(context);
    const memoryState = memoryMediaState(context);
    const cacheState = cachedMediaState(args, context);
    return {
        attempted:
            taskState.attempted ||
            memoryState.attempted ||
            cacheState.attempted,
        assets: dedupeAssets([
            ...taskState.assets,
            ...memoryState.assets,
            ...cacheState.assets
        ])
    };
}

function rememberCollection(args = {}, context = {}, result = {}) {
    const cache = missionCache();
    const assets = dedupeAssets(payloadAssets(result));
    const entry = {
        attempted: true,
        assets,
        status: String(result?.status || ""),
        capturedAt: Date.now()
    };
    for (const key of missionKeys(args, context)) cache.set(key, entry);
    return entry;
}

function hydrateReelArgs(args = {}, assets = []) {
    const current = args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
    const scenes = Array.isArray(current.scenes)
        ? current.scenes.map(scene => scene && typeof scene === "object" && !Array.isArray(scene) ? { ...scene } : scene)
        : [];
    const verified = dedupeAssets(assets.map(verifiedAsset).filter(Boolean));
    const logoAssets = verified.filter(asset => asset.kind === "image" && asset.mediaRole === "brand_logo");
    const sceneAssets = verified.filter(asset => asset.mediaRole !== "brand_logo");
    const ordered = [
        ...sceneAssets.filter(asset => asset.kind === "video"),
        ...sceneAssets.filter(asset => asset.kind === "image")
    ];
    const explicitLogo = Boolean(
        String(current.logoOutput || "").trim() ||
        String(current.logoDataUrl || "").trim() ||
        String(current.logoUrl || "").trim()
    );
    const logoAsset = !explicitLogo ? logoAssets[0] || null : null;
    const baseArgs = logoAsset ? { ...current, logoOutput: logoAsset.output } : current;
    if (scenes.length === 0 || ordered.length === 0) {
        return {
            args: baseArgs,
            hydrated: Boolean(logoAsset),
            verifiedAssetCount: verified.length,
            verifiedSceneAssetCount: ordered.length,
            verifiedLogoAssetCount: logoAssets.length,
            hydratedSceneCount: 0,
            logoHydrated: Boolean(logoAsset)
        };
    }
    let assigned = 0;
    const hydratedScenes = scenes.map((scene, index) => {
        if (!scene || typeof scene !== "object" || Array.isArray(scene)) return scene;
        const explicit = Boolean(
            String(scene.assetOutput || "").trim() ||
            String(scene.assetDataUrl || "").trim() ||
            String(scene.mediaUrl || "").trim()
        );
        if (explicit) return scene;
        const asset = ordered[index % ordered.length];
        if (!asset) return scene;
        assigned += 1;
        return {
            ...scene,
            assetOutput: asset.output,
            mediaType: asset.kind,
            sourceMedia: {
                origin: "web.media.collect",
                sourceUrl: asset.sourceUrl || null,
                mimeType: asset.mimeType,
                sha256: asset.sha256,
                mediaRole: asset.mediaRole
            }
        };
    });
    return {
        args: { ...baseArgs, scenes: hydratedScenes },
        hydrated: assigned > 0 || Boolean(logoAsset),
        verifiedAssetCount: verified.length,
        verifiedSceneAssetCount: ordered.length,
        verifiedLogoAssetCount: logoAssets.length,
        hydratedSceneCount: assigned,
        logoHydrated: Boolean(logoAsset)
    };
}

export function registerNexoRealMediaRuntimeGuard(runtime = runtimeCandidate()) {
    if (!runtime || typeof runtime.register !== "function") {
        throw new Error("NEXO_RUNTIME_GUARD_RUNTIME_REQUIRED");
    }
    if (globalThis[INSTALL_KEY]?.active === true) return globalThis[INSTALL_KEY];

    const collectorDefinition = previousDefinition(runtime, "web.media.collect");
    const reelDefinition = previousDefinition(runtime, "reel.create");
    if (
        typeof collectorDefinition?.execute !== "function" ||
        typeof reelDefinition?.execute !== "function"
    ) {
        throw new Error("NEXO_RUNTIME_GUARD_DEPENDENCIES_REQUIRED");
    }

    const collectorExecute = collectorDefinition.execute.bind(collectorDefinition);
    collectorDefinition.runtimeGuardVersion = NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION;
    collectorDefinition.execute = async (args = {}, context = {}) => {
            const result = await collectorExecute(args, context);
            const remembered = rememberCollection(args, context, result);
            return {
                ...result,
                verifiedMediaCount: remembered.assets.length,
                runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION
            };
        };

    const reelExecute = reelDefinition.execute.bind(reelDefinition);
    reelDefinition.runtimeGuardVersion = NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION;
    reelDefinition.execute = async (args = {}, context = {}) => {
            const audioHydration = hydrateReelAudioArgs(args, context);
            if (audioHydration.ambiguous) {
                return {
                    ok: false,
                    executionOk: true,
                    objectiveSatisfied: false,
                    blocked: true,
                    requiresInput: true,
                    retryable: false,
                    status: "REEL_AUDIO_SELECTION_REQUIRED",
                    error: "MULTIPLE_AUDIO_ATTACHMENTS_REQUIRE_SELECTION",
                    message: "Hay más de un audio adjunto verificable. La producción se detuvo para no elegir una pista arbitrariamente.",
                    audioHydration,
                    runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION
                };
            }
            const media = availableMediaState(audioHydration.args, context);
            const verifiedSceneAssetCount = media.assets
                .map(verifiedAsset)
                .filter(asset => asset && asset.mediaRole !== "brand_logo")
                .length;
            if (media.attempted && verifiedSceneAssetCount === 0 && !hasExplicitSceneMedia(audioHydration.args)) {
                return {
                    ok: false,
                    executionOk: true,
                    objectiveSatisfied: false,
                    blocked: true,
                    requiresInput: false,
                    retryable: false,
                    status: "REEL_REAL_MEDIA_UNAVAILABLE",
                    error: "WEB_MEDIA_COLLECT_RETURNED_NO_VERIFIED_SCENE_MEDIA",
                    message:
                        "web.media.collect se ejecutó, pero no entregó imágenes o videos verificables para escenas. Un logo declarado no se reutiliza como fondo genérico.",
                    mediaHydration: {
                        hydrated: false,
                        verifiedAssetCount: media.assets.length,
                        verifiedSceneAssetCount,
                        hydratedSceneCount: 0,
                        source: "web.media.collect"
                    },
                    runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION
                };
            }

            const semanticCoverage = reelSceneMediaCoverage(audioHydration.args);
            if (
                media.attempted === true &&
                verifiedSceneAssetCount > 0 &&
                semanticCoverage.complete !== true
            ) {
                return {
                    ok: false,
                    executionOk: true,
                    objectiveSatisfied: false,
                    blocked: true,
                    requiresInput: false,
                    retryable: true,
                    status: "REEL_MEDIA_SEMANTIC_BINDING_REQUIRED",
                    error: "WEB_MEDIA_REQUIRES_COMPLETE_SEMANTIC_SCENE_BINDING",
                    message: "Los medios web verificados existen, pero el storyboard no trae una selección semántica completa por escena. Se bloqueó el reparto automático por posición.",
                    semanticMediaCoverage: semanticCoverage,
                    mediaHydration: {
                        hydrated: false,
                        verifiedAssetCount: media.assets.length,
                        verifiedSceneAssetCount,
                        hydratedSceneCount: 0,
                        source: "web.media.collect"
                    },
                    runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION
                };
            }

            const hydration = hydrateReelArgs(audioHydration.args, media.assets);
            const result = await reelExecute(hydration.args, context);
            const checks =
                result?.checks ||
                result?.studioVerification?.checks ||
                result?.verification?.checks ||
                {};
            if (
                result?.ok === true &&
                hydration.verifiedAssetCount > 0 &&
                checks.sourceMediaRendering === false
            ) {
                return {
                    ...result,
                    ok: false,
                    executionOk: true,
                    objectiveSatisfied: false,
                    blocked: true,
                    status: "REEL_SOURCE_MEDIA_RENDERING_NOT_VERIFIED",
                    error: "REEL_SOURCE_MEDIA_RENDERING_NOT_VERIFIED",
                    mediaHydration: {
                        hydrated: hydration.hydrated,
                        verifiedAssetCount: hydration.verifiedAssetCount,
                        hydratedSceneCount: hydration.hydratedSceneCount,
                        source: "web.media.collect"
                    },
                    runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION
                };
            }
            return {
                ...result,
                audioHydration: {
                    ...(result?.audioHydration || {}),
                    hydrated: audioHydration.hydrated,
                    candidateCount: audioHydration.candidateCount,
                    source: audioHydration.source,
                    output: audioHydration.output || null
                },
                mediaHydration: {
                    ...(result?.mediaHydration || {}),
                    hydrated: hydration.hydrated || result?.mediaHydration?.hydrated === true,
                    verifiedAssetCount: Math.max(
                        hydration.verifiedAssetCount,
                        Number(result?.mediaHydration?.verifiedAssetCount || 0)
                    ),
                    verifiedSceneAssetCount: hydration.verifiedSceneAssetCount,
                    verifiedLogoAssetCount: hydration.verifiedLogoAssetCount,
                    hydratedSceneCount: Math.max(
                        hydration.hydratedSceneCount,
                        Number(result?.mediaHydration?.hydratedSceneCount || 0)
                    ),
                    logoHydrated: hydration.logoHydrated,
                    source:
                        hydration.hydrated || result?.mediaHydration?.hydrated === true
                            ? "web.media.collect"
                            : null
                },
                runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION
            };
        };

    const installation = {
        ok: true,
        active: true,
        version: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION,
        tools: ["web.media.collect", "reel.create"],
        installedAt: new Date().toISOString()
    };
    globalThis[INSTALL_KEY] = installation;
    globalThis.__NEXO_REAL_MEDIA_RUNTIME_GUARD_HEALTH__ = installation;
    return installation;
}

export function installNexoRealMediaRuntimeGuard({
    maximumAttempts = 160,
    intervalMs = 100
} = {}) {
    if (globalThis[INSTALL_KEY]?.active === true) {
        return Promise.resolve(globalThis[INSTALL_KEY]);
    }
    if (typeof window === "undefined") {
        return Promise.resolve({
            ok: true,
            active: false,
            environment: "non_browser",
            version: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION
        });
    }
    return new Promise(resolve => {
        let attempts = 0;
        const attempt = () => {
            attempts += 1;
            const runtime = runtimeCandidate();
            if (realMediaToolsReady(runtime)) {
                resolve(registerNexoRealMediaRuntimeGuard(runtime));
                return;
            }
            if (attempts >= maximumAttempts) {
                const failure = {
                    ok: false,
                    active: false,
                    status: "NEXO_RUNTIME_GUARD_TIMEOUT",
                    version: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION,
                    attempts
                };
                globalThis.__NEXO_REAL_MEDIA_RUNTIME_GUARD_HEALTH__ = failure;
                resolve(failure);
                return;
            }
            setTimeout(attempt, intervalMs);
        };
        attempt();
    });
}

export const __test = {
    verifiedAsset,
    payloadAssets,
    dedupeAssets,
    missionKeys,
    taskMediaState,
    attachmentManifest,
    verifiedAudioAttachment,
    verifiedSynthesizedAudioTask,
    hydrateReelAudioArgs,
    hasExplicitSceneMedia,
    hydrateReelArgs,
    realMediaToolsReady
};
