import fs from "node:fs/promises";

const paths = {
    bridge: "jarvis-fs-bridge.js",
    orchestrator: "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    reelTest: "tests/jarvis-reel-native-mp4-v138.test.mjs",
    fsBridgeV2Test: "tests/jarvis-fs-bridge-v2.test.mjs",
    semanticPlannerTest: "tests/jarvis-semantic-planner.test.cjs",
    missionTest: "tests/jarvis-mission-orchestrator.test.mjs"
};

async function read(file) {
    return (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
}

async function write(file, source) {
    await fs.writeFile(file, source, "utf8");
}

function replaceOnce(source, before, after, label) {
    if (source.includes(after)) return source;
    const count = source.split(before).length - 1;
    if (
        count === 0 &&
        label === "RECOVERED_TOOL_ARCHIVE_HELPER" &&
        source.includes("function archiveRecoveredToolAttempts(")
    ) return source;
    if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
    return source.replace(before, after);
}

function appendOnce(source, marker, addition) {
    if (source.includes(marker)) return source;
    return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

let bridge = await read(paths.bridge);
bridge = replaceOnce(
    bridge,
`export const JARVIS_FS_BRIDGE_VERSION =
    "2.45.0-native-mp4-reel-export-v138";`,
`export const JARVIS_FS_BRIDGE_VERSION =
    "2.46.0-reel-export-completion-v142";`,
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
bridge = replaceOnce(
    bridge,
`    app.post("/speech/synthesize", async (req, res) => {
        try {
            const speech = synthesizeSpeechArtifact({
                ...(req.body || {}),
                root
            });`,
`    app.post("/speech/synthesize", async (req, res) => {
        try {
            const requestedSpeechOutput = String(req.body?.output || "")
                .trim()
                .replaceAll("\\\\", "/");
            const speechOutput =
                requestedSpeechOutput.startsWith(".jarvis-artifacts/audio/") &&
                !requestedSpeechOutput.includes("../") &&
                requestedSpeechOutput.toLowerCase().endsWith(".wav")
                    ? requestedSpeechOutput
                    : "";
            const speech = synthesizeSpeechArtifact({
                ...(req.body || {}),
                output: speechOutput,
                root
            });`,
    "SPEECH_OUTPUT_PHYSICAL_CANONICALIZATION"
);
bridge = replaceOnce(
    bridge,
`    const compatible =
        contract.ok === true &&
        Boolean(git.root) &&
        contract.branch === git.branch;

    return {
        ok: compatible,
        status:
            compatible
                ? "BRIDGE_IDENTITY_OK"
                : "BRIDGE_IDENTITY_INVALID",
        root:
            path.resolve(root),
        contract,
        git
    };`,
`    const branchMatches =
        contract.ok === true &&
        Boolean(git.root) &&
        contract.branch === git.branch;

    const detachedContractHead =
        contract.ok === true &&
        Boolean(git.root) &&
        !git.branch &&
        Boolean(git.head) &&
        Boolean(contract.branch)
            ? gitText(
                [
                    "rev-parse",
                    "--verify",
                    \`origin/${'${'}contract.branch}^{commit}\`
                ],
                root,
                {
                    allowFailure: true
                }
            )
            : "";

    const detachedMatchesContractHead =
        Boolean(detachedContractHead) &&
        detachedContractHead === git.head;

    const compatible =
        branchMatches ||
        detachedMatchesContractHead;

    return {
        ok: compatible,
        status:
            compatible
                ? "BRIDGE_IDENTITY_OK"
                : "BRIDGE_IDENTITY_INVALID",
        root:
            path.resolve(root),
        contract,
        git,
        identityMode:
            branchMatches
                ? "branch"
                : detachedMatchesContractHead
                    ? "detached_contract_head"
                    : "invalid",
        contractHead:
            detachedContractHead ||
            null
    };`,
    "DETACHED_CONTRACT_HEAD_IDENTITY"
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
`function archiveRecoveredToolAttempts(mission = {}, toolName = "", now = () => new Date().toISOString()) {
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
`function archiveRecoveredToolAttempts(mission = {}, toolName = "", now = () => new Date().toISOString()) {
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

function verifiedSpeechArtifactForReel(mission = {}) {
    const completed = Array.isArray(mission?.completedTasks)
        ? mission.completedTasks
        : [];
    const speech = [...completed].reverse().find(item =>
        item?.name === "speech.synthesize" &&
        item?.observation?.objectiveSatisfied === true &&
        item?.observation?.status === "SPEECH_AUDIO_CREATED_VERIFIED"
    );
    const output = text(
        speech?.observation?.artifact ||
        speech?.observation?.evidence?.output ||
        "",
        500
    ).replaceAll("\\\\", "/");
    if (
        !output.startsWith(".jarvis-artifacts/audio/") ||
        output.includes("../") ||
        !output.toLowerCase().endsWith(".wav")
    ) {
        return "";
    }
    return output;
}

export async function runJarvisMission({`,
    "VERIFIED_SPEECH_REEL_HANDOFF_HELPER"
);
orchestrator = replaceOnce(
    orchestrator,
`        mission.iterations += 1;
        task.attempts += 1;
        let result;
        try {
            result = await execute({ name: task.name, args: task.args, approved: false }, {`,
`        mission.iterations += 1;
        task.attempts += 1;
        if (task.name === "reel.create") {
            const verifiedSpeechOutput = verifiedSpeechArtifactForReel(mission);
            if (verifiedSpeechOutput) {
                task.args = {
                    ...(task.args || {}),
                    audioOutput: verifiedSpeechOutput
                };
                task.signature = callSignature({ name: task.name, args: task.args });
            }
        }
        let result;
        try {
            result = await execute({ name: task.name, args: task.args, approved: false }, {`,
    "VERIFIED_SPEECH_REEL_HANDOFF_CALL"
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
    archiveRecoveredMediaSourceAttempts,
    archiveRecoveredToolAttempts
};`,
`    deterministicReelMediaRecoveryCall,
    archiveRecoveredMediaSourceAttempts,
    archiveRecoveredToolAttempts,
    verifiedSpeechArtifactForReel
};`,
    "RECOVERED_TOOL_TEST_EXPORT"
);
await write(paths.orchestrator, orchestrator);

let reelTest = await read(paths.reelTest);
reelTest = replaceOnce(
    reelTest,
`import path from "node:path";
import { test } from "node:test";`,
`import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";`,
    "REEL_TEST_GIT_IMPORT"
);
reelTest = replaceOnce(
    reelTest,
`import {
    assertReelVideoContainer,
    reelVideoExtensionFromMime,`,
`import {
    assertReelVideoContainer,
    createJarvisFsBridgeApp,
    reelVideoExtensionFromMime,`,
    "REEL_TEST_BRIDGE_APP_IMPORT"
);
reelTest = replaceOnce(
    reelTest,
`    assert.match(runtime, /v138-native-mp4-reel-export-20260812/);`,
`    assert.match(runtime, /v139-transient-resilience-20260813/);`,
    "REEL_RUNTIME_BASELINE_MARKER"
);
reelTest = appendOnce(
    reelTest,
    "V142 waits for the real browser export completion state",
`test("V142 waits for the real browser export completion state", () => {
  const source = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  assert.match(source, /2\\.46\\.0-reel-export-completion-v142/);
  assert.doesNotMatch(source, /await sleepMs\\(duration \\* 1000 \\+ 2600\\)/);
  assert.match(source, /__JARVIS_REEL_EXPORT_ERROR__/);
  assert.match(source, /REEL_EXPORT_COMPLETION_TIMEOUT/);
  assert.match(source, /setTimeout\\(finish, 100\\)/);
  assert.match(source, /Math\\.max\\(45000, duration \\* 1000 \\+ 30000\\)/);
});`
);
reelTest = appendOnce(
    reelTest,
    "V142 canonicalizes planner speech output at the physical bridge boundary",
`test("V142 canonicalizes planner speech output at the physical bridge boundary", () => {
  const source = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  assert.match(source, /const requestedSpeechOutput = String\\(req\\.body\\?\\.output \\|\\| ""\\)/);
  assert.match(source, /requestedSpeechOutput\\.startsWith\\("\\.jarvis-artifacts\\/audio\\/"\\)/);
  assert.match(source, /requestedSpeechOutput\\.toLowerCase\\(\\)\\.endsWith\\("\\.wav"\\)/);
  assert.match(source, /output: speechOutput/);
});`
);
reelTest = appendOnce(
    reelTest,
    "V142 accepts detached bridge identity only at the contract remote-tracking head",
`test("V142 accepts detached bridge identity only at the contract remote-tracking head", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v142-detached-identity-"));
  const branch = "v94-media-v4n-negative-claims";
  const releaseId = "v94-source-grounded-research-v124-20260810";
  const runGit = args => execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();

  let server;
  try {
    runGit(["init", "-b", branch]);
    runGit(["config", "user.email", "v142@example.test"]);
    runGit(["config", "user.name", "V142 Test"]);
    fs.writeFileSync(
      path.join(root, "jarvis-runtime-contract.json"),
      JSON.stringify({ projectId: "fixgo-test", branch, releaseId }),
      "utf8"
    );
    const marker = path.join(root, "identity-marker.txt");
    fs.writeFileSync(marker, "certified detached worktree\n", "utf8");
    runGit(["add", "."]);
    runGit(["commit", "-m", "certified head"]);
    const certifiedHead = runGit(["rev-parse", "HEAD"]);
    runGit(["update-ref", \`refs/remotes/origin/${'${'}branch}\`, certifiedHead]);
    runGit(["checkout", "--detach", certifiedHead]);

    server = createJarvisFsBridgeApp({ root }).listen(0);
    await new Promise(resolve => server.once("listening", resolve));
    const base = \`http://127.0.0.1:${'${'}server.address().port}\`;

    const health = await fetch(\`${'${'}base}/health\`).then(response => response.json());
    assert.equal(health.identity.ok, true);
    assert.equal(health.identity.identityMode, "detached_contract_head");
    assert.equal(health.identity.contractHead, certifiedHead);

    const accepted = await fetch(\`${'${'}base}/grep\`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jarvis-release-id": releaseId
      },
      body: JSON.stringify({ term: "certified", cwd: "." })
    });
    assert.notEqual(accepted.status, 503);

    fs.writeFileSync(marker, "diverged detached worktree\n", "utf8");
    runGit(["add", "identity-marker.txt"]);
    runGit(["commit", "-m", "diverged head"]);

    const rejected = await fetch(\`${'${'}base}/grep\`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-jarvis-release-id": releaseId
      },
      body: JSON.stringify({ term: "diverged", cwd: "." })
    });
    const rejectedBody = await rejected.json();
    assert.equal(rejected.status, 503);
    assert.equal(rejectedBody.status, "BRIDGE_IDENTITY_INVALID");
  }
  finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});`
);
await write(paths.reelTest, reelTest);

let fsBridgeV2Test = await read(paths.fsBridgeV2Test);
fsBridgeV2Test = replaceOnce(
    fsBridgeV2Test,
`    assert.equal(description.version, "2.45.0-native-mp4-reel-export-v138");`,
`    assert.equal(description.version, "2.46.0-reel-export-completion-v142");`,
    "FS_BRIDGE_V2_VERSION_CONTRACT"
);
await write(paths.fsBridgeV2Test, fsBridgeV2Test);

let semanticPlannerTest = await read(paths.semanticPlannerTest);
semanticPlannerTest = semanticPlannerTest.replace(
    /\n{3,}(const catalog = \[)/,
    "\n\n$1"
);
await write(paths.semanticPlannerTest, semanticPlannerTest);

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
missionTest = appendOnce(
    missionTest,
    "reel creation receives the verified speech artifact instead of a stale planned path",
`test("reel creation receives the verified speech artifact instead of a stale planned path", async () => {
    let reelArgs = null;
    const verifiedAudio = ".jarvis-artifacts/audio/physical-verified.wav";
    const mission = await runJarvisMission({
        instruction: "Produce narracion y reel fisico usando el audio verificado de esta misma mision.",
        initialToolCalls: [
            {
                name: "speech.synthesize",
                args: {
                    text: "Narracion real",
                    output: "audio-inventado.wav"
                }
            },
            {
                name: "reel.create",
                args: {
                    brandName: "Taqueria El Dorado",
                    title: "Taco Macho",
                    cta: "Visitanos",
                    durationSeconds: 30,
                    audioOutput: ".jarvis-artifacts/audio/stale-missing.wav",
                    scenes: [
                        { durationSeconds: 10, overlay: "Uno", mediaType: "image", assetDataUrl: "data:image/jpeg;base64,/9j/" },
                        { durationSeconds: 10, overlay: "Dos", mediaType: "image", assetDataUrl: "data:image/jpeg;base64,/9j/" },
                        { durationSeconds: 10, overlay: "Tres", mediaType: "image", assetDataUrl: "data:image/jpeg;base64,/9j/" }
                    ]
                }
            }
        ],
        requiredToolNames: ["speech.synthesize", "reel.create"],
        planner: async () => ({ toolCalls: [], missionComplete: true }),
        execute: async call => {
            if (call.name === "speech.synthesize") {
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "SPEECH_AUDIO_CREATED_VERIFIED",
                    output: verifiedAudio,
                    mimeType: "audio/wav",
                    bytes: 4096,
                    sha256: "b".repeat(64)
                };
            }
            if (call.name === "reel.create") {
                reelArgs = structuredClone(call.args);
                return {
                    ok: true,
                    executionOk: true,
                    objectiveSatisfied: true,
                    status: "REEL_VIDEO_CREATED_VERIFIED",
                    output: ".jarvis-artifacts/reels/taco-macho.mp4",
                    mimeType: "video/mp4",
                    bytes: 8192,
                    sha256: "c".repeat(64)
                };
            }
            return { ok: false, status: "UNEXPECTED_TOOL" };
        },
        storage: memoryStorage()
    });

    assert.equal(reelArgs?.audioOutput, verifiedAudio);
    assert.equal(mission.completedTasks.some(item => item.name === "speech.synthesize"), true);
    assert.equal(mission.completedTasks.some(item => item.name === "reel.create"), true);
    assert.equal(mission.blockedTasks.length, 0);
});`
);
await write(paths.missionTest, missionTest);

console.log("V142_REEL_CLOSEOUT_APPLIED=true");