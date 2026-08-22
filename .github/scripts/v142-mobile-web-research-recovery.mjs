import fs from "node:fs";

const paths = {
  clientPlanner: "gestia-core/jarvis/jarvis.multifunction.planner.js",
  core: "gestia-core/gestia-core.js",
  multitool: "gestia-core/jarvis/jarvis.multitool.pack.js",
  semanticPlanner: "functions/jarvis-semantic-planner.js",
  providerChain: "functions/jarvis-genai-provider-chain.js",
  functionsIndex: "functions/index.js",
  semanticTest: "tests/jarvis-semantic-planner.test.cjs",
  providerTest: "tests/jarvis-genai-provider-chain.test.cjs"
};

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}
function write(file, value) {
  fs.writeFileSync(file, value, "utf8");
}
function assertHas(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`V142_PATCH_MARKER_MISSING:${label}`);
}
function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`V142_PATCH_MARKER_MISSING:${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}
function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`V142_PATCH_MARKER_MISSING:${label}:start`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`V142_PATCH_MARKER_MISSING:${label}:end`);
  return source.slice(0, start) + replacement + source.slice(end);
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
  return {
    prefix: source.slice(0, starts[0]),
    blocks: starts.map((start, index) =>
      source.slice(start, index + 1 < starts.length ? starts[index + 1] : source.length)
    )
  };
}

const clientPlanner = read(paths.clientPlanner);
assertHas(clientPlanner, "CLOUD_MISSION_CONTRACT_TIMEOUT_MS", "client-cloud-timeout");
if (
  clientPlanner.includes("text.pollinations.ai") ||
  clientPlanner.includes("callBrowserMissionContract") ||
  clientPlanner.includes("callBrowserSemanticPlan")
) {
  throw new Error("V142_CLIENT_SECOND_PLANNER_STILL_ACTIVE");
}
const core = read(paths.core);
assertHas(core, 'call?.name === "speech.synthesize"', "physical-speech-grounding");
assertHas(core, 'call?.name === "reel.plan"', "physical-reel-grounding");
const multitool = read(paths.multitool);
assertHas(multitool, 'status: "GROUNDED_LOCAL_FALLBACK"', "local-research-fallback");

let index = read(paths.functionsIndex);
const providerOrderOld = `    const providers = [];\n\n    providers.push({\n        name: "vertex-adc",\n        ai: getVertexGenAI()\n    });\n\n    try {\n        providers.push({\n            name: "gemini-developer",\n            ai: getGroundedGenAI()\n        });\n    }\n    catch(error) {\n        console.warn(JSON.stringify({\n            level: "WARNING",\n            message: "JARVIS_GEMINI_DEVELOPER_UNAVAILABLE",\n            error: error?.message || String(error)\n        }));\n    }`;
const providerOrderNew = `    const providers = [];\n\n    try {\n        providers.push({\n            name: "gemini-developer",\n            ai: getGroundedGenAI()\n        });\n    }\n    catch(error) {\n        console.warn(JSON.stringify({\n            level: "WARNING",\n            message: "JARVIS_GEMINI_DEVELOPER_UNAVAILABLE",\n            error: error?.message || String(error)\n        }));\n    }\n\n    providers.push({\n        name: "vertex-adc",\n        ai: getVertexGenAI()\n    });`;
index = replaceOnce(index, providerOrderOld, providerOrderNew, "two-provider-order");
index = index.split('"gemini-2.5-flash"').join('"gemini-3.6-flash"');
const plannerProviderStart = index.indexOf("function getPlannerGenAI");
const developerIndex = index.indexOf('name: "gemini-developer"', plannerProviderStart);
const vertexIndex = index.indexOf('name: "vertex-adc"', plannerProviderStart);
if (developerIndex < 0 || vertexIndex < 0 || developerIndex > vertexIndex) {
  throw new Error("V142_PROVIDER_ORDER_INVALID");
}
write(paths.functionsIndex, index);

let semantic = read(paths.semanticPlanner);
semantic = semantic
  .replace('const VERSION = "1.22.0-mission-isolation";', 'const VERSION = "1.23.0-two-provider-failover-v142";')
  .replace('const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";', 'const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";')
  .replace('const DEFAULT_ENDPOINT = "https://text.pollinations.ai/openai";\n', '');
if (semantic.includes("async function requestModel(")) {
  semantic = replaceSection(semantic, "async function requestModel(", "function isSafeToolName(", "", "remove-public-request-model");
}
if (semantic.includes("async function runSimpleSemanticPlanner(")) {
  semantic = replaceSection(semantic, "async function runSimpleSemanticPlanner(", "async function runJarvisSemanticPlanner(", "", "remove-simple-planner");
}

const authenticatedPlanner = `async function runJarvisSemanticPlanner({\n    ai = null,\n    input = "",\n    catalog = [],\n    timeoutMs = 45000,\n    missionState = null\n} = {}) {\n    const instruction = String(input || "").trim();\n    const safeCatalog = normalizeCatalog(catalog);\n    if (instruction.length < 1 || instruction.length > 120000) throw new Error("SEMANTIC_PLAN_INPUT_OUT_OF_RANGE");\n    if (safeCatalog.length === 0) throw new Error("SEMANTIC_PLAN_CATALOG_REQUIRED");\n    if (!ai?.models?.generateContent) throw new Error("SEMANTIC_AUTHENTICATED_PROVIDER_REQUIRED");\n    let timeoutHandle = null;\n    const timeout = new Promise((_, reject) => {\n        timeoutHandle = setTimeout(\n            () => reject(new Error("SEMANTIC_PROVIDER_TIMEOUT")),\n            Math.max(5000, Number(timeoutMs) || 45000)\n        );\n    });\n    try {\n        return await Promise.race([\n            runGeminiSemanticPlanner({ ai, input: instruction, catalog: safeCatalog, missionState }),\n            timeout\n        ]);\n    }\n    catch(error) {\n        const message = String(error?.message || error || "FAILED");\n        if (message.startsWith("SEMANTIC_AUTHENTICATED_PROVIDER_")) throw error;\n        throw new Error(\`SEMANTIC_AUTHENTICATED_PROVIDER_\${message}\`);\n    }\n    finally {\n        if (timeoutHandle) clearTimeout(timeoutHandle);\n    }\n}\n\n`;
semantic = replaceSection(
  semantic,
  "async function runJarvisSemanticPlanner(",
  "async function runJarvisSemanticResponse(",
  authenticatedPlanner,
  "authenticated-planner-only"
);

const authenticatedResponse = `async function runJarvisSemanticResponse({\n    ai = null,\n    input = "",\n    timeoutMs = null,\n    maxOutputTokens = 3500\n} = {}) {\n    const instruction = String(input || "").trim();\n    const outputTokenBudget = Math.max(500, Math.min(8000, Number(maxOutputTokens) || 3500));\n    if (instruction.length < 1 || instruction.length > 120000) throw new Error("SEMANTIC_RESPONSE_INPUT_OUT_OF_RANGE");\n    if (!ai?.models?.generateContent) throw new Error("SEMANTIC_AUTHENTICATED_PROVIDER_REQUIRED");\n    const effectiveTimeoutMs = Number(timeoutMs) > 0\n        ? Math.max(5000, Number(timeoutMs))\n        : outputTokenBudget >= 6000 ? 120000 : 45000;\n    let timeoutHandle = null;\n    const timeout = new Promise((_, reject) => {\n        timeoutHandle = setTimeout(() => reject(new Error("SEMANTIC_RESPONSE_TIMEOUT")), effectiveTimeoutMs);\n    });\n    try {\n        const response = await Promise.race([\n            ai.models.generateContent({\n                model: DEFAULT_GEMINI_MODEL,\n                contents: instruction,\n                config: {\n                    maxOutputTokens: outputTokenBudget,\n                    thinkingConfig: { thinkingBudget: 0 },\n                    systemInstruction: [\n                        "Eres Jarvis, asistente multifuncional privado de Heberto Mendoza.",\n                        "Responde en espanol natural, completo, directo y verificable.",\n                        "Usa solamente la evidencia incluida en la solicitud.",\n                        "No inventes ejecuciones, archivos, accesos, fuentes ni resultados.",\n                        "Distingue claramente lo ejecutado, lo planeado y lo bloqueado."\n                    ].join("\\n")\n                }\n            }),\n            timeout\n        ]);\n        const message = String(response?.text || "").trim();\n        if (!message) throw new Error("SEMANTIC_RESPONSE_EMPTY");\n        return {\n            ok: true,\n            status: "SEMANTIC_RESPONSE_READY",\n            version: VERSION,\n            provider: String(ai.lastProvider || "gemini"),\n            model: DEFAULT_GEMINI_MODEL,\n            message\n        };\n    }\n    catch(error) {\n        const message = String(error?.message || error || "FAILED");\n        if (message.startsWith("SEMANTIC_AUTHENTICATED_PROVIDER_")) throw error;\n        throw new Error(\`SEMANTIC_AUTHENTICATED_PROVIDER_\${message}\`);\n    }\n    finally {\n        if (timeoutHandle) clearTimeout(timeoutHandle);\n    }\n}\n\n`;
semantic = replaceSection(
  semantic,
  "async function runJarvisSemanticResponse(",
  "module.exports = {",
  authenticatedResponse,
  "authenticated-response-only"
);
semantic = semantic
  .replace("    DEFAULT_ENDPOINT,\n", "")
  .replace("    requestModel,\n", "")
  .replace("    runSimpleSemanticPlanner,\n", "");
for (const forbidden of [
  "text.pollinations.ai", "openai-fast", "pollinations-simple-json",
  'provider: "pollinations"', "DEFAULT_ENDPOINT", "runSimpleSemanticPlanner", "requestModel"
]) {
  if (semantic.includes(forbidden)) throw new Error(`V142_THIRD_SEMANTIC_PROVIDER_STILL_ACTIVE:${forbidden}`);
}
assertHas(semantic, 'const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";', "gemini-3.6-model");
write(paths.semanticPlanner, semantic);

let provider = read(paths.providerChain);
const sanitizeOld = `function sanitizeGenerateContentRequest(request) {\n    const guardedRequest =\n        applyFreshnessGuardToGroundedRequest(request);\n    const tools = guardedRequest?.config?.tools;\n    if (!Array.isArray(tools)) return guardedRequest;\n\n    let changed = false;\n    const compactTools = tools.map(tool => {\n        const declarations = tool?.functionDeclarations;\n        if (!Array.isArray(declarations)) return tool;\n        changed = true;\n        return {\n            ...tool,\n            functionDeclarations: declarations.map(compactFunctionDeclaration)\n        };\n    });\n\n    if (!changed) return guardedRequest;\n\n    return {\n        ...guardedRequest,\n        config: {\n            ...guardedRequest.config,\n            tools: compactTools\n        }\n    };\n}`;
const sanitizeNew = `function sanitizeGenerateContentRequest(request) {\n    const guardedRequest = applyFreshnessGuardToGroundedRequest(request);\n    const sourceConfig = guardedRequest?.config && typeof guardedRequest.config === "object"\n        ? guardedRequest.config\n        : null;\n    let sanitizedConfig = sourceConfig;\n    if (sourceConfig && String(guardedRequest?.model || "").startsWith("gemini-3.")) {\n        const { temperature: _temperature, topP: _topP, topK: _topK, frequencyPenalty: _frequencyPenalty, presencePenalty: _presencePenalty, ...supportedConfig } = sourceConfig;\n        sanitizedConfig = supportedConfig;\n    }\n    const tools = sanitizedConfig?.tools;\n    if (!Array.isArray(tools)) {\n        return sanitizedConfig === sourceConfig ? guardedRequest : { ...guardedRequest, config: sanitizedConfig };\n    }\n    let changed = sanitizedConfig !== sourceConfig;\n    const compactTools = tools.map(tool => {\n        const declarations = tool?.functionDeclarations;\n        if (!Array.isArray(declarations)) return tool;\n        changed = true;\n        return { ...tool, functionDeclarations: declarations.map(compactFunctionDeclaration) };\n    });\n    if (!changed) return guardedRequest;\n    return { ...guardedRequest, config: { ...(sanitizedConfig || {}), tools: compactTools } };\n}`;
provider = replaceOnce(provider, sanitizeOld, sanitizeNew, "gemini3-request-sanitizer");
if (!provider.includes("function responseHasExecutableSemanticPlan(")) {
  const chainMarker = "function createJarvisGenAIProviderChain({ providers = [] } = {}) {";
  const chainIndex = provider.indexOf(chainMarker);
  if (chainIndex < 0) throw new Error("V142_PATCH_MARKER_MISSING:provider-chain");
  const validator = `function requestRequiresExecutableSemanticPlan(request = {}) {\n    if (requestUsesFunctionDeclarations(request)) return true;\n    const text = collectRequestText(request?.contents);\n    return /CONTRATO_DE_MISION|MISSION_CONTRACT|GROUNDED_ARGUMENT_COMPLETION|COMPLETION_AUDIT|AUDITORIA_FINAL_OBLIGATORIA|AUDITORIA_DE_CIERRE_CONTROLADA/.test(text);\n}\n\nfunction responseHasExecutableSemanticPlan(response = {}, request = {}) {\n    if (!requestRequiresExecutableSemanticPlan(request)) return true;\n    if (Array.isArray(response?.functionCalls) && response.functionCalls.length > 0) return true;\n    const parts = Array.isArray(response?.candidates?.[0]?.content?.parts) ? response.candidates[0].content.parts : [];\n    if (parts.some(part => part?.functionCall?.name)) return true;\n    const text = String(response?.text || "").trim();\n    if (!text) return false;\n    try {\n        const payload = JSON.parse(text);\n        const calls = Array.isArray(payload?.toolCalls) ? payload.toolCalls : [];\n        return calls.length > 0 || payload?.missionComplete === true;\n    }\n    catch {\n        return false;\n    }\n}\n\n`;
  provider = provider.slice(0, chainIndex) + validator + provider.slice(chainIndex);
}
provider = replaceOnce(
  provider,
  `                            if (!response) {\n                                throw new Error("EMPTY_PROVIDER_RESPONSE");\n                            }`,
  `                            if (!response) {\n                                throw new Error("EMPTY_PROVIDER_RESPONSE");\n                            }\n                            if (!responseHasExecutableSemanticPlan(response, providerRequest)) {\n                                throw new Error("SEMANTIC_PLAN_EMPTY");\n                            }`,
  "provider-semantic-empty-failover"
);
provider = replaceOnce(
  provider,
  `                                    if (!fallbackResponse) {\n                                        throw new Error("EMPTY_SCHEMA_JSON_FALLBACK_RESPONSE");\n                                    }`,
  `                                    if (!fallbackResponse) {\n                                        throw new Error("EMPTY_SCHEMA_JSON_FALLBACK_RESPONSE");\n                                    }\n                                    if (!responseHasExecutableSemanticPlan(fallbackResponse, jsonFallbackRequest)) {\n                                        throw new Error("SEMANTIC_PLAN_EMPTY");\n                                    }`,
  "provider-schema-fallback-semantic-check"
);
if (!provider.includes("    responseHasExecutableSemanticPlan,")) {
  provider = provider.replace(
    "    resolveGroundingRedirectUrl,\n",
    "    resolveGroundingRedirectUrl,\n    responseHasExecutableSemanticPlan,\n"
  );
}
assertHas(provider, "SEMANTIC_PLAN_EMPTY", "provider-semantic-failover");
write(paths.providerChain, provider);

let semanticTest = read(paths.semanticTest)
  .replace("    requestModel,\n", "")
  .replace("    runSimpleSemanticPlanner,\n", "")
  .split('"gemini-2.5-flash"').join('"gemini-3.6-flash"');

// The historical shared catalog lived between tests. Preserve it before removing legacy test blocks.
const catalogStart = semanticTest.indexOf("\nconst catalog = [");
const catalogEndMarker = catalogStart >= 0 ? semanticTest.indexOf("\n];", catalogStart) : -1;
if (catalogStart < 0 || catalogEndMarker < 0) {
  throw new Error("V142_SHARED_SEMANTIC_CATALOG_MISSING");
}
const sharedCatalog = semanticTest.slice(catalogStart + 1, catalogEndMarker + 3);
semanticTest = semanticTest.slice(0, catalogStart) + "\n" + semanticTest.slice(catalogEndMarker + 3);

const semanticParsed = topLevelTestBlocks(semanticTest);
const semanticKept = [];
for (const block of semanticParsed.blocks) {
  if (block.startsWith('test("semantic response falls back when the authenticated providers are unavailable"')) {
    semanticKept.push(`test("semantic response fails closed when both authenticated providers are unavailable", async () => {\n    await assert.rejects(\n        () => runJarvisSemanticResponse({\n            input: "Integra evidencia.",\n            ai: { models: { generateContent: async () => { throw new Error("PROVIDERS_UNAVAILABLE"); } } }\n        }),\n        /SEMANTIC_AUTHENTICATED_PROVIDER_PROVIDERS_UNAVAILABLE/\n    );\n});\n\n`);
    continue;
  }
  if (block.startsWith('test("semantic planner preserves mixed tools and never grants prompt approval"')) {
    semanticKept.push(`test("semantic planner preserves mixed tools and never grants prompt approval", async () => {\n    const result = await runJarvisSemanticPlanner({\n        input: "analisa el repo y revisa conectores sin modificar nada",\n        catalog,\n        ai: {\n            lastProvider: "gemini-developer",\n            models: {\n                generateContent: async request => {\n                    assert.equal(request.model, "gemini-3.6-flash");\n                    return { functionCalls: [\n                        { name: "jarvis_tool_0", args: { query: "repo" } },\n                        { name: "jarvis_tool_1", args: {} },\n                        { name: "jarvis_tool_2", args: {} }\n                    ] };\n                }\n            }\n        }\n    });\n    assert.deepEqual(result.toolCalls.map(call => call.name), ["repo.search", "connector.list", "system.supervision.runNow"]);\n    assert.equal(result.toolCalls[2].mutates, true);\n    assert.equal(result.toolCalls[2].approved, false);\n});\n\n`);
    continue;
  }
  const isLegacyPublicTest =
    block.includes("runSimpleSemanticPlanner(") ||
    block.includes("requestModel(") ||
    block.includes("text.pollinations.ai") ||
    block.includes('provider, "pollinations"') ||
    block.includes('provider: "pollinations"') ||
    block.includes('"openai-fast"') ||
    block.startsWith('test("public semantic fallback consumes native provider tool calls"') ||
    block.startsWith('test("semantic planner retries one malformed model output"');
  if (isLegacyPublicTest) continue;
  semanticKept.push(block);
}
semanticTest = semanticParsed.prefix + "\n" + sharedCatalog + "\n\n" + semanticKept.join("");
semanticTest = semanticTest.replace(
  'test("semantic planner uses authenticated Gemini before the public fallback"',
  'test("semantic planner uses the authenticated two-provider authority without a public fallback"'
);
for (const forbidden of ["pollinations", "runSimpleSemanticPlanner", "requestModel", "openai-fast"]) {
  if (semanticTest.includes(forbidden)) throw new Error(`V142_OBSOLETE_SEMANTIC_TEST_STILL_ACTIVE:${forbidden}`);
}
write(paths.semanticTest, semanticTest);

let providerTest = read(paths.providerTest).split('"gemini-2.5-flash"').join('"gemini-3.6-flash"');
const providerParsed = topLevelTestBlocks(providerTest);
const providerKept = [];
for (const block of providerParsed.blocks) {
  if (block.startsWith('test("provider chain continues from an invalid developer key to Vertex AI"')) {
    providerKept.push(`test("provider chain continues from an empty developer plan to Vertex AI", async () => {\n    const calls = [];\n    const chain = createJarvisGenAIProviderChain({ providers: [\n        { name: "gemini-developer", ai: { models: { generateContent: async () => {\n            calls.push("developer");\n            return { text: JSON.stringify({ toolCalls: [], missionComplete: false }) };\n        } } } },\n        { name: "vertex-adc", ai: { models: { generateContent: async () => {\n            calls.push("vertex");\n            return { functionCalls: [{ name: "jarvis_tool_0", args: { query: "ok" } }] };\n        } } } }\n    ] });\n    const result = await chain.models.generateContent({\n        model: "gemini-3.6-flash",\n        contents: "INSTRUCCION_ORIGINAL_INMUTABLE=plan",\n        config: {\n            tools: [{ functionDeclarations: [{ name: "jarvis_tool_0", parametersJsonSchema: { type: "object" } }] }],\n            toolConfig: { functionCallingConfig: { mode: "ANY" } }\n        }\n    });\n    assert.deepEqual(calls, ["developer", "vertex"]);\n    assert.equal(result.functionCalls[0].name, "jarvis_tool_0");\n    assert.equal(chain.lastProvider, "vertex-adc");\n});\n\n`);
    continue;
  }
  providerKept.push(block);
}
providerTest = providerParsed.prefix + providerKept.join("");
providerTest = providerTest.replace(
  "    const functionRequest = {\n        config: {",
  "    const functionRequest = {\n        model: \"gemini-3.6-flash\",\n        config: {\n            temperature: 0,\n            topP: 0.9,"
);
providerTest = providerTest.replace(
  "    const declaration = sanitized.config.tools[0].functionDeclarations[0];\n\n    assert.notEqual(sanitized, functionRequest);",
  "    const declaration = sanitized.config.tools[0].functionDeclarations[0];\n\n    assert.notEqual(sanitized, functionRequest);\n    assert.equal(sanitized.config.temperature, undefined);\n    assert.equal(sanitized.config.topP, undefined);"
);
write(paths.providerTest, providerTest);

console.log(JSON.stringify({
  ok: true,
  status: "V142_TWO_PROVIDER_SEMANTIC_CONSOLIDATION_APPLIED",
  primaryProvider: "gemini-developer",
  secondaryProvider: "vertex-adc",
  model: "gemini-3.6-flash",
  publicFallbackRemoved: true,
  semanticEmptyTriggersFailover: true,
  sharedCatalogPreserved: true,
  newFiles: false,
  newBrains: false
}));
