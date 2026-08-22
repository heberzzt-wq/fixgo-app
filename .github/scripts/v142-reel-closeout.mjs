import fs from "node:fs/promises";

const paths = {
    bridge: "jarvis-fs-bridge.js",
    orchestrator: "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    reelTest: "tests/jarvis-reel-native-mp4-v138.test.mjs",
    missionTest: "tests/jarvis-mission-orchestrator.test.mjs"
};

async function read(file) {
    return fs.readFile(file, "utf8");
}

async function write(file, source) {
    await fs.writeFile(file, source, "utf8");
}

function replaceOnce(source, before, after, label) {
    if (source.includes(after)) return source;
    const count = source.split(before).length - 1;
    if (count !== 1) {
        throw new Error(`${label}_MATCH_COUNT_${count}`);
    }
    return source.replace(before, after);
}

function appendOnce(source, marker, addition) {
    if (source.includes(marker)) return source;
    return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

let bridge = await read(paths.bridge);
bridge = replaceOnce(
    bridge,
    'const JARVIS_FS_BRIDGE_VERSION = "2.45.0-native-mp4-reel-export-v138";',
    'const JARVIS_FS_BRIDGE_VERSION = "2.46.0-reel-export-completion-v142";',
    "BRIDGE_VERSION"
);
bridge = replaceOnce(
    bridge,
`        await sleepMs(duration * 1000 + 2600);
        const payloadText = await evaluateCdpExpression(
            target.webSocketDebuggerUrl,
            \`(() => new Promise(async (resolve, reject) => { try { const blob = window.__JARVIS_LAST_REEL_BLOB__; const detail = window.__JARVIS_LAST_REEL_DETAIL__; if (!blob || !detail) throw new Error('REEL_EXPORTED_BLOB_MISSING'); const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''; const step = 0x8000; for (let index = 0; index < bytes.length; index += step) binary += String.fromCharCode(...bytes.subarray(index, index + step)); resolve(JSON.stringify({ ...detail, base64: btoa(binary) })); } catch (error) { reject(error); } }))()\`,
            Math.max(30000, duration * 1000)
        );`,
`        const payloadText = await evaluateCdpExpression(
            target.webSocketDebuggerUrl,
            \`(() => new Promise((resolve, reject) => { const startedAt = Date.now(); const timeoutMs = ${'${'}Math.max(45000, duration * 1000 + 30000)}; const finish = async () => { try { const exportError = window.__JARVIS_REEL_EXPORT_ERROR__; if (exportError) throw new Error(String(exportError)); const blob = window.__JARVIS_LAST_REEL_BLOB__; const detail = window.__JARVIS_LAST_REEL_DETAIL__; if (blob && detail) { const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''; const step = 0x8000; for (let index = 0; index < bytes.length; index += step) binary += String.fromCharCode(...bytes.subarray(index, index + step)); resolve(JSON.stringify({ ...detail, base64: btoa(binary) })); return; } if (Date.now() - startedAt >= timeoutMs) throw new Error('REEL_EXPORT_COMPLETION_TIMEOUT'); setTimeout(finish, 100); } catch (error) { reject(error); } }; finish(); }))()\`,
            Math.max(45000, duration * 1000 + 30000)
        );`,
    "REEL_EXPORT_COMPLETION_WAIT"
);
await write(paths.bridge, bridge);

let orchestrator = await read(paths.orchestrator);
orchestrator = replaceOnce(
    orchestrator,
`function archiveRecoveredMediaSourceAttempts(mission = {}, now = () => new Date().toISOString()) {
    const blocked = Array.isArray(mission?.blockedTasks) ? mission.blockedTasks : [];
    const recovered = blocked.filter(item => item?.name === "web.media.collect");
    if (recovered.length === 0) return;
    mission.recoveredMediaSourceAttempts = [
        ...(Array.isArray(mission.recoveredMediaSourceAttempts)
            ? mission.recoveredMediaSourceAttempts
            : []),
        ...recovered.map(item => ({
            name: item.name,
            args: item.args,
            reason: item.reason,
            observation: item.observation,
            recoveredAt: now()
        }))
    ].slice(-12);
    mission.blockedTasks = blocked.filter(item => item?.name !== "web.media.collect");
    mission.errors = (Array.isArray(mission?.errors) ? mission.errors : [])
        .filter(item => item?.tool !== "web.media.collect");
    mission.reelMediaRecovery = {
        ...(mission.reelMediaRecovery || {}),
        active: false,
        recovered: true,
        recoveredAt: now()
    };
}

export async function runJarvisMission({`,
`function archiveRecoveredMediaSourceAttempts(mission = {}, now = () => new Date().toISOString()) {
    const blocked = Array.isArray(mission?.blockedTasks) ? mission.blockedTasks : [];
    const recovered = blocked.filter(item => item?.name === "web.media.collect");
    if (recovered.length === 0) return;
    mission.recoveredMediaSourceAttempts = [
        ...(Array.isArray(mission.recoveredMediaSourceAttempts)
            ? mission.recoveredMediaSourceAttempts
            : []),
        ...recovered.map(item => ({
            name: item.name,
            args: item.args,
            reason: item.reason,
            observation: item.observation,
            recoveredAt: now()
        }))
    ].slice(-12);
    mission.blockedTasks = blocked.filter(item => item?.name !== "web.media.collect");
    mission.errors = (Array.isArray(mission?.errors) ? mission.errors : [])
        .filter(item => item?.tool !== "web.media.collect");
    mission.reelMediaRecovery = {
        ...(mission.reelMediaRecovery || {}),
        active: false,
        recovered: true,
        recoveredAt: now()
    };
}

function archiveRecoveredToolAttempts(mission = {}, toolName = "", now = () => new Date().toISOString()) {
    const name = text(toolName, 120);
    if (name !== "speech.synthesize") return;
    const blocked = Array.isArray(mission?.blockedTasks) ? mission.blockedTasks : [];
    const recovered = blocked.filter(item => item?.name === name);
    const recoveredErrors = (Array.isArray(mission?.errors) ? mission.errors : [])
        .filter(item => item?.tool === name);
    if (recovered.length === 0 && recoveredErrors.length === 0) return;
    mission.recoveredToolAttempts = [
        ...(Array.isArray(mission.recoveredToolAttempts)
            ? mission.recoveredToolAttempts
            : []),
        ...recovered.map(item => ({
            name: item.name,
            args: item.args,
            reason: item.reason,
            observation: item.observation,
            errors: recoveredErrors,
            recoveredAt: now()
        }))
    ].slice(-12);
    mission.blockedTasks = blocked.filter(item => item?.name !== name);
    mission.errors = (Array.isArray(mission?.errors) ? mission.errors : [])
        .filter(item => item?.tool !== name);
}

export async function runJarvisMission({`,
    "RECOVERED_TOOL_ARCHIVE_HELPER"
);
orchestrator = replaceOnce(
    orchestrator,
`        if (observation.objectiveSatisfied) {
            if (task.name === "web.media.collect") {
                archiveRecoveredMediaSourceAttempts(mission, now);
            }
            mission.completedTasks.push(record);`,
`        if (observation.objectiveSatisfied) {
            if (task.name === "web.media.collect") {
                archiveRecoveredMediaSourceAttempts(mission, now);
            }
            if (task.name === "speech.synthesize") {
                archiveRecoveredToolAttempts(mission, task.name, now);
            }
            mission.completedTasks.push(record);`,
    "RECOVERED_TOOL_ARCHIVE_CALL"
);
orchestrator = replaceOnce(
    orchestrator,
`    deterministicReelMediaRecoveryCall,
    archiveRecoveredMediaSourceAttempts
};`,
`    deterministicReelMediaRecoveryCall,
    archiveRecoveredMediaSourceAttempts,
    archiveRecoveredToolAttempts
};`,
    "RECOVERED_TOOL_TEST_EXPORT"
);
await write(paths.orchestrator, orchestrator);

let reelTest = await read(paths.reelTest);
reelTest = appendOnce(
    reelTest,
    "V142 waits for the real browser export completion state",
`test("V142 waits for the real browser export completion state", async () => {
  const source = await read("jarvis-fs-bridge.js");
  assert.match(source, /2\\.46\\.0-reel-export-completion-v142/);
  assert.doesNotMatch(source, /await sleepMs\\(duration \\* 1000 \\+ 2600\\)/);
  assert.match(source, /__JARVIS_REEL_EXPORT_ERROR__/);
  assert.match(source, /REEL_EXPORT_COMPLETION_TIMEOUT/);
  assert.match(source, /setTimeout\\(finish, 100\\)/);
  assert.match(source, /Math\\.max\\(45000, duration \\* 1000 \\+ 30000\\)/);
});`
);
await write(paths.reelTest, reelTest);

let missionTest = await read(paths.missionTest);
missionTest = appendOnce(
    missionTest,
    "mission archives an earlier blocked speech attempt after verified recovery",
`test("mission archives an earlier blocked speech attempt after verified recovery", async () => {
    let speechAttempt = 0;
    const mission = await runJarvisMission({
        instruction: "Genera una narracion verificable y recupera automaticamente una voz disponible.",
        initialToolCalls: [
            { name: "speech.synthesize", args: { text: "Primer intento", language: "es-MX" } },
            { name: "speech.synthesize", args: { text: "Segundo intento", language: "es" } }
        ],
        requiredToolNames: ["speech.synthesize"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async () => {
            speechAttempt += 1;
            if (speechAttempt === 1) {
                return {
                    ok: false,
                    executionOk: true,
                    objectiveSatisfied: false,
                    blocked: true,
                    retryable: false,
                    status: "SPEECH_LANGUAGE_VOICE_NOT_FOUND",
                    error: "SPEECH_LANGUAGE_VOICE_NOT_FOUND"
                };
            }
            return {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "SPEECH_AUDIO_CREATED_VERIFIED",
                output: ".jarvis-artifacts/audio/recovered.wav",
                mimeType: "audio/wav",
                bytes: 2048,
                sha256: "a".repeat(64)
            };
        },
        storage: memoryStorage()
    });

    assert.equal(mission.completedTasks.some(item => item.name === "speech.synthesize"), true);
    assert.equal(mission.blockedTasks.some(item => item.name === "speech.synthesize"), false);
    assert.equal(mission.errors.some(item => item.tool === "speech.synthesize"), false);
    assert.equal(mission.recoveredToolAttempts.length, 1);
    assert.equal(mission.recoveredToolAttempts[0].observation.status, "SPEECH_LANGUAGE_VOICE_NOT_FOUND");
    assert.equal(mission.reason, "ALL_EXECUTABLE_TASKS_COMPLETED");
});`
);
await write(paths.missionTest, missionTest);

console.log("V142_REEL_CLOSEOUT_APPLIED=true");
