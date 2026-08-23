export const JARVIS_REEL_MEDIA_BINDER_VERSION =
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
        !(
            output.startsWith(".jarvis-artifacts/web-media/") ||
            output.startsWith(".jarvis-artifacts/images/")
        ) ||
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
        origin:
            clean(asset?.origin) ||
            (output.startsWith(".jarvis-artifacts/images/")
                ? clean(asset?.sourceTag) || "image.generate"
                : "web.media.collect"),
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
                origin: binding.asset.origin || "web.media.collect",
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
