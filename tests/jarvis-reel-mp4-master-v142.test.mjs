import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
    inspectReelVideoFile,
    persistReelMasterArtifact,
    reelVideoOutputTarget,
    validateReelMp4Master
} from "../jarvis-fs-bridge.js";
import { resolveLocalExecutable } from "../jarvis-local-video-engine.js";

const ffmpeg = resolveLocalExecutable(process.env.JARVIS_FFMPEG_PATH || "ffmpeg");
const ffprobe = resolveLocalExecutable(process.env.JARVIS_FFPROBE_PATH || "ffprobe");
const mediaToolsAvailable = Boolean(ffmpeg && ffprobe);

function payloadFor(file, mimeType, { audioExpected = false } = {}) {
    const buffer = fs.readFileSync(file);
    return {
        buffer,
        payload: {
            bytes: buffer.length,
            sha256: createHash("sha256").update(buffer).digest("hex"),
            mimeType,
            audioExpected,
            audioTracksAdded: audioExpected ? 1 : 0,
            audioGraphAvailable: audioExpected,
            audioMixMode: audioExpected ? "mixed_audio" : "silent_visual"
        }
    };
}

function runFfmpeg(args, cwd) {
    execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
        cwd,
        windowsHide: true,
        timeout: 120000,
        stdio: ["ignore", "pipe", "pipe"]
    });
}

test("V142 reel.create always resolves its final target to MP4", () => {
    const root = path.resolve(os.tmpdir(), "jarvis-v142-target-contract");
    const target = reelVideoOutputTarget(
        ".jarvis-artifacts/reels/campaign.webm",
        "video/webm;codecs=vp9",
        root
    );
    assert.equal(target.relativeOutput, ".jarvis-artifacts/reels/campaign.mp4");
    assert.equal(target.extension, ".mp4");
    assert.equal(target.format, "mp4");
});

test("V142 professional MP4 validation fails closed on every master invariant", () => {
    const valid = {
        extension: ".mp4",
        bytes: 1024,
        formatName: "mov,mp4,m4a,3gp,3g2,mj2",
        durationSeconds: 30.2,
        video: {
            codec: "h264",
            pixelFormat: "yuv420p",
            width: 1080,
            height: 1920,
            fps: 30
        },
        audio: { codec: "aac", sampleRate: 48000, channels: 2 },
        faststart: true
    };
    assert.equal(validateReelMp4Master(valid, {
        durationSeconds: 30,
        audioRequired: true
    }).ok, true);

    for (const [field, mutate, expectedFailure] of [
        ["container", value => { value.formatName = "matroska,webm"; }, "containerMp4"],
        ["codec", value => { value.video.codec = "vp9"; }, "videoCodecH264"],
        ["pixel", value => { value.video.pixelFormat = "yuv444p"; }, "pixelFormatYuv420p"],
        ["resolution", value => { value.video.width = 720; }, "professionalResolution"],
        ["fps", value => { value.video.fps = 19.99; }, "fpsAtLeast20"],
        ["duration", value => { value.durationSeconds = 34; }, "durationWithinTolerance"],
        ["audio", value => { value.audio = null; }, "requiredAudioPresent"],
        ["faststart", value => { value.faststart = false; }, "faststart"]
    ]) {
        const candidate = structuredClone(valid);
        mutate(candidate);
        const result = validateReelMp4Master(candidate, {
            durationSeconds: 30,
            audioRequired: true
        });
        assert.equal(result.ok, false, field);
        assert.ok(result.failedChecks.includes(expectedFailure), field);
    }
});

test("V142 physical mastering preserves compliant MP4 and normalizes WebM to H264 AAC", {
    skip: mediaToolsAvailable ? false : "FFmpeg and ffprobe are not installed"
}, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v142-reel-master-"));
    const directSource = path.join(root, "direct-source.mp4");
    const webmSource = path.join(root, "webm-source.webm");
    const silentWebm = path.join(root, "silent-source.webm");
    try {
        runFfmpeg([
            "-f", "lavfi", "-i", "color=c=0xd4af37:s=1080x1920:r=30:d=1.2",
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1.2",
            "-shortest",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-ar", "48000", "-movflags", "+faststart",
            directSource
        ], root);
        runFfmpeg([
            "-f", "lavfi", "-i", "color=c=0x202020:s=360x640:r=25:d=1.2",
            "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=1.2",
            "-shortest",
            "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8",
            "-c:a", "libopus",
            webmSource
        ], root);
        runFfmpeg(["-i", webmSource, "-map", "0:v:0", "-c:v", "copy", "-an", silentWebm], root);

        const directInput = payloadFor(directSource, "video/mp4", { audioExpected: true });
        const direct = await persistReelMasterArtifact({
            ...directInput,
            output: ".jarvis-artifacts/reels/direct-master.mp4",
            durationSeconds: 1.2,
            root,
            ffmpeg,
            ffprobe
        });
        assert.equal(direct.masteringMode, "passthrough");
        assert.equal(direct.provisionalContainer, "mp4");
        assert.equal(direct.mimeType, "video/mp4");
        assert.equal(direct.externalApiUsed, false);
        assert.equal(direct.externalEstimatedCostUsd, 0);
        assert.equal(direct.artifact.file, direct.output);
        assert.equal(direct.artifact.sha256, direct.sha256);

        const webmInput = payloadFor(webmSource, "video/webm;codecs=vp8,opus", {
            audioExpected: true
        });
        const mastered = await persistReelMasterArtifact({
            ...webmInput,
            output: ".jarvis-artifacts/reels/webm-request.webm",
            durationSeconds: 1.2,
            root,
            ffmpeg,
            ffprobe
        });
        assert.equal(mastered.masteringMode, "ffmpeg_normalized");
        assert.equal(mastered.provisionalContainer, "webm");
        assert.equal(mastered.output, ".jarvis-artifacts/reels/webm-request.mp4");
        assert.equal(mastered.videoCodec, "h264");
        assert.equal(mastered.pixelFormat, "yuv420p");
        assert.equal(mastered.width, 1080);
        assert.equal(mastered.height, 1920);
        assert.ok(mastered.fps >= 20);
        assert.equal(mastered.audioCodec, "aac");
        assert.ok(mastered.audioSampleRate >= 44100);
        assert.equal(mastered.faststart, true);
        assert.equal(mastered.artifact.transformations[0].container, "mp4");
        assert.equal(mastered.artifact.transformations[0].externalApiUsed, false);
        const physical = path.join(root, mastered.output);
        assert.equal(fs.existsSync(physical), true);
        assert.equal(path.extname(physical), ".mp4");
        assert.equal(createHash("sha256").update(fs.readFileSync(physical)).digest("hex"), mastered.sha256);
        assert.equal(inspectReelVideoFile({ file: physical, ffprobe }).video.codec, "h264");

        const missingToolsRoot = fs.mkdtempSync(path.join(root, "missing-ffmpeg-"));
        await assert.rejects(
            persistReelMasterArtifact({
                ...webmInput,
                output: ".jarvis-artifacts/reels/no-encoder.mp4",
                durationSeconds: 1.2,
                root: missingToolsRoot,
                ffprobe,
                env: { ...process.env, PATH: "", JARVIS_FFMPEG_PATH: "" }
            }),
            /REEL_FFMPEG_UNAVAILABLE/
        );
        assert.equal(
            fs.existsSync(path.join(missingToolsRoot, ".jarvis-artifacts/reels/no-encoder.mp4")),
            false
        );

        const missingProbeRoot = fs.mkdtempSync(path.join(root, "missing-ffprobe-"));
        await assert.rejects(
            persistReelMasterArtifact({
                ...directInput,
                output: ".jarvis-artifacts/reels/no-probe.mp4",
                durationSeconds: 1.2,
                root: missingProbeRoot,
                ffmpeg,
                env: { ...process.env, PATH: "", JARVIS_FFPROBE_PATH: "" }
            }),
            /REEL_FFPROBE_UNAVAILABLE/
        );
        assert.equal(
            fs.existsSync(path.join(missingProbeRoot, ".jarvis-artifacts/reels/no-probe.mp4")),
            false
        );

        const silentInput = payloadFor(silentWebm, "video/webm;codecs=vp8", {
            audioExpected: true
        });
        const previousOutput = path.join(root, ".jarvis-artifacts/reels/missing-audio.mp4");
        fs.mkdirSync(path.dirname(previousOutput), { recursive: true });
        fs.writeFileSync(previousOutput, "previous artifact must survive a failed replacement");
        await assert.rejects(
            persistReelMasterArtifact({
                ...silentInput,
                output: ".jarvis-artifacts/reels/missing-audio.mp4",
                durationSeconds: 1.2,
                root,
                ffmpeg,
                ffprobe
            }),
            /REEL_SOURCE_AUDIO_STREAM_REQUIRED/
        );
        assert.equal(
            fs.readFileSync(previousOutput, "utf8"),
            "previous artifact must survive a failed replacement"
        );
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("V142 corrupt provisional media is never registered as a successful reel", {
    skip: ffprobe ? false : "ffprobe is not installed"
}, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v142-corrupt-reel-"));
    try {
        const buffer = Buffer.alloc(4096);
        Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(buffer);
        await assert.rejects(
            persistReelMasterArtifact({
                buffer,
                payload: {
                    bytes: buffer.length,
                    sha256: createHash("sha256").update(buffer).digest("hex"),
                    mimeType: "video/webm"
                },
                output: ".jarvis-artifacts/reels/corrupt.mp4",
                durationSeconds: 30,
                root,
                ffprobe
            }),
            /REEL_FFPROBE_FAILED/
        );
        assert.equal(
            fs.existsSync(path.join(root, ".jarvis-artifacts/reels/corrupt.mp4")),
            false
        );
        assert.equal(
            fs.existsSync(path.join(root, ".jarvis-artifacts/.ledger/artifacts.jsonl")),
            false
        );
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
