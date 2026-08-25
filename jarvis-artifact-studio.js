import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const JARVIS_ARTIFACT_STUDIO_VERSION = "1.0.0-versioned-ledger";
export const JARVIS_SERIES_CANON_VERSION = "1.0.0-v142-artifact-studio-series-canon";
const SERIES_REFERENCE_MAX_COUNT = 3;
const SERIES_CHARACTER_STATE_FIELDS = [
    "wardrobeState",
    "physicalState",
    "positionNarrative",
    "recurringProps",
    "relationships"
];

function clean(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

function boundedClean(value, maximum) {
    return clean(value).slice(0, maximum);
}

function ledgerPath(root) {
    return path.resolve(root, ".jarvis-artifacts/.ledger/artifacts.jsonl");
}

function readLedger(root, limit = 5000) {
    const file = ledgerPath(root);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).slice(-Math.max(1, limit));
    return lines.map(line => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
}

function hashFile(file) {
    return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function registerArtifact({ root, output, metadata = {} } = {}) {
    const resolvedRoot = path.resolve(root || process.cwd());
    const normalizedOutput = clean(output).replaceAll("\\", "/");
    if (!normalizedOutput.startsWith(".jarvis-artifacts/")) throw new Error("ARTIFACT_OUTPUT_REQUIRED");
    const file = path.resolve(resolvedRoot, normalizedOutput);
    const artifactRoot = path.resolve(resolvedRoot, ".jarvis-artifacts");
    if (file !== artifactRoot && !file.startsWith(`${artifactRoot}${path.sep}`)) throw new Error("ARTIFACT_OUTSIDE_ROOT");
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error("ARTIFACT_FILE_REQUIRED");
    const existing = readLedger(resolvedRoot);
    const originalFile = clean(metadata.originalFile);
    const lineageKey = originalFile || normalizedOutput;
    const version = existing
        .filter(item => item.lineageKey === lineageKey)
        .reduce((maximum, item) => Math.max(maximum, Number(item.version) || 0), 0) + 1;
    const sha256 = hashFile(file);
    const createdAt = new Date().toISOString();
    const record = {
        artifactId: `ART-${randomUUID()}`,
        studioVersion: JARVIS_ARTIFACT_STUDIO_VERSION,
        caseId: clean(metadata.caseId),
        objectiveId: clean(metadata.objectiveId),
        type: clean(metadata.type) || "artifact",
        version,
        lineageKey,
        origin: clean(metadata.origin) || "jarvis_local_bridge",
        provider: clean(metadata.provider) || "local",
        model: clean(metadata.model),
        file: normalizedOutput,
        mimeType: clean(metadata.mimeType),
        bytes: stat.size,
        sha256,
        createdAt,
        status: clean(metadata.status) || "CREATED_VERIFIED",
        approval: {
            required: metadata.approvalRequired === true,
            approved: metadata.approved === true,
            approvedBy: clean(metadata.approvedBy)
        },
        editable: metadata.editable === true,
        preview: metadata.preview === true,
        downloadable: metadata.downloadable !== false,
        publishable: metadata.publishable === true,
        deploymentStatus: clean(metadata.deploymentStatus) || "NOT_DEPLOYED",
        originalFile: originalFile || null,
        transformations: Array.isArray(metadata.transformations) ? metadata.transformations.slice(0, 30) : []
    };
    const target = ledgerPath(resolvedRoot);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `${JSON.stringify(record)}\n`, "utf8");
    return record;
}

export function listArtifacts({ root, limit = 100, type = "", caseId = "", objectiveId = "" } = {}) {
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    return readLedger(path.resolve(root || process.cwd()))
        .filter(item => !type || item.type === type)
        .filter(item => !caseId || item.caseId === caseId)
        .filter(item => !objectiveId || item.objectiveId === objectiveId)
        .slice(-boundedLimit)
        .reverse();
}

export function findArtifact({ root, artifactId = "", output = "" } = {}) {
    const records = readLedger(path.resolve(root || process.cwd()));
    for (let index = records.length - 1; index >= 0; index -= 1) {
        const item = records[index];
        if ((artifactId && item.artifactId === artifactId) || (output && item.file === output)) return item;
    }
    return null;
}

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function mergeContinuity(base, overlay) {
    if (!overlay || typeof overlay !== "object" || Array.isArray(overlay)) {
        return clone(overlay);
    }
    const result = base && typeof base === "object" && !Array.isArray(base)
        ? clone(base)
        : {};
    for (const [key, value] of Object.entries(overlay)) {
        result[key] = value && typeof value === "object" && !Array.isArray(value)
            ? mergeContinuity(result[key], value)
            : clone(value);
    }
    return result;
}

function cleanIdentifier(value, label, maximum = 120) {
    const identifier = clean(value).slice(0, maximum);
    if (
        identifier.length < 3 ||
        identifier.length > maximum ||
        !/^[A-Z0-9][A-Z0-9_-]+$/.test(identifier)
    ) {
        throw new Error(`${label}_INVALID`);
    }
    return identifier;
}

function cleanStringList(value, maximum = 100) {
    return [...new Set((Array.isArray(value) ? value : [])
        .map(item => clean(item).slice(0, 500))
        .filter(Boolean))]
        .slice(0, maximum);
}

function seriesCanonOutput(seriesId) {
    return `.jarvis-artifacts/series/${cleanIdentifier(seriesId, "SERIES_ID")}/canon.json`;
}

function seriesCanonFile(root, seriesId) {
    const resolvedRoot = path.resolve(root || process.cwd());
    const output = seriesCanonOutput(seriesId);
    const file = path.resolve(resolvedRoot, output);
    const seriesRoot = path.resolve(resolvedRoot, ".jarvis-artifacts/series");
    if (!file.startsWith(`${seriesRoot}${path.sep}`)) {
        throw new Error("SERIES_CANON_OUTSIDE_ARTIFACT_STUDIO");
    }
    return { resolvedRoot, output, file };
}

function writeSeriesCanon(root, canon, origin) {
    const target = seriesCanonFile(root, canon.seriesId);
    const next = {
        ...canon,
        schemaVersion: JARVIS_SERIES_CANON_VERSION,
        revision: Math.max(0, Number(canon.revision) || 0) + 1,
        updatedAt: new Date().toISOString()
    };
    fs.mkdirSync(path.dirname(target.file), { recursive: true });
    fs.writeFileSync(target.file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    const artifact = registerArtifact({
        root: target.resolvedRoot,
        output: target.output,
        metadata: {
            type: "series_canon",
            origin,
            provider: "artifact_studio",
            mimeType: "application/json",
            status: "SERIES_CANON_PERSISTED_VERIFIED",
            approvalRequired: false,
            approved: true,
            approvedBy: "EXPLICIT_SERIES_CONTRACT",
            editable: true,
            preview: true,
            downloadable: true,
            publishable: false,
            originalFile: target.output,
            transformations: [{
                type: "series_canon_revision",
                revision: next.revision,
                origin
            }]
        }
    });
    return { canon: next, artifact };
}

function readSeriesCanon(root, seriesId) {
    const target = seriesCanonFile(root, seriesId);
    if (!fs.existsSync(target.file)) throw new Error("SERIES_CANON_NOT_FOUND");
    const artifact = findArtifact({ root: target.resolvedRoot, output: target.output });
    if (!artifact) throw new Error("SERIES_CANON_LEDGER_RECORD_MISSING");
    const sha256 = hashFile(target.file);
    if (sha256 !== artifact.sha256) throw new Error("SERIES_CANON_HASH_MISMATCH");
    let canon;
    try {
        canon = JSON.parse(fs.readFileSync(target.file, "utf8"));
    }
    catch {
        throw new Error("SERIES_CANON_JSON_INVALID");
    }
    if (
        canon?.schemaVersion !== JARVIS_SERIES_CANON_VERSION ||
        canon?.seriesId !== cleanIdentifier(seriesId, "SERIES_ID")
    ) {
        throw new Error("SERIES_CANON_CONTRACT_INVALID");
    }
    return { canon, artifact };
}

function verifySeriesReferenceArtifact(root, value = {}) {
    if (value?.dataBase64 || value?.imageBytes || value?.base64) {
        throw new Error("SERIES_REFERENCE_INLINE_BYTES_FORBIDDEN");
    }
    const sourceOutput = clean(value?.sourceOutput || value?.path || value?.output)
        .replaceAll("\\", "/");
    if (!sourceOutput.startsWith(".jarvis-artifacts/")) {
        throw new Error("SERIES_REFERENCE_ARTIFACT_REQUIRED");
    }
    const resolvedRoot = path.resolve(root || process.cwd());
    const artifact = findArtifact({ root: resolvedRoot, output: sourceOutput });
    if (!artifact) throw new Error(`SERIES_REFERENCE_LEDGER_MISSING:${sourceOutput}`);
    const file = path.resolve(resolvedRoot, sourceOutput);
    const artifactRoot = path.resolve(resolvedRoot, ".jarvis-artifacts");
    if (!file.startsWith(`${artifactRoot}${path.sep}`) || !fs.existsSync(file)) {
        throw new Error(`SERIES_REFERENCE_PHYSICAL_MISSING:${sourceOutput}`);
    }
    const stat = fs.statSync(file);
    const sha256 = hashFile(file);
    const mimeType = clean(value?.mimeType || artifact.mimeType).toLowerCase();
    if (!stat.isFile() || stat.size !== artifact.bytes || sha256 !== artifact.sha256) {
        throw new Error(`SERIES_REFERENCE_PHYSICAL_MISMATCH:${sourceOutput}`);
    }
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(mimeType)) {
        throw new Error(`SERIES_REFERENCE_MIME_UNSUPPORTED:${mimeType || "missing"}`);
    }
    if (value?.sha256 && clean(value.sha256).toLowerCase() !== sha256) {
        throw new Error(`SERIES_REFERENCE_SHA256_MISMATCH:${sourceOutput}`);
    }
    if (value?.bytes && Number(value.bytes) !== stat.size) {
        throw new Error(`SERIES_REFERENCE_BYTES_MISMATCH:${sourceOutput}`);
    }
    return {
        artifactId: artifact.artifactId,
        sourceOutput,
        mimeType,
        bytes: stat.size,
        sha256,
        approvedForVeo: value?.approvedForVeo !== false,
        verifiedAt: new Date().toISOString()
    };
}

function activeCastReferences(root, canon, castIds = []) {
    const references = [];
    for (const characterId of castIds) {
        const character = canon.characters?.[characterId];
        if (!character) throw new Error(`SERIES_CHARACTER_NOT_FOUND:${characterId}`);
        if (character.active !== true) throw new Error(`SERIES_CHARACTER_INACTIVE:${characterId}`);
        for (const reference of character.referenceAssets || []) {
            if (reference.approvedForVeo !== true) continue;
            references.push({
                characterId,
                ...verifySeriesReferenceArtifact(root, reference)
            });
        }
    }
    const deduplicated = references.filter((item, index, values) =>
        values.findIndex(candidate =>
            candidate.characterId === item.characterId &&
            candidate.sha256 === item.sha256
        ) === index
    );
    if (deduplicated.length > SERIES_REFERENCE_MAX_COUNT) {
        throw new Error(
            `SERIES_VEO_REFERENCE_LIMIT_EXCEEDED:${deduplicated.length}:${SERIES_REFERENCE_MAX_COUNT}`
        );
    }
    return deduplicated;
}

function episodeById(canon, episodeId) {
    const id = cleanIdentifier(episodeId, "SERIES_EPISODE_ID", 160);
    const episode = (Array.isArray(canon.episodes) ? canon.episodes : [])
        .find(item => item?.episodeId === id);
    if (!episode) throw new Error("SERIES_EPISODE_NOT_FOUND");
    return episode;
}

function assertKnownFacts(canon, state = {}) {
    const characters = Array.isArray(state?.characters) ? state.characters : [];
    for (const stateCharacter of characters) {
        const characterId = cleanIdentifier(
            stateCharacter?.characterId,
            "SERIES_CHARACTER_ID"
        );
        const character = canon.characters?.[characterId];
        if (!character) throw new Error(`SERIES_CHARACTER_NOT_FOUND:${characterId}`);
        const unknown = new Set(character.secretsNotKnown || []);
        for (const fact of cleanStringList(stateCharacter?.knownFacts)) {
            if (unknown.has(fact)) {
                throw new Error(`SERIES_CONTINUITY_UNKNOWN_SECRET:${characterId}:${fact}`);
            }
        }
    }
}

function normalizeStoryBeats(value) {
    return (Array.isArray(value) ? value : []).slice(0, 100).map((beat, index) => {
        if (!beat || typeof beat !== "object" || Array.isArray(beat)) {
            throw new Error(`SERIES_STORY_BEAT_INVALID:${index + 1}`);
        }
        const exactAction = boundedClean(beat.exactAction, 5000);
        const dialogue = boundedClean(beat.dialogue, 5000);
        const dialogueIntent = boundedClean(beat.dialogueIntent, 2000);
        const requiredBeat = boundedClean(beat.requiredBeat, 5000);
        if (!exactAction && !dialogue && !dialogueIntent && !requiredBeat) {
            throw new Error(`SERIES_STORY_BEAT_CONTENT_REQUIRED:${index + 1}`);
        }
        return {
            beatId: boundedClean(beat.beatId, 160) || `BEAT-${index + 1}`,
            initialState: clone(beat.initialState || {}),
            exactAction,
            dialogueIntent,
            dialogue,
            requiredBeat,
            finalState: clone(beat.finalState || {}),
            revelations: cleanStringList(beat.revelations)
        };
    });
}

export function createSeriesBible({
    root,
    seriesId,
    title,
    storyArc = "",
    status = "ACTIVE"
} = {}) {
    const id = cleanIdentifier(seriesId, "SERIES_ID");
    const normalizedTitle = clean(title).slice(0, 300);
    if (!normalizedTitle) throw new Error("SERIES_TITLE_REQUIRED");
    const target = seriesCanonFile(root, id);
    if (fs.existsSync(target.file)) throw new Error("SERIES_CANON_ALREADY_EXISTS");
    const now = new Date().toISOString();
    const saved = writeSeriesCanon(root, {
        schemaVersion: JARVIS_SERIES_CANON_VERSION,
        seriesId: id,
        title: normalizedTitle,
        currentEpisodeNumber: null,
        lastCompletedEpisodeNumber: null,
        storyArc: clean(storyArc).slice(0, 20000),
        status: clean(status).slice(0, 80) || "ACTIVE",
        characters: {},
        episodes: [],
        continuityState: {},
        cliffhanger: "",
        canonFacts: [],
        revision: 0,
        createdAt: now,
        updatedAt: now,
        authority: "ARTIFACT_STUDIO_VERSIONED_LEDGER",
        policy: {
            explicitCharacterAssignmentOnly: true,
            biometricIdentificationForbidden: true,
            plannedResultAcceptedSeparated: true,
            episodeCounterAdvancesOnHumanAcceptanceOnly: true
        }
    }, "series.create");
    return {
        ok: true,
        status: "SERIES_CANON_CREATED_VERIFIED",
        seriesId: id,
        canon: clone(saved.canon),
        artifact: saved.artifact
    };
}

export function getSeriesBible({ root, seriesId } = {}) {
    return clone(readSeriesCanon(root, seriesId).canon);
}

export function upsertSeriesCharacter({
    root,
    seriesId,
    characterId,
    displayName,
    assignmentConfirmed = false,
    referenceAssets = [],
    role = "",
    visualDescription = "",
    wardrobeState = "",
    voiceProfile = null,
    relationships = {},
    knownFacts = [],
    secretsNotKnown = [],
    recurringProps = [],
    active = true
} = {}) {
    if (assignmentConfirmed !== true) {
        throw new Error("SERIES_CHARACTER_EXPLICIT_ASSIGNMENT_REQUIRED");
    }
    const loaded = readSeriesCanon(root, seriesId);
    const canon = loaded.canon;
    const id = cleanIdentifier(characterId, "SERIES_CHARACTER_ID");
    const name = clean(displayName).slice(0, 300);
    if (!name) throw new Error("SERIES_CHARACTER_DISPLAY_NAME_REQUIRED");
    if (!Array.isArray(referenceAssets) || referenceAssets.length === 0) {
        throw new Error("SERIES_CHARACTER_REFERENCE_ASSETS_REQUIRED");
    }
    const verifiedReferences = referenceAssets
        .map(item => verifySeriesReferenceArtifact(root, item))
        .filter((item, index, values) =>
            values.findIndex(candidate => candidate.sha256 === item.sha256) === index
        )
        .sort((a, b) => a.sourceOutput.localeCompare(b.sourceOutput));
    const previous = canon.characters?.[id] || null;
    const now = new Date().toISOString();
    const character = {
        characterId: id,
        displayName: name,
        role: clean(role).slice(0, 1000),
        referenceAssets: verifiedReferences,
        visualDescription: clean(visualDescription).slice(0, 5000),
        wardrobeState: clone(wardrobeState),
        voiceProfile: voiceProfile && typeof voiceProfile === "object"
            ? clone(voiceProfile)
            : null,
        relationships: relationships && typeof relationships === "object"
            ? clone(relationships)
            : {},
        knownFacts: cleanStringList(knownFacts),
        secretsNotKnown: cleanStringList(secretsNotKnown),
        recurringProps: cleanStringList(recurringProps),
        active: active !== false,
        assignmentSource: "EXPLICIT_USER_ASSIGNMENT",
        revision: Math.max(0, Number(previous?.revision) || 0) + 1,
        createdAt: previous?.createdAt || now,
        updatedAt: now
    };
    canon.characters ||= {};
    canon.characters[id] = character;
    const saved = writeSeriesCanon(root, canon, "series.character.upsert");
    return {
        ok: true,
        status: "SERIES_CHARACTER_PERSISTED_VERIFIED",
        seriesId: canon.seriesId,
        character: clone(character),
        artifact: saved.artifact
    };
}

export function prepareSeriesEpisode({
    root,
    seriesId,
    episodeId = "",
    episodeNumber = null,
    title,
    script,
    castIds = [],
    storyBeats = [],
    continuityStart = null
} = {}) {
    const loaded = readSeriesCanon(root, seriesId);
    const canon = loaded.canon;
    const lastCompleted = Number.isInteger(canon.lastCompletedEpisodeNumber)
        ? canon.lastCompletedEpisodeNumber
        : null;
    const requested = Number(episodeNumber);
    let resolvedNumber;
    if (lastCompleted === null) {
        if (!Number.isInteger(requested) || requested < 1) {
            throw new Error("SERIES_FIRST_EPISODE_NUMBER_REQUIRED");
        }
        resolvedNumber = requested;
    }
    else {
        resolvedNumber = lastCompleted + 1;
        if (episodeNumber !== null && episodeNumber !== undefined && requested !== resolvedNumber) {
            throw new Error(`SERIES_EPISODE_NUMBER_MISMATCH:${requested}:${resolvedNumber}`);
        }
    }
    if ((canon.episodes || []).some(item => item?.episodeNumber === resolvedNumber)) {
        throw new Error(`SERIES_EPISODE_NUMBER_ALREADY_EXISTS:${resolvedNumber}`);
    }
    const normalizedTitle = clean(title).slice(0, 300);
    const normalizedScript = clean(script).slice(0, 200000);
    if (!normalizedTitle) throw new Error("SERIES_EPISODE_TITLE_REQUIRED");
    if (!normalizedScript) throw new Error("SERIES_EPISODE_SCRIPT_REQUIRED");
    const normalizedCastIds = [...new Set((Array.isArray(castIds) ? castIds : [])
        .map(value => cleanIdentifier(value, "SERIES_CHARACTER_ID")))];
    if (normalizedCastIds.length === 0) throw new Error("SERIES_EPISODE_CAST_REQUIRED");
    activeCastReferences(root, canon, normalizedCastIds);
    const initialState = continuityStart && typeof continuityStart === "object"
        ? clone(continuityStart)
        : clone(canon.continuityState || {});
    assertKnownFacts(canon, initialState);
    const normalizedBeats = normalizeStoryBeats(storyBeats);
    let rollingState = clone(initialState);
    normalizedBeats.forEach(beat => {
        beat.initialState = mergeContinuity(rollingState, beat.initialState || {});
        assertKnownFacts(canon, beat.initialState);
        rollingState = mergeContinuity(beat.initialState, beat.finalState || {});
        beat.finalState = clone(rollingState);
    });
    const previousEpisode = [...(canon.episodes || [])]
        .filter(item => item?.status === "HUMAN_ACCEPTED")
        .sort((a, b) => Number(b.episodeNumber) - Number(a.episodeNumber))[0] || null;
    const id = episodeId
        ? cleanIdentifier(episodeId, "SERIES_EPISODE_ID", 160)
        : cleanIdentifier(`EP-${canon.seriesId}-${resolvedNumber}`, "SERIES_EPISODE_ID", 160);
    if ((canon.episodes || []).some(item => item?.episodeId === id)) {
        throw new Error("SERIES_EPISODE_ID_ALREADY_EXISTS");
    }
    const now = new Date().toISOString();
    const episode = {
        episodeId: id,
        seriesId: canon.seriesId,
        episodeNumber: resolvedNumber,
        title: normalizedTitle,
        script: normalizedScript,
        scriptSha256: createHash("sha256").update(normalizedScript).digest("hex"),
        status: "READY",
        previousEpisodeId: previousEpisode?.episodeId || null,
        castIds: normalizedCastIds,
        storyBeats: normalizedBeats,
        continuityStart: initialState,
        plannedContinuityEnd: normalizedBeats.length > 0
            ? clone(rollingState)
            : {},
        generatedResult: null,
        continuityEnd: null,
        cliffhanger: "",
        physicalArtifact: null,
        artifactSha256: null,
        createdAt: now,
        generatedAt: null,
        completedAt: null
    };
    canon.episodes ||= [];
    canon.episodes.push(episode);
    const saved = writeSeriesCanon(root, canon, "series.episode.prepare");
    return {
        ok: true,
        status: "SERIES_EPISODE_READY_VERIFIED",
        seriesId: canon.seriesId,
        episode: clone(episode),
        artifact: saved.artifact
    };
}

export function getSeriesGenerationContext({ root, seriesId, episodeId } = {}) {
    const canon = readSeriesCanon(root, seriesId).canon;
    const episode = episodeById(canon, episodeId);
    if (!new Set(["READY", "GENERATING"]).has(episode.status)) {
        throw new Error(`SERIES_EPISODE_NOT_GENERATABLE:${episode.status}`);
    }
    assertKnownFacts(canon, episode.continuityStart || {});
    const references = activeCastReferences(root, canon, episode.castIds || []);
    return {
        ok: true,
        status: "SERIES_EPISODE_GENERATION_CONTEXT_VERIFIED",
        seriesId: canon.seriesId,
        episodeId: episode.episodeId,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        script: episode.script,
        scriptSha256: episode.scriptSha256,
        castIds: clone(episode.castIds),
        storyBeats: clone(episode.storyBeats),
        continuityStart: clone(episode.continuityStart),
        referenceAssets: references,
        referenceOutputs: references.map(item => item.sourceOutput),
        cliffhangerPrevious: clean(canon.cliffhanger),
        canonRevision: canon.revision,
        policy: {
            referenceSelection: "ACTIVE_CAST_EXPLICIT_ASSIGNMENTS_ONLY",
            maximumReferenceImages: SERIES_REFERENCE_MAX_COUNT,
            noFacialIdentification: true
        }
    };
}

function verifyGeneratedEpisodeArtifact(root, output, declaredSha256) {
    const normalizedOutput = clean(output).replaceAll("\\", "/");
    const artifact = findArtifact({ root, output: normalizedOutput });
    if (!artifact) throw new Error("SERIES_EPISODE_ARTIFACT_LEDGER_MISSING");
    const file = path.resolve(root || process.cwd(), normalizedOutput);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        throw new Error("SERIES_EPISODE_ARTIFACT_PHYSICAL_MISSING");
    }
    const sha256 = hashFile(file);
    if (
        artifact.sha256 !== sha256 ||
        (declaredSha256 && clean(declaredSha256).toLowerCase() !== sha256)
    ) {
        throw new Error("SERIES_EPISODE_ARTIFACT_SHA256_MISMATCH");
    }
    if (
        artifact.mimeType !== "video/mp4" ||
        !normalizedOutput.toLowerCase().endsWith(".mp4") ||
        Number(artifact.bytes || 0) < 100000
    ) {
        throw new Error("SERIES_EPISODE_ARTIFACT_MP4_REQUIRED");
    }
    return {
        artifactId: artifact.artifactId,
        output: normalizedOutput,
        mimeType: "video/mp4",
        bytes: fs.statSync(file).size,
        sha256
    };
}

export function markSeriesEpisodeGenerated({
    root,
    seriesId,
    episodeId,
    physicalArtifact,
    artifactSha256
} = {}) {
    const loaded = readSeriesCanon(root, seriesId);
    const canon = loaded.canon;
    const episode = episodeById(canon, episodeId);
    if (!new Set(["READY", "GENERATING"]).has(episode.status)) {
        throw new Error(`SERIES_EPISODE_GENERATED_TRANSITION_INVALID:${episode.status}`);
    }
    const physical = verifyGeneratedEpisodeArtifact(root, physicalArtifact, artifactSha256);
    episode.status = "GENERATED";
    episode.generatedResult = physical;
    episode.physicalArtifact = physical.output;
    episode.artifactSha256 = physical.sha256;
    episode.generatedAt = new Date().toISOString();
    const saved = writeSeriesCanon(root, canon, "series.episode.generated");
    return {
        ok: true,
        status: "SERIES_EPISODE_GENERATED_RECORDED",
        seriesId: canon.seriesId,
        episodeId: episode.episodeId,
        episode: clone(episode),
        canonRevision: saved.canon.revision,
        artifact: saved.artifact
    };
}

function applyAcceptedCharacterContinuity(canon, continuityEnd = {}) {
    for (const state of Array.isArray(continuityEnd?.characters) ? continuityEnd.characters : []) {
        const characterId = cleanIdentifier(state?.characterId, "SERIES_CHARACTER_ID");
        const character = canon.characters?.[characterId];
        if (!character) throw new Error(`SERIES_CHARACTER_NOT_FOUND:${characterId}`);
        for (const field of SERIES_CHARACTER_STATE_FIELDS) {
            if (Object.hasOwn(state, field)) character[field] = clone(state[field]);
        }
        const addedFacts = cleanStringList(state.knownFactsAdded);
        const revealed = cleanStringList(state.secretsRevealed);
        character.knownFacts = cleanStringList([
            ...(character.knownFacts || []),
            ...addedFacts,
            ...revealed
        ]);
        character.secretsNotKnown = (character.secretsNotKnown || [])
            .filter(fact => !revealed.includes(fact));
        character.revision = Math.max(0, Number(character.revision) || 0) + 1;
        character.updatedAt = new Date().toISOString();
    }
}

export function acceptSeriesEpisode({
    root,
    seriesId,
    episodeId,
    humanAccepted = false,
    continuityEnd,
    cliffhanger = "",
    canonFacts = []
} = {}) {
    if (humanAccepted !== true) throw new Error("SERIES_EPISODE_HUMAN_ACCEPTANCE_REQUIRED");
    if (!continuityEnd || typeof continuityEnd !== "object" || Array.isArray(continuityEnd)) {
        throw new Error("SERIES_EPISODE_ACCEPTED_CONTINUITY_REQUIRED");
    }
    const loaded = readSeriesCanon(root, seriesId);
    const canon = loaded.canon;
    const episode = episodeById(canon, episodeId);
    if (episode.status !== "GENERATED") {
        throw new Error(`SERIES_EPISODE_ACCEPT_TRANSITION_INVALID:${episode.status}`);
    }
    verifyGeneratedEpisodeArtifact(root, episode.physicalArtifact, episode.artifactSha256);
    const acceptedStateForValidation = clone(continuityEnd);
    for (const state of Array.isArray(acceptedStateForValidation?.characters)
        ? acceptedStateForValidation.characters
        : []) {
        const revealed = new Set(cleanStringList(state?.secretsRevealed));
        if (Array.isArray(state?.knownFacts)) {
            state.knownFacts = state.knownFacts.filter(fact => !revealed.has(clean(fact)));
        }
    }
    assertKnownFacts(canon, acceptedStateForValidation);
    const acceptedContinuity = mergeContinuity(episode.continuityStart || {}, continuityEnd);
    episode.status = "HUMAN_ACCEPTED";
    episode.continuityEnd = clone(acceptedContinuity);
    episode.cliffhanger = clean(cliffhanger).slice(0, 10000);
    episode.acceptedCanonFacts = cleanStringList(canonFacts, 500);
    episode.completedAt = new Date().toISOString();
    canon.currentEpisodeNumber = episode.episodeNumber;
    canon.lastCompletedEpisodeNumber = episode.episodeNumber;
    canon.continuityState = clone(acceptedContinuity);
    canon.cliffhanger = episode.cliffhanger;
    canon.canonFacts = cleanStringList([
        ...(canon.canonFacts || []),
        ...episode.acceptedCanonFacts
    ], 2000);
    applyAcceptedCharacterContinuity(canon, acceptedContinuity);
    const saved = writeSeriesCanon(root, canon, "series.episode.accept");
    return {
        ok: true,
        status: "SERIES_EPISODE_HUMAN_ACCEPTED",
        seriesId: canon.seriesId,
        episodeId: episode.episodeId,
        currentEpisodeNumber: canon.currentEpisodeNumber,
        lastCompletedEpisodeNumber: canon.lastCompletedEpisodeNumber,
        episode: clone(episode),
        canonRevision: saved.canon.revision,
        artifact: saved.artifact
    };
}

export function getSeriesResumeContext({ root, seriesId } = {}) {
    const canon = readSeriesCanon(root, seriesId).canon;
    const lastEpisode = [...(canon.episodes || [])]
        .filter(item => item?.status === "HUMAN_ACCEPTED")
        .sort((a, b) => Number(b.episodeNumber) - Number(a.episodeNumber))[0] || null;
    return {
        ok: true,
        status: "SERIES_RESUME_CONTEXT_VERIFIED",
        seriesId: canon.seriesId,
        title: canon.title,
        currentEpisodeNumber: canon.currentEpisodeNumber,
        lastCompletedEpisodeNumber: canon.lastCompletedEpisodeNumber,
        nextEpisodeNumber: Number.isInteger(canon.lastCompletedEpisodeNumber)
            ? canon.lastCompletedEpisodeNumber + 1
            : null,
        lastEpisode: clone(lastEpisode),
        activeCharacters: Object.values(canon.characters || {})
            .filter(character => character.active === true)
            .map(character => ({
                characterId: character.characterId,
                displayName: character.displayName,
                referenceAssets: clone(character.referenceAssets),
                wardrobeState: clone(character.wardrobeState),
                recurringProps: clone(character.recurringProps),
                knownFacts: clone(character.knownFacts),
                secretsNotKnown: clone(character.secretsNotKnown)
            })),
        continuityState: clone(canon.continuityState || {}),
        cliffhanger: canon.cliffhanger,
        canonFacts: clone(canon.canonFacts || []),
        canonRevision: canon.revision,
        authority: canon.authority
    };
}
