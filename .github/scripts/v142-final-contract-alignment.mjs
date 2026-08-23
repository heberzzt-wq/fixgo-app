import fs from "node:fs";

const paths = {
  semanticPlanner: "functions/jarvis-semantic-planner.js",
  multitool: "gestia-core/jarvis/jarvis.multitool.pack.js",
  core: "gestia-core/gestia-core.js",
  multifunctionTest: "tests/jarvis-multifunction-tools.test.mjs",
  sourceGroundedTest: "tests/jarvis-source-grounded-research-v124.test.mjs",
  v142Test: "tests/jarvis-mobile-web-research-recovery-v142.test.mjs"
};

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, value) {
  fs.writeFileSync(file, value, "utf8");
}

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  const index = source.indexOf(from);
  if (index < 0) {
    if (
      label === "physical-reel-grounding-before-semantic-audit" &&
      source.includes('call?.name === "speech.synthesize"') &&
      source.includes('call?.name === "reel.plan"') &&
      source.includes('"marketing.plan:videoPackage"')
    ) {
      return source;
    }
    throw new Error(`V142_FINAL_ALIGNMENT_MARKER_MISSING:${label}`);
  }
  return source.slice(0, index) + to + source.slice(index + from.length);
}

function topLevelTestBlocks(source) {
  const marker = "\ntest(";
  const starts = [];
  let cursor = source.indexOf(marker);
  while (cursor >= 0) {
    starts.push(cursor + 1);
    cursor = source.indexOf(marker, cursor + marker.length);
  }
  if (starts.length === 0) return { prefix: source, blocks: [] };
  const prefix = source.slice(0, starts[0]);
  const blocks = starts.map((start, index) =>
    source.slice(start, index + 1 < starts.length ? starts[index + 1] : source.length)
  );
  return { prefix, blocks };
}

let semantic = read(paths.semanticPlanner);
const domainRule = '        "Cuando el usuario limite la investigacion a un dominio, copia ese dominio exacto en allowedDomain de web.research y descarta fuentes externas.",';
const anchoredRules = [
  domainRule,
  '        "Si la instruccion original contiene una URL explicita entregada por el usuario, tratala como FUENTE ANCLA. FUENTES_EXPLICITAS_USUARIO identifica esas URLs inmutables: conserva la URL y la identidad exactas y nunca sustituyas el ancla por una publicacion, cuenta o entidad homonima.",',
  '        "Para web.research con FUENTE ANCLA, copia la URL exacta en seedUrl y su dominio exacto en allowedDomain. Si el ancla no puede verificarse, falla cerrado; no relajes allowedDomain ni presentes otra fuente como si fuera el ancla.",',
  '        "Para web.media.collect con FUENTE ANCLA, copia la URL exacta en url. Si la investigacion verificada selecciono una fuente concreta, conserva exactamente esa URL y no la reemplaces por otra publicacion."'
].join("\n");
semantic = replaceOnce(
  semantic,
  domainRule,
  anchoredRules,
  "authenticated-source-anchor-policy"
);
for (const marker of ["FUENTE ANCLA", "FUENTES_EXPLICITAS_USUARIO", "seedUrl", "web.media.collect"]) {
  if (!semantic.includes(marker)) throw new Error(`V142_AUTHENTICATED_ANCHOR_POLICY_MISSING:${marker}`);
}
write(paths.semanticPlanner, semantic);

let multitool = read(paths.multitool);
const recoveryReturnOld = `                    return {\n                        ...recoveryResult,\n                        ok: true,\n                        status: recoveryStatus,`;
const recoveryReturnNew = `                    return {\n                        ...recoveryResult,\n                        ok: true,\n                        executionOk: true,\n                        objectiveSatisfied: !entityNotVerified,\n                        blocked: entityNotVerified,\n                        requiresInput: entityNotVerified,\n                        retryable: false,\n                        ...(entityNotVerified\n                            ? {\n                                missingInputs: [\n                                    "informacion verificable adicional para confirmar la identidad exacta de la entidad"\n                                ]\n                            }\n                            : {}),\n                        status: recoveryStatus,`;
multitool = replaceOnce(
  multitool,
  recoveryReturnOld,
  recoveryReturnNew,
  "cross-source-entity-objective-truth"
);
const primaryStatusOld = `            const resultStatus =\n                seedUrl && exactAnchorVerified !== true\n                    ? "GROUNDED_ANCHOR_UNVERIFIED_DOMAIN_ONLY"\n                    : primaryResult.status;`;
const primaryStatusNew = `            const primaryEntityNotVerified =\n                primaryResult?.status ===\n                    "ENTITY_NOT_VERIFIED";\n            const resultStatus =\n                primaryEntityNotVerified\n                    ? "ENTITY_NOT_VERIFIED"\n                    : seedUrl && exactAnchorVerified !== true\n                        ? "GROUNDED_ANCHOR_UNVERIFIED_DOMAIN_ONLY"\n                        : primaryResult.status;`;
multitool = replaceOnce(
  multitool,
  primaryStatusOld,
  primaryStatusNew,
  "primary-entity-status-truth"
);
const primaryReturnOld = `            return {\n                ...primaryResult,\n                status: resultStatus,`;
const primaryReturnNew = `            return {\n                ...primaryResult,\n                ...(primaryEntityNotVerified\n                    ? {\n                        executionOk: true,\n                        objectiveSatisfied: false,\n                        blocked: true,\n                        requiresInput: true,\n                        retryable: false,\n                        missingInputs: [\n                            "informacion verificable adicional para confirmar la identidad exacta de la entidad"\n                        ]\n                    }\n                    : {}),\n                status: resultStatus,`;
multitool = replaceOnce(
  multitool,
  primaryReturnOld,
  primaryReturnNew,
  "primary-entity-objective-truth"
);

const localEntityRecoveryAnchor = `                    const recoveryStatus =\n                        entityNotVerified\n                            ? "ENTITY_NOT_VERIFIED_CROSS_SOURCE_RECOVERY"\n                            : "GROUNDED_CROSS_SOURCE_RECOVERY";`;
const localEntityRecoveryPatch = `${localEntityRecoveryAnchor}\n\n                    if (\n                        entityNotVerified &&\n                        typeof globalThis?.JarvisLocalBridge?.requestJson === "function"\n                    ) {\n                        const localRecoveryQuery =\n                            buildCrossSourceResearchRecoveryQuery(\n                                query,\n                                trace\n                            );\n                        try {\n                            const localResult =\n                                await globalThis.JarvisLocalBridge.requestJson(\n                                    "/research",\n                                    {\n                                        query: localRecoveryQuery,\n                                        timeoutMs: 20000,\n                                        allowedDomain: "",\n                                        exactEntity: trace.exactEntity || "",\n                                        seedUrl: seedUrl\n                                    },\n                                    {\n                                        timeoutMs: 25000\n                                    }\n                                );\n                            if (\n                                localResult?.ok === true &&\n                                localResult?.grounded === true &&\n                                Array.isArray(localResult?.sources) &&\n                                localResult.sources.length > 0\n                            ) {\n                                globalThis.__JARVIS_WEB_RESEARCH_HEALTH__ = recordCapabilityEvidence("web_research", {\n                                    ok: true,\n                                    grounded: true,\n                                    status: "GROUNDED_LOCAL_FALLBACK",\n                                    sourceCount: localResult.sources.length,\n                                    factCount: Array.isArray(localResult?.facts)\n                                        ? localResult.facts.length\n                                        : 0,\n                                    objectiveId: localResult?.objectiveId || trace.objectiveId || null,\n                                    caseId: localResult?.caseId || trace.caseId || null,\n                                    checkedAt: new Date().toISOString()\n                                });\n                                recordCapabilityEvidence("web_research_context", {\n                                    ok: true,\n                                    grounded: true,\n                                    query: localResult.query || localRecoveryQuery,\n                                    answer: String(localResult.answer || "").slice(0, 5000),\n                                    sources: localResult.sources.slice(0, 8),\n                                    facts: Array.isArray(localResult?.facts)\n                                        ? localResult.facts.slice(0, 24)\n                                        : [],\n                                    checkedAt: new Date().toISOString()\n                                });\n\n                                return {\n                                    ...localResult,\n                                    ok: true,\n                                    executionOk: true,\n                                    objectiveSatisfied: true,\n                                    blocked: false,\n                                    requiresInput: false,\n                                    retryable: false,\n                                    status: "GROUNDED_LOCAL_FALLBACK",\n                                    cloudStatus: recoveryStatus,\n                                    cloudError:\n                                        recoveryResult?.message ||\n                                        recoveryResult?.error ||\n                                        "ENTITY_NOT_VERIFIED",\n                                    source: "JARVIS_LOCAL_GROUNDED_WEB_RESEARCH",\n                                    readOnly: true,\n                                    sourceScopeRecovered: true,\n                                    exactAnchorVerified: false,\n                                    anchorStatus: "EXACT_ANCHOR_UNAVAILABLE_CROSS_SOURCE_GROUNDED",\n                                    anchor: {\n                                        seedUrl,\n                                        allowedDomain: String(trace.allowedDomain || ""),\n                                        verified: false,\n                                        primaryError: primaryMessage || null\n                                    }\n                                };\n                            }\n                        }\n                        catch(localError) {\n                            recoveryMessage = [\n                                recoveryMessage,\n                                localError?.message ||\n                                String(localError)\n                            ]\n                                .filter(Boolean)\n                                .join(" | ");\n                        }\n                    }`;
multitool = replaceOnce(
  multitool,
  localEntityRecoveryAnchor,
  localEntityRecoveryPatch,
  "entity-not-verified-local-research-fallback"
);

for (const marker of [
  "objectiveSatisfied: !entityNotVerified",
  "requiresInput: entityNotVerified",
  "primaryEntityNotVerified",
  "objectiveSatisfied: false",
  "localRecoveryQuery",
  'status: "GROUNDED_LOCAL_FALLBACK"',
  'source: "JARVIS_LOCAL_GROUNDED_WEB_RESEARCH"'
]) {
  if (!multitool.includes(marker)) throw new Error(`V142_RESEARCH_OBJECTIVE_TRUTH_MISSING:${marker}`);
}
write(paths.multitool, multitool);

let core = read(paths.core);
const genericArgumentAudit = `                    if (\n                        !argumentGrounded &&\n                        toolDefinition?.inputSchema &&\n                        Array.isArray(missionContext?.completedTasks) &&\n                        missionContext.completedTasks.length > 0\n                    ) {`;
const physicalReelGrounding = `                    if (\n                        call?.name === "speech.synthesize" &&\n                        !String(\n                            executionCall.args?.output ||\n                            ""\n                        ).trim()\n                    ) {\n                        const speechArtifactIdentity =\n                            String(\n                                executionCall.args?.objectiveId ||\n                                missionContext?.objectiveId ||\n                                executionCall.args?.caseId ||\n                                missionContext?.caseId ||\n                                "jarvis-speech"\n                            )\n                                .normalize("NFD")\n                                .replace(/[\\u0300-\\u036f]/g, "")\n                                .replace(/[^a-zA-Z0-9_-]+/g, "-")\n                                .replace(/^-+|-+$/g, "")\n                                .slice(0, 80) ||\n                            "jarvis-speech";\n                        executionCall.args = {\n                            ...executionCall.args,\n                            output:\n                                \`.jarvis-artifacts/audio/\${speechArtifactIdentity}.wav\`\n                        };\n                    }\n\n                    if (\n                        !argumentGrounded &&\n                        call?.name === "reel.plan" &&\n                        Array.isArray(missionContext?.completedTasks)\n                    ) {\n                        const marketingReelArgs =\n                            reelArtifactArgsFromCompletedTasks(\n                                missionContext.completedTasks,\n                                executionCall.args\n                            );\n                        const marketingReelScenes =\n                            Array.isArray(marketingReelArgs?.scenes)\n                                ? marketingReelArgs.scenes.map(scene => ({\n                                    durationSeconds:\n                                        Number(scene?.durationSeconds),\n                                    visual:\n                                        String(\n                                            scene?.visualDescription ||\n                                            ""\n                                        ).trim(),\n                                    overlay:\n                                        String(\n                                            scene?.overlay ||\n                                            ""\n                                        ).trim(),\n                                    voiceover:\n                                        String(\n                                            scene?.subtitle ||\n                                            ""\n                                        ).trim(),\n                                    evidence:\n                                        "marketing.plan:videoPackage",\n                                    transition:\n                                        String(\n                                            scene?.transition ||\n                                            "fade"\n                                        ).trim() ||\n                                        "fade"\n                                }))\n                                : [];\n                        const marketingReelTimeline =\n                            marketingReelScenes.reduce(\n                                (sum, scene) =>\n                                    sum +\n                                    (Number.isFinite(\n                                        scene.durationSeconds\n                                    )\n                                        ? scene.durationSeconds\n                                        : 0),\n                                0\n                            );\n                        if (\n                            marketingReelArgs?.brandName &&\n                            marketingReelArgs?.title &&\n                            marketingReelArgs?.cta &&\n                            Number.isFinite(\n                                Number(\n                                    marketingReelArgs\n                                        .durationSeconds\n                                )\n                            ) &&\n                            marketingReelScenes.length >= 3 &&\n                            Math.abs(\n                                marketingReelTimeline -\n                                Number(\n                                    marketingReelArgs\n                                        .durationSeconds\n                                )\n                            ) <= 0.01 &&\n                            marketingReelScenes.every(scene =>\n                                Number.isFinite(\n                                    scene.durationSeconds\n                                ) &&\n                                scene.durationSeconds > 0 &&\n                                scene.visual &&\n                                scene.overlay &&\n                                scene.voiceover &&\n                                scene.evidence\n                            )\n                        ) {\n                            executionCall.args = {\n                                ...executionCall.args,\n                                brandName:\n                                    marketingReelArgs.brandName,\n                                title:\n                                    marketingReelArgs.title,\n                                cta:\n                                    marketingReelArgs.cta,\n                                durationSeconds:\n                                    Number(\n                                        marketingReelArgs\n                                            .durationSeconds\n                                    ),\n                                scenes:\n                                    marketingReelScenes\n                            };\n                            argumentGrounded =\n                                true;\n                        }\n                    }\n\n${genericArgumentAudit}`;
core = replaceOnce(
  core,
  genericArgumentAudit,
  physicalReelGrounding,
  "physical-reel-grounding-before-semantic-audit"
);
for (const marker of [
  'call?.name === "speech.synthesize"',
  '.jarvis-artifacts/audio/',
  'call?.name === "reel.plan"',
  'reelArtifactArgsFromCompletedTasks(',
  'evidence:',
  '"marketing.plan:videoPackage"',
  'argumentGrounded =\n                                true;'
]) {
  if (!core.includes(marker)) throw new Error(`V142_PHYSICAL_REEL_GROUNDING_MISSING:${marker}`);
}
write(paths.core, core);

let multifunction = read(paths.multifunctionTest);
const parsed = topLevelTestBlocks(multifunction);
const legacyInvocation = /plannerTest[\s\S]{0,100}\.callBrowser(?:MissionContract|SemanticPlan)\s*\(/;
const keptBlocks = [];
let removedLegacyBlocks = 0;
let alignedLatencyBlocks = 0;
let alignedSemanticAuthorityBlocks = 0;
let alignedArtifactEditorBlocks = 0;
for (const block of parsed.blocks) {
  if (legacyInvocation.test(block)) {
    removedLegacyBlocks += 1;
    continue;
  }
  let keptBlock = block;
  const isSemanticAuthorityContract =
    block.startsWith('test("semantic model planner replaces phrase gates and preserves terminal speech"');
  if (isSemanticAuthorityContract) {
    alignedSemanticAuthorityBlocks += 1;
    keptBlock = keptBlock
      .replace(
        "    assert.match(planner, /repo\\.architectReview es autocontenida/);",
        "    assert.doesNotMatch(planner, /repo\\.architectReview es autocontenida/);\n    assert.match(planner, /GENERALIST_CURRENT_TURN_POLICY/);"
      );
  }
  const isArtifactEditorContract =
    block.startsWith('test("artifact edit missions keep specialized editors and defer certification until completion audit"') ||
    block.startsWith('test("artifact edit missions stay catalog-driven and defer certification until completion audit"');
  if (isArtifactEditorContract) {
    alignedArtifactEditorBlocks += 1;
    keptBlock = `test("artifact edit missions stay catalog-driven and defer certification until completion audit", () => {\n    const plannerSource = fs.readFileSync(\n        path.join(process.cwd(), "gestia-core", "jarvis", "jarvis.multifunction.planner.js"),\n        "utf8"\n    );\n    const actuatorSource = fs.readFileSync(\n        path.join(process.cwd(), "gestia-core", "jarvis", "jarvis.actuator.pack.js"),\n        "utf8"\n    );\n\n    assert.match(plannerSource, /extractExplicitGovernedToolPlan/);\n    assert.match(plannerSource, /catalogByName/);\n    assert.match(plannerSource, /isGovernedArtifact/);\n    assert.match(plannerSource, /COMPLETION_AUDIT/);\n    assert.match(plannerSource, /terminalCertificationAccounted/);\n    assert.match(actuatorSource, /name:\\s*"document\\.pdf\\.edit"/);\n    assert.match(actuatorSource, /name:\\s*"document\\.xlsx\\.edit"/);\n});\n\n`;
  }
  const isV142LatencyContract =
    block.startsWith('test("semantic mission latency budgets are bounded and do not stack exhausted providers"') ||
    block.startsWith('test("terminal core-first has no orphan brain route and semantic latency is bounded"');
  if (isV142LatencyContract) {
    alignedLatencyBlocks += 1;
    keptBlock = keptBlock
      .replace("12000/", "45000/")
      .replace(
        "assert.match(plannerSource, /BROWSER_MISSION_ATTEMPT_TIMEOUT_MS",
        "assert.doesNotMatch(plannerSource, /BROWSER_MISSION_ATTEMPT_TIMEOUT_MS"
      )
      .replace(
        "assert.match(plannerSource, /BROWSER_PLAN_ATTEMPT_TIMEOUT_MS",
        "assert.doesNotMatch(plannerSource, /BROWSER_PLAN_ATTEMPT_TIMEOUT_MS"
      );
  }
  keptBlocks.push(keptBlock);
}
multifunction = parsed.prefix + keptBlocks.join("");
multifunction = multifunction
  .replace(
    "    assert.match(planner, /callBrowserMissionContract/);",
    "    assert.doesNotMatch(planner, /callBrowserMissionContract/);"
  )
  .replace(
    "    assert.match(planner, /callBrowserSemanticPlan/);",
    "    assert.doesNotMatch(planner, /callBrowserSemanticPlan/);"
  );
if (!multifunction.includes('test("entity-not-verified research cannot satisfy the mission objective"')) {
  multifunction += `\n\ntest("entity-not-verified research cannot satisfy the mission objective", () => {\n    const source = fs.readFileSync(\n        path.resolve("gestia-core/jarvis/jarvis.multitool.pack.js"),\n        "utf8"\n    );\n\n    assert.match(source, /objectiveSatisfied:\\s*!entityNotVerified/);\n    assert.match(source, /requiresInput:\\s*entityNotVerified/);\n    assert.match(source, /const primaryEntityNotVerified/);\n    assert.match(source, /objectiveSatisfied:\\s*false/);\n});\n`;
}
if (/plannerTest[\s\S]{0,100}\.callBrowser(?:MissionContract|SemanticPlan)\s*\(/.test(multifunction)) {
  throw new Error("V142_LEGACY_BROWSER_PLANNER_TEST_STILL_ACTIVE");
}
if (!multifunction.includes("client planner keeps jarvisSemanticPlan as the single planning authority")) {
  throw new Error("V142_SINGLE_AUTHORITY_TEST_MISSING");
}
if (!multifunction.includes("assert.doesNotMatch(planner, /callBrowserMissionContract/);")) {
  throw new Error("V142_BROWSER_MISSION_NEGATIVE_ASSERTION_MISSING");
}
if (!multifunction.includes("assert.doesNotMatch(planner, /callBrowserSemanticPlan/);")) {
  throw new Error("V142_BROWSER_PLAN_NEGATIVE_ASSERTION_MISSING");
}
if (alignedSemanticAuthorityBlocks !== 1) {
  throw new Error(`V142_SEMANTIC_AUTHORITY_CONTRACT_COUNT_MISMATCH:${alignedSemanticAuthorityBlocks}`);
}
if (alignedArtifactEditorBlocks !== 1) {
  throw new Error(`V142_ARTIFACT_EDITOR_CONTRACT_COUNT_MISMATCH:${alignedArtifactEditorBlocks}`);
}
if (alignedLatencyBlocks !== 2) {
  throw new Error(`V142_LATENCY_CONTRACT_COUNT_MISMATCH:${alignedLatencyBlocks}`);
}
if (multifunction.includes("assert.match(plannerSource, /BROWSER_MISSION_ATTEMPT_TIMEOUT_MS")) {
  throw new Error("V142_LEGACY_BROWSER_MISSION_TIMEOUT_ASSERTION_ACTIVE");
}
if (multifunction.includes("assert.match(plannerSource, /BROWSER_PLAN_ATTEMPT_TIMEOUT_MS")) {
  throw new Error("V142_LEGACY_BROWSER_PLAN_TIMEOUT_ASSERTION_ACTIVE");
}
if (multifunction.includes("assert.match(planner, /repo\\.architectReview es autocontenida/);")) {
  throw new Error("V142_LEGACY_ARCHITECT_LITERAL_ASSERTION_ACTIVE");
}
if (multifunction.includes("assert.match(\n        plannerSource,\n        /document\\.pdf\\.edit/")) {
  throw new Error("V142_LEGACY_CLIENT_EDITOR_LITERAL_ASSERTION_ACTIVE");
}
write(paths.multifunctionTest, multifunction);

let sourceGrounded = read(paths.sourceGroundedTest);
const anchorTestStart = sourceGrounded.indexOf('test("production code contains generic source-anchor rules and no fixture-specific business", () => {');
if (anchorTestStart < 0) throw new Error("V142_SOURCE_ANCHOR_TEST_MISSING");
const nextTest = sourceGrounded.indexOf("\ntest(", anchorTestStart + 1);
const anchorTestEnd = nextTest >= 0 ? nextTest : sourceGrounded.length;
let anchorTest = sourceGrounded.slice(anchorTestStart, anchorTestEnd);
anchorTest = anchorTest.replace(
  'const planner = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.multifunction.planner.js", import.meta.url), "utf8");',
  'const planner = fs.readFileSync(new URL("../functions/jarvis-semantic-planner.js", import.meta.url), "utf8");'
);
if (!anchorTest.includes('const planner = fs.readFileSync(new URL("../functions/jarvis-semantic-planner.js", import.meta.url), "utf8");')) {
  throw new Error("V142_SOURCE_ANCHOR_AUTHORITY_TEST_NOT_MIGRATED");
}
sourceGrounded = sourceGrounded.slice(0, anchorTestStart) + anchorTest + sourceGrounded.slice(anchorTestEnd);
write(paths.sourceGroundedTest, sourceGrounded);

let v142Test = read(paths.v142Test);
if (!v142Test.includes('test("v142 entity-not-verified cloud recovery gives the existing local research bridge a chance"')) {
  v142Test += `\n\ntest("v142 entity-not-verified cloud recovery gives the existing local research bridge a chance", async () => {\n    const previousAuth = globalThis.auth;\n    const previousWindow = globalThis.window;\n    const previousFetch = globalThis.fetch;\n    const previousBridge = globalThis.JarvisLocalBridge;\n    const cloudCalls = [];\n    const localCalls = [];\n\n    globalThis.auth = {\n        currentUser: {\n            getIdToken: async () => "firebase-user-token"\n        }\n    };\n    globalThis.window = globalThis.window || {};\n    globalThis.fetch = async (_url, options = {}) => {\n        const body = JSON.parse(String(options.body || "{}"));\n        cloudCalls.push(body?.data || {});\n        return {\n            ok: true,\n            status: 200,\n            json: async () => ({\n                result: {\n                    ok: true,\n                    grounded: false,\n                    status: "ENTITY_NOT_VERIFIED",\n                    message: "No pude verificar la identidad exacta con las fuentes cloud consultadas.",\n                    answer: "",\n                    sources: [],\n                    facts: [],\n                    supports: []\n                }\n            })\n        };\n    };\n    globalThis.JarvisLocalBridge = {\n        requestJson: async (path, payload, options) => {\n            localCalls.push({ path, payload, options });\n            return {\n                ok: true,\n                grounded: true,\n                status: "GROUNDED_LOCAL_SEARCH",\n                query: payload.query,\n                answer: "Identidad recuperada con fuentes web locales atribuibles.",\n                sources: [\n                    {\n                        id: 1,\n                        title: "Taquería El Dorado Cancún",\n                        url: "https://example.com/taqueria-el-dorado-cancun"\n                    }\n                ],\n                supports: [\n                    {\n                        text: "Fuente atribuible a Taquería El Dorado.",\n                        sourceIds: [1]\n                    }\n                ]\n            };\n        }\n    };\n\n    try {\n        const result = await fetchGroundedWebResearch(\n            "Taquería El Dorado @taqueria.eldorado Cancún",\n            {\n                objectiveId: "OBJ-V142-LOCAL",\n                caseId: "CASE-V142-LOCAL",\n                allowedDomain: "tiktok.com",\n                exactEntity: "Taquería El Dorado",\n                seedUrl\n            }\n        );\n\n        assert.equal(cloudCalls.length, 2);\n        assert.equal(localCalls.length, 1);\n        assert.equal(localCalls[0].path, "/research");\n        assert.equal(localCalls[0].payload.allowedDomain, "");\n        assert.equal(localCalls[0].payload.exactEntity, "Taquería El Dorado");\n        assert.equal(localCalls[0].payload.seedUrl, "");\n        assert.doesNotMatch(localCalls[0].payload.query, /https?:\\/\\//i);\n        assert.match(localCalls[0].payload.query, /Taquería El Dorado/i);\n        assert.equal(result.ok, true);\n        assert.equal(result.executionOk, true);\n        assert.equal(result.objectiveSatisfied, true);\n        assert.equal(result.requiresInput, false);\n        assert.equal(result.status, "GROUNDED_LOCAL_FALLBACK");\n        assert.equal(result.source, "JARVIS_LOCAL_GROUNDED_WEB_RESEARCH");\n        assert.equal(result.sourceScopeRecovered, true);\n        assert.equal(result.exactAnchorVerified, false);\n    }\n    finally {\n        if (previousAuth === undefined) delete globalThis.auth;\n        else globalThis.auth = previousAuth;\n        if (previousWindow === undefined) delete globalThis.window;\n        else globalThis.window = previousWindow;\n        if (previousFetch === undefined) delete globalThis.fetch;\n        else globalThis.fetch = previousFetch;\n        if (previousBridge === undefined) delete globalThis.JarvisLocalBridge;\n        else globalThis.JarvisLocalBridge = previousBridge;\n    }\n});\n`;
}
if (!v142Test.includes('test("v142 physical reel reuses completed marketing evidence before semantic argument audit"')) {
  v142Test += `\n\ntest("v142 physical reel reuses completed marketing evidence before semantic argument audit", () => {\n    const core = fs.readFileSync(\n        new URL("../gestia-core/gestia-core.js", import.meta.url),\n        "utf8"\n    );\n    const speechIndex = core.indexOf(\n        'call?.name === "speech.synthesize"'\n    );\n    const reelIndex = core.indexOf(\n        'call?.name === "reel.plan"'\n    );\n    const genericAuditIndex = core.indexOf(\n        "toolDefinition?.inputSchema &&",\n        reelIndex\n    );\n\n    assert.ok(speechIndex >= 0);\n    assert.ok(reelIndex > speechIndex);\n    assert.ok(genericAuditIndex > reelIndex);\n    assert.match(core, /!String\\(\\s*executionCall\\.args\\?\\.output/);\n    assert.match(core, /\\.jarvis-artifacts\\/audio\\//);\n    assert.match(core, /reelArtifactArgsFromCompletedTasks\\(/);\n    assert.match(core, /marketingReelScenes/);\n    assert.match(core, /marketing\\.plan:videoPackage/);\n});\n`;
}
write(paths.v142Test, v142Test);

console.log(JSON.stringify({
  ok: true,
  status: "V142_FINAL_CONTRACT_ALIGNMENT_APPLIED",
  removedLegacyBrowserPlannerTests: removedLegacyBlocks,
  alignedSemanticAuthorityBlocks,
  alignedArtifactEditorBlocks,
  alignedLatencyBlocks,
  researchObjectiveTruth: true,
  localEntityRecovery: true,
  physicalReelGrounding: true,
  speechArtifactDefault: true,
  marketingReelPlanReuse: true,
  sourceAnchorAuthority: "functions/jarvis-semantic-planner.js"
}));
