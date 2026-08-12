import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const JARVIS_SPEECH_ARTIFACT_VERSION =
    "1.0.0-local-windows-system-speech-v137";

const MAX_SPEECH_TEXT_LENGTH = 12000;

function safeText(value = "", limit = MAX_SPEECH_TEXT_LENGTH) {
    return String(value || "").trim().slice(0, limit);
}

function clampNumber(value, minimum, maximum, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}

function speechOutputPath(root, requestedOutput = "") {
    const repoRoot = path.resolve(root || process.cwd());
    const normalized = String(requestedOutput || "")
        .trim()
        .replaceAll("\\", "/");
    const relative = normalized ||
        `.jarvis-artifacts/audio/narration-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.wav`;
    if (
        !relative.startsWith(".jarvis-artifacts/audio/") ||
        relative.includes("../") ||
        !relative.toLowerCase().endsWith(".wav")
    ) {
        throw new Error("SPEECH_OUTPUT_PATH_INVALID");
    }
    const target = path.resolve(repoRoot, relative);
    const audioRoot = path.resolve(repoRoot, ".jarvis-artifacts/audio");
    if (target !== audioRoot && !target.startsWith(`${audioRoot}${path.sep}`)) {
        throw new Error("SPEECH_OUTPUT_OUTSIDE_AUDIO_ARTIFACT_ROOT");
    }
    return { repoRoot, relative, target };
}

export function inspectWavBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
        throw new Error("SPEECH_WAV_TOO_SMALL");
    }
    if (
        buffer.toString("ascii", 0, 4) !== "RIFF" ||
        buffer.toString("ascii", 8, 12) !== "WAVE"
    ) {
        throw new Error("SPEECH_WAV_SIGNATURE_INVALID");
    }
    const declaredRiffBytes = buffer.readUInt32LE(4) + 8;
    if (declaredRiffBytes > buffer.length || declaredRiffBytes < 44) {
        throw new Error("SPEECH_WAV_LENGTH_INVALID");
    }

    let cursor = 12;
    let format = null;
    let dataBytes = 0;
    while (cursor + 8 <= buffer.length) {
        const chunkId = buffer.toString("ascii", cursor, cursor + 4);
        const chunkSize = buffer.readUInt32LE(cursor + 4);
        const chunkStart = cursor + 8;
        const chunkEnd = chunkStart + chunkSize;
        if (chunkEnd > buffer.length) {
            throw new Error("SPEECH_WAV_CHUNK_TRUNCATED");
        }
        if (chunkId === "fmt ") {
            if (chunkSize < 16) throw new Error("SPEECH_WAV_FMT_INVALID");
            format = {
                audioFormat: buffer.readUInt16LE(chunkStart),
                channels: buffer.readUInt16LE(chunkStart + 2),
                sampleRate: buffer.readUInt32LE(chunkStart + 4),
                byteRate: buffer.readUInt32LE(chunkStart + 8),
                blockAlign: buffer.readUInt16LE(chunkStart + 12),
                bitsPerSample: buffer.readUInt16LE(chunkStart + 14)
            };
        }
        if (chunkId === "data") dataBytes += chunkSize;
        cursor = chunkEnd + (chunkSize % 2);
    }
    if (!format || dataBytes <= 0) throw new Error("SPEECH_WAV_AUDIO_DATA_REQUIRED");
    if (
        format.audioFormat !== 1 ||
        format.channels <= 0 ||
        format.sampleRate <= 0 ||
        format.byteRate <= 0 ||
        format.blockAlign <= 0 ||
        format.bitsPerSample <= 0
    ) {
        throw new Error("SPEECH_WAV_PCM_FORMAT_REQUIRED");
    }
    const durationSeconds = dataBytes / format.byteRate;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new Error("SPEECH_WAV_DURATION_INVALID");
    }
    return {
        ok: true,
        mimeType: "audio/wav",
        bytes: buffer.length,
        dataBytes,
        durationSeconds,
        ...format
    };
}

export function describeLocalSpeechCapability({ platform = process.platform } = {}) {
    return {
        available: platform === "win32",
        provider: platform === "win32" ? "windows-system-speech" : null,
        platform,
        outputFormats: ["wav"],
        physicallyVerified: true,
        cloudRequired: false,
        version: JARVIS_SPEECH_ARTIFACT_VERSION
    };
}

function runWindowsSpeech({ text, target, voice, language, rate, volume, execFile = execFileSync }) {
    const script = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:JARVIS_SPEECH_TEXT_B64))
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  if ($env:JARVIS_SPEECH_VOICE) {
    $synth.SelectVoice($env:JARVIS_SPEECH_VOICE)
  } elseif ($env:JARVIS_SPEECH_LANGUAGE) {
    $match = $synth.GetInstalledVoices() | Where-Object {
      $_.Enabled -and $_.VoiceInfo.Culture.Name -ieq $env:JARVIS_SPEECH_LANGUAGE
    } | Select-Object -First 1
    if (-not $match) { throw 'SPEECH_LANGUAGE_VOICE_NOT_FOUND' }
    $synth.SelectVoice($match.VoiceInfo.Name)
  }
  $synth.Rate = [int]$env:JARVIS_SPEECH_RATE
  $synth.Volume = [int]$env:JARVIS_SPEECH_VOLUME
  $synth.SetOutputToWaveFile($env:JARVIS_SPEECH_OUTPUT)
  $synth.Speak($text)
} finally {
  $synth.Dispose()
}
`;
    execFile("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-Command", script
    ], {
        env: {
            ...process.env,
            JARVIS_SPEECH_TEXT_B64: Buffer.from(text, "utf8").toString("base64"),
            JARVIS_SPEECH_OUTPUT: target,
            JARVIS_SPEECH_VOICE: safeText(voice, 180),
            JARVIS_SPEECH_LANGUAGE: safeText(language, 40),
            JARVIS_SPEECH_RATE: String(rate),
            JARVIS_SPEECH_VOLUME: String(volume)
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 90000,
        windowsHide: true,
        maxBuffer: 1024 * 1024
    });
}

export function synthesizeSpeechArtifact(input = {}, options = {}) {
    const text = safeText(input.text);
    if (!text) throw new Error("SPEECH_TEXT_REQUIRED");
    const platform = options.platform || process.platform;
    if (platform !== "win32" && typeof options.synthesizeImpl !== "function") {
        throw new Error("SPEECH_SYNTHESIS_PLATFORM_UNSUPPORTED");
    }
    const output = speechOutputPath(input.root || options.root || process.cwd(), input.output);
    fs.mkdirSync(path.dirname(output.target), { recursive: true });
    if (fs.existsSync(output.target)) fs.rmSync(output.target, { force: true });

    const rate = clampNumber(input.rate, -10, 10, 0);
    const volume = clampNumber(input.volume, 0, 100, 100);
    const synthesizeImpl = typeof options.synthesizeImpl === "function"
        ? options.synthesizeImpl
        : payload => runWindowsSpeech({ ...payload, execFile: options.execFile || execFileSync });

    synthesizeImpl({
        text,
        target: output.target,
        voice: safeText(input.voice, 180),
        language: safeText(input.language, 40),
        rate,
        volume
    });

    if (!fs.existsSync(output.target)) throw new Error("SPEECH_WAV_NOT_CREATED");
    const buffer = fs.readFileSync(output.target);
    let wav;
    try {
        wav = inspectWavBuffer(buffer);
    }
    catch (error) {
        fs.rmSync(output.target, { force: true });
        throw error;
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (sha256.length !== 64) {
        fs.rmSync(output.target, { force: true });
        throw new Error("SPEECH_SHA256_INVALID");
    }
    return {
        ok: true,
        executionOk: true,
        objectiveSatisfied: true,
        status: "SPEECH_AUDIO_CREATED_VERIFIED",
        output: output.relative,
        mimeType: "audio/wav",
        bytes: buffer.length,
        sha256,
        durationSeconds: wav.durationSeconds,
        sampleRate: wav.sampleRate,
        channels: wav.channels,
        bitsPerSample: wav.bitsPerSample,
        provider: platform === "win32" ? "windows-system-speech" : "injected-test-synthesizer",
        voice: safeText(input.voice, 180) || null,
        language: safeText(input.language, 40) || null,
        rate,
        volume,
        version: JARVIS_SPEECH_ARTIFACT_VERSION
    };
}

export const __test = {
    speechOutputPath,
    clampNumber,
    runWindowsSpeech
};
