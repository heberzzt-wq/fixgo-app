from pathlib import Path

content = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
    describeLocalSpeechCapability,
    inspectWavBuffer,
    synthesizeSpeechArtifact
} from "../jarvis-speech-artifact.js";
import { __test as orchestratorTest } from "../gestia-core/jarvis/jarvis.mission.orchestrator.js";
import { __test as guardTest } from "../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js";
import { registerNexoRealMediaTools } from "../gestia-core/nexo/nexo.real-media.tools.js";
import { registerJarvisActuatorTools } from "../gestia-core/jarvis/jarvis.actuator.pack.js";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function pcmWav({ sampleRate = 8000, channels = 1, bitsPerSample = 16, samples = 800 } = {}) {
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write("RIFF", 0, "ascii");
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8, "ascii");
    buffer.write("fmt ", 12, "ascii");
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write("data", 36, "ascii");
    buffer.writeUInt32LE(dataSize, 40);
    return buffer;
}

function reelPlanTask(voiceovers = ["Prueba uno", "Prueba dos"]) {
    return {
        name: "reel.plan",
        observation: {
            status: "REEL_PLAN_READY",
            objectiveSatisfied: true,
            preparedArtifact: {
                kind: "reel",
                scenes: voiceovers.map(voiceover => ({ voiceover }))
            }
        }
    };
}

function speechTask(output = ".jarvis-artifacts/audio/narration.wav", sha256 = SHA_A) {
    return {
        name: "speech.synthesize",
        observation: {
            status: "SPEECH_AUDIO_CREATED_VERIFIED",
            objectiveSatisfied: true,
            artifact: output,
            evidence: {
                output,
                mimeType: "audio/wav",
                bytes: 1644,
                sha256
            }
        }
    };
}

function runtimeWithCanonicalTools() {
    const registry = new Map();
    const runtime = {
        register(definition) {
            registry.set(definition.name, definition);
            return { ok: true, tool: definition.name };
        },
        get(name) { return registry.get(name); },
        has(name) { return registry.has(name); },
        list() { return [...registry.values()]; }
    };
    runtime.register({ name: "marketing.plan", execute: async () => ({ ok: true, readyForProduction: true }) });
    runtime.register({ name: "reel.create", execute: async () => ({ ok: true, status: "REEL_VIDEO_CREATED_VERIFIED" }) });
    runtime.register({ name: "speech.synthesize", execute: async args => ({
        ok: true,
        status: "SPEECH_AUDIO_CREATED_VERIFIED",
        output: ".jarvis-artifacts/audio/canonical.wav",
        mimeType: "audio/wav",
        bytes: 1644,
        sha256: SHA_A,
        textSeen: args.text
    }) });
    return runtime;
}

test("v137 WAV verifier requires real PCM bytes and reports duration", () => {
    const wav = pcmWav({ samples: 1600 });
    const inspected = inspectWavBuffer(wav);
    assert.equal(inspected.ok, true);
    assert.equal(inspected.mimeType, "audio/wav");
    assert.equal(inspected.sampleRate, 8000);
    assert.equal(inspected.channels, 1);
    assert.equal(inspected.bitsPerSample, 16);
    assert.ok(inspected.durationSeconds > 0);
    assert.throws(() => inspectWavBuffer(Buffer.from("not a wav")), /SPEECH_WAV_TOO_SMALL/);
});

test("v137 local speech fails closed on unsupported production platforms", () => {
    const capability = describeLocalSpeechCapability({ platform: "linux" });
    assert.equal(capability.available, false);
    assert.throws(
        () => synthesizeSpeechArtifact({ text: "Hola" }, { platform: "linux" }),
        /SPEECH_SYNTHESIS_PLATFORM_UNSUPPORTED/
    );
});

test("v137 speech artifact physically writes and verifies WAV with SHA-256", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-speech-v137-"));
    try {
        const result = synthesizeSpeechArtifact({
            text: "Narración verificada",
            output: ".jarvis-artifacts/audio/test.wav",
            root,
            rate: 2,
            volume: 88
        }, {
            platform: "win32",
            synthesizeImpl: ({ target }) => fs.writeFileSync(target, pcmWav({ samples: 1200 }))
        });
        const target = path.join(root, result.output);
        assert.equal(result.ok, true);
        assert.equal(result.status, "SPEECH_AUDIO_CREATED_VERIFIED");
        assert.equal(result.mimeType, "audio/wav");
        assert.equal(result.output, ".jarvis-artifacts/audio/test.wav");
        assert.ok(result.bytes > 44);
        assert.match(result.sha256, /^[a-f0-9]{64}$/);
        assert.equal(result.sha256, createHash("sha256").update(fs.readFileSync(target)).digest("hex"));
        assert.ok(result.durationSeconds > 0);
        assert.equal(fs.existsSync(target), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("v137 speech output cannot escape the audio artifact directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-speech-v137-path-"));
    try {
        assert.throws(() => synthesizeSpeechArtifact({
            text: "No escapar",
            output: ".jarvis-artifacts/audio/../escape.wav",
            root
        }, {
            platform: "win32",
            synthesizeImpl: () => {}
        }), /SPEECH_OUTPUT_PATH_INVALID/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("v137 orchestrator derives speech only from completed reel voiceover", () => {
    const mission = { completedTasks: [reelPlanTask(["Uno", "Dos"])] };
    const call = orchestratorTest.reelSpeechDependencyCall({ name: "reel.create", args: {} }, mission);
    assert.equal(call?.name, "speech.synthesize");
    assert.equal(call?.args?.text, "Uno Dos");
    assert.equal(call?.reason, "REEL_VOICEOVER_AUDIO_DEPENDENCY");

    assert.equal(
        orchestratorTest.reelSpeechDependencyCall({ name: "reel.create", args: { audioOutput: ".jarvis-artifacts/uploads/music.wav" } }, mission),
        null
    );
    assert.equal(
        orchestratorTest.reelSpeechDependencyCall({ name: "reel.create", args: {} }, { completedTasks: [reelPlanTask(["", ""])] }),
        null
    );
});

test("v137 verified completed speech prevents duplicate synthesis", () => {
    const mission = { completedTasks: [reelPlanTask(), speechTask()] };
    assert.deepEqual(orchestratorTest.verifiedSpeechArtifact(speechTask()), {
        output: ".jarvis-artifacts/audio/narration.wav",
        mimeType: "audio/wav",
        bytes: 1644,
        sha256: SHA_A
    });
    assert.equal(
        orchestratorTest.reelSpeechDependencyCall({ name: "reel.create", args: {} }, mission),
        null
    );
});

test("v137 runtime hydrates one verified synthesized WAV into reel.create", () => {
    const result = guardTest.hydrateReelAudioArgs({}, { completedTasks: [speechTask()] });
    assert.equal(result.hydrated, true);
    assert.equal(result.ambiguous, false);
    assert.equal(result.source, "speech.synthesize");
    assert.equal(result.args.audioOutput, ".jarvis-artifacts/audio/narration.wav");
});

test("v137 explicit and uploaded audio outrank synthesized narration", () => {
    const explicit = guardTest.hydrateReelAudioArgs(
        { audioOutput: ".jarvis-artifacts/uploads/explicit.wav" },
        { completedTasks: [speechTask()] }
    );
    assert.equal(explicit.source, "explicit");
    assert.equal(explicit.args.audioOutput, ".jarvis-artifacts/uploads/explicit.wav");

    const attachment = {
        artifact: ".jarvis-artifacts/uploads/user.wav",
        mimeType: "audio/wav",
        bytes: 1444,
        sha256: SHA_B
    };
    const uploaded = guardTest.hydrateReelAudioArgs({}, {
        rawInput: `Archivos adjuntos reales entregados por el usuario:${JSON.stringify([attachment])}`,
        completedTasks: [speechTask()]
    });
    assert.equal(uploaded.source, "user_attachment");
    assert.equal(uploaded.args.audioOutput, attachment.artifact);
});

test("v137 runtime never guesses between multiple synthesized WAV artifacts", () => {
    const result = guardTest.hydrateReelAudioArgs({}, {
        completedTasks: [
            speechTask(".jarvis-artifacts/audio/a.wav", SHA_A),
            speechTask(".jarvis-artifacts/audio/b.wav", SHA_B)
        ]
    });
    assert.equal(result.hydrated, false);
    assert.equal(result.ambiguous, true);
    assert.equal(result.source, "speech.synthesize");
    assert.equal(result.candidateCount, 2);
    assert.equal(result.args.audioOutput, undefined);
});

test("v137 actuator and NEXO registries expose speech synthesis as a local user artifact", async () => {
    const canonicalRegistry = new Map();
    const canonicalRuntime = {
        register(tool) { canonicalRegistry.set(tool.name, tool); return { ok: true }; },
        get(name) { return canonicalRegistry.get(name); },
        has(name) { return canonicalRegistry.has(name); },
        list() { return [...canonicalRegistry.values()]; }
    };
    registerJarvisActuatorTools(canonicalRuntime);
    const speech = canonicalRuntime.get("speech.synthesize");
    assert.ok(speech);
    assert.equal(speech.mutates, true);
    assert.equal(speech.requiresApproval, false);
    assert.equal(speech.userArtifact, true);
    assert.equal(speech.output, "SPEECH_AUDIO_ARTIFACT");

    const nexoRuntime = runtimeWithCanonicalTools();
    const installation = registerNexoRealMediaTools(nexoRuntime);
    assert.equal(installation.ok, true);
    assert.ok(installation.tools.includes("speech.synthesize"));
    const result = await nexoRuntime.get("speech.synthesize").execute({ text: "Narración canónica" }, {});
    assert.equal(result.objectiveSatisfied, true);
    assert.equal(result.status, "SPEECH_AUDIO_CREATED_VERIFIED");
    assert.equal(result.textSeen, "Narración canónica");
});
'''

Path('tests/jarvis-reel-speech-v137.test.mjs').write_text(content, encoding='utf-8')
print('v137 reel speech regression created')
