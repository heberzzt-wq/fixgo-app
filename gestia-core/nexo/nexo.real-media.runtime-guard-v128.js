export const NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION =
    "1.0.0-real-media-runtime-authority-v128";

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
    const current = args && typeof args === "object" && !Array.isArray(args)
        ? { ...args }
        : {};
    const scenes = Array.isArray(current.scenes)
        ? current.scenes.map(scene =>
            scene && typeof scene === "object" && !Array.isArray(scene)
                ? { ...scene }
                : scene
        )
        : [];
    const verified = dedupeAssets(assets.map(verifiedAsset).filter(Boolean));
    if (scenes.length === 0 || verified.length === 0) {
        return {
            args: current,
            hydrated: false,
            verifiedAssetCount: verified.length,
            hydratedSceneCount: 0
        };
    }
    const ordered = [
        ...verified.filter(asset => asset.kind === "video"),
        ...verified.filter(asset => asset.kind === "image")
    ];
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
                sha256: asset.sha256
            }
        };
    });
    return {
        args: { ...current, scenes: hydratedScenes },
        hydrated: assigned > 0,
        verifiedAssetCount: ordered.length,
        hydratedSceneCount: assigned
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

    runtime.register({
        ...collectorDefinition,
        version: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION,
        execute: async (args = {}, context = {}) => {
            const result = await collectorDefinition.execute(args, context);
            const remembered = rememberCollection(args, context, result);
            return {
                ...result,
                verifiedMediaCount: remembered.assets.length,
                runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION
            };
        }
    });

    runtime.register({
        ...reelDefinition,
        version: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION,
        execute: async (args = {}, context = {}) => {
            const media = availableMediaState(args, context);
            if (media.attempted && media.assets.length === 0) {
                return {
                    ok: false,
                    executionOk: true,
                    objectiveSatisfied: false,
                    blocked: true,
                    requiresInput: false,
                    retryable: false,
                    status: "REEL_REAL_MEDIA_UNAVAILABLE",
                    error: "WEB_MEDIA_COLLECT_RETURNED_NO_VERIFIED_MEDIA",
                    message:
                        "web.media.collect se ejecutó, pero no entregó imágenes o videos verificables. Se bloqueó la plantilla genérica para no presentarla como un reel con identidad real.",
                    mediaHydration: {
                        hydrated: false,
                        verifiedAssetCount: 0,
                        hydratedSceneCount: 0,
                        source: "web.media.collect"
                    },
                    runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION
                };
            }

            const hydration = hydrateReelArgs(args, media.assets);
            const result = await reelDefinition.execute(hydration.args, context);
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
                mediaHydration: {
                    ...(result?.mediaHydration || {}),
                    hydrated: hydration.hydrated || result?.mediaHydration?.hydrated === true,
                    verifiedAssetCount: Math.max(
                        hydration.verifiedAssetCount,
                        Number(result?.mediaHydration?.verifiedAssetCount || 0)
                    ),
                    hydratedSceneCount: Math.max(
                        hydration.hydratedSceneCount,
                        Number(result?.mediaHydration?.hydratedSceneCount || 0)
                    ),
                    source:
                        hydration.hydrated || result?.mediaHydration?.hydrated === true
                            ? "web.media.collect"
                            : null
                },
                runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION
            };
        }
    });

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
            const collector = previousDefinition(runtime, "web.media.collect");
            const reel = previousDefinition(runtime, "reel.create");
            const realMediaReady =
                typeof collector?.execute === "function" &&
                typeof reel?.execute === "function" &&
                String(collector?.version || "").includes("real-media-reel-hydration-v127") &&
                String(reel?.version || "").includes("real-media-reel-hydration-v127");
            if (realMediaReady) {
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
    hydrateReelArgs
};
