import fs from "node:fs/promises";

const paths = {
    bridge: "jarvis-fs-bridge.js",
    orchestrator: "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    reelTest: "tests/jarvis-reel-native-mp4-v138.test.mjs",
    semanticPlannerTest: "tests/jarvis-semantic-planner.test.cjs"
};

async function read(file) {
    return (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
}

async function write(file, source) {
    await fs.writeFile(file, source, "utf8");
}

const bridge = await read(paths.bridge);
for (const marker of [
    "2.46.0-reel-export-completion-v142",
    "detached_contract_head",
    "requestedSpeechOutput",
    "REEL_EXPORT_COMPLETION_TIMEOUT",
    "speechSynthesisRecoveryInputs",
    "tiktokOembedVisualSeed",
    "tiktok-oembed-thumbnail",
    "speechRecovery"
]) {
    if (!bridge.includes(marker)) {
        throw new Error(`V142_BRIDGE_MATERIALIZATION_REQUIRED:${marker}`);
    }
}

const orchestrator = await read(paths.orchestrator);
for (const marker of [
    "verifiedSpeechArtifactForReel",
    "archiveRecoveredToolAttempts"
]) {
    if (!orchestrator.includes(marker)) {
        throw new Error(`V142_ORCHESTRATOR_MATERIALIZATION_REQUIRED:${marker}`);
    }
}

const reelTest = await read(paths.reelTest);
for (const marker of [
    "V142 accepts detached bridge identity only at the contract remote-tracking head",
    "V142 reuses installed speech capability when semantic voice is unavailable",
    "V142 reuses verified TikTok oEmbed thumbnail as input to the existing media collector"
]) {
    if (!reelTest.includes(marker)) {
        throw new Error(`V142_REEL_TEST_MATERIALIZATION_REQUIRED:${marker}`);
    }
}

let semanticPlannerTest = await read(paths.semanticPlannerTest);
semanticPlannerTest = semanticPlannerTest.replace(
    /\n{3,}(const catalog = \[)/,
    "\n\n$1"
);
await write(paths.semanticPlannerTest, semanticPlannerTest);

console.log("V142_REEL_CLOSEOUT_APPLIED=true");
