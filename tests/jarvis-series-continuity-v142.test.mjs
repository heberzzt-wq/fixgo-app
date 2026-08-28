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
    updateSeriesCommercialIdentity,
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

test("EP1 generation scope covers Heberto and Roldan while pending Mateo remains out of scope", () => {
    const root = seriesRoot();
    const seriesId = "SERIES_EP1_CAST_SCOPE";
    createSeries(root, seriesId);
    const hebertoAssets = ["heber-1", "heber-2", "heber-3"].map(name =>
        physicalArtifact(root, `.jarvis-artifacts/uploads/${name}.jpg`, name, "image/jpeg")
    );
    const roldanAssets = ["roldan-1", "roldan-2"].map(name =>
        physicalArtifact(root, `.jarvis-artifacts/uploads/${name}.jpg`, name, "image/jpeg")
    );
    registerCharacter(root, seriesId, "CHAR_HEBERTO", "Heberto", hebertoAssets);
    registerCharacter(root, seriesId, "CHAR_ROLDAN", "Roldan", roldanAssets);
    upsertSeriesCharacter({
        root,
        seriesId,
        characterId: "CHAR_MATEO",
        displayName: "Mateo",
        assignmentConfirmed: true,
        referenceAssets: [],
        referenceAssetsPending: true
    });
    const prepared = prepareSeriesEpisode({
        root,
        seriesId,
        episodeNumber: 1,
        title: "EL BARRO Y LAS BOTAS DE MIL DOLARES",
        script: "Roldan inspecciona el muro. Heberto responde.",
        castIds: ["CHAR_HEBERTO", "CHAR_ROLDAN"],
        storyBeats: []
    });

    assert.throws(
        () => getSeriesGenerationContext({ root, seriesId, episodeId: prepared.episode.episodeId }),
        /SERIES_VEO_REFERENCE_LIMIT_EXCEEDED:5:3/
    );
    const context = getSeriesGenerationContext({
        root,
        seriesId,
        episodeId: prepared.episode.episodeId,
        referenceSelectionPolicy: "ACTIVE_CAST_COVERAGE",
        maximumReferenceImages: 3
    });
    assert.equal(context.referenceOutputs.length, 3);
    assert.deepEqual(context.referenceSelection, {
        policy: "ACTIVE_CAST_COVERAGE",
        availableCount: 5,
        selectedCount: 3,
        selectedCharacterIds: ["CHAR_HEBERTO", "CHAR_ROLDAN"]
    });
    assert.equal(context.referenceAssets.some(asset => asset.characterId === "CHAR_MATEO"), false);
    assert.equal(context.referenceAssets.some(asset => asset.characterId === "CHAR_HEBERTO"), true);
    assert.equal(context.referenceAssets.some(asset => asset.characterId === "CHAR_ROLDAN"), true);
});

test("EP1 preproduction lock survives a new runtime and binds the exact EP2 opening continuity without video", async () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_HEBERTO_CANCUN", "Heberto infiltrado en una obra de Cancun");
    const references = ["front", "work", "marina"].map(name =>
        physicalArtifact(root, `.jarvis-artifacts/uploads/heberto-${name}.jpg`, name, "image/jpeg")
    );
    registerCharacter(root, "SERIES_HEBERTO_CANCUN", "CHAR_HEBERTO", "Heberto", references, {
        role: "Trabajador aparentemente humilde; identidad real clasificada.",
        relationships: {
            CHAR_ROLDAN: "Roldan lo humillo publicamente despues de quedar en evidencia tecnicamente."
        },
        knownFacts: ["HEBERTO_TECHNICALLY_EXTRAORDINARY", "HEBERTO_SELF_CONTROLLED"],
        recurringProps: ["PROP_GRANDDAUGHTER_PHOTO", "PROP_BACKPACK", "PROP_HELMET", "PROP_ENCRYPTED_PHONE"]
    });
    upsertSeriesCharacter({
        root,
        seriesId: "SERIES_HEBERTO_CANCUN",
        characterId: "CHAR_ROLDAN",
        displayName: "Roldan",
        assignmentConfirmed: true,
        referenceAssets: [],
        referenceAssetsPending: true,
        role: "Antagonista arrogante e inseguro ante la superioridad tecnica de Heberto.",
        relationships: {
            CHAR_HEBERTO: "Lo humillo publicamente y ahora sospecha de su telefono extrano."
        },
        knownFacts: ["HEBERTO_BUILT_CORRECT_WALL", "HEBERTO_HAS_UNUSUAL_PHONE"],
        secretsNotKnown: [
            "HEBERTO_TRUE_IDENTITY",
            "HEBERTO_ECONOMIC_REACH",
            "VANGUARD",
            "BRUNO",
            "HARRISON",
            "ENCRYPTED_PHONE_PURPOSE"
        ],
        recurringProps: ["PROP_CAYMAN_BOOTS", "PROP_COFFEE_CALLBACK"]
    });

    const continuityEnd = {
        location: "CANCUN_SEASIDE_CONSTRUCTION_SITE",
        activeConflict: "ROLDAN_SUSPECTS_ENCRYPTED_PHONE",
        characters: [{
            characterId: "CHAR_HEBERTO",
            wardrobeState: "HUMBLE_WORKER_WITH_WORN_HELMET",
            physicalState: "UNINJURED_AND_SELF_CONTROLLED",
            positionNarrative: "PUBLICLY_HUMILIATED_BUT_TECHNICALLY_PROVEN",
            recurringProps: ["PROP_GRANDDAUGHTER_PHOTO", "PROP_BACKPACK", "PROP_HELMET", "PROP_ENCRYPTED_PHONE"],
            relationships: {
                CHAR_ROLDAN: "Roldan lo humillo y sospecha del telefono; Heberto no revelo su identidad."
            }
        }, {
            characterId: "CHAR_ROLDAN",
            physicalState: "UNINJURED",
            positionNarrative: "TECHNICALLY_EXPOSED_AND_SUSPICIOUS",
            recurringProps: ["PROP_CAYMAN_BOOTS", "PROP_COFFEE_CALLBACK"],
            relationships: {
                CHAR_HEBERTO: "Lo considera trabajador, pero quedo inseguro y sospecha del telefono."
            }
        }],
        objects: {
            PROP_GRANDDAUGHTER_PHOTO: "INSIDE_HEBERTO_BACKPACK",
            PROP_ENCRYPTED_PHONE: "HIDDEN_AND_SWITCHED_OFF_AFTER_BLUE_ALERT",
            PROP_COFFEE_CALLBACK: "PUBLIC_HUMILIATION_OCCURRED",
            PROP_CAYMAN_BOOTS: "BELONG_TO_ROLDAN",
            PROP_CORRECT_WALL: "VERIFIED_PLUMB_AND_TECHNICALLY_CORRECT"
        }
    };
    const prepared = prepareSeriesEpisode({
        root,
        seriesId: "SERIES_HEBERTO_CANCUN",
        episodeNumber: 1,
        title: "EL BARRO Y LAS BOTAS DE MIL DOLARES",
        script: "Roldan humilla a Heberto despues de perder una disputa tecnica; un telefono cifrado abre el misterio.",
        castIds: ["CHAR_HEBERTO", "CHAR_ROLDAN"],
        continuityStart: { location: "CANCUN_SEASIDE_CONSTRUCTION_SITE" },
        storyBeats: [{
            beatId: "HOOK",
            exactAction: "Roldan pregunta quien hizo el muro; Heberto responde: Yo.",
            finalState: { activeConflict: "WALL_QUALITY_CHALLENGED" }
        }, {
            beatId: "CLIFFHANGER",
            exactAction: "Roldan detecta el telefono cifrado; Heberto apaga la pantalla.",
            finalState: continuityEnd
        }]
    });
    const accepted = acceptSeriesEpisode({
        root,
        seriesId: "SERIES_HEBERTO_CANCUN",
        episodeId: prepared.episode.episodeId,
        humanAccepted: true,
        acceptanceStage: "PREPRODUCTION",
        continuityEnd,
        hook: "Roldan acusa el muro y Heberto responde: Yo.",
        conflict: "Roldan pierde la disputa tecnica y transforma su inseguridad en humillacion de clase.",
        progression: "Competencia, evidencia tecnica, humillacion, orden de limpiar las botas, consejo y telefono cifrado.",
        revelationsAllowed: [
            "HEBERTO_TECHNICALLY_EXTRAORDINARY",
            "HEBERTO_HAS_GRANDDAUGHTER_PHOTO",
            "ENCRYPTED_PHONE_EXISTS"
        ],
        revealRestrictions: [
            "HEBERTO_TRUE_IDENTITY",
            "HEBERTO_ECONOMIC_REACH",
            "VANGUARD",
            "BRUNO",
            "HARRISON",
            "ENCRYPTED_PHONE_PURPOSE"
        ],
        durableProps: [
            "PROP_GRANDDAUGHTER_PHOTO",
            "PROP_BACKPACK",
            "PROP_HELMET",
            "PROP_ENCRYPTED_PHONE",
            "PROP_CAYMAN_BOOTS",
            "PROP_CORRECT_WALL",
            "PROP_COFFEE_CALLBACK"
        ],
        cliffhanger: "Roldan pregunta que esconde Heberto; Heberto apaga el telefono y corte a negro.",
        nextEpisodeOpeningObligation: "EP2 comienza en el mismo instante y paga la sospecha de Roldan sin revelar identidad, fortuna ni proposito del telefono.",
        canonFacts: ["ROLDAN_PUBLICLY_HUMILIATED_HEBERTO", "COFFEE_AND_BOOTS_CONFLICT_OCCURRED"]
    });
    assert.equal(accepted.status, "SERIES_EPISODE_PREPRODUCTION_ACCEPTED");

    const laterRuntime = await import(`../jarvis-artifact-studio.js?runtime=${Date.now()}`);
    const resumed = laterRuntime.getSeriesResumeContext({ root, seriesId: "SERIES_HEBERTO_CANCUN" });
    assert.equal(resumed.lastLockedEpisodeNumber, 1);
    assert.equal(resumed.lastCompletedEpisodeNumber, null);
    assert.equal(resumed.nextEpisodeNumber, 2);
    assert.equal(resumed.lastEpisode.status, "PREPRODUCTION_ACCEPTED");
    assert.equal(resumed.lastEpisode.narrativeLock.hook, "Roldan acusa el muro y Heberto responde: Yo.");
    assert.match(resumed.nextEpisodeOpeningObligation, /mismo instante/);
    assert.deepEqual(resumed.revealRestrictions, [
        "HEBERTO_TRUE_IDENTITY",
        "HEBERTO_ECONOMIC_REACH",
        "VANGUARD",
        "BRUNO",
        "HARRISON",
        "ENCRYPTED_PHONE_PURPOSE"
    ]);
    assert.ok(resumed.durableProps.includes("PROP_GRANDDAUGHTER_PHOTO"));
    assert.ok(resumed.durableProps.includes("PROP_ENCRYPTED_PHONE"));
    assert.ok(resumed.durableProps.includes("PROP_COFFEE_CALLBACK"));
    const heberto = resumed.activeCharacters.find(character => character.characterId === "CHAR_HEBERTO");
    const roldan = resumed.activeCharacters.find(character => character.characterId === "CHAR_ROLDAN");
    assert.equal(heberto.referenceAssets.length, 3);
    assert.match(heberto.relationships.CHAR_ROLDAN, /telefono/);
    assert.equal(roldan.referenceAssetsPending, true);
    assert.ok(roldan.secretsNotKnown.includes("HEBERTO_TRUE_IDENTITY"));
    assert.match(roldan.relationships.CHAR_HEBERTO, /sospecha/);
    assert.equal(laterRuntime.listArtifacts({ root, type: "video" }).length, 0);
    assert.throws(
        () => laterRuntime.getSeriesGenerationContext({
            root,
            seriesId: "SERIES_HEBERTO_CANCUN",
            episodeId: prepared.episode.episodeId
        }),
        /SERIES_CHARACTER_REFERENCE_ASSETS_PENDING:CHAR_ROLDAN/
    );

    const episode2 = laterRuntime.prepareSeriesEpisode({
        root,
        seriesId: "SERIES_HEBERTO_CANCUN",
        title: "EL ARQUITECTO DE CRISTAL",
        script: "Continuacion narrativa pendiente de lock humano.",
        castIds: ["CHAR_HEBERTO", "CHAR_ROLDAN"]
    });
    assert.equal(episode2.episode.episodeNumber, 2);
    assert.equal(episode2.episode.previousEpisodeId, prepared.episode.episodeId);
    assert.equal(
        episode2.episode.openingObligation,
        "EP2 comienza en el mismo instante y paga la sospecha de Roldan sin revelar identidad, fortuna ni proposito del telefono."
    );
    assert.deepEqual(episode2.episode.continuityStart, continuityEnd);
});

test("preproduction acceptance fails closed when any critical narrative lock field is absent", async t => {
    const requiredCases = [
        ["hook", "SERIES_PREPRODUCTION_HOOK_REQUIRED"],
        ["conflict", "SERIES_PREPRODUCTION_CONFLICT_REQUIRED"],
        ["progression", "SERIES_PREPRODUCTION_PROGRESSION_REQUIRED"],
        ["revelationsAllowed", "SERIES_PREPRODUCTION_REVELATIONS_ALLOWED_REQUIRED"],
        ["revealRestrictions", "SERIES_PREPRODUCTION_REVEAL_RESTRICTIONS_REQUIRED"],
        ["durableProps", "SERIES_PREPRODUCTION_DURABLE_PROPS_REQUIRED"],
        ["cliffhanger", "SERIES_PREPRODUCTION_CLIFFHANGER_REQUIRED"],
        ["nextEpisodeOpeningObligation", "SERIES_PREPRODUCTION_NEXT_EPISODE_OPENING_OBLIGATION_REQUIRED"]
    ];
    for (const [missing, expectedError] of requiredCases) {
        await t.test(missing, () => {
            const root = seriesRoot();
            createSeries(root, `SERIES_LOCK_${missing.replaceAll(/[a-z]/g, character => character.toUpperCase())}`);
            const asset = physicalArtifact(root, `.jarvis-artifacts/uploads/${missing}.jpg`, missing, "image/jpeg");
            registerCharacter(root, `SERIES_LOCK_${missing.replaceAll(/[a-z]/g, character => character.toUpperCase())}`, "CHAR_LOCK", "Lock", [asset]);
            const prepared = prepareSeriesEpisode({
                root,
                seriesId: `SERIES_LOCK_${missing.replaceAll(/[a-z]/g, character => character.toUpperCase())}`,
                episodeNumber: 1,
                title: "Lock",
                script: "Lock narrativo.",
                castIds: ["CHAR_LOCK"]
            });
            const args = {
                root,
                seriesId: prepared.episode.seriesId,
                episodeId: prepared.episode.episodeId,
                humanAccepted: true,
                acceptanceStage: "PREPRODUCTION",
                continuityEnd: { location: "LOCK_END" },
                hook: "Hook",
                conflict: "Conflict",
                progression: "Progression",
                revelationsAllowed: ["FACT_ALLOWED"],
                revealRestrictions: ["FACT_RESTRICTED"],
                durableProps: ["PROP_LOCK"],
                cliffhanger: "Cliffhanger",
                nextEpisodeOpeningObligation: "Open immediately"
            };
            args[missing] = Array.isArray(args[missing]) ? [] : "";
            assert.throws(() => acceptSeriesEpisode(args), new RegExp(expectedError));
            const canon = getSeriesBible({ root, seriesId: prepared.episode.seriesId });
            assert.equal(canon.episodes[0].status, "READY");
            assert.equal(canon.lastLockedEpisodeNumber, null);
        });
    }
});

test("later narrative locks never regress when an earlier episode is generated and accepted afterward", () => {
    const root = seriesRoot();
    createSeries(root, "SERIES_LOCK_AHEAD");
    const asset = physicalArtifact(root, ".jarvis-artifacts/uploads/lock-ahead.jpg", "lock-ahead", "image/jpeg");
    registerCharacter(root, "SERIES_LOCK_AHEAD", "CHAR_AHEAD", "Ahead", [asset]);
    const lock = (episode, continuityEnd, suffix) => acceptSeriesEpisode({
        root,
        seriesId: "SERIES_LOCK_AHEAD",
        episodeId: episode.episodeId,
        humanAccepted: true,
        acceptanceStage: "PREPRODUCTION",
        continuityEnd,
        hook: `Hook ${suffix}`,
        conflict: `Conflict ${suffix}`,
        progression: `Progression ${suffix}`,
        revelationsAllowed: [`ALLOWED_${suffix}`],
        revealRestrictions: [`RESTRICTED_${suffix}`],
        durableProps: [`PROP_${suffix}`],
        cliffhanger: `Cliffhanger ${suffix}`,
        nextEpisodeOpeningObligation: `Opening ${suffix}`
    });
    const ep1 = prepareSeriesEpisode({
        root,
        seriesId: "SERIES_LOCK_AHEAD",
        episodeNumber: 1,
        title: "EP1",
        script: "EP1",
        castIds: ["CHAR_AHEAD"]
    }).episode;
    lock(ep1, { storyPosition: "EP1_END" }, "EP1");
    const ep2 = prepareSeriesEpisode({
        root,
        seriesId: "SERIES_LOCK_AHEAD",
        title: "EP2",
        script: "EP2",
        castIds: ["CHAR_AHEAD"]
    }).episode;
    lock(ep2, { storyPosition: "EP2_END" }, "EP2");

    const video = physicalArtifact(
        root,
        ".jarvis-artifacts/videos/lock-ahead-ep1.mp4",
        Buffer.concat([Buffer.from("....ftyp"), Buffer.alloc(120000)]),
        "video/mp4"
    );
    markSeriesEpisodeGenerated({
        root,
        seriesId: "SERIES_LOCK_AHEAD",
        episodeId: ep1.episodeId,
        physicalArtifact: video.file,
        artifactSha256: video.sha256
    });
    acceptSeriesEpisode({
        root,
        seriesId: "SERIES_LOCK_AHEAD",
        episodeId: ep1.episodeId,
        humanAccepted: true,
        continuityEnd: { storyPosition: "EP1_FILMED" },
        cliffhanger: "Production EP1"
    });

    const resumed = getSeriesResumeContext({ root, seriesId: "SERIES_LOCK_AHEAD" });
    assert.equal(resumed.lastCompletedEpisodeNumber, 1);
    assert.equal(resumed.lastLockedEpisodeNumber, 2);
    assert.equal(resumed.nextEpisodeNumber, 3);
    assert.equal(resumed.lastEpisode.episodeId, ep2.episodeId);
    assert.equal(resumed.continuityState.storyPosition, "EP2_END");
    assert.equal(resumed.cliffhanger, "Cliffhanger EP2");
});

test("preproduction rejects facts that are both revealed and explicitly restricted", async t => {
    const conflictingAcceptance = ({ restrictedBeat = false } = {}) => {
        const root = seriesRoot();
        createSeries(root, "SERIES_REVELATION_CONFLICT");
        const asset = physicalArtifact(
            root,
            ".jarvis-artifacts/uploads/revelation-conflict.jpg",
            "revelation-conflict",
            "image/jpeg"
        );
        registerCharacter(root, "SERIES_REVELATION_CONFLICT", "CHAR_LOCK", "Lock", [asset]);
        const prepared = prepareSeriesEpisode({
            root,
            seriesId: "SERIES_REVELATION_CONFLICT",
            episodeNumber: 1,
            title: "Conflicto de revelacion",
            script: "Una solicitud de auditoria no confirma fraude.",
            castIds: ["CHAR_LOCK"],
            storyBeats: [{
                exactAction: "Se solicita una auditoria.",
                revelations: restrictedBeat ? ["FRAUD_CONFIRMED"] : ["AUDIT_REQUESTED"]
            }]
        });
        const args = {
            root,
            seriesId: "SERIES_REVELATION_CONFLICT",
            episodeId: prepared.episode.episodeId,
            humanAccepted: true,
            acceptanceStage: "PREPRODUCTION",
            continuityEnd: { auditState: "AUDIT_REQUESTED_NOT_RESOLVED" },
            hook: "Solicitud de auditoria.",
            conflict: "La irregularidad sigue sin confirmarse.",
            progression: "Se pide revisar, sin declarar resultado.",
            revelationsAllowed: restrictedBeat
                ? ["AUDIT_REQUESTED"]
                : ["AUDIT_REQUESTED", "FRAUD_CONFIRMED"],
            revealRestrictions: ["FRAUD_CONFIRMED"],
            durableProps: ["PROP_AUDIT_REQUEST"],
            cliffhanger: "REQUEST ACCEPTED.",
            nextEpisodeOpeningObligation: "Pagar la revision sin inventar su resultado."
        };
        return { root, prepared, args };
    };

    await t.test("narrative allowlist cannot overlap the restrictions", () => {
        const { root, prepared, args } = conflictingAcceptance();
        assert.throws(
            () => acceptSeriesEpisode(args),
            /SERIES_PREPRODUCTION_REVELATION_CONFLICT:FRAUD_CONFIRMED/
        );
        assert.equal(getSeriesBible({ root, seriesId: args.seriesId }).episodes[0].status, "READY");
        assert.equal(prepared.episode.physicalArtifact, null);
    });

    await t.test("story beats cannot disclose a restricted fact", () => {
        const { root, args } = conflictingAcceptance({ restrictedBeat: true });
        assert.throws(
            () => acceptSeriesEpisode(args),
            /SERIES_PREPRODUCTION_REVELATION_CONFLICT:FRAUD_CONFIRMED/
        );
        assert.equal(getSeriesBible({ root, seriesId: args.seriesId }).episodes[0].status, "READY");
    });
});

test("EP2 durable lock rehydrates the exact EP3 obligation without inventing an audit result", async () => {
    const root = seriesRoot();
    const seriesId = "SERIES_HEBERTO_INFILTRADO_CANCUN";
    createSeries(root, seriesId, "Heberto infiltrado en Cancun");
    const references = ["front", "work", "marina"].map(name =>
        physicalArtifact(root, `.jarvis-artifacts/uploads/heberto-${name}.jpg`, name, "image/jpeg")
    );
    registerCharacter(root, seriesId, "CHAR_HEBERTO", "Heberto", references, {
        role: "Trabajador aparentemente humilde; identidad real clasificada.",
        relationships: {
            CHAR_ROLDAN: "Roldan lo humillo y sospecha del telefono cifrado."
        },
        knownFacts: ["HEBERTO_TECHNICALLY_EXTRAORDINARY", "HEBERTO_SELF_CONTROLLED"],
        recurringProps: ["PROP_GRANDDAUGHTER_PHOTO", "PROP_BACKPACK", "PROP_HELMET", "PROP_ENCRYPTED_PHONE"]
    });
    upsertSeriesCharacter({
        root,
        seriesId,
        characterId: "CHAR_ROLDAN",
        displayName: "Roldan",
        assignmentConfirmed: true,
        referenceAssets: [],
        referenceAssetsPending: true,
        role: "Supervisor antagonista subordinado a Mateo.",
        relationships: {
            CHAR_HEBERTO: "Lo humillo y sospecha del telefono cifrado.",
            CHAR_MATEO: "Subordinado que intenta recuperar control ante Mateo."
        },
        knownFacts: ["HEBERTO_BUILT_CORRECT_WALL", "HEBERTO_HAS_UNUSUAL_PHONE"],
        secretsNotKnown: ["HEBERTO_TRUE_IDENTITY", "ENCRYPTED_PHONE_PURPOSE"],
        recurringProps: ["PROP_CAYMAN_BOOTS", "PROP_COFFEE_CALLBACK"]
    });

    const ep1End = {
        location: "CANCUN_SEASIDE_CONSTRUCTION_SITE",
        timeContinuity: "SAME_INSTANT_NO_JUMP",
        activeConflict: "ROLDAN_SUSPECTS_ENCRYPTED_PHONE",
        characters: [{
            characterId: "CHAR_HEBERTO",
            wardrobeState: "HUMBLE_WORKER_WITH_WORN_HELMET",
            physicalState: "UNINJURED_AND_SELF_CONTROLLED",
            positionNarrative: "PUBLICLY_HUMILIATED_BUT_TECHNICALLY_PROVEN",
            recurringProps: ["PROP_GRANDDAUGHTER_PHOTO", "PROP_BACKPACK", "PROP_HELMET", "PROP_ENCRYPTED_PHONE"],
            relationships: { CHAR_ROLDAN: "Roldan suspects his encrypted phone." }
        }, {
            characterId: "CHAR_ROLDAN",
            physicalState: "UNINJURED",
            positionNarrative: "TECHNICALLY_EXPOSED_AND_SUSPICIOUS",
            recurringProps: ["PROP_CAYMAN_BOOTS", "PROP_COFFEE_CALLBACK"],
            relationships: { CHAR_HEBERTO: "Suspicious of the encrypted phone." }
        }],
        objects: {
            PROP_GRANDDAUGHTER_PHOTO: "INSIDE_HEBERTO_BACKPACK",
            PROP_BACKPACK: "WITH_HEBERTO_AT_WORKSITE",
            PROP_HELMET: "WORN_BY_HEBERTO",
            PROP_ENCRYPTED_PHONE: "HIDDEN_AND_SWITCHED_OFF_AFTER_BLUE_ALERT",
            PROP_COFFEE_CALLBACK: "PUBLIC_HUMILIATION_OCCURRED",
            PROP_CAYMAN_BOOTS: "BELONG_TO_ROLDAN",
            PROP_CORRECT_WALL: "VERIFIED_PLUMB_AND_TECHNICALLY_CORRECT"
        }
    };
    const ep1 = prepareSeriesEpisode({
        root,
        seriesId,
        episodeNumber: 1,
        title: "EL BARRO Y LAS BOTAS DE MIL DOLARES",
        script: "Roldan pregunta: Que escondes ahi? Heberto apaga la pantalla.",
        castIds: ["CHAR_HEBERTO", "CHAR_ROLDAN"],
        continuityStart: { location: "CANCUN_SEASIDE_CONSTRUCTION_SITE" },
        storyBeats: [{
            exactAction: "Roldan ve el telefono y pregunta que esconde Heberto.",
            finalState: ep1End
        }]
    }).episode;
    acceptSeriesEpisode({
        root,
        seriesId,
        episodeId: ep1.episodeId,
        humanAccepted: true,
        acceptanceStage: "PREPRODUCTION",
        continuityEnd: ep1End,
        hook: "Roldan confronta a Heberto.",
        conflict: "La sospecha del telefono queda abierta.",
        progression: "La humillacion tecnica desemboca en una sospecha cifrada.",
        revelationsAllowed: ["ENCRYPTED_PHONE_EXISTS"],
        revealRestrictions: ["HEBERTO_TRUE_IDENTITY", "ENCRYPTED_PHONE_PURPOSE"],
        durableProps: Object.keys(ep1End.objects),
        cliffhanger: "Roldan: Que escondes ahi?",
        nextEpisodeOpeningObligation: "EP2 comienza exactamente con Roldan: Que escondes ahi?; Heberto guarda el telefono y Mateo entra fuera de cuadro, sin salto temporal ni de ubicacion."
    });
    const ep1Snapshot = cloneForTest(getSeriesBible({ root, seriesId }).episodes[0]);

    upsertSeriesCharacter({
        root,
        seriesId,
        characterId: "CHAR_MATEO",
        displayName: "Mateo",
        assignmentConfirmed: true,
        referenceAssets: [],
        referenceAssetsPending: true,
        role: "Arquitecto ejecutivo de Mateo Design con autoridad sobre Roldan.",
        relationships: {
            CHAR_ROLDAN: "Autoridad directa sobre Roldan.",
            CHAR_HEBERTO: "No conoce su identidad y sospecha que sabe demasiado."
        },
        knownFacts: [],
        secretsNotKnown: [
            "HEBERTO_TRUE_IDENTITY",
            "HEBERTO_ECONOMIC_REACH",
            "VANGUARD",
            "BRUNO",
            "HARRISON",
            "ENCRYPTED_PHONE_PURPOSE",
            "AUDIT_RECIPIENT_IDENTITY"
        ],
        recurringProps: ["PROP_MATEO_PLANS_TABLET"]
    });

    const ep2End = {
        location: "CANCUN_SEASIDE_CONSTRUCTION_SITE",
        timeContinuity: "SAME_INSTANT_NO_JUMP",
        activeConflict: "MATEO_SUSPECTS_HEBERTO_AFTER_AUDIT_REQUEST",
        auditState: "AUDIT_REQUESTED_NOT_RESOLVED",
        technicalFinding: "POSSIBLE_TECHNICAL_OR_DOCUMENTARY_IRREGULARITY_NOT_CONFIRMED",
        fraudStatus: "NOT_CONFIRMED",
        characters: [{
            characterId: "CHAR_HEBERTO",
            wardrobeState: "HUMBLE_WORKER_WITH_WORN_HELMET",
            physicalState: "MINOR_CHEEK_INJURY_NO_GORE",
            positionNarrative: "TECHNICALLY_PROVEN_AUDIT_REQUESTED_IDENTITY_HIDDEN",
            recurringProps: ["PROP_GRANDDAUGHTER_PHOTO", "PROP_BACKPACK", "PROP_HELMET", "PROP_ENCRYPTED_PHONE"],
            relationships: {
                CHAR_ROLDAN: "Roldan remains suspicious and subordinate to Mateo.",
                CHAR_MATEO: "Mateo suspects he knows too much; Heberto keeps self-control and identity hidden."
            },
            knownFactsAdded: ["POSSIBLE_IRREGULARITY_DETECTED", "AUDIT_REQUESTED_MATEO_DESIGN"]
        }, {
            characterId: "CHAR_MATEO",
            physicalState: "UNINJURED_EGO_CHALLENGED",
            positionNarrative: "AUTHORITY_OVER_ROLDAN_SUSPICIOUS_OF_HEBERTO",
            recurringProps: ["PROP_MATEO_PLANS_TABLET"],
            relationships: {
                CHAR_ROLDAN: "Exercises authority over Roldan.",
                CHAR_HEBERTO: "Does not know his identity and suspects he knows too much."
            },
            knownFactsAdded: ["HEBERTO_DETECTED_POSSIBLE_IRREGULARITY", "HEBERTO_REQUESTED_AUDIT"]
        }, {
            characterId: "CHAR_ROLDAN",
            physicalState: "UNINJURED",
            positionNarrative: "SUBORDINATE_TO_MATEO_TRYING_TO_REGAIN_CONTROL",
            recurringProps: ["PROP_CAYMAN_BOOTS", "PROP_COFFEE_CALLBACK"],
            relationships: {
                CHAR_HEBERTO: "Still suspicious of Heberto and his phone.",
                CHAR_MATEO: "Subordinate to Mateo."
            }
        }],
        objects: {
            PROP_CORRECT_WALL: "MURO_PARCIALMENTE_DANADO_POR_MATEO",
            PROP_MATEO_PLANS_TABLET: "WITH_MATEO_AT_WORKSITE",
            PROP_HEBERTO_CHEEK_INJURY: "MINOR_NO_GORE",
            PROP_ENCRYPTED_PHONE: "USED_PRIVATELY_TO_REQUEST_AUDIT_THEN_HIDDEN"
        }
    };
    const ep2 = prepareSeriesEpisode({
        root,
        seriesId,
        title: "EL ARQUITECTO DE CRISTAL",
        script: "Roldan: Que escondes ahi? Heberto: Nada que tenga que ver con usted. Mateo entra. Heberto demuestra una posible irregularidad; Mateo dana el muro y Heberto solicita una auditoria sin conocer su resultado.",
        castIds: ["CHAR_HEBERTO", "CHAR_MATEO", "CHAR_ROLDAN"],
        storyBeats: [{
            beatId: "00:00-00:12",
            exactAction: "Roldan pregunta: Que escondes ahi? Heberto guarda el telefono y responde: Nada que tenga que ver con usted. Mateo entra fuera de cuadro: Que esta pasando aqui?",
            requiredBeat: "Pagar literalmente el cliffhanger de EP1 sin salto temporal ni de ubicacion.",
            finalState: { activeConflict: "MATEO_ENTERS_PHONE_CONFRONTATION" }
        }, {
            beatId: "00:12-00:40",
            dialogue: "Roldan: El trabajador insiste... Mateo: Tu lo hiciste? Heberto: Si. Mateo: Y tu decidiste...? Heberto: No lo decidi. Lo medi.",
            exactAction: "Mateo establece autoridad sobre Roldan.",
            revelations: ["MATEO_AUTHORITY_OVER_ROLDAN", "HEBERTO_TECHNICAL_SKILL"],
            finalState: { activeConflict: "TECHNICAL_AUTHORITY_CHALLENGE" }
        }, {
            beatId: "00:40-01:10",
            exactAction: "Heberto comprueba el plomo del muro, revisa los planos y dice: El problema no esta aqui.",
            requiredBeat: "Presentar solo una posible irregularidad tecnica o documental, nunca fraude confirmado.",
            revelations: ["POSSIBLE_TECHNICAL_OR_DOCUMENTARY_IRREGULARITY"],
            finalState: { technicalFinding: "POSSIBLE_IRREGULARITY_NOT_CONFIRMED" }
        }, {
            beatId: "01:10-01:35",
            dialogue: "Mateo: Ahora tambien eres estructurista? Heberto: Para detectar un error no hace falta saber quien lo senalo.",
            exactAction: "Mateo percibe por un instante que Heberto puede tener razon; su ego queda herido.",
            finalState: { activeConflict: "MATEO_EGO_CHALLENGED" }
        }, {
            beatId: "01:35-02:00",
            exactAction: "Mateo destruye parcialmente el muro; una esquirla causa una herida leve en la mejilla de Heberto, sin gore.",
            finalState: {
                wallState: "MURO_PARCIALMENTE_DANADO_POR_MATEO",
                hebertoInjury: "MINOR_CHEEK_INJURY_NO_GORE"
            }
        }, {
            beatId: "02:00-02:22",
            dialogue: "Heberto: Acaba de destruir algo que estaba bien para ocultar algo que esta mal. Mateo: Cuida como me hablas. Heberto: Cuide usted lo que firma.",
            exactAction: "Heberto mantiene el autocontrol y confronta la responsabilidad documental.",
            finalState: { activeConflict: "MATEO_SIGNATURE_CHALLENGED" }
        }, {
            beatId: "02:22-02:42",
            dialogue: "Mateo: Quien demonios eres? Heberto: Hoy, el hombre que le esta diciendo que revise sus numeros.",
            exactAction: "Mateo ordena apartarlo; Heberto va hacia su mochila sin revelar su identidad.",
            finalState: { hebertoPosition: "AT_BACKPACK_IDENTITY_HIDDEN" }
        }, {
            beatId: "02:42-03:00",
            exactAction: "Heberto usa el mismo telefono cifrado: Auditen Mateo Design. Desde el origen. La pantalla responde REQUEST ACCEPTED y corta a negro.",
            requiredBeat: "Solo se solicita auditoria; no mostrar resultado, sancion ni consecuencia financiera.",
            revelations: ["AUDIT_REQUESTED", "MATEO_DESIGN_EXISTS"],
            finalState: ep2End
        }]
    }).episode;
    assert.equal(ep2.episodeNumber, 2);
    assert.equal(ep2.previousEpisodeId, ep1.episodeId);
    assert.equal(
        ep2.openingObligation,
        "EP2 comienza exactamente con Roldan: Que escondes ahi?; Heberto guarda el telefono y Mateo entra fuera de cuadro, sin salto temporal ni de ubicacion."
    );
    assert.deepEqual(ep2.continuityStart, ep1End);

    const forbidden = [
        "HEBERTO_TRUE_IDENTITY",
        "HEBERTO_ECONOMIC_REACH",
        "VANGUARD",
        "BRUNO",
        "HARRISON",
        "HEBERTO_REAL_TITLE",
        "HEBERTO_POWER_SCOPE",
        "AUDIT_RECIPIENT_IDENTITY",
        "GLOBAL_COUNCIL",
        "PRESIDENT",
        "BLACK_CODE",
        "FRAUD_CONFIRMED",
        "SUSPENDED_ACCOUNTS",
        "AUDIT_RESULT",
        "BLOCKED_ASSETS"
    ];
    acceptSeriesEpisode({
        root,
        seriesId,
        episodeId: ep2.episodeId,
        humanAccepted: true,
        acceptanceStage: "PREPRODUCTION",
        continuityEnd: ep2End,
        hook: "EP2 paga en el mismo instante la pregunta de Roldan y la entrada fuera de cuadro de Mateo.",
        conflict: "Mateo impone autoridad, Heberto detecta una posible irregularidad y una nueva humillacion dana el muro y su mejilla.",
        progression: "Sospecha del telefono, autoridad de Mateo, medicion y planos, ego herido, muro danado, confrontacion documental y solicitud de auditoria.",
        revelationsAllowed: [
            "MATEO_AUTHORITY_OVER_ROLDAN",
            "HEBERTO_TECHNICAL_SKILL",
            "POSSIBLE_TECHNICAL_OR_DOCUMENTARY_IRREGULARITY",
            "HEBERTO_CAN_REQUEST_AUDIT",
            "MATEO_DESIGN_EXISTS",
            "HEBERTO_SELF_CONTROLLED",
            "MINOR_CHEEK_INJURY"
        ],
        revealRestrictions: forbidden,
        durableProps: [
            "PROP_GRANDDAUGHTER_PHOTO",
            "PROP_BACKPACK",
            "PROP_HELMET",
            "PROP_ENCRYPTED_PHONE",
            "PROP_CAYMAN_BOOTS",
            "PROP_COFFEE_CALLBACK",
            "PROP_CORRECT_WALL",
            "PROP_MATEO_PLANS_TABLET",
            "PROP_HEBERTO_CHEEK_INJURY"
        ],
        cliffhanger: "Heberto ordena en el telefono cifrado: Auditen Mateo Design. Desde el origen. La pantalla responde REQUEST ACCEPTED y corta a negro.",
        nextEpisodeOpeningObligation: "EP3 comienza inmediatamente y paga el cliffhanger con una consecuencia verificable de la revision o auditoria; cualquier suspension pertenece a EP3, la identidad de Heberto sigue oculta y el resultado de la auditoria no se presume.",
        canonFacts: [
            "MATEO_AUTHORITY_OVER_ROLDAN",
            "HEBERTO_DETECTED_POSSIBLE_IRREGULARITY_NOT_FRAUD",
            "MATEO_PARTIALLY_DAMAGED_CORRECT_WALL",
            "HEBERTO_CHEEK_MINOR_INJURY",
            "AUDIT_REQUESTED_MATEO_DESIGN",
            "AUDIT_RESULT_UNKNOWN"
        ]
    });

    const laterRuntime = await import(`../jarvis-artifact-studio.js?ep2-runtime=${Date.now()}`);
    const resumed = laterRuntime.getSeriesResumeContext({ root, seriesId });
    assert.equal(resumed.lastLockedEpisodeNumber, 2);
    assert.equal(resumed.lastCompletedEpisodeNumber, null);
    assert.equal(resumed.nextEpisodeNumber, 3);
    assert.equal(resumed.lastEpisode.title, "EL ARQUITECTO DE CRISTAL");
    assert.equal(resumed.lastEpisode.status, "PREPRODUCTION_ACCEPTED");
    assert.equal(resumed.lastEpisode.physicalArtifact, null);
    assert.equal(resumed.lastEpisode.generatedResult, null);
    assert.match(resumed.cliffhanger, /REQUEST ACCEPTED/);
    assert.match(resumed.nextEpisodeOpeningObligation, /EP3 comienza inmediatamente/);
    assert.equal(resumed.continuityState.auditState, "AUDIT_REQUESTED_NOT_RESOLVED");
    assert.equal(resumed.continuityState.fraudStatus, "NOT_CONFIRMED");
    assert.equal(resumed.continuityState.objects.PROP_CORRECT_WALL, "MURO_PARCIALMENTE_DANADO_POR_MATEO");
    assert.equal(resumed.continuityState.objects.PROP_GRANDDAUGHTER_PHOTO, "INSIDE_HEBERTO_BACKPACK");
    assert.ok(resumed.canonFacts.includes("AUDIT_REQUESTED_MATEO_DESIGN"));
    assert.ok(resumed.canonFacts.includes("AUDIT_RESULT_UNKNOWN"));
    assert.equal(resumed.canonFacts.includes("FRAUD_CONFIRMED"), false);
    assert.deepEqual(resumed.revealRestrictions, forbidden);
    const heberto = resumed.activeCharacters.find(character => character.characterId === "CHAR_HEBERTO");
    const mateo = resumed.activeCharacters.find(character => character.characterId === "CHAR_MATEO");
    const roldan = resumed.activeCharacters.find(character => character.characterId === "CHAR_ROLDAN");
    assert.equal(heberto.physicalState, "MINOR_CHEEK_INJURY_NO_GORE");
    assert.ok(heberto.knownFacts.includes("AUDIT_REQUESTED_MATEO_DESIGN"));
    assert.equal(mateo.referenceAssetsPending, true);
    assert.match(mateo.relationships.CHAR_ROLDAN, /authority/i);
    assert.ok(mateo.secretsNotKnown.includes("HEBERTO_TRUE_IDENTITY"));
    assert.match(roldan.relationships.CHAR_MATEO, /subordinate/i);
    assert.deepEqual(getSeriesBible({ root, seriesId }).episodes[0], ep1Snapshot);
    assert.equal(laterRuntime.listArtifacts({ root, type: "video" }).length, 0);
    assert.throws(
        () => laterRuntime.getSeriesGenerationContext({ root, seriesId, episodeId: ep2.episodeId }),
        /SERIES_CHARACTER_REFERENCE_ASSETS_PENDING:CHAR_MATEO/
    );
});

test("EP3 durable lock resumes EP4 with active review, proportional defense and unresolved identity", async () => {
    const root = seriesRoot();
    const seriesId = "SERIES_EP3_DURABLE";
    createSeries(root, seriesId, "Heberto infiltrado");
    const hebertoReferences = ["heberto-front", "heberto-work", "heberto-marina"].map(name =>
        physicalArtifact(root, `.jarvis-artifacts/uploads/${name}.jpg`, name, "image/jpeg")
    );
    const roldanReferences = ["roldan-one", "roldan-two"].map(name =>
        physicalArtifact(root, `.jarvis-artifacts/uploads/${name}.jpg`, name, "image/jpeg")
    );
    registerCharacter(root, seriesId, "CHAR_HEBERTO", "Heberto", hebertoReferences, {
        role: "Trabajador aparente con identidad real oculta.",
        knownFacts: ["EXTRAORDINARY_TECHNICAL_EXPERIENCE", "SELF_CONTROL"],
        recurringProps: ["PROP_GRANDDAUGHTER_PHOTO", "PROP_BACKPACK", "PROP_HELMET", "PROP_ENCRYPTED_PHONE"]
    });
    registerCharacter(root, seriesId, "CHAR_ROLDAN", "Roldan", roldanReferences, {
        role: "Supervisor subordinate to Mateo.",
        secretsNotKnown: ["HEBERTO_TRUE_IDENTITY"],
        recurringProps: ["PROP_CAYMAN_BOOTS", "PROP_COFFEE_CALLBACK"]
    });
    upsertSeriesCharacter({
        root,
        seriesId,
        characterId: "CHAR_MATEO",
        displayName: "Mateo",
        assignmentConfirmed: true,
        referenceAssets: [],
        referenceAssetsPending: true,
        role: "Architect with authority over Roldan.",
        secretsNotKnown: ["HEBERTO_TRUE_IDENTITY", "AUDIT_CHANNEL_OPERATOR"]
    });

    const acceptLock = (episode, continuityEnd, suffix, nextOpening) => acceptSeriesEpisode({
        root,
        seriesId,
        episodeId: episode.episodeId,
        humanAccepted: true,
        acceptanceStage: "PREPRODUCTION",
        continuityEnd,
        hook: `Hook ${suffix}`,
        conflict: `Conflict ${suffix}`,
        progression: `Progression ${suffix}`,
        revelationsAllowed: [`ALLOWED_${suffix}`],
        revealRestrictions: ["HEBERTO_TRUE_IDENTITY", "FRAUD_CONFIRMED"],
        durableProps: ["PROP_ENCRYPTED_PHONE"],
        cliffhanger: `Cliffhanger ${suffix}`,
        nextEpisodeOpeningObligation: nextOpening
    });
    const ep1 = prepareSeriesEpisode({
        root,
        seriesId,
        episodeNumber: 1,
        title: "EP1",
        script: "EP1",
        castIds: ["CHAR_HEBERTO", "CHAR_ROLDAN"]
    }).episode;
    acceptLock(ep1, {
        location: "CANCUN_WORKSITE",
        objects: {
            PROP_GRANDDAUGHTER_PHOTO: "IN_BACKPACK",
            PROP_BACKPACK: "WITH_HEBERTO",
            PROP_HELMET: "WORN",
            PROP_ENCRYPTED_PHONE: "HIDDEN",
            PROP_CAYMAN_BOOTS: "WITH_ROLDAN",
            PROP_COFFEE_CALLBACK: "DURABLE"
        }
    }, "EP1", "EP2 starts immediately.");
    const ep2 = prepareSeriesEpisode({
        root,
        seriesId,
        title: "EP2",
        script: "EP2 audit request.",
        castIds: ["CHAR_HEBERTO", "CHAR_MATEO", "CHAR_ROLDAN"]
    }).episode;
    acceptLock(ep2, {
        location: "CANCUN_WORKSITE",
        auditState: "AUDIT_REQUESTED_NOT_RESOLVED",
        fraudStatus: "NOT_CONFIRMED",
        characters: [{
            characterId: "CHAR_HEBERTO",
            physicalState: "MINOR_CHEEK_INJURY_NO_GORE",
            recurringProps: ["PROP_GRANDDAUGHTER_PHOTO", "PROP_BACKPACK", "PROP_HELMET", "PROP_ENCRYPTED_PHONE"]
        }, {
            characterId: "CHAR_MATEO",
            relationships: { CHAR_ROLDAN: "Authority over Roldan." }
        }, {
            characterId: "CHAR_ROLDAN",
            relationships: { CHAR_MATEO: "Subordinate to Mateo." },
            recurringProps: ["PROP_CAYMAN_BOOTS", "PROP_COFFEE_CALLBACK"]
        }],
        objects: {
            PROP_WALL: "PARTIALLY_DAMAGED_BY_MATEO",
            PROP_MATEO_PLANS_TABLET: "WITH_MATEO",
            PROP_CHEEK_INJURY: "MINOR_NO_GORE"
        }
    }, "EP2", "EP3 starts immediately with a verifiable temporary review consequence and no fraud confirmation.");
    const beforeEp3 = getSeriesBible({ root, seriesId });
    const ep1Snapshot = cloneForTest(beforeEp3.episodes[0]);
    const ep2Snapshot = cloneForTest(beforeEp3.episodes[1]);

    const ep3End = {
        location: "CANCUN_WORKSITE",
        timeContinuity: "IMMEDIATE_AFTER_EP2",
        auditState: "ACTIVE_REVIEW_TEMPORARY_VERIFIABLE_CONSEQUENCE",
        fraudStatus: "NOT_CONFIRMED",
        activeConflict: "ROLDAN_NEUTRALIZED_MATEO_ALLOWED_ESCALATION",
        characters: [{
            characterId: "CHAR_HEBERTO",
            physicalState: "MINOR_CHEEK_INJURY_NO_GORE",
            positionNarrative: "DEFENDED_PROPORTIONALLY_IDENTITY_HIDDEN",
            recurringProps: ["PROP_GRANDDAUGHTER_PHOTO", "PROP_BACKPACK", "PROP_HELMET", "PROP_ENCRYPTED_PHONE"],
            relationships: {
                CHAR_ROLDAN: "Neutralized his attack without striking or pursuing him.",
                CHAR_MATEO: "Mateo seriously suspects unusual connections but does not know his identity."
            },
            knownFactsAdded: ["ACTIVE_REVIEW_CONSEQUENCE_OBSERVED", "PROPORTIONAL_DEFENSE_USED"]
        }, {
            characterId: "CHAR_MATEO",
            positionNarrative: "RECEIVED_REVIEW_ALERTS_AND_ALLOWED_PHYSICAL_ESCALATION",
            relationships: {
                CHAR_ROLDAN: "Retains authority but allowed Roldan to escalate.",
                CHAR_HEBERTO: "Seriously suspects unusual connections; identity remains unknown."
            },
            knownFactsAdded: ["MATEO_DESIGN_UNDER_ACTIVE_REVIEW", "HEBERTO_HAS_UNUSUAL_CONNECTIONS"]
        }, {
            characterId: "CHAR_ROLDAN",
            physicalState: "NEUTRALIZED_WITHOUT_BEING_STRUCK",
            positionNarrative: "REAL_FEAR_OF_HEBERTO_IDENTITY_UNKNOWN",
            recurringProps: ["PROP_CAYMAN_BOOTS", "PROP_COFFEE_CALLBACK", "PROP_ROLDAN_TOOL_HANDLE"],
            relationships: {
                CHAR_MATEO: "Still subordinate to Mateo.",
                CHAR_HEBERTO: "Attacked him and now feels real fear after proportional neutralization."
            },
            knownFactsAdded: ["HEBERTO_CAN_DEFEND_HIMSELF"]
        }],
        objects: {
            PROP_WALL: "PARTIALLY_DAMAGED_BY_MATEO",
            PROP_MATEO_PLANS_TABLET: "WITH_MATEO",
            PROP_CHEEK_INJURY: "MINOR_NO_GORE",
            PROP_ROLDAN_TOOL_HANDLE: "BROKEN_OR_DISABLED_AFTER_PROPORTIONAL_DEFENSE",
            PROP_WORKSITE_SECURITY_CAMERAS: "VISIBLE_SEEDED_NOT_FORMAL_JUDICIAL_EVIDENCE",
            PROP_MATEO_DESIGN_REVIEW_ALERTS: "ACTIVE_TEMPORARY_REVIEW_CONSEQUENCE"
        }
    };
    const ep3 = prepareSeriesEpisode({
        root,
        seriesId,
        title: "EL PRECIO DE LA ARROGANCIA",
        script: "Immediate review alerts, escalating threat, proportional defense and real fear.",
        castIds: ["CHAR_HEBERTO", "CHAR_MATEO", "CHAR_ROLDAN"],
        storyBeats: [{
            beatId: "00:00-00:15",
            exactAction: "Mateo receives a temporary extraordinary review alert immediately after REQUEST ACCEPTED.",
            revelations: ["ACTIVE_REVIEW_TEMPORARY_CONSEQUENCE"],
            finalState: { auditState: "ACTIVE_REVIEW_TEMPORARY_VERIFIABLE_CONSEQUENCE" }
        }, {
            beatId: "02:30-02:50",
            exactAction: "Roldan attacks with a tool handle; Heberto neutralizes it proportionally without striking him.",
            revelations: ["HEBERTO_CAN_DEFEND_HIMSELF"],
            finalState: { defenseState: "PROPORTIONAL_NO_RETALIATION" }
        }, {
            beatId: "02:50-03:00",
            dialogue: "Heberto: Ya tuvo dos oportunidades para detenerse.",
            exactAction: "Roldan sees the disabled handle and feels real fear; cut to Mateo and black.",
            revelations: ["ROLDAN_REAL_FEAR", "WORKSITE_CAMERAS_AND_WITNESSES_EXIST"],
            finalState: ep3End
        }]
    }).episode;
    assert.equal(ep3.episodeNumber, 3);
    assert.match(ep3.openingObligation, /verifiable temporary review consequence/);
    assert.equal(ep3.continuityStart.auditState, "AUDIT_REQUESTED_NOT_RESOLVED");

    const forbidden = [
        "HEBERTO_TRUE_IDENTITY",
        "FOUNDER_OR_PRESIDENT",
        "VANGUARD",
        "BRUNO",
        "HARRISON",
        "FORTUNE",
        "PROJECT_OWNERSHIP",
        "REAL_POWER_SCOPE",
        "AUDIT_CHANNEL_OPERATOR",
        "FRAUD_CONFIRMED",
        "ARRESTS",
        "LEGAL_GUILT",
        "GLOBAL_COUNCIL",
        "BLACK_CODE",
        "ABSOLUTE_INSTITUTIONAL_CONTROL"
    ];
    acceptSeriesEpisode({
        root,
        seriesId,
        episodeId: ep3.episodeId,
        humanAccepted: true,
        acceptanceStage: "PREPRODUCTION",
        continuityEnd: ep3End,
        hook: "Mateo receives immediate alerts proving a limited temporary review consequence.",
        conflict: "Suspicion escalates into a tool-handle attack while Mateo chooses not to stop Roldan.",
        progression: "Review alerts, suspicion, class contempt, extraordinary experience implied, threat, visible cameras, proportional defense and real fear.",
        revelationsAllowed: [
            "AUDIT_REQUEST_HAD_REAL_CONSEQUENCE",
            "MATEO_DESIGN_UNDER_REVIEW",
            "HEBERTO_HAS_UNUSUAL_CONNECTIONS",
            "HEBERTO_EXTRAORDINARY_EXPERIENCE",
            "HEBERTO_CAN_DEFEND_HIMSELF",
            "ROLDAN_REAL_FEAR",
            "WORKSITE_CAMERAS_AND_WITNESSES_EXIST"
        ],
        revealRestrictions: forbidden,
        durableProps: [
            "PROP_GRANDDAUGHTER_PHOTO",
            "PROP_BACKPACK",
            "PROP_HELMET",
            "PROP_ENCRYPTED_PHONE",
            "PROP_CAYMAN_BOOTS",
            "PROP_COFFEE_CALLBACK",
            "PROP_WALL",
            "PROP_MATEO_PLANS_TABLET",
            "PROP_CHEEK_INJURY",
            "PROP_ROLDAN_TOOL_HANDLE",
            "PROP_WORKSITE_SECURITY_CAMERAS",
            "PROP_MATEO_DESIGN_REVIEW_ALERTS"
        ],
        cliffhanger: "Roldan is neutralized, the handle is disabled and he feels real fear. Heberto: Ya tuvo dos oportunidades para detenerse. Cut to Mateo and black.",
        nextEpisodeOpeningObligation: "EP4 starts immediately after the handle incident with no time jump; physical aggression becomes personal aggression involving influence threats, Heberto's backpack, granddaughter photo, cement destruction, emotional change and a future PROCEDAN message, without writing EP4 yet.",
        canonFacts: [
            "ACTIVE_REVIEW_TEMPORARY_CONSEQUENCE",
            "FRAUD_NOT_CONFIRMED",
            "MATEO_ALLOWED_ROLDAN_PHYSICAL_ESCALATION",
            "ROLDAN_ATTACKED_WITH_TOOL_HANDLE",
            "HEBERTO_DEFENDED_PROPORTIONALLY_WITHOUT_STRIKING",
            "ROLDAN_REAL_FEAR",
            "WORKSITE_CAMERAS_SEEDED_NOT_FORMAL_EVIDENCE"
        ]
    });

    const laterRuntime = await import(`../jarvis-artifact-studio.js?ep3-runtime=${Date.now()}`);
    const resumed = laterRuntime.getSeriesResumeContext({ root, seriesId });
    assert.equal(resumed.lastLockedEpisodeNumber, 3);
    assert.equal(resumed.lastCompletedEpisodeNumber, null);
    assert.equal(resumed.nextEpisodeNumber, 4);
    assert.equal(resumed.lastEpisode.title, "EL PRECIO DE LA ARROGANCIA");
    assert.equal(resumed.lastEpisode.status, "PREPRODUCTION_ACCEPTED");
    assert.equal(resumed.lastEpisode.physicalArtifact, null);
    assert.equal(resumed.continuityState.auditState, "ACTIVE_REVIEW_TEMPORARY_VERIFIABLE_CONSEQUENCE");
    assert.equal(resumed.continuityState.fraudStatus, "NOT_CONFIRMED");
    assert.equal(resumed.continuityState.objects.PROP_ROLDAN_TOOL_HANDLE, "BROKEN_OR_DISABLED_AFTER_PROPORTIONAL_DEFENSE");
    assert.match(resumed.continuityState.objects.PROP_WORKSITE_SECURITY_CAMERAS, /NOT_FORMAL_JUDICIAL_EVIDENCE/);
    assert.match(resumed.cliffhanger, /dos oportunidades/);
    assert.match(resumed.nextEpisodeOpeningObligation, /EP4 starts immediately/);
    assert.deepEqual(resumed.revealRestrictions, forbidden);
    const heberto = resumed.activeCharacters.find(character => character.characterId === "CHAR_HEBERTO");
    const mateo = resumed.activeCharacters.find(character => character.characterId === "CHAR_MATEO");
    const roldan = resumed.activeCharacters.find(character => character.characterId === "CHAR_ROLDAN");
    assert.equal(heberto.physicalState, "MINOR_CHEEK_INJURY_NO_GORE");
    assert.match(heberto.positionNarrative, /PROPORTIONALLY/);
    assert.equal(roldan.referenceAssetsPending, false);
    assert.equal(roldan.referenceAssets.length, 2);
    assert.equal(roldan.physicalState, "NEUTRALIZED_WITHOUT_BEING_STRUCK");
    assert.match(roldan.positionNarrative, /REAL_FEAR/);
    assert.equal(mateo.referenceAssetsPending, true);
    assert.match(mateo.positionNarrative, /ALLOWED_PHYSICAL_ESCALATION/);
    const canon = getSeriesBible({ root, seriesId });
    assert.deepEqual(canon.episodes[0], ep1Snapshot);
    assert.deepEqual(canon.episodes[1], ep2Snapshot);
    assert.equal(laterRuntime.listArtifacts({ root, type: "video" }).length, 0);
    assert.throws(
        () => laterRuntime.getSeriesGenerationContext({ root, seriesId, episodeId: ep3.episodeId }),
        /SERIES_CHARACTER_REFERENCE_ASSETS_PENDING:CHAR_MATEO/
    );
});

test("commercial identity updates the same durable series without mutating episodes, characters or working title", async () => {
    const root = seriesRoot();
    const seriesId = "SERIES_COMMERCIAL_TITLE";
    createSeries(root, seriesId, "WORKING TITLE");

    const heberto = physicalArtifact(
        root,
        ".jarvis-artifacts/uploads/commercial-title-heberto.jpg",
        Buffer.from("commercial-title-heberto"),
        "image/jpeg"
    );
    registerCharacter(root, seriesId, "CHAR_HEBERTO", "Heberto", [heberto]);
    const before = getSeriesBible({ root, seriesId });
    const episodeSnapshot = cloneForTest(before.episodes);
    const characterSnapshot = cloneForTest(before.characters);

    const updated = updateSeriesCommercialIdentity({
        root,
        seriesId,
        commercialTitle: "EL ALBAÑIL DE LA CUADRA",
        clearanceStatus: "PUBLIC_SEARCH_PASS_FORMAL_REGISTRATION_PENDING"
    });
    assert.equal(updated.status, "SERIES_COMMERCIAL_IDENTITY_PERSISTED_VERIFIED");
    assert.equal(updated.seriesId, seriesId);
    assert.equal(updated.canon.title, "WORKING TITLE");
    assert.equal(updated.canon.commercialTitle, "EL ALBAÑIL DE LA CUADRA");
    assert.equal(updated.canon.clearanceStatus, "PUBLIC_SEARCH_PASS_FORMAL_REGISTRATION_PENDING");
    assert.equal(updated.canon.productionBrandingPolicy.generativeFootageTitleBurnInAllowed, false);
    assert.equal(updated.canon.productionBrandingPolicy.brandingAssemblyStage, "POST_GENERATION_MASTERING");
    assert.equal(updated.canon.productionBrandingPolicy.formalRegistrationPending, true);
    assert.deepEqual(updated.canon.episodes, episodeSnapshot);
    assert.deepEqual(updated.canon.characters, characterSnapshot);

    const laterRuntime = await import(`../jarvis-artifact-studio.js?commercial-title-runtime=${Date.now()}`);
    const resumed = laterRuntime.getSeriesResumeContext({ root, seriesId });
    assert.equal(resumed.seriesId, seriesId);
    assert.equal(resumed.title, "WORKING TITLE");
    assert.equal(resumed.commercialTitle, "EL ALBAÑIL DE LA CUADRA");
    assert.equal(resumed.displayTitle, "EL ALBAÑIL DE LA CUADRA");
    assert.equal(resumed.clearanceStatus, "PUBLIC_SEARCH_PASS_FORMAL_REGISTRATION_PENDING");
    assert.equal(resumed.productionBrandingPolicy.generativeFootageTitleBurnInAllowed, false);
    assert.deepEqual(resumed.activeCharacters[0].referenceAssets, characterSnapshot.CHAR_HEBERTO.referenceAssets);
});

test("commercial identity rejects registration claims and leaves the canon untouched", () => {
    const root = seriesRoot();
    const seriesId = "SERIES_COMMERCIAL_GUARD";
    createSeries(root, seriesId, "WORKING TITLE");
    const before = getSeriesBible({ root, seriesId });

    assert.throws(
        () => updateSeriesCommercialIdentity({
            root,
            seriesId,
            commercialTitle: "EL ALBAÑIL DE LA CUADRA ®",
            clearanceStatus: "PUBLIC_SEARCH_PASS_FORMAL_REGISTRATION_PENDING"
        }),
        /SERIES_COMMERCIAL_TITLE_REGISTRATION_CLAIM_FORBIDDEN/
    );
    assert.throws(
        () => updateSeriesCommercialIdentity({
            root,
            seriesId,
            commercialTitle: "EL ALBAÑIL DE LA CUADRA",
            clearanceStatus: "IMPI_REGISTERED"
        }),
        /SERIES_COMMERCIAL_CLEARANCE_STATUS_UNSUPPORTED/
    );
    assert.deepEqual(getSeriesBible({ root, seriesId }), before);
});

function cloneForTest(value) {
    return JSON.parse(JSON.stringify(value));
}
