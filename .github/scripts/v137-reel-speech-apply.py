from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(path, old, new):
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f'ANCHOR_MISMATCH:{path}:{count}:{old[:100]!r}')
    write(path, content.replace(old, new, 1))


speech_module = r'''import fs from "node:fs";
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
'''
write('jarvis-speech-artifact.js', speech_module)

replace_once(
    'jarvis-fs-bridge.js',
    'import {\n    collectNexoRealWebMedia,\n    registerNexoWebMediaRoutes\n} from "./nexo-web-media-bridge.js";\n\nexport const JARVIS_FS_BRIDGE_VERSION =\n    "2.43.0-cdp-response-body-media-v135";',
    'import {\n    collectNexoRealWebMedia,\n    registerNexoWebMediaRoutes\n} from "./nexo-web-media-bridge.js";\nimport {\n    describeLocalSpeechCapability,\n    synthesizeSpeechArtifact\n} from "./jarvis-speech-artifact.js";\n\nexport const JARVIS_FS_BRIDGE_VERSION =\n    "2.44.0-local-speech-synthesis-v137";'
)
replace_once(
    'jarvis-fs-bridge.js',
    '            documents: {\n                available: true,',
    '            speech: {\n                ...describeLocalSpeechCapability(),\n                status: describeLocalSpeechCapability().available\n                    ? "LOCAL_SPEECH_READY"\n                    : "LOCAL_SPEECH_PLATFORM_UNSUPPORTED"\n            },\n            documents: {\n                available: true,'
)
replace_once(
    'jarvis-fs-bridge.js',
    '    app.post("/reel/create", async (req, res) => {',
    '''    app.post("/speech/synthesize", async (req, res) => {
        try {
            const speech = synthesizeSpeechArtifact({
                ...(req.body || {}),
                root
            });
            const artifact = registerArtifact({
                root,
                output: speech.output,
                metadata: {
                    type: "audio",
                    origin: "speech.synthesize",
                    provider: speech.provider,
                    caseId: req.body?.caseId,
                    objectiveId: req.body?.objectiveId,
                    mimeType: speech.mimeType,
                    status: speech.status,
                    approvalRequired: false,
                    approved: true,
                    approvedBy: "LOCAL_ARTIFACT_POLICY",
                    editable: false,
                    preview: true,
                    downloadable: true,
                    publishable: false,
                    sha256: speech.sha256,
                    durationSeconds: speech.durationSeconds,
                    sampleRate: speech.sampleRate,
                    channels: speech.channels,
                    bitsPerSample: speech.bitsPerSample
                }
            });
            return res.json({
                ...speech,
                artifact,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            const unsupported = String(error?.message || error) === "SPEECH_SYNTHESIS_PLATFORM_UNSUPPORTED";
            return res.status(unsupported ? 501 : 400).json({
                ok: false,
                executionOk: false,
                objectiveSatisfied: false,
                blocked: true,
                requiresInput: false,
                retryable: false,
                status: unsupported
                    ? "SPEECH_SYNTHESIS_PLATFORM_UNSUPPORTED"
                    : "SPEECH_SYNTHESIS_FAILED",
                error: String(error?.message || error),
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

    app.post("/reel/create", async (req, res) => {'''
)

replace_once(
    'gestia-core/jarvis/jarvis.actuator.pack.js',
    '        register(runtime, {\n            name: "reel.create",\n            description: "Crea un reel 9:16 local, genera su estudio editable y exporta automáticamente un WebM físico verificado por SHA-256. Prioriza audioOutput explícito y, si no existe, enruta audio de videos fuente cuando esté disponible; no genera TTS. No publica.",',
    '''        register(runtime, {
            name: "speech.synthesize",
            description: "Sintetiza narración local en un WAV físico verificado por SHA-256 para usarlo como audio de producción. No publica.",
            output: "SPEECH_AUDIO_ARTIFACT",
            inputSchema: {
                text: "string", output: "string", voice: "string", language: "string",
                rate: "number", volume: "number", caseId: "string", objectiveId: "string"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: [],
            execute: async (args = {}, context = {}) => {
                const result = await bridgeRequest("/speech/synthesize", {
                    ...args,
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || ""
                }, 90000);
                if (result?.ok === true && result?.status === "SPEECH_AUDIO_CREATED_VERIFIED") {
                    recordCapabilityEvidence("speech_synthesis", {
                        ok: true,
                        status: result.status,
                        output: result.output,
                        bytes: result.bytes,
                        sha256: result.sha256,
                        mimeType: result.mimeType,
                        durationSeconds: result.durationSeconds,
                        provider: result.provider,
                        checkedAt: new Date().toISOString()
                    });
                }
                return result;
            }
        }),
        register(runtime, {
            name: "reel.create",
            description: "Crea un reel 9:16 local, genera su estudio editable y exporta automáticamente un WebM físico verificado por SHA-256. Mezcla audioOutput explícito o el WAV verificado producido por speech.synthesize en la misma misión. No publica.",'''
)

replace_once(
    'gestia-core/jarvis/jarvis.mission.orchestrator.js',
    '    "1.14.0-reel-media-source-recovery-v136";',
    '    "1.15.0-reel-speech-dependency-v137";'
)
insert_speech_helpers = r'''
function reelArgsHaveExplicitAudio(args = {}) {
    return [args?.audioOutput, args?.audioDataUrl, args?.audioUrl]
        .some(value => String(value || "").trim().length > 0);
}

function completedReelNarration(mission = {}) {
    const tasks = Array.isArray(mission?.completedTasks) ? mission.completedTasks : [];
    const task = [...tasks].reverse().find(item =>
        item?.name === "reel.plan" &&
        item?.observation?.objectiveSatisfied === true &&
        item?.observation?.status === "REEL_PLAN_READY" &&
        item?.observation?.preparedArtifact?.kind === "reel"
    );
    const scenes = Array.isArray(task?.observation?.preparedArtifact?.scenes)
        ? task.observation.preparedArtifact.scenes
        : [];
    const narration = scenes
        .map(scene => String(scene?.voiceover || "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();
    return narration.slice(0, 12000);
}

function verifiedSpeechArtifact(task = {}) {
    if (
        task?.name !== "speech.synthesize" ||
        task?.observation?.objectiveSatisfied !== true ||
        task?.observation?.status !== "SPEECH_AUDIO_CREATED_VERIFIED"
    ) return null;
    const evidence = task?.observation?.evidence || {};
    const output = String(task?.observation?.artifact || evidence?.output || "")
        .trim()
        .replaceAll("\\", "/");
    const mimeType = String(evidence?.mimeType || "").trim().toLowerCase();
    const bytes = Number(evidence?.bytes || 0);
    const sha256 = String(evidence?.sha256 || "").trim().toLowerCase();
    const hashValid = sha256.length === 64 && [...sha256].every(character =>
        (character >= "0" && character <= "9") ||
        (character >= "a" && character <= "f")
    );
    if (
        !output.startsWith(".jarvis-artifacts/audio/") ||
        output.includes("../") ||
        !output.toLowerCase().endsWith(".wav") ||
        mimeType !== "audio/wav" ||
        !Number.isFinite(bytes) ||
        bytes <= 0 ||
        !hashValid
    ) return null;
    return { output, mimeType, bytes, sha256 };
}

function reelSpeechDependencyCall(task = {}, mission = {}) {
    if (task?.name !== "reel.create") return null;
    if (reelArgsHaveExplicitAudio(task?.args || {})) return null;
    const completedSpeech = (Array.isArray(mission?.completedTasks) ? mission.completedTasks : [])
        .map(verifiedSpeechArtifact)
        .filter(Boolean);
    if (completedSpeech.length > 0) return null;
    const narration = completedReelNarration(mission);
    if (!narration) return null;
    return {
        name: "speech.synthesize",
        args: { text: narration },
        reason: "REEL_VOICEOVER_AUDIO_DEPENDENCY"
    };
}

'''
replace_once(
    'gestia-core/jarvis/jarvis.mission.orchestrator.js',
    'function reelMediaDependencyCall(task = {}, mission = {}) {',
    insert_speech_helpers + 'function reelMediaDependencyCall(task = {}, mission = {}) {'
)
replace_once(
    'gestia-core/jarvis/jarvis.mission.orchestrator.js',
    '''        const task = mission.pendingTasks.shift();
        const mediaDependency =''',
    '''        const task = mission.pendingTasks.shift();
        const speechDependency =
            reelSpeechDependencyCall(
                task,
                mission
            );
        if (speechDependency) {
            const dependencyTasks =
                trustedCalls(
                    [speechDependency],
                    mission
                );
            if (dependencyTasks.length > 0) {
                if (!mission.requiredToolNames.includes("speech.synthesize")) {
                    mission.requiredToolNames.push("speech.synthesize");
                }
                mission.pendingTasks.unshift(task);
                mission.pendingTasks.unshift(...dependencyTasks);
                mission.plannedTools.push(...dependencyTasks.map(item => item.name));
                mission.updatedAt = now();
                saveMission(persistence, mission);
                continue;
            }
        }

        const mediaDependency ='''
)
replace_once(
    'gestia-core/jarvis/jarvis.mission.orchestrator.js',
    '    reelArgsHaveExplicitVisualMedia,\n    verifiedCollectedVisualAssets,\n    reelMediaDependencyCall,',
    '    reelArgsHaveExplicitVisualMedia,\n    reelArgsHaveExplicitAudio,\n    completedReelNarration,\n    verifiedSpeechArtifact,\n    reelSpeechDependencyCall,\n    verifiedCollectedVisualAssets,\n    reelMediaDependencyCall,'
)

replace_once(
    'gestia-core/nexo/nexo.real-media.runtime-guard-v128.js',
    '    "1.2.0-semantic-scene-media-authority-v131";',
    '    "1.3.0-synthesized-reel-audio-v137";'
)
insert_guard_helper = r'''
function verifiedSynthesizedAudioTask(task = {}) {
    if (
        String(task?.name || "") !== "speech.synthesize" ||
        task?.observation?.objectiveSatisfied !== true ||
        String(task?.observation?.status || "") !== "SPEECH_AUDIO_CREATED_VERIFIED"
    ) return null;
    const evidence = task?.observation?.evidence || {};
    const output = String(task?.observation?.artifact || evidence?.output || "")
        .trim()
        .replaceAll("\\", "/");
    const mimeType = String(evidence?.mimeType || "").trim().toLowerCase();
    const sha256 = String(evidence?.sha256 || "").trim().toLowerCase();
    const bytes = Number(evidence?.bytes || 0);
    const hashValid = sha256.length === 64 && [...sha256].every(character =>
        (character >= "0" && character <= "9") ||
        (character >= "a" && character <= "f")
    );
    if (
        !output.startsWith(".jarvis-artifacts/audio/") ||
        output.includes("../") ||
        !output.toLowerCase().endsWith(".wav") ||
        mimeType !== "audio/wav" ||
        !Number.isFinite(bytes) ||
        bytes <= 0 ||
        !hashValid
    ) return null;
    return { output, mimeType, sha256, bytes };
}

'''
replace_once(
    'gestia-core/nexo/nexo.real-media.runtime-guard-v128.js',
    'function hydrateReelAudioArgs(args = {}, context = {}) {',
    insert_guard_helper + 'function hydrateReelAudioArgs(args = {}, context = {}) {'
)
replace_once(
    'gestia-core/nexo/nexo.real-media.runtime-guard-v128.js',
    '''    if (candidates.length === 1) {
        return {
            args: { ...current, audioOutput: candidates[0].output },
            hydrated: true,
            ambiguous: false,
            candidateCount: 1,
            source: "user_attachment",
            output: candidates[0].output
        };
    }
    return { args: current, hydrated: false, ambiguous: false, candidateCount: 0, source: null };
}''',
    '''    if (candidates.length === 1) {
        return {
            args: { ...current, audioOutput: candidates[0].output },
            hydrated: true,
            ambiguous: false,
            candidateCount: 1,
            source: "user_attachment",
            output: candidates[0].output
        };
    }
    const synthesized = missionTasks(context)
        .map(verifiedSynthesizedAudioTask)
        .filter(Boolean)
        .filter((item, index, list) => list.findIndex(candidate => candidate.output === item.output) === index);
    if (synthesized.length > 1) {
        return { args: current, hydrated: false, ambiguous: true, candidateCount: synthesized.length, source: "speech.synthesize" };
    }
    if (synthesized.length === 1) {
        return {
            args: { ...current, audioOutput: synthesized[0].output },
            hydrated: true,
            ambiguous: false,
            candidateCount: 1,
            source: "speech.synthesize",
            output: synthesized[0].output
        };
    }
    return { args: current, hydrated: false, ambiguous: false, candidateCount: 0, source: null };
}'''
)
replace_once(
    'gestia-core/nexo/nexo.real-media.runtime-guard-v128.js',
    '    verifiedAudioAttachment,\n    hydrateReelAudioArgs,',
    '    verifiedAudioAttachment,\n    verifiedSynthesizedAudioTask,\n    hydrateReelAudioArgs,'
)

replace_once(
    'gestia-core/nexo/nexo.real-media.tools.js',
    '    "1.6.0-cdp-response-body-media-v135";',
    '    "1.7.0-local-speech-v137";'
)
replace_once(
    'gestia-core/nexo/nexo.real-media.tools.js',
    '    const canonicalReelDefinition =\n        previousDefinition(runtime, "reel.create");',
    '    const canonicalReelDefinition =\n        previousDefinition(runtime, "reel.create");\n    const canonicalSpeechDefinition =\n        previousDefinition(runtime, "speech.synthesize");'
)
replace_once(
    'gestia-core/nexo/nexo.real-media.tools.js',
    '    if (typeof canonicalReelDefinition?.execute === "function") {',
    '''    registerOrReplace(runtime, {
        name: "speech.synthesize",
        description:
            "Sintetiza narración local en un WAV físico verificado por SHA-256 para el reel. No usa Functions ni publica.",
        output: "SPEECH_AUDIO_ARTIFACT",
        mutates: true,
        requiresApproval: false,
        userArtifact: true,
        missionDedupeBy: [],
        inputSchema: {
            type: "object",
            required: ["text"],
            properties: {
                text: { type: "string" },
                output: { type: "string" },
                voice: { type: "string" },
                language: { type: "string" },
                rate: { type: "number" },
                volume: { type: "number" },
                objectiveId: { type: "string" },
                caseId: { type: "string" }
            },
            additionalProperties: false
        },
        execute: async (args = {}, context = {}) => {
            const payload = {
                ...args,
                objectiveId: args.objectiveId || context.objectiveId || "",
                caseId: args.caseId || context.caseId || ""
            };
            const result = typeof canonicalSpeechDefinition?.execute === "function"
                ? await canonicalSpeechDefinition.execute(payload, context)
                : await bridgeRequest("/speech/synthesize", payload, 90000);
            return {
                ...result,
                objectiveSatisfied: result?.ok === true && result?.status === "SPEECH_AUDIO_CREATED_VERIFIED",
                blocked: result?.ok !== true,
                requiresInput: false,
                retryable: result?.status === "LOCAL_BRIDGE_REQUIRED",
                runtimeOverride: NEXO_REAL_MEDIA_TOOLS_VERSION
            };
        }
    });

    if (typeof canonicalReelDefinition?.execute === "function") {'''
)
replace_once(
    'gestia-core/nexo/nexo.real-media.tools.js',
    '                "Crea un reel 9:16 local y reutiliza automáticamente los medios reales verificados de la misma misión cuando el plan no haya asignado material visual explícito. No inventa logotipos ni sustituye medios ya elegidos. El audio sólo se incorpora cuando existe un artefacto de audio explícito; este actuador no genera TTS.",',
    '                "Crea un reel 9:16 local y reutiliza automáticamente los medios reales verificados de la misma misión cuando el plan no haya asignado material visual explícito. No inventa logotipos ni sustituye medios ya elegidos. El audio explícito conserva prioridad y, si existe un WAV verificado de speech.synthesize en la misión, el runtime lo incorpora antes de renderizar.",'
)
replace_once(
    'gestia-core/nexo/nexo.real-media.tools.js',
    '            "marketing.plan",\n            "web.media.collect",',
    '            "marketing.plan",\n            "speech.synthesize",\n            "web.media.collect",'
)

replace_once(
    'gestia-core/tools.runtime.js',
    './jarvis/jarvis.actuator.pack.js?v=v94-source-grounded-research-v124-20260810',
    './jarvis/jarvis.actuator.pack.js?v=v137-local-speech-synthesis-20260812'
)
replace_once(
    'modules/terminal/nexo-bootstrap.js',
    '    "1.9.0-cdp-response-body-media-v135";',
    '    "1.10.0-local-speech-v137";'
)
replace_once(
    'modules/terminal/nexo-bootstrap.js',
    '../../gestia-core/nexo/nexo.real-media.tools.js?v=v135-cdp-response-body-media-20260812',
    '../../gestia-core/nexo/nexo.real-media.tools.js?v=v137-local-speech-synthesis-20260812'
)
replace_once(
    'modules/terminal/nexo-bootstrap.js',
    '../../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js?v=v131-semantic-scene-media-authority-20260811',
    '../../gestia-core/nexo/nexo.real-media.runtime-guard-v128.js?v=v137-local-speech-synthesis-20260812'
)
replace_once(
    'modules/terminal/proposal-state.js',
    'import "./nexo-bootstrap.js?v=v135-cdp-response-body-media-20260812";',
    'import "./nexo-bootstrap.js?v=v137-local-speech-synthesis-20260812";'
)
replace_once(
    'gestia-core/gestia-core.js',
    '/gestia-core/jarvis/jarvis.mission.orchestrator.js?v=v136-reel-media-source-recovery-20260812',
    '/gestia-core/jarvis/jarvis.mission.orchestrator.js?v=v137-local-speech-synthesis-20260812'
)
replace_once(
    'gestia-terminal.html',
    '/modules/terminal/proposal-state.js?v=v135-cdp-response-body-media-20260812',
    '/modules/terminal/proposal-state.js?v=v137-local-speech-synthesis-20260812'
)
replace_once(
    'gestia-terminal.html',
    '/gestia-core/gestia-core.js?v=v136-reel-media-source-recovery-20260812',
    '/gestia-core/gestia-core.js?v=v137-local-speech-synthesis-20260812'
)
replace_once(
    'gestia-terminal.html',
    '            "web.research": "Consultando información en Internet",',
    '            "web.research": "Consultando información en Internet",\n            "speech.synthesize": "Generando narración del reel",'
)

replace_once(
    'tests/jarvis-actuator-pack.test.mjs',
    '        "page.create",\n        "reel.create",',
    '        "page.create",\n        "speech.synthesize",\n        "reel.create",'
)
replace_once(
    'tests/jarvis-actuator-pack.test.mjs',
    '    assert.equal(runtime.get("reel.create").requiresApproval, false);',
    '    assert.equal(runtime.get("speech.synthesize").requiresApproval, false);\n    assert.equal(runtime.get("speech.synthesize").userArtifact, true);\n    assert.equal(runtime.get("reel.create").requiresApproval, false);'
)
replace_once(
    'tests/jarvis-fs-bridge-v2.test.mjs',
    '    assert.equal(description.version, "2.43.0-cdp-response-body-media-v135");',
    '    assert.equal(description.version, "2.44.0-local-speech-synthesis-v137");\n    assert.equal(typeof description.actuators.speech.available, "boolean");\n    assert.deepEqual(description.actuators.speech.outputFormats, ["wav"]);'
)

print('v137 verified reel speech synthesis patch applied')
