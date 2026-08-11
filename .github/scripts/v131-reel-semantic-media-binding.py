from pathlib import Path


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, got {count}")
    return source.replace(old, new, 1)


binder = r'''export const JARVIS_REEL_MEDIA_BINDER_VERSION =
    "1.0.0-semantic-scene-media-authority-v131";

function clean(value = "") {
    return typeof value === "string" ? value.trim() : "";
}

function validSha256(value = "") {
    const hash = clean(value).toLowerCase();
    return hash.length === 64 && [...hash].every(character =>
        (character >= "0" && character <= "9") ||
        (character >= "a" && character <= "f")
    );
}

function verifiedSceneAsset(asset = {}) {
    const kind = clean(asset?.kind).toLowerCase();
    const output = clean(asset?.output).replaceAll("\\", "/");
    const mimeType = clean(asset?.mimeType).toLowerCase();
    const bytes = Number(asset?.bytes || 0);
    const sha256 = clean(asset?.sha256).toLowerCase();
    const mediaRole = clean(asset?.mediaRole) === "brand_logo"
        ? "brand_logo"
        : "scene";
    if (
        !["image", "video"].includes(kind) ||
        mediaRole === "brand_logo" ||
        !output.startsWith(".jarvis-artifacts/web-media/") ||
        output.includes("../") ||
        !mimeType.startsWith(`${kind}/`) ||
        !Number.isFinite(bytes) ||
        bytes <= 0 ||
        !validSha256(sha256)
    ) {
        return null;
    }
    return {
        kind,
        output,
        mimeType,
        bytes,
        sha256,
        mediaRole,
        sourceUrl: clean(asset?.sourceUrl),
        sourceTag: clean(asset?.sourceTag),
        alt: clean(asset?.alt)
    };
}

function payloadAssets(payload = {}) {
    return [
        payload?.mediaAssets,
        payload?.assets,
        payload?.evidence?.mediaAssets,
        payload?.data?.mediaAssets,
        payload?.runtimeResult?.mediaAssets,
        payload?.runtimeResult?.data?.mediaAssets
    ]
        .filter(Array.isArray)
        .flat();
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

export function reelMediaCollectionState(context = {}) {
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
}

export function buildReelMediaBindingPrompt({
    scenes = [],
    assets = []
} = {}) {
    const sceneCatalog = (Array.isArray(scenes) ? scenes : [])
        .map((scene, index) => ({
            sceneId: Number(scene?.id || index + 1),
            visual: clean(scene?.visual || scene?.visualDescription),
            overlay: clean(scene?.overlay),
            voiceover: clean(scene?.voiceover || scene?.subtitle),
            evidence: clean(scene?.evidence)
        }));
    const mediaCatalog = (Array.isArray(assets) ? assets : [])
        .map((asset, index) => ({
            mediaId: `MEDIA_${index + 1}`,
            kind: asset.kind,
            alt: asset.alt || "",
            sourceTag: asset.sourceTag || "",
            sourceUrl: asset.sourceUrl || ""
        }));
    return [
        "ASIGNACION_SEMANTICA_DE_MEDIOS_PARA_REEL",
        "Relaciona cada escena con el medio verificado que mejor corresponda por significado al visual, overlay, voz y evidencia de esa escena.",
        "No uses coincidencias lexicas locales ni reglas por posicion. Esta decision debe ser semantica.",
        "Solo puedes elegir mediaId presentes en CATALOGO_MEDIOS. Nunca inventes IDs, URLs, archivos, hechos ni contenido visual no descrito por la metadata disponible.",
        "Cada sceneId debe aparecer exactamente una vez.",
        "Si hay al menos tantos medios como escenas, usa un medio distinto por escena.",
        "Si hay menos medios que escenas, distribuye las repeticiones de forma equilibrada y evita concentrar un medio si existe otra alternativa verificada.",
        "Devuelve solamente JSON estricto con esta forma: {\"bindings\":[{\"sceneId\":1,\"mediaId\":\"MEDIA_1\",\"reason\":\"...\"}]}",
        `CATALOGO_ESCENAS=${JSON.stringify(sceneCatalog)}`,
        `CATALOGO_MEDIOS=${JSON.stringify(mediaCatalog)}`
    ].join("\n");
}

export function validateReelMediaBindings({
    scenes = [],
    assets = [],
    decision = {}
} = {}) {
    const sourceScenes = Array.isArray(scenes) ? scenes : [];
    const sourceAssets = Array.isArray(assets)
        ? assets.map(verifiedSceneAsset).filter(Boolean)
        : [];
    const bindings = Array.isArray(decision?.bindings)
        ? decision.bindings
        : [];
    if (sourceScenes.length < 1 || sourceAssets.length < 1) {
        return { ok: false, status: "REEL_MEDIA_BINDING_INPUT_REQUIRED" };
    }
    if (bindings.length !== sourceScenes.length) {
        return {
            ok: false,
            status: "REEL_MEDIA_BINDING_COVERAGE_INVALID",
            expectedScenes: sourceScenes.length,
            receivedBindings: bindings.length
        };
    }
    const mediaById = new Map(
        sourceAssets.map((asset, index) => [`MEDIA_${index + 1}`, asset])
    );
    const expectedSceneIds = sourceScenes.map((scene, index) =>
        Number(scene?.id || index + 1)
    );
    const expectedSceneSet = new Set(expectedSceneIds);
    const seenScenes = new Set();
    const uses = new Map();
    const normalized = [];
    for (const binding of bindings) {
        const sceneId = Number(binding?.sceneId);
        const mediaId = clean(binding?.mediaId);
        if (
            !Number.isInteger(sceneId) ||
            !expectedSceneSet.has(sceneId) ||
            seenScenes.has(sceneId)
        ) {
            return { ok: false, status: "REEL_MEDIA_BINDING_SCENE_INVALID", sceneId };
        }
        const asset = mediaById.get(mediaId);
        if (!asset) {
            return { ok: false, status: "REEL_MEDIA_BINDING_MEDIA_INVALID", sceneId, mediaId };
        }
        seenScenes.add(sceneId);
        uses.set(mediaId, Number(uses.get(mediaId) || 0) + 1);
        normalized.push({
            sceneId,
            mediaId,
            reason: clean(binding?.reason).slice(0, 500),
            asset
        });
    }
    if (seenScenes.size !== expectedSceneIds.length) {
        return { ok: false, status: "REEL_MEDIA_BINDING_COVERAGE_INVALID" };
    }
    const maxUse = Math.ceil(sourceScenes.length / Math.min(sourceScenes.length, sourceAssets.length));
    const overloaded = [...uses.entries()].find(([, count]) => count > maxUse);
    if (overloaded) {
        return {
            ok: false,
            status: "REEL_MEDIA_BINDING_DIVERSITY_INVALID",
            mediaId: overloaded[0],
            useCount: overloaded[1],
            maxUse
        };
    }
    const bindingByScene = new Map(normalized.map(item => [item.sceneId, item]));
    const boundScenes = sourceScenes.map((scene, index) => {
        const sceneId = Number(scene?.id || index + 1);
        const binding = bindingByScene.get(sceneId);
        return {
            ...scene,
            assetOutput: binding.asset.output,
            mediaType: binding.asset.kind,
            sourceMedia: {
                origin: "web.media.collect",
                selection: "semantic_scene_media_binding_v131",
                mediaId: binding.mediaId,
                sourceUrl: binding.asset.sourceUrl || null,
                sourceTag: binding.asset.sourceTag || null,
                mimeType: binding.asset.mimeType,
                sha256: binding.asset.sha256,
                reason: binding.reason || null
            }
        };
    });
    return {
        ok: true,
        status: "REEL_MEDIA_SEMANTIC_BINDING_VALIDATED",
        scenes: boundScenes,
        bindingCount: normalized.length,
        assetCount: sourceAssets.length,
        maxUse,
        uses: Object.fromEntries(uses),
        bindings: normalized.map(item => ({
            sceneId: item.sceneId,
            mediaId: item.mediaId,
            reason: item.reason,
            output: item.asset.output,
            kind: item.asset.kind,
            sha256: item.asset.sha256
        }))
    };
}

export function reelSceneMediaCoverage(args = {}) {
    const scenes = Array.isArray(args?.scenes) ? args.scenes : [];
    const bound = scenes.filter(scene =>
        scene && typeof scene === "object" && !Array.isArray(scene) && Boolean(
            clean(scene.assetOutput) ||
            clean(scene.assetDataUrl) ||
            clean(scene.mediaUrl)
        )
    ).length;
    return {
        totalScenes: scenes.length,
        boundScenes: bound,
        missingScenes: Math.max(0, scenes.length - bound),
        complete: scenes.length > 0 && bound === scenes.length
    };
}
'''

Path("gestia-core/jarvis/jarvis.reel.media-binder.js").write_text(binder)

# Multitool pack: import binder, bump version, and bind at reel.plan execution time.
path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
source = path.read_text()
source = replace_once(
    source,
    '''import {\n    extractDocumentContract,\n    validateDocumentBlueprint\n} from "./jarvis.document.validator.js?v=sia7-exact-template-contract-v84-20260725";\n\nconst VERSION = "1.54.0-marketing-actuator-bridge-v126";''',
    '''import {\n    extractDocumentContract,\n    validateDocumentBlueprint\n} from "./jarvis.document.validator.js?v=sia7-exact-template-contract-v84-20260725";\nimport {\n    buildReelMediaBindingPrompt,\n    reelMediaCollectionState,\n    validateReelMediaBindings\n} from "./jarvis.reel.media-binder.js?v=v131-semantic-scene-media-authority-20260811";\n\nconst VERSION = "1.55.0-reel-semantic-media-binding-v131";''',
    "multitool binder import"
)
old = '''                return {\n                    ...result,\n                    objectiveSatisfied: result?.ok === true,\n                    requiresInput: result?.ok !== true,\n                    missingInputs: result?.ok === true ? [] : result?.missingInformation || [],\n                    semanticEnrichment: semanticEnrichment\n                        ? {\n                            used: true,\n                            provider: semanticEnrichment.provider,\n                            model: semanticEnrichment.model,\n                            sourceCount: semanticEnrichment.sourceCount\n                        }\n                        : {\n                            used: false\n                        }\n                };\n            }\n        }),\n        register(runtime, {\n            name: "media.analyze",'''
new = '''                let semanticMediaBinding = {\n                    used: false\n                };\n                if (result?.ok === true) {\n                    const requiredTools = Array.isArray(context?.requiredToolNames)\n                        ? context.requiredToolNames.map(String)\n                        : [];\n                    const collectionRequired = requiredTools.includes("web.media.collect");\n                    const collection = reelMediaCollectionState(context);\n                    if (collectionRequired && collection.attempted !== true) {\n                        return {\n                            ...result,\n                            ok: false,\n                            executionOk: true,\n                            objectiveSatisfied: false,\n                            blocked: false,\n                            retryable: true,\n                            requiresInput: false,\n                            status: "REEL_MEDIA_COLLECTION_REQUIRED_BEFORE_PLAN",\n                            error: "WEB_MEDIA_COLLECT_MUST_COMPLETE_BEFORE_REEL_PLAN",\n                            missingInputs: [],\n                            semanticMediaBinding: {\n                                used: false,\n                                waitingFor: "web.media.collect"\n                            }\n                        };\n                    }\n                    if (collection.attempted === true && collection.assets.length < 1) {\n                        return {\n                            ...result,\n                            ok: false,\n                            executionOk: true,\n                            objectiveSatisfied: false,\n                            blocked: true,\n                            retryable: false,\n                            requiresInput: false,\n                            status: "REEL_VERIFIED_SCENE_MEDIA_REQUIRED",\n                            error: "WEB_MEDIA_COLLECT_RETURNED_NO_VERIFIED_SCENE_MEDIA",\n                            missingInputs: [],\n                            semanticMediaBinding: { used: false, assetCount: 0 }\n                        };\n                    }\n                    if (collection.assets.length > 0) {\n                        let semanticBindingResult = null;\n                        let decision = null;\n                        try {\n                            semanticBindingResult = await fetchSemanticConversation(\n                                buildReelMediaBindingPrompt({\n                                    scenes: result.scenes,\n                                    assets: collection.assets\n                                }),\n                                { maxOutputTokens: 2800 }\n                            );\n                            if (semanticBindingResult?.ok !== true) {\n                                throw new Error(\n                                    semanticBindingResult?.error ||\n                                    semanticBindingResult?.status ||\n                                    "REEL_MEDIA_BINDING_MODEL_UNAVAILABLE"\n                                );\n                            }\n                            decision = extractSemanticJsonObject(\n                                semanticBindingResult?.message ||\n                                ""\n                            );\n                        }\n                        catch(error) {\n                            return {\n                                ...result,\n                                ok: false,\n                                executionOk: true,\n                                objectiveSatisfied: false,\n                                blocked: false,\n                                retryable: true,\n                                requiresInput: false,\n                                status: "REEL_MEDIA_SEMANTIC_BINDING_FAILED",\n                                error: error?.message || "REEL_MEDIA_SEMANTIC_BINDING_FAILED",\n                                semanticMediaBinding: {\n                                    used: true,\n                                    validated: false,\n                                    assetCount: collection.assets.length,\n                                    provider: semanticBindingResult?.provider || null,\n                                    model: semanticBindingResult?.model || null\n                                }\n                            };\n                        }\n                        const validation = validateReelMediaBindings({\n                            scenes: result.scenes,\n                            assets: collection.assets,\n                            decision\n                        });\n                        if (validation.ok !== true) {\n                            return {\n                                ...result,\n                                ok: false,\n                                executionOk: true,\n                                objectiveSatisfied: false,\n                                blocked: false,\n                                retryable: true,\n                                requiresInput: false,\n                                status: "REEL_MEDIA_SEMANTIC_BINDING_FAILED",\n                                error: validation.status || "REEL_MEDIA_SEMANTIC_BINDING_FAILED",\n                                semanticMediaBinding: {\n                                    used: true,\n                                    validated: false,\n                                    validationStatus: validation.status || null,\n                                    assetCount: collection.assets.length,\n                                    provider: semanticBindingResult?.provider || null,\n                                    model: semanticBindingResult?.model || null\n                                }\n                            };\n                        }\n                        semanticMediaBinding = {\n                            used: true,\n                            validated: true,\n                            version: "semantic_scene_media_authority_v131",\n                            assetCount: validation.assetCount,\n                            bindingCount: validation.bindingCount,\n                            maxUse: validation.maxUse,\n                            bindings: validation.bindings,\n                            provider: semanticBindingResult?.provider || null,\n                            model: semanticBindingResult?.model || null\n                        };\n                        result = {\n                            ...result,\n                            scenes: validation.scenes,\n                            mediaBinding: semanticMediaBinding\n                        };\n                    }\n                }\n                return {\n                    ...result,\n                    objectiveSatisfied: result?.ok === true,\n                    requiresInput: result?.ok !== true,\n                    missingInputs: result?.ok === true ? [] : result?.missingInformation || [],\n                    semanticEnrichment: semanticEnrichment\n                        ? {\n                            used: true,\n                            provider: semanticEnrichment.provider,\n                            model: semanticEnrichment.model,\n                            sourceCount: semanticEnrichment.sourceCount\n                        }\n                        : {\n                            used: false\n                        },\n                    semanticMediaBinding\n                };\n            }\n        }),\n        register(runtime, {\n            name: "media.analyze",'''
source = replace_once(source, old, new, "reel.plan semantic binding")
path.write_text(source)

# Runtime guard: web-collected scene media may not fall back to round-robin anymore.
path = Path("gestia-core/nexo/nexo.real-media.runtime-guard-v128.js")
source = path.read_text()
source = replace_once(
    source,
    '''export const NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION =\n    "1.1.0-brand-role-audio-authority-v130";''',
    '''import {\n    reelSceneMediaCoverage\n} from "../jarvis/jarvis.reel.media-binder.js?v=v131-semantic-scene-media-authority-20260811";\n\nexport const NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION =\n    "1.2.0-semantic-scene-media-authority-v131";''',
    "runtime binder import"
)
anchor = '''            const hydration = hydrateReelArgs(audioHydration.args, media.assets);\n            const result = await reelDefinition.execute(hydration.args, context);'''
replacement = '''            const semanticCoverage = reelSceneMediaCoverage(audioHydration.args);\n            if (\n                media.attempted === true &&\n                verifiedSceneAssetCount > 0 &&\n                semanticCoverage.complete !== true\n            ) {\n                return {\n                    ok: false,\n                    executionOk: true,\n                    objectiveSatisfied: false,\n                    blocked: true,\n                    requiresInput: false,\n                    retryable: true,\n                    status: "REEL_MEDIA_SEMANTIC_BINDING_REQUIRED",\n                    error: "WEB_MEDIA_REQUIRES_COMPLETE_SEMANTIC_SCENE_BINDING",\n                    message: "Los medios web verificados existen, pero el storyboard no trae una selección semántica completa por escena. Se bloqueó el reparto automático por posición.",\n                    semanticMediaCoverage: semanticCoverage,\n                    mediaHydration: {\n                        hydrated: false,\n                        verifiedAssetCount: media.assets.length,\n                        verifiedSceneAssetCount,\n                        hydratedSceneCount: 0,\n                        source: "web.media.collect"\n                    },\n                    runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION\n                };\n            }\n\n            const hydration = hydrateReelArgs(audioHydration.args, media.assets);\n            const result = await reelDefinition.execute(hydration.args, context);'''
source = replace_once(source, anchor, replacement, "runtime semantic coverage")
source = replace_once(
    source,
    '''                runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION\n            };''',
    '''                semanticMediaCoverage: reelSceneMediaCoverage(hydration.args),\n                runtimeMediaAuthority: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION\n            };''',
    "runtime result coverage"
)
path.write_text(source)

# Cache-bust terminal bootstrap for v131 guard.
path = Path("modules/terminal/nexo-bootstrap.js")
source = path.read_text()
source = replace_once(
    source,
    '''export const NEXO_TERMINAL_BOOTSTRAP_VERSION =\n    "1.6.0-real-media-runtime-authority-v128";''',
    '''export const NEXO_TERMINAL_BOOTSTRAP_VERSION =\n    "1.7.0-semantic-reel-media-authority-v131";''',
    "bootstrap version"
)
source = replace_once(
    source,
    '''"../../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js?v=v94-real-media-runtime-authority-v128-20260811"''',
    '''"../../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js?v=v131-semantic-scene-media-authority-20260811"''',
    "bootstrap guard cache bust"
)
path.write_text(source)

# Pure binder regressions.
Path("tests/jarvis-reel-media-binder-v131.test.mjs").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";

import {
    buildReelMediaBindingPrompt,
    reelMediaCollectionState,
    reelSceneMediaCoverage,
    validateReelMediaBindings
} from "../gestia-core/jarvis/jarvis.reel.media-binder.js";

const sceneAssets = [
    {
        kind: "video",
        output: ".jarvis-artifacts/web-media/source.example/1/work.mp4",
        mimeType: "video/mp4",
        bytes: 900000,
        sha256: "a".repeat(64),
        sourceUrl: "https://cdn.example/work.mp4",
        sourceTag: "og:video",
        alt: "Técnico trabajando",
        mediaRole: "scene"
    },
    {
        kind: "image",
        output: ".jarvis-artifacts/web-media/source.example/1/team.jpg",
        mimeType: "image/jpeg",
        bytes: 250000,
        sha256: "b".repeat(64),
        sourceUrl: "https://cdn.example/team.jpg",
        sourceTag: "og:image",
        alt: "Equipo de servicio",
        mediaRole: "scene"
    },
    {
        kind: "image",
        output: ".jarvis-artifacts/web-media/source.example/1/result.jpg",
        mimeType: "image/jpeg",
        bytes: 260000,
        sha256: "c".repeat(64),
        sourceUrl: "https://cdn.example/result.jpg",
        sourceTag: "img",
        alt: "Resultado final",
        mediaRole: "scene"
    }
];

const logo = {
    kind: "image",
    output: ".jarvis-artifacts/web-media/source.example/1/logo.jpg",
    mimeType: "image/jpeg",
    bytes: 120000,
    sha256: "d".repeat(64),
    sourceUrl: "https://cdn.example/logo.jpg",
    sourceTag: "jsonld:logo",
    mediaRole: "brand_logo"
};

const scenes = [
    { id: 1, durationSeconds: 10, visual: "Trabajo en sitio", overlay: "Diagnóstico" },
    { id: 2, durationSeconds: 10, visual: "Equipo humano", overlay: "Atención" },
    { id: 3, durationSeconds: 10, visual: "Resultado terminado", overlay: "Resultado" }
];

test("v131 extracts verified scene media from completed collection and excludes brand logo", () => {
    const state = reelMediaCollectionState({
        completedTasks: [{
            name: "web.media.collect",
            observation: { mediaAssets: [logo, ...sceneAssets] }
        }]
    });
    assert.equal(state.attempted, true);
    assert.equal(state.assets.length, 3);
    assert.equal(state.assets.some(asset => asset.output === logo.output), false);
});

test("v131 semantic prompt exposes stable media ids without handing semantic authority an output choice", () => {
    const prompt = buildReelMediaBindingPrompt({ scenes, assets: sceneAssets });
    assert.match(prompt, /MEDIA_1/);
    assert.match(prompt, /CATALOGO_ESCENAS=/);
    assert.match(prompt, /CATALOGO_MEDIOS=/);
    assert.match(prompt, /No uses coincidencias lexicas locales/);
});

test("v131 validates complete diverse semantic bindings and applies only verified outputs", () => {
    const validated = validateReelMediaBindings({
        scenes,
        assets: sceneAssets,
        decision: {
            bindings: [
                { sceneId: 1, mediaId: "MEDIA_1", reason: "Trabajo" },
                { sceneId: 2, mediaId: "MEDIA_2", reason: "Equipo" },
                { sceneId: 3, mediaId: "MEDIA_3", reason: "Resultado" }
            ]
        }
    });
    assert.equal(validated.ok, true);
    assert.equal(validated.scenes[0].assetOutput, sceneAssets[0].output);
    assert.equal(validated.scenes[1].mediaType, "image");
    assert.equal(validated.scenes[2].sourceMedia.selection, "semantic_scene_media_binding_v131");
    assert.equal(reelSceneMediaCoverage({ scenes: validated.scenes }).complete, true);
});

test("v131 rejects invented media ids and incomplete semantic coverage", () => {
    const invented = validateReelMediaBindings({
        scenes,
        assets: sceneAssets,
        decision: {
            bindings: [
                { sceneId: 1, mediaId: "MEDIA_99" },
                { sceneId: 2, mediaId: "MEDIA_2" },
                { sceneId: 3, mediaId: "MEDIA_3" }
            ]
        }
    });
    assert.equal(invented.ok, false);
    assert.equal(invented.status, "REEL_MEDIA_BINDING_MEDIA_INVALID");
    const incomplete = validateReelMediaBindings({
        scenes,
        assets: sceneAssets,
        decision: { bindings: [{ sceneId: 1, mediaId: "MEDIA_1" }] }
    });
    assert.equal(incomplete.status, "REEL_MEDIA_BINDING_COVERAGE_INVALID");
});

test("v131 rejects concentrated repetition when verified alternatives exist", () => {
    const fourScenes = [
        ...scenes,
        { id: 4, durationSeconds: 10, visual: "Cierre", overlay: "Contacto" }
    ];
    const validated = validateReelMediaBindings({
        scenes: fourScenes,
        assets: sceneAssets.slice(0, 2),
        decision: {
            bindings: [
                { sceneId: 1, mediaId: "MEDIA_1" },
                { sceneId: 2, mediaId: "MEDIA_1" },
                { sceneId: 3, mediaId: "MEDIA_1" },
                { sceneId: 4, mediaId: "MEDIA_2" }
            ]
        }
    });
    assert.equal(validated.ok, false);
    assert.equal(validated.status, "REEL_MEDIA_BINDING_DIVERSITY_INVALID");
});
''')

# Runtime behavior: collected web media cannot be completed with positional hydration.
Path("tests/nexo-real-media-semantic-binding-v131.test.mjs").write_text(r'''import assert from "node:assert/strict";
import test from "node:test";

import {
    registerNexoRealMediaRuntimeGuard
} from "../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js";

function runtimeFixture() {
    const registry = new Map();
    return {
        _registry: registry,
        register(definition) {
            registry.set(definition.name, definition);
            return definition;
        },
        get(name) {
            return registry.get(name);
        }
    };
}

const assetA = {
    kind: "image",
    output: ".jarvis-artifacts/web-media/source.example/1/a.jpg",
    mimeType: "image/jpeg",
    bytes: 220000,
    sha256: "a".repeat(64),
    sourceUrl: "https://cdn.example/a.jpg",
    sourceTag: "og:image",
    mediaRole: "scene"
};
const assetB = {
    ...assetA,
    output: ".jarvis-artifacts/web-media/source.example/1/b.jpg",
    sha256: "b".repeat(64),
    sourceUrl: "https://cdn.example/b.jpg"
};

test("v131 runtime blocks positional fallback when collected web media lacks complete semantic scene binding", async () => {
    delete globalThis.__NEXO_REAL_MEDIA_RUNTIME_GUARD_V128__;
    delete globalThis.__NEXO_REAL_MEDIA_MISSION_CACHE_V128__;
    const runtime = runtimeFixture();
    let reelCalls = 0;
    runtime.register({
        name: "web.media.collect",
        execute: async () => ({
            ok: true,
            status: "WEB_REAL_MEDIA_COLLECTED",
            mediaAssets: [assetA, assetB]
        })
    });
    runtime.register({
        name: "reel.create",
        execute: async args => {
            reelCalls += 1;
            return {
                ok: true,
                status: "REEL_VIDEO_CREATED_VERIFIED",
                received: args,
                checks: { sourceMediaRendering: true }
            };
        }
    });
    registerNexoRealMediaRuntimeGuard(runtime);
    await runtime.get("web.media.collect").execute(
        { objectiveId: "OBJ-V131" },
        { objectiveId: "OBJ-V131" }
    );
    const blocked = await runtime.get("reel.create").execute({
        objectiveId: "OBJ-V131",
        scenes: [
            { durationSeconds: 10, overlay: "Uno", assetOutput: assetA.output, mediaType: "image" },
            { durationSeconds: 10, overlay: "Dos" },
            { durationSeconds: 10, overlay: "Tres" }
        ]
    }, { objectiveId: "OBJ-V131" });
    assert.equal(blocked.status, "REEL_MEDIA_SEMANTIC_BINDING_REQUIRED");
    assert.equal(blocked.semanticMediaCoverage.complete, false);
    assert.equal(reelCalls, 0);
});

test("v131 runtime allows a fully semantically bound storyboard to reach reel.create", async () => {
    delete globalThis.__NEXO_REAL_MEDIA_RUNTIME_GUARD_V128__;
    delete globalThis.__NEXO_REAL_MEDIA_MISSION_CACHE_V128__;
    const runtime = runtimeFixture();
    let received = null;
    runtime.register({
        name: "web.media.collect",
        execute: async () => ({ ok: true, mediaAssets: [assetA, assetB] })
    });
    runtime.register({
        name: "reel.create",
        execute: async args => {
            received = args;
            return {
                ok: true,
                status: "REEL_VIDEO_CREATED_VERIFIED",
                checks: { sourceMediaRendering: true }
            };
        }
    });
    registerNexoRealMediaRuntimeGuard(runtime);
    await runtime.get("web.media.collect").execute(
        { objectiveId: "OBJ-V131-OK" },
        { objectiveId: "OBJ-V131-OK" }
    );
    const result = await runtime.get("reel.create").execute({
        objectiveId: "OBJ-V131-OK",
        scenes: [
            { durationSeconds: 10, overlay: "Uno", assetOutput: assetA.output, mediaType: "image" },
            { durationSeconds: 10, overlay: "Dos", assetOutput: assetB.output, mediaType: "image" },
            { durationSeconds: 10, overlay: "Tres", assetOutput: assetA.output, mediaType: "image" }
        ]
    }, { objectiveId: "OBJ-V131-OK" });
    assert.equal(result.ok, true);
    assert.equal(result.semanticMediaCoverage.complete, true);
    assert.equal(received.scenes.every(scene => Boolean(scene.assetOutput)), true);
});
''')

# Remove staging files in successful runner before product commit.
Path(".github/scripts/v131-reel-semantic-media-binding.py").unlink()
Path(".github/workflows/v131-reel-semantic-media-binding-apply.yml").unlink()
