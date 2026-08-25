import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    acceptSeriesEpisode,
    createSeriesBible,
    getSeriesBible,
    getSeriesGenerationContext,
    getSeriesResumeContext,
    markSeriesEpisodeGenerated,
    prepareSeriesEpisode,
    registerArtifact,
    upsertSeriesCharacter
} from "../jarvis-artifact-studio.js";

function seriesRoot() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-series-v142-"));
}

function physicalArtifact(root, output, content, mimeType) {
    const file = path.join(root, output);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return registerArtifact({
        root,
        output,
        metadata: {
            type: mimeType === "video/mp4" ? "video" : "image",
            origin: "v142.fixture",
            mimeType,
            status: "CREATED_VERIFIED"
        }
    });
}

function registerCharacter(root, seriesId, characterId, displayName, assets, extra = {}) {
    return upsertSeriesCharacter({
        root,
        seriesId,
        characterId,
        displayName,
        assignmentConfirmed: true,
        referenceAssets: assets.map(asset => ({
            sourceOutput: asset.file,
            mimeType: asset.mimeType,
            bytes: asset.bytes,
            sha256: asset.sha256,
            approvedForVeo: true
        })),
        ...extra
    });
}

function createSeries(root, seriesId, title = seriesId) {
    return createSeriesBible({ root, seriesId, title, storyArc: "Arco verificable." });
}

function prepareEpisode27(root, seriesId, castIds, extra = {}) {
    return prepareSeriesEpisode({
        root,
        seriesId,
        episodeNumber: 27,
        title: "Capitulo 27",
        script: "Guion canonico del capitulo 27.",
        castIds,
        storyBeats: [{
            initialState: { location: "Taller" },
            exactAction: "El personaje conserva el objeto.",
            dialogueIntent: "Confirmar continuidad.",
            requiredBeat: "El objeto sigue visible.",
            finalState: { location: "Taller" }
        }],
        ...extra
    });
}

function generateAndAccept(root, seriesId, episodeId, continuityEnd) {
    const video = physicalArtifact(
        root,
        `.jarvis-artifacts/videos/${seriesId.toLowerCase()}-episode.mp4`,
        Buffer.concat([Buffer.from("....ftyp"), Buffer.alloc(120000)]),
        "video/mp4"
    );
    markSeriesEpisodeGenerated({
        root,
        seriesId,
        episodeId,
        physicalArtifact: video.file,
        artifactSha256: video.sha256
    });
    return acceptSeriesEpisode({
        root,
        seriesId,
        episodeId,
        humanAccepted: true,
        continuityEnd,
        cliffhanger: "Cliffhanger confirmado por la aceptacion humana."
    });
}

test("persistent character assignment recovers the exact verified assets in a later runtime", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_ALPHA", "Serie Alpha");
    const front = physicalArtifact(root, ".jarvis-artifacts/uploads/front.jpg", "front", "image/jpeg");
    const profile = physicalArtifact(root, ".jarvis-artifacts/uploads/profile.jpg", "profile", "image/jpeg");

    registerCharacter(root, "SERIES_ALPHA", "CHAR_PRIMARY", "Personaje principal", [front, profile]);

    const recovered = getSeriesBible({ root, seriesId: "SERIES_ALPHA" });
    assert.deepEqual(
        recovered.characters.CHAR_PRIMARY.referenceAssets.map(item => item.sourceOutput),
        [front.file, profile.file]
    );
    assert.deepEqual(
        recovered.characters.CHAR_PRIMARY.referenceAssets.map(item => item.sha256),
        [front.sha256, profile.sha256]
    );
    assert.equal(recovered.characters.CHAR_PRIMARY.assignmentSource, "EXPLICIT_USER_ASSIGNMENT");
});

test("distinct characters keep independent ids and never exchange reference assets", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_CAST");
    const assetA = physicalArtifact(root, ".jarvis-artifacts/uploads/a.jpg", "character-a", "image/jpeg");
    const assetB = physicalArtifact(root, ".jarvis-artifacts/uploads/b.jpg", "character-b", "image/jpeg");
    registerCharacter(root, "SERIES_CAST", "CHAR_A", "A", [assetA]);
    registerCharacter(root, "SERIES_CAST", "CHAR_B", "B", [assetB]);

    const canon = getSeriesBible({ root, seriesId: "SERIES_CAST" });
    assert.deepEqual(canon.characters.CHAR_A.referenceAssets.map(item => item.sha256), [assetA.sha256]);
    assert.deepEqual(canon.characters.CHAR_B.referenceAssets.map(item => item.sha256), [assetB.sha256]);
    assert.notEqual(
        canon.characters.CHAR_A.referenceAssets[0].sourceOutput,
        canon.characters.CHAR_B.referenceAssets[0].sourceOutput
    );
});

test("resume context derives episode 28 only from accepted episode 27 across runtimes", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_RESUME");
    const asset = physicalArtifact(root, ".jarvis-artifacts/uploads/resume.jpg", "resume", "image/jpeg");
    registerCharacter(root, "SERIES_RESUME", "CHAR_RESUME", "Resume", [asset]);
    const prepared = prepareEpisode27(root, "SERIES_RESUME", ["CHAR_RESUME"]);
    generateAndAccept(root, "SERIES_RESUME", prepared.episode.episodeId, {
        characters: [{ characterId: "CHAR_RESUME", recurringProps: ["PROP_TOKEN"] }]
    });

    const laterRuntime = getSeriesResumeContext({ root, seriesId: "SERIES_RESUME" });
    assert.equal(laterRuntime.lastCompletedEpisodeNumber, 27);
    assert.equal(laterRuntime.nextEpisodeNumber, 28);
    assert.equal(laterRuntime.lastEpisode.status, "HUMAN_ACCEPTED");
});

test("accepted final continuity becomes the verified start of the next episode", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_CONTINUITY");
    const asset = physicalArtifact(root, ".jarvis-artifacts/uploads/continuity.jpg", "continuity", "image/jpeg");
    registerCharacter(root, "SERIES_CONTINUITY", "CHAR_KEEPER", "Keeper", [asset]);
    const prepared = prepareEpisode27(root, "SERIES_CONTINUITY", ["CHAR_KEEPER"]);
    const acceptedState = {
        characters: [{
            characterId: "CHAR_KEEPER",
            wardrobeState: "JACKET_BLUE",
            recurringProps: ["PROP_DOCUMENT"],
            physicalState: "UNINJURED"
        }],
        location: "WAREHOUSE_NORTH",
        activeConflict: "CONFLICT_OPEN"
    };
    generateAndAccept(root, "SERIES_CONTINUITY", prepared.episode.episodeId, acceptedState);

    const next = prepareSeriesEpisode({
        root,
        seriesId: "SERIES_CONTINUITY",
        title: "Capitulo siguiente",
        script: "Continuacion verificada.",
        castIds: ["CHAR_KEEPER"],
        storyBeats: []
    });
    assert.equal(next.episode.episodeNumber, 28);
    assert.deepEqual(next.episode.continuityStart, acceptedState);
});

test("unknown character secret blocks a contradictory episode before generation", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_SECRET");
    const asset = physicalArtifact(root, ".jarvis-artifacts/uploads/secret.jpg", "secret", "image/jpeg");
    registerCharacter(root, "SERIES_SECRET", "CHAR_OBSERVER", "Observer", [asset], {
        knownFacts: ["FACT_PUBLIC"],
        secretsNotKnown: ["FACT_SECRET"]
    });

    assert.throws(() => prepareSeriesEpisode({
        root,
        seriesId: "SERIES_SECRET",
        episodeNumber: 1,
        title: "Contradiccion",
        script: "El personaje actua como si conociera un secreto.",
        castIds: ["CHAR_OBSERVER"],
        continuityStart: {
            characters: [{ characterId: "CHAR_OBSERVER", knownFacts: ["FACT_SECRET"] }]
        },
        storyBeats: []
    }), /SERIES_CONTINUITY_UNKNOWN_SECRET:CHAR_OBSERVER:FACT_SECRET/);
});

test("Veo context uses only active cast assets and fails explicitly above three references", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_VEO");
    const assets = ["a1", "a2", "b1", "inactive"].map(name =>
        physicalArtifact(root, `.jarvis-artifacts/uploads/${name}.jpg`, name, "image/jpeg")
    );
    registerCharacter(root, "SERIES_VEO", "CHAR_A", "A", assets.slice(0, 2));
    registerCharacter(root, "SERIES_VEO", "CHAR_B", "B", [assets[2]]);
    registerCharacter(root, "SERIES_VEO", "CHAR_INACTIVE", "Inactive", [assets[3]], { active: false });
    const prepared = prepareSeriesEpisode({
        root,
        seriesId: "SERIES_VEO",
        episodeNumber: 5,
        title: "Cast activo",
        script: "Solo participa el cast activo.",
        castIds: ["CHAR_A", "CHAR_B"],
        storyBeats: []
    });
    const context = getSeriesGenerationContext({ root, seriesId: "SERIES_VEO", episodeId: prepared.episode.episodeId });
    assert.deepEqual(context.referenceOutputs, assets.slice(0, 3).map(item => item.file));
    assert.equal(context.referenceOutputs.includes(assets[3].file), false);

    const extra = physicalArtifact(root, ".jarvis-artifacts/uploads/b2.jpg", "b2", "image/jpeg");
    registerCharacter(root, "SERIES_VEO", "CHAR_B", "B", [assets[2], extra]);
    assert.throws(
        () => getSeriesGenerationContext({ root, seriesId: "SERIES_VEO", episodeId: prepared.episode.episodeId }),
        /SERIES_VEO_REFERENCE_LIMIT_EXCEEDED:4:3/
    );
});

test("independent audiovisual work remains valid without a series bible", () => {
    const standaloneArgs = {
        prompt: "Video independiente.",
        output: ".jarvis-artifacts/videos/standalone.mp4"
    };
    assert.equal(Object.hasOwn(standaloneArgs, "seriesId"), false);
    assert.equal(Object.hasOwn(standaloneArgs, "episodeId"), false);
});

test("two series remain isolated even when they reuse the same character id", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_ONE");
    createSeries(root, "SERIES_TWO");
    const one = physicalArtifact(root, ".jarvis-artifacts/uploads/one.jpg", "one", "image/jpeg");
    const two = physicalArtifact(root, ".jarvis-artifacts/uploads/two.jpg", "two", "image/jpeg");
    registerCharacter(root, "SERIES_ONE", "CHAR_SHARED_NAME", "One", [one]);
    registerCharacter(root, "SERIES_TWO", "CHAR_SHARED_NAME", "Two", [two]);

    const seriesOne = getSeriesBible({ root, seriesId: "SERIES_ONE" });
    const seriesTwo = getSeriesBible({ root, seriesId: "SERIES_TWO" });
    assert.equal(seriesOne.characters.CHAR_SHARED_NAME.referenceAssets[0].sha256, one.sha256);
    assert.equal(seriesTwo.characters.CHAR_SHARED_NAME.referenceAssets[0].sha256, two.sha256);
    assert.notDeepEqual(seriesOne.characters, seriesTwo.characters);
});

test("first episode number is never invented and canon advances only after human acceptance", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_COUNTER");
    const asset = physicalArtifact(root, ".jarvis-artifacts/uploads/counter.jpg", "counter", "image/jpeg");
    registerCharacter(root, "SERIES_COUNTER", "CHAR_COUNTER", "Counter", [asset]);
    assert.throws(() => prepareSeriesEpisode({
        root,
        seriesId: "SERIES_COUNTER",
        title: "Sin numero",
        script: "No inventar numero.",
        castIds: ["CHAR_COUNTER"]
    }), /SERIES_FIRST_EPISODE_NUMBER_REQUIRED/);

    const prepared = prepareEpisode27(root, "SERIES_COUNTER", ["CHAR_COUNTER"]);
    let canon = getSeriesBible({ root, seriesId: "SERIES_COUNTER" });
    assert.equal(canon.lastCompletedEpisodeNumber, null);
    const video = physicalArtifact(root, ".jarvis-artifacts/videos/counter.mp4", Buffer.alloc(120000), "video/mp4");
    markSeriesEpisodeGenerated({
        root,
        seriesId: "SERIES_COUNTER",
        episodeId: prepared.episode.episodeId,
        physicalArtifact: video.file,
        artifactSha256: video.sha256
    });
    canon = getSeriesBible({ root, seriesId: "SERIES_COUNTER" });
    assert.equal(canon.lastCompletedEpisodeNumber, null);
    acceptSeriesEpisode({
        root,
        seriesId: "SERIES_COUNTER",
        episodeId: prepared.episode.episodeId,
        humanAccepted: true,
        continuityEnd: { location: "FINAL_ACCEPTED" }
    });
    canon = getSeriesBible({ root, seriesId: "SERIES_COUNTER" });
    assert.equal(canon.lastCompletedEpisodeNumber, 27);
    assert.equal(canon.currentEpisodeNumber, 27);
});

test("each structural beat inherits the verified final state of the previous beat", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_BEATS");
    const asset = physicalArtifact(root, ".jarvis-artifacts/uploads/beats.jpg", "beats", "image/jpeg");
    registerCharacter(root, "SERIES_BEATS", "CHAR_BEATS", "Beats", [asset]);
    const prepared = prepareSeriesEpisode({
        root,
        seriesId: "SERIES_BEATS",
        episodeNumber: 1,
        title: "Dos beats",
        script: "Continuidad estructural.",
        castIds: ["CHAR_BEATS"],
        continuityStart: { location: "ROOM_A", prop: "PHONE" },
        storyBeats: [{
            exactAction: "Cambia de cuarto.",
            finalState: { location: "ROOM_B" }
        }, {
            exactAction: "Conserva el telefono.",
            initialState: {},
            finalState: { light: "NIGHT" }
        }]
    });
    assert.deepEqual(prepared.episode.storyBeats[1].initialState, {
        location: "ROOM_B",
        prop: "PHONE"
    });
    assert.deepEqual(prepared.episode.plannedContinuityEnd, {
        location: "ROOM_B",
        prop: "PHONE",
        light: "NIGHT"
    });
});

test("a secret becomes known only when human acceptance explicitly records its revelation", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_REVEAL");
    const asset = physicalArtifact(root, ".jarvis-artifacts/uploads/reveal.jpg", "reveal", "image/jpeg");
    registerCharacter(root, "SERIES_REVEAL", "CHAR_REVEAL", "Reveal", [asset], {
        secretsNotKnown: ["FACT_REVEALED"]
    });
    const prepared = prepareSeriesEpisode({
        root,
        seriesId: "SERIES_REVEAL",
        episodeNumber: 1,
        title: "Revelacion",
        script: "La revelacion se somete a aceptacion.",
        castIds: ["CHAR_REVEAL"]
    });
    generateAndAccept(root, "SERIES_REVEAL", prepared.episode.episodeId, {
        characters: [{
            characterId: "CHAR_REVEAL",
            knownFacts: ["FACT_REVEALED"],
            secretsRevealed: ["FACT_REVEALED"]
        }]
    });
    const canon = getSeriesBible({ root, seriesId: "SERIES_REVEAL" });
    assert.deepEqual(canon.characters.CHAR_REVEAL.knownFacts, ["FACT_REVEALED"]);
    assert.deepEqual(canon.characters.CHAR_REVEAL.secretsNotKnown, []);
});
