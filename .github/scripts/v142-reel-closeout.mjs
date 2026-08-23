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

function removeReelLexicalContentGate(source) {
    const semanticTextBlock = `    const semanticText = [
        input.brandName,
        input.title,
        input.cta,
        ...(Array.isArray(input.scenes)
            ? input.scenes.flatMap(scene => [scene?.overlay, scene?.subtitle, scene?.visualDescription])
            : [])
    ].map(value => clean(value)).filter(Boolean).join("\\n");
`;
    if (source.includes(semanticTextBlock)) {
        source = source.replace(semanticTextBlock, "");
    }

    const lexicalChecks = [
        `            noPlaceholders: !/\\bTODO\\b/i.test(semanticText) && !/Lorem ipsum/i.test(semanticText)`,
        `            noPlaceholders: !/\\bTODO\\b/.test(semanticText) && !/Lorem ipsum/i.test(semanticText)`
    ];
    let removed = false;
    for (const check of lexicalChecks) {
        if (!source.includes(check)) continue;
        source = source.replace(`,\n${check}`, "");
        removed = true;
    }
    if (!removed && source.includes("noPlaceholders:")) {
        throw new Error("REEL_LEXICAL_CONTENT_GATE_UNKNOWN_SHAPE");
    }
    return source;
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
reelArtifact = removeReelLexicalContentGate(reelArtifact);
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
    "V142 reel Studio does not lexically block user content",
`test("V142 reel Studio does not lexically block user content", () => {
  for (const phrase of [
    "Mostrar todo el taco y el queso derretido",
    "TODO reemplazar esta toma",
    "Lorem ipsum puede ser texto intencional del usuario",
    "ToDo, TODO, todo: cualquier texto es contenido, no un gate fisico"
  ]) {
    const candidate = input();
    candidate.scenes[0].visualDescription = phrase;
    candidate.scenes[0].subtitle = phrase;
    const html = buildReelStudioHtml(candidate);
    const verification = describeReelStudio(candidate, html);
    assert.equal(Object.hasOwn(verification.checks, "noPlaceholders"), false);
    assert.equal(Object.values(verification.checks).every(Boolean), true);
  }
});`
);

reelTest = appendOnce(
    reelTest,
    "V142 reel bridge reports the exact failed Studio post-verification checks",
`test("V142 reel bridge reports the exact failed Studio post-verification checks", () => {
  const source = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
  assert.equal(source.includes("const failedChecks = Object.entries(verification.checks)"), true);
  assert.equal(source.includes("REEL_STUDIO_POST_VERIFY_FAILED:"), true);
  assert.equal(source.includes('failedChecks.join(",")'), true);
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
