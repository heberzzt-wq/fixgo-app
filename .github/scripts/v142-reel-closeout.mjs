import fs from "node:fs/promises";

const paths = {
    core: "gestia-core/gestia-core.js",
    planner: "gestia-core/jarvis/jarvis.multifunction.planner.js",
    orchestrator: "gestia-core/jarvis/jarvis.mission.orchestrator.js",
    bridge: "jarvis-fs-bridge.js",
    reelArtifact: "jarvis-reel-artifact.js",
    reelTest: "tests/jarvis-reel-native-mp4-v138.test.mjs",
    semanticPlannerTest: "tests/jarvis-semantic-planner.test.cjs"
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
    if (count !== 1) throw new Error(`${label}_MATCH_COUNT_${count}`);
    return source.replace(before, after);
}

function appendOnce(source, marker, addition) {
    if (source.includes(marker)) return source;
    return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

const bridge = await read(paths.bridge);
for (const marker of [
    "2.47.0-dual-human-recovery-v142",
    "REEL_STUDIO_POST_VERIFY_FAILED:",
    "detached_contract_head",
    "speechSynthesisRecoveryInputs",
    "tiktokOembedVisualSeed"
]) {
    if (!bridge.includes(marker)) throw new Error(`V142_BRIDGE_STATE_REQUIRED:${marker}`);
}

const planner = await read(paths.planner);
for (const marker of [
    "generalistCurrentTurnPolicy: GENERALIST_CURRENT_TURN_POLICY",
    "contexto semantico asesor de esta conversacion confirme de forma inequivoca una produccion activa",
    "por si solos y sin esa continuidad semantica, no autorizan ejecutar nada"
]) {
    if (!planner.includes(marker)) throw new Error(`V142_PLANNER_STATE_REQUIRED:${marker}`);
}

const orchestrator = await read(paths.orchestrator);
for (const marker of [
    "verifiedSpeechArtifactForReel",
    "REEL_PLAN_RETRY_AFTER_MEDIA_RECOVERY",
    "reelCreateArgsFromVerifiedPlan"
]) {
    if (!orchestrator.includes(marker)) throw new Error(`V142_ORCHESTRATOR_STATE_REQUIRED:${marker}`);
}

const reelArtifact = await read(paths.reelArtifact);
if (reelArtifact.includes("noPlaceholders:")) {
    throw new Error("V142_REEL_LEXICAL_CONTENT_GATE_REGRESSION");
}

let core = await read(paths.core);
for (const marker of [
    "[CURRENT_TURN_SEMANTIC_PLANNER_TRANSIENT_RETRY]",
    "attempt <= 3",
    "call?.deferred === true",
    "reason: \"SEMANTIC_PLANNER_UNAVAILABLE\""
]) {
    if (!core.includes(marker)) throw new Error(`V142_CORE_STATE_REQUIRED:${marker}`);
}

const missionContractBefore = `    let missionContractToolCalls;
    try {
        missionContractToolCalls =
            await buildJarvisMultifunctionToolCalls(
                inputRaw.slice(0, 120000),
                {
                    ...context,
                    throwOnUnavailable: true,
                    toolCatalog: missionToolCatalog,
                    missionState: {
                        phase: "MISSION_CONTRACT",
                        writeAllowed: false,
                        userArtifactAllowed: true,
                        existingInitialTools: operationalInitialToolCalls.map(call => call?.name).filter(Boolean),
                        semanticMemoryAvailable: Boolean(semanticMemoryContext),
                        advisorySemanticContext: compactJarvisSemanticMemoryForPlanner(semanticMemoryContext)
                    }
                }
            );
    } catch (contractError) {
        console.warn("[MISSION_CONTRACT_RECOVERED_FROM_INITIAL_PLAN]", contractError);
        const allowedMissionTools = new Set(missionToolCatalog.map(tool => tool.name));
        missionContractToolCalls = operationalInitialToolCalls.filter(
            call => allowedMissionTools.has(call?.name)
        );
        if (missionContractToolCalls.length === 0) throw contractError;
    }`;

const missionContractAfter = `    let missionContractToolCalls;
    let lastMissionContractError = null;
    for (let missionContractAttempt = 1; missionContractAttempt <= 3; missionContractAttempt += 1) {
        try {
            missionContractToolCalls =
                await buildJarvisMultifunctionToolCalls(
                    inputRaw.slice(0, 120000),
                    {
                        ...context,
                        throwOnUnavailable: true,
                        toolCatalog: missionToolCatalog,
                        missionState: {
                            phase: "MISSION_CONTRACT",
                            writeAllowed: false,
                            userArtifactAllowed: true,
                            existingInitialTools: operationalInitialToolCalls.map(call => call?.name).filter(Boolean),
                            semanticMemoryAvailable: Boolean(semanticMemoryContext),
                            advisorySemanticContext: compactJarvisSemanticMemoryForPlanner(semanticMemoryContext)
                        }
                    }
                );
            lastMissionContractError = null;
            break;
        }
        catch(error) {
            lastMissionContractError = error;
            if (missionContractAttempt >= 3) break;
            const retryDelayMs = missionContractAttempt === 1 ? 500 : 1500;
            console.warn(
                "[MISSION_CONTRACT_SEMANTIC_PLANNER_TRANSIENT_RETRY]",
                missionContractAttempt,
                String(error?.message || error),
                retryDelayMs
            );
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
    }
    if (lastMissionContractError) {
        console.warn("[MISSION_CONTRACT_RECOVERED_FROM_INITIAL_PLAN]", lastMissionContractError);
        const allowedMissionTools = new Set(missionToolCatalog.map(tool => tool.name));
        const recoveredInitialToolCalls = operationalInitialToolCalls.filter(
            call => allowedMissionTools.has(call?.name)
        );
        const incompleteProductionFallback = recoveredInitialToolCalls.some(call =>
            call?.name === "marketing.plan" &&
            call?.args?.productionRequested === true &&
            (
                !Array.isArray(call?.args?.productionArtifacts) ||
                call.args.productionArtifacts.length === 0
            )
        );
        if (recoveredInitialToolCalls.length === 0 || incompleteProductionFallback) {
            throw lastMissionContractError;
        }
        missionContractToolCalls = recoveredInitialToolCalls;
    }`;

core = replaceOnce(
    core,
    missionContractBefore,
    missionContractAfter,
    "MISSION_CONTRACT_RETRY_AND_FAIL_CLOSED"
);
await write(paths.core, core);

let reelTest = await read(paths.reelTest);
reelTest = appendOnce(
    reelTest,
    "V142 mission contract retries the same semantic authority and rejects amputated production fallback",
`test("V142 mission contract retries the same semantic authority and rejects amputated production fallback", () => {
  const coreSource = fs.readFileSync(
    new URL("../gestia-core/gestia-core.js", import.meta.url),
    "utf8"
  );
  assert.equal(coreSource.includes("missionContractAttempt <= 3"), true);
  assert.equal(coreSource.includes("[MISSION_CONTRACT_SEMANTIC_PLANNER_TRANSIENT_RETRY]"), true);
  assert.equal(coreSource.includes("const incompleteProductionFallback = recoveredInitialToolCalls.some"), true);
  assert.equal(coreSource.includes('call?.name === "marketing.plan"'), true);
  assert.equal(coreSource.includes("call?.args?.productionRequested === true"), true);
  assert.equal(coreSource.includes("call.args.productionArtifacts.length === 0"), true);
  assert.equal(coreSource.includes("throw lastMissionContractError"), true);
});`
);
await write(paths.reelTest, reelTest);

let semanticPlannerTest = await read(paths.semanticPlannerTest);
semanticPlannerTest = semanticPlannerTest.replace(
    /(\} = require\("\.\.\/functions\/jarvis-semantic-planner"\);\n)\n+(const catalog = \[)/,
    "$1\n$2"
);
await write(paths.semanticPlannerTest, semanticPlannerTest);

console.log(JSON.stringify({
    ok: true,
    status: "V142_REEL_CLOSEOUT_APPLIED",
    sameSemanticAuthority: true,
    missionContractAttempts: 3,
    partialProductionFallbackRejected: true,
    semanticPlannerTestWhitespaceCanonical: true,
    newFiles: false,
    newContracts: false,
    newBrains: false
}));
