import {
    planMarketingRequest
} from "../jarvis/jarvis.marketing.engine.js?v=v94-source-grounded-research-v124-20260810";

export const NEXO_REAL_MEDIA_TOOLS_VERSION =
    "1.3.0-real-media-reel-hydration-v127";

const INSTALL_KEY = "__NEXO_REAL_MEDIA_TOOLS__";

const MARKETING_REQUIRED_FIELDS = Object.freeze([
    "audience", "offer", "pain", "promise", "differentiator", "cta",
    "market", "campaignObjective", "horizon", "tone", "channels",
    "metrics", "productionRequested"
]);

const MARKETING_FALLBACK_SCHEMA = Object.freeze({
    type: "object",
    required: [...MARKETING_REQUIRED_FIELDS],
    properties: {
        prompt: { type: "string" },
        brandName: { type: "string" },
        audience: { type: "string" },
        offer: { type: "string" },
        pain: { type: "string" },
        promise: { type: "string" },
        differentiator: { type: "string" },
        cta: { type: "string" },
        market: { type: "string" },
        campaignObjective: { type: "string" },
        horizon: { type: "string" },
        tone: { type: "string" },
        channels: { type: "array", items: { type: "string" } },
        metrics: { type: "array", items: { type: "string" } },
        productionRequested: { type: "boolean" },
        productionArtifacts: { type: "array", items: { type: "string" } },
        assets: { type: "array", items: { type: "string" } },
        durationSeconds: { type: "number" },
        objectiveId: { type: "string" },
        caseId: { type: "string" }
    },
    additionalProperties: true
});

function previousDefinition(runtime, name) {
    if (typeof runtime?.get === "function") return runtime.get(name);
    return runtime?._registry?.get?.(name) || null;
}

function marketingInputSchema(runtime) {
    const existing = previousDefinition(runtime, "marketing.plan")?.inputSchema;
    const required = Array.isArray(existing?.required) ? existing.required : [];
    if (
        existing?.type === "object" &&
        MARKETING_REQUIRED_FIELDS.every(field => required.includes(field))
    ) {
        return existing;
    }
    return MARKETING_FALLBACK_SCHEMA;
}

function runtimeCandidate() {
    return (
        globalThis.JarvisToolRuntime ||
        globalThis.window?.JarvisToolRuntime ||
        null
    );
}

function bridgeRequest(path, payload, timeoutMs = 120000) {
    const bridge =
        globalThis.JarvisLocalBridge ||
        globalThis.window?.JarvisLocalBridge ||
        null;
    if (typeof bridge?.requestJson !== "function") {
        return Promise.resolve({
            ok: false,
            executionOk: false,
            objectiveSatisfied: false,
            blocked: true,
            requiresInput: false,
            retryable: true,
            status: "LOCAL_BRIDGE_REQUIRED",
            error: "LOCAL_BRIDGE_REQUIRED"
        });
    }
    return bridge.requestJson(path, payload, { timeoutMs });
}

function instructionFrom(args = {}, context = {}) {
    return String(
        args.prompt ||
        args.instruction ||
        context.rawInput ||
        ""
    ).trim();
}

function missionTasks(context = {}) {
    return [
        ...(Array.isArray(context.completedTasks) ? context.completedTasks : []),
        ...(Array.isArray(context.blockedTasks) ? context.blockedTasks : [])
    ];
}

function completedTask(context = {}, name = "") {
    return [...missionTasks(context)]
        .reverse()
        .find(task => String(task?.name || "") === name) ||
        null;
}

function collectorEvidence(context = {}) {
    const task = completedTask(context, "web.media.collect");
    const evidence =
        task?.observation?.evidence ||
        task?.observation ||
        null;
    const assets = Array.isArray(evidence?.mediaAssets)
        ? evidence.mediaAssets
        : Array.isArray(task?.observation?.mediaAssets)
            ? task.observation.mediaAssets
            : [];
    return {
        task,
        evidence,
        assets,
        images: assets.filter(asset => asset?.kind === "image"),
        videos: assets.filter(asset => asset?.kind === "video")
    };
}

function marketingEvidence(context = {}) {
    const task = completedTask(context, "marketing.plan");
    return task?.observation?.evidence || task?.observation || null;
}

function verifiedCollectorAsset(asset = {}) {
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
    return (
        ["image", "video"].includes(kind) &&
        output.startsWith(".jarvis-artifacts/web-media/") &&
        !output.includes("../") &&
        mimeType.startsWith(`${kind}/`) &&
        Number.isFinite(bytes) &&
        bytes > 0 &&
        hashValid
    )
        ? {
            kind,
            output,
            mimeType,
            bytes,
            sha256,
            sourceUrl: String(asset?.sourceUrl || "").trim(),
            sourceTag: String(asset?.sourceTag || "").trim(),
            alt: String(asset?.alt || "").trim()
        }
        : null;
}

function hydrateReelArgsWithCollectorMedia(args = {}, context = {}) {
    const current =
        args && typeof args === "object" && !Array.isArray(args)
            ? { ...args }
            : {};
    const scenes = Array.isArray(current.scenes)
        ? current.scenes.map(scene =>
            scene && typeof scene === "object" && !Array.isArray(scene)
                ? { ...scene }
                : scene
        )
        : [];
    const verifiedAssets = collectorEvidence(context)
        .assets
        .map(verifiedCollectorAsset)
        .filter(Boolean);

    if (scenes.length === 0 || verifiedAssets.length === 0) {
        return {
            args: current,
            hydrated: false,
            assetCount: 0,
            sceneCount: scenes.length,
            assets: []
        };
    }

    const orderedAssets = [
        ...verifiedAssets.filter(asset => asset.kind === "video"),
        ...verifiedAssets.filter(asset => asset.kind === "image")
    ];
    let assigned = 0;
    const hydratedScenes = scenes.map((scene, index) => {
        if (!scene || typeof scene !== "object" || Array.isArray(scene)) return scene;
        const hasExplicitMedia = Boolean(
            String(scene.assetOutput || "").trim() ||
            String(scene.assetDataUrl || "").trim() ||
            String(scene.mediaUrl || "").trim()
        );
        if (hasExplicitMedia) return scene;
        const asset = orderedAssets[index % orderedAssets.length];
        if (!asset) return scene;
        assigned += 1;
        return {
            ...scene,
            assetOutput: asset.output,
            mediaType: asset.kind,
            sourceMedia: {
                origin: "web.media.collect",
                sourceUrl: asset.sourceUrl || null,
                sha256: asset.sha256,
                mimeType: asset.mimeType
            }
        };
    });

    return {
        args: {
            ...current,
            scenes: hydratedScenes
        },
        hydrated: assigned > 0,
        assetCount: orderedAssets.length,
        sceneCount: assigned,
        assets: orderedAssets
    };
}

function slug(value = "nexo-campaign") {
    return String(value || "nexo-campaign")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70) || "nexo-campaign";
}

function registerOrReplace(runtime, definition) {
    const previous = previousDefinition(runtime, definition?.name) || {};
    return runtime.register({
        ...previous,
        version: NEXO_REAL_MEDIA_TOOLS_VERSION,
        mutates: definition?.mutates ?? previous?.mutates ?? false,
        requiresApproval: definition?.requiresApproval ?? previous?.requiresApproval ?? false,
        ...definition,
        missionDedupeBy:
            definition?.missionDedupeBy ?? previous?.missionDedupeBy ?? null,
        missionIsolation:
            definition?.missionIsolation ?? previous?.missionIsolation ?? null
    });
}

export function registerNexoRealMediaTools(runtime = runtimeCandidate()) {
    if (!runtime || typeof runtime.register !== "function") {
        throw new Error("NEXO_TOOL_RUNTIME_REQUIRED");
    }

    const canonicalMarketingDefinition =
        previousDefinition(runtime, "marketing.plan");
    const canonicalReelDefinition =
        previousDefinition(runtime, "reel.create");

    registerOrReplace(runtime, {
        name: "marketing.plan",
        description:
            "NEXO produce una campaña específica desde una instrucción natural y evidencia opcional; completa propuestas editables sin inventar hechos.",
        output: "NEXO_MARKETING_PLAN",
        inputSchema: marketingInputSchema(runtime),
        execute: async (args = {}, context = {}) => {
            const instruction = instructionFrom(args, context);
            const canonicalExecute =
                typeof canonicalMarketingDefinition?.execute === "function"
                    ? canonicalMarketingDefinition.execute
                    : null;
            const result = canonicalExecute
                ? await canonicalExecute(args, context)
                : planMarketingRequest(instruction, {
                    ...context,
                    ...args,
                    authorityId: args.authorityId || context.authorityId || "HEBERTO_MENDOZA",
                    controllerId: args.controllerId || context.controllerId || "PENINSULA_NEXO"
                });
            return {
                ...result,
                objectiveSatisfied:
                    typeof result?.objectiveSatisfied === "boolean"
                        ? result.objectiveSatisfied
                        : result?.readyForProduction === true,
                requiresInput: result?.requiresInput === true,
                blocked: result?.blocked === true || result?.requiresInput === true,
                retryable: result?.retryable === true,
                error:
                    result?.ok === false
                        ? (result?.error || result?.status || "MARKETING_PLAN_FAILED")
                        : (result?.error || null),
                canonicalExecutorUsed: Boolean(canonicalExecute),
                runtimeOverride: NEXO_REAL_MEDIA_TOOLS_VERSION
            };
        }
    });

    if (typeof canonicalReelDefinition?.execute === "function") {
        registerOrReplace(runtime, {
            name: "reel.create",
            description:
                "Crea un reel 9:16 local y reutiliza automáticamente los medios reales verificados de la misma misión cuando el plan no haya asignado material visual explícito. No inventa logotipos ni sustituye medios ya elegidos. El audio sólo se incorpora cuando existe un artefacto de audio explícito; este actuador no genera TTS.",
            execute: async (args = {}, context = {}) => {
                const hydration =
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
            }
        });
    }

    registerOrReplace(runtime, {
        name: "web.media.collect",
        description:
            "Descarga fotos y videos reales desde una URL explícita, valida host, MIME, firma de bytes, tamaño y SHA-256, y conserva un manifiesto local. Nunca genera material sintético.",
        output: "NEXO_REAL_WEB_MEDIA",
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
                requireVideos: { type: "boolean" },
                maxImages: { type: "number" },
                maxVideos: { type: "number" },
                allowedHosts: { type: "array", items: { type: "string" } },
                timeoutMs: { type: "number" },
                objectiveId: { type: "string" },
                caseId: { type: "string" }
            },
            additionalProperties: false
        },
        execute: async (args = {}, context = {}) => {
            const result = await bridgeRequest("/web/media/collect", {
                ...args,
                objectiveId: args.objectiveId || context.objectiveId || "",
                caseId: args.caseId || context.caseId || ""
            }, Math.max(60000, Number(args.timeoutMs) || 120000));
            return {
                ...result,
                objectiveSatisfied: result?.ok === true && result?.requirementsMet === true,
                blocked: result?.ok !== true || result?.requirementsMet !== true,
                requiresInput: false,
                retryable: result?.status === "LOCAL_BRIDGE_REQUIRED"
            };
        }
    });

    registerOrReplace(runtime, {
        name: "marketing.package.real-media",
        description:
            "Crea un manifiesto de campaña que enlaza el plan de marketing con los archivos reales verificados por web.media.collect. Falla cerrado si faltan los bytes solicitados.",
        output: "NEXO_REAL_MEDIA_MARKETING_PACKAGE",
        mutates: true,
        requiresApproval: false,
        userArtifact: true,
        missionDedupeBy: ["sourceUrl"],
        inputSchema: {
            type: "object",
            required: ["sourceUrl"],
            properties: {
                sourceUrl: { type: "string" },
                title: { type: "string" },
                requireImages: { type: "boolean" },
                requireVideos: { type: "boolean" },
                output: { type: "string" },
                objectiveId: { type: "string" },
                caseId: { type: "string" }
            },
            additionalProperties: false
        },
        execute: async (args = {}, context = {}) => {
            const media = collectorEvidence(context);
            const hasImages = media.images.length > 0;
            const hasVideos = media.videos.length > 0;
            const requirementsMet =
                (args.requireImages !== true || hasImages) &&
                (args.requireVideos !== true || hasVideos);

            if (!requirementsMet) {
                return {
                    ok: false,
                    executionOk: true,
                    objectiveSatisfied: false,
                    blocked: true,
                    requiresInput: false,
                    retryable: false,
                    status: "REAL_MEDIA_PACKAGE_REQUIREMENTS_UNMET",
                    sourceUrl: args.sourceUrl,
                    requirements: {
                        requireImages: args.requireImages === true,
                        requireVideos: args.requireVideos === true
                    },
                    counts: {
                        images: media.images.length,
                        videos: media.videos.length
                    }
                };
            }

            const title = String(args.title || "NEXO - Paquete de marketing con medios reales").trim();
            const packageData = {
                engine: "NEXO",
                version: NEXO_REAL_MEDIA_TOOLS_VERSION,
                sourceUrl: args.sourceUrl,
                generatedAt: new Date().toISOString(),
                requirements: {
                    requireImages: args.requireImages === true,
                    requireVideos: args.requireVideos === true
                },
                counts: {
                    images: media.images.length,
                    videos: media.videos.length,
                    total: media.assets.length
                },
                mediaAssets: media.assets,
                marketingPlan: marketingEvidence(context),
                policy: {
                    syntheticMediaSubstitutionAllowed: false,
                    sourceBytesRequired: true,
                    sha256Required: true,
                    publicationAllowed: false,
                    ownerApprovalRequiredForPublication: true
                }
            };
            const result = await bridgeRequest("/artifact/json/create", {
                type: "campaign",
                slug: slug(title),
                output: args.output,
                data: packageData,
                origin: "marketing.package.real-media",
                provider: "nexo",
                caseId: args.caseId || context.caseId || "",
                objectiveId: args.objectiveId || context.objectiveId || "",
                approved: true,
                approvedBy: "LOCAL_ARTIFACT_POLICY",
                publishable: false,
                originalFile: args.sourceUrl
            }, 60000);

            return {
                ...result,
                status: result?.ok === true
                    ? "REAL_MEDIA_MARKETING_PACKAGE_CREATED"
                    : result?.status || "REAL_MEDIA_MARKETING_PACKAGE_FAILED",
                objectiveSatisfied: result?.ok === true,
                blocked: result?.ok !== true,
                requiresInput: false,
                retryable: result?.status === "LOCAL_BRIDGE_REQUIRED",
                sourceUrl: args.sourceUrl,
                counts: packageData.counts,
                mediaAssets: media.assets
            };
        }
    });

    const installation = {
        ok: true,
        active: true,
        version: NEXO_REAL_MEDIA_TOOLS_VERSION,
        tools: [
            "marketing.plan",
            "web.media.collect",
            "marketing.package.real-media",
            ...(typeof canonicalReelDefinition?.execute === "function" ? ["reel.create"] : [])
        ],
        installedAt: new Date().toISOString()
    };
    globalThis[INSTALL_KEY] = installation;
    globalThis.__NEXO_REAL_MEDIA_TOOLS_HEALTH__ = installation;
    return installation;
}

export function installNexoRealMediaTools({ maximumAttempts = 120, intervalMs = 100 } = {}) {
    if (globalThis[INSTALL_KEY]) return Promise.resolve(globalThis[INSTALL_KEY]);
    if (typeof window === "undefined") {
        return Promise.resolve({
            ok: true,
            active: false,
            environment: "non_browser",
            version: NEXO_REAL_MEDIA_TOOLS_VERSION
        });
    }

    return new Promise(resolve => {
        let attempts = 0;
        const attempt = () => {
            attempts += 1;
            const runtime = runtimeCandidate();
            if (
                runtime?.has?.("marketing.plan") &&
                runtime?.has?.("reel.create")
            ) {
                resolve(registerNexoRealMediaTools(runtime));
                return;
            }
            if (attempts >= maximumAttempts) {
                const failure = {
                    ok: false,
                    active: false,
                    status: "NEXO_TOOL_RUNTIME_TIMEOUT",
                    version: NEXO_REAL_MEDIA_TOOLS_VERSION,
                    attempts
                };
                globalThis.__NEXO_REAL_MEDIA_TOOLS_HEALTH__ = failure;
                resolve(failure);
                return;
            }
            setTimeout(attempt, intervalMs);
        };
        attempt();
    });
}

export const __test = {
    instructionFrom,
    completedTask,
    collectorEvidence,
    marketingEvidence,
    verifiedCollectorAsset,
    hydrateReelArgsWithCollectorMedia,
    slug
};
