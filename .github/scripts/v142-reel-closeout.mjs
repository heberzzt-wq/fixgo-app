import fs from "node:fs/promises";

const paths = {
    bridge: "jarvis-fs-bridge.js",
    orchestrator: "gestia-core/jarvis/jarvis.mission.orchestrator.js",
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

let bridge = await read(paths.bridge);
for (const marker of [
    "2.46.0-reel-export-completion-v142",
    "detached_contract_head",
    "speechSynthesisRecoveryInputs",
    "canonicalSeedUrl",
    "tiktokOembedVisualSeed",
    "speechRecovery"
]) {
    if (!bridge.includes(marker)) {
        throw new Error(`V142_BRIDGE_MATERIALIZATION_REQUIRED:${marker}`);
    }
}

bridge = replaceOnce(
    bridge,
`            const verification = describeReelStudio(hydrated, html);
            if (!Object.values(verification.checks).every(Boolean)) throw new Error("REEL_STUDIO_POST_VERIFY_FAILED");`,
`            const verification = describeReelStudio(hydrated, html);
            const failedChecks = Object.entries(verification.checks)
                .filter(([, passed]) => passed !== true)
                .map(([name]) => name);
            if (failedChecks.length > 0) {
                throw new Error(
                    "REEL_STUDIO_POST_VERIFY_FAILED:" + failedChecks.join(",")
                );
            }`,
    "REEL_POST_VERIFY_EXACT_CHECK"
);
await write(paths.bridge, bridge);

const orchestrator = await read(paths.orchestrator);
for (const marker of [
    "verifiedSpeechArtifactForReel",
    "REEL_PLAN_RETRY_AFTER_MEDIA_RECOVERY",
    "reelCreateArgsFromVerifiedPlan"
]) {
    if (!orchestrator.includes(marker)) {
        throw new Error(`V142_ORCHESTRATOR_MATERIALIZATION_REQUIRED:${marker}`);
    }
}

let reelArtifact = await read(paths.reelArtifact);
reelArtifact = replaceOnce(
    reelArtifact,
`            noPlaceholders: !/\\bTODO\\b/i.test(semanticText) && !/Lorem ipsum/i.test(semanticText)`,
`            noPlaceholders: !/\\bTODO\\b/.test(semanticText) && !/Lorem ipsum/i.test(semanticText)`,
    "REEL_SPANISH_TODO_FALSE_POSITIVE"
);
await write(paths.reelArtifact, reelArtifact);

let reelTest = await read(paths.reelTest);
for (const marker of [
    "V142 recovers a language-only speech request when the requested culture is unavailable",
    "V142 requeues the same reel plan after verified media recovery",
    "V142 hands verified semantically bound reel-plan scenes to reel.create"
]) {
    if (!reelTest.includes(marker)) {
        throw new Error(`V142_REEL_TEST_MATERIALIZATION_REQUIRED:${marker}`);
    }
}

reelTest = appendOnce(
    reelTest,
    "V142 does not confuse Spanish todo with the TODO placeholder",
`test("V142 does not confuse Spanish todo with the TODO placeholder", () => {
  const spanishInput = input();
  spanishInput.scenes[0].visualDescription = "Mostrar todo el taco y el queso derretido";
  const spanishHtml = buildReelStudioHtml(spanishInput);
  const spanishVerification = describeReelStudio(spanishInput, spanishHtml);
  assert.equal(spanishVerification.checks.noPlaceholders, true);
  assert.equal(Object.values(spanishVerification.checks).every(Boolean), true);

  const placeholderInput = input();
  placeholderInput.scenes[0].visualDescription = "TODO reemplazar esta toma";
  const placeholderHtml = buildReelStudioHtml(placeholderInput);
  const placeholderVerification = describeReelStudio(placeholderInput, placeholderHtml);
  assert.equal(placeholderVerification.checks.noPlaceholders, false);
});`
);

reelTest = appendOnce(
    reelTest,
    "V142 reel bridge reports the exact failed Studio post-verification checks",
`test("V142 reel bridge reports the exact failed Studio post-verification checks", () => {
  const source = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  assert.match(source, /const failedChecks = Object\.entries\(verification\.checks\)/);
  assert.match(source, /REEL_STUDIO_POST_VERIFY_FAILED:/);
  assert.match(source, /failedChecks\.join\(","\)/);
});`
);
await write(paths.reelTest, reelTest);

let semanticPlannerTest = await read(paths.semanticPlannerTest);
semanticPlannerTest = semanticPlannerTest.replace(
    /\n{3,}(const catalog = \[)/,
    "\n\n$1"
);
await write(paths.semanticPlannerTest, semanticPlannerTest);

console.log("V142_REEL_CLOSEOUT_APPLIED=true");
