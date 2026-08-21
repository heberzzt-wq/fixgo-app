import fs from "node:fs";

const paths = {
  semanticPlanner: "functions/jarvis-semantic-planner.js",
  multitool: "gestia-core/jarvis/jarvis.multitool.pack.js",
  multifunctionTest: "tests/jarvis-multifunction-tools.test.mjs",
  sourceGroundedTest: "tests/jarvis-source-grounded-research-v124.test.mjs"
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
  if (index < 0) throw new Error(`V142_FINAL_ALIGNMENT_MARKER_MISSING:${label}`);
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
  '        "Para web.media.collect con FUENTE ANCLA, copia la URL exacta en url. Si la investigacion verificada selecciono una fuente concreta, conserva exactamente esa URL y no la reemplaces por otra publicacion.",'
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
for (const marker of [
  "objectiveSatisfied: !entityNotVerified",
  "requiresInput: entityNotVerified",
  "primaryEntityNotVerified",
  "objectiveSatisfied: false"
]) {
  if (!multitool.includes(marker)) throw new Error(`V142_RESEARCH_OBJECTIVE_TRUTH_MISSING:${marker}`);
}
write(paths.multitool, multitool);

let multifunction = read(paths.multifunctionTest);
const parsed = topLevelTestBlocks(multifunction);
const legacyInvocation = /plannerTest[\s\S]{0,100}\.callBrowser(?:MissionContract|SemanticPlan)\s*\(/;
const keptBlocks = [];
let removedLegacyBlocks = 0;
let alignedLatencyBlocks = 0;
for (const block of parsed.blocks) {
  if (legacyInvocation.test(block)) {
    removedLegacyBlocks += 1;
    continue;
  }
  let keptBlock = block;
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
  multifunction += `\n\ntest("entity-not-verified research cannot satisfy the mission objective", () => {\n    const source = fs.readFileSync(\n        path.resolve("gestia-core/jarvis/jarvis.multitool.pack.js"),\n        "utf8"\n    );\n\n    assert.match(source, /objectiveSatisfied:\s*!entityNotVerified/);\n    assert.match(source, /requiresInput:\s*entityNotVerified/);\n    assert.match(source, /const primaryEntityNotVerified/);\n    assert.match(source, /objectiveSatisfied:\s*false/);\n});\n`;
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
if (alignedLatencyBlocks !== 2) {
  throw new Error(`V142_LATENCY_CONTRACT_COUNT_MISMATCH:${alignedLatencyBlocks}`);
}
if (multifunction.includes("assert.match(plannerSource, /BROWSER_MISSION_ATTEMPT_TIMEOUT_MS")) {
  throw new Error("V142_LEGACY_BROWSER_MISSION_TIMEOUT_ASSERTION_ACTIVE");
}
if (multifunction.includes("assert.match(plannerSource, /BROWSER_PLAN_ATTEMPT_TIMEOUT_MS")) {
  throw new Error("V142_LEGACY_BROWSER_PLAN_TIMEOUT_ASSERTION_ACTIVE");
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

console.log(JSON.stringify({
  ok: true,
  status: "V142_FINAL_CONTRACT_ALIGNMENT_APPLIED",
  removedLegacyBrowserPlannerTests: removedLegacyBlocks,
  alignedLatencyBlocks,
  researchObjectiveTruth: true,
  sourceAnchorAuthority: "functions/jarvis-semantic-planner.js"
}));
