import fs from "node:fs";

const P = {
  client: "gestia-core/jarvis/jarvis.multifunction.planner.js",
  core: "gestia-core/gestia-core.js",
  multitool: "gestia-core/jarvis/jarvis.multitool.pack.js",
  semantic: "functions/jarvis-semantic-planner.js",
  chain: "functions/jarvis-genai-provider-chain.js",
  index: "functions/index.js",
  semanticTest: "tests/jarvis-semantic-planner.test.cjs",
  chainTest: "tests/jarvis-genai-provider-chain.test.cjs"
};

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const write = (file, value) => fs.writeFileSync(file, value, "utf8");
function need(source, value, label) {
  if (!source.includes(value)) throw new Error(`V142_MARKER_MISSING:${label}`);
}
function replaceSection(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`V142_SECTION_MISSING:${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}
function testBlocks(source) {
  const starts = [];
  let cursor = source.indexOf("\ntest(");
  while (cursor >= 0) {
    starts.push(cursor + 1);
    cursor = source.indexOf("\ntest(", cursor + 6);
  }
  if (!starts.length) return { prefix: source, blocks: [] };
  return {
    prefix: source.slice(0, starts[0]),
    blocks: starts.map((start, i) =>
      source.slice(start, i + 1 < starts.length ? starts[i + 1] : source.length)
    )
  };
}

// Guard the already-materialized V142 architecture. No browser/public second brain.
const client = read(P.client);
need(client, "CLOUD_MISSION_CONTRACT_TIMEOUT_MS", "cloud-planner");
for (const forbidden of ["text.pollinations.ai", "callBrowserMissionContract", "callBrowserSemanticPlan"]) {
  if (client.includes(forbidden)) throw new Error(`V142_CLIENT_ALT_BRAIN:${forbidden}`);
}
need(read(P.core), 'call?.name === "speech.synthesize"', "speech-grounding");
need(read(P.core), 'call?.name === "reel.plan"', "reel-grounding");
need(read(P.multitool), 'status: "GROUNDED_LOCAL_FALLBACK"', "local-research");

// Provider authority: Gemini Developer primary, Vertex ADC secondary, same GA model.
let index = read(P.index).split('"gemini-2.5-flash"').join('"gemini-3.6-flash"');
const providerFn = index.indexOf("function getPlannerGenAI");
let dev = index.indexOf('name: "gemini-developer"', providerFn);
let vertex = index.indexOf('name: "vertex-adc"', providerFn);
if (dev < 0 || vertex < 0) throw new Error("V142_TWO_PROVIDERS_REQUIRED");
if (vertex < dev) {
  const oldBlock = `    const providers = [];\n\n    providers.push({\n        name: "vertex-adc",\n        ai: getVertexGenAI()\n    });\n\n    try {\n        providers.push({\n            name: "gemini-developer",\n            ai: getGroundedGenAI()\n        });\n    }\n    catch(error) {\n        console.warn(JSON.stringify({\n            level: "WARNING",\n            message: "JARVIS_GEMINI_DEVELOPER_UNAVAILABLE",\n            error: error?.message || String(error)\n        }));\n    }`;
  const newBlock = `    const providers = [];\n\n    try {\n        providers.push({\n            name: "gemini-developer",\n            ai: getGroundedGenAI()\n        });\n    }\n    catch(error) {\n        console.warn(JSON.stringify({\n            level: "WARNING",\n            message: "JARVIS_GEMINI_DEVELOPER_UNAVAILABLE",\n            error: error?.message || String(error)\n        }));\n    }\n\n    providers.push({\n        name: "vertex-adc",\n        ai: getVertexGenAI()\n    });`;
  need(index, oldBlock, "provider-order");
  index = index.replace(oldBlock, newBlock);
}
write(P.index, index);

// Semantic planner: authenticated authority only. Remove Pollinations/OpenAI-compatible fallback.
let semantic = read(P.semantic)
  .replace('const VERSION = "1.22.0-mission-isolation";', 'const VERSION = "1.23.0-two-provider-failover-v142";')
  .replace('const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";', 'const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";')
  .replace('const DEFAULT_ENDPOINT = "https://text.pollinations.ai/openai";\n', '');
if (semantic.includes("async function requestModel(")) {
  semantic = replaceSection(semantic, "async function requestModel(", "function isSafeToolName(", "", "public-request-model");
}
if (semantic.includes("async function runSimpleSemanticPlanner(")) {
  semantic = replaceSection(semantic, "async function runSimpleSemanticPlanner(", "async function runJarvisSemanticPlanner(", "", "simple-public-planner");
}

const plannerImpl = `async function runJarvisSemanticPlanner({\n    ai = null,\n    input = "",\n    catalog = [],\n    timeoutMs = 45000,\n    missionState = null\n} = {}) {\n    const instruction = String(input || "").trim();\n    const safeCatalog = normalizeCatalog(catalog);\n    if (instruction.length < 1 || instruction.length > 120000) throw new Error("SEMANTIC_PLAN_INPUT_OUT_OF_RANGE");\n    if (safeCatalog.length === 0) throw new Error("SEMANTIC_PLAN_CATALOG_REQUIRED");\n    if (!ai?.models?.generateContent) throw new Error("SEMANTIC_AUTHENTICATED_PROVIDER_REQUIRED");\n    let timer = null;\n    const timeout = new Promise((_, reject) => {\n        timer = setTimeout(() => reject(new Error("SEMANTIC_PROVIDER_TIMEOUT")), Math.max(5000, Number(timeoutMs) || 45000));\n    });\n    try {\n        return await Promise.race([\n            runGeminiSemanticPlanner({ ai, input: instruction, catalog: safeCatalog, missionState }),\n            timeout\n        ]);\n    } catch(error) {\n        const message = String(error?.message || error || "FAILED");\n        if (message.startsWith("SEMANTIC_AUTHENTICATED_PROVIDER_")) throw error;\n        throw new Error(\`SEMANTIC_AUTHENTICATED_PROVIDER_\${message}\`);\n    } finally {\n        if (timer) clearTimeout(timer);\n    }\n}\n\n`;
semantic = replaceSection(
  semantic,
  "async function runJarvisSemanticPlanner(",
  "async function runJarvisSemanticResponse(",
  plannerImpl,
  "authenticated-planner"
);

const responseImpl = `async function runJarvisSemanticResponse({\n    ai = null,\n    input = "",\n    timeoutMs = null,\n    maxOutputTokens = 3500\n} = {}) {\n    const instruction = String(input || "").trim();\n    const budget = Math.max(500, Math.min(8000, Number(maxOutputTokens) || 3500));\n    if (instruction.length < 1 || instruction.length > 120000) throw new Error("SEMANTIC_RESPONSE_INPUT_OUT_OF_RANGE");\n    if (!ai?.models?.generateContent) throw new Error("SEMANTIC_AUTHENTICATED_PROVIDER_REQUIRED");\n    const deadline = Number(timeoutMs) > 0 ? Math.max(5000, Number(timeoutMs)) : budget >= 6000 ? 120000 : 45000;\n    let timer = null;\n    const timeout = new Promise((_, reject) => {\n        timer = setTimeout(() => reject(new Error("SEMANTIC_RESPONSE_TIMEOUT")), deadline);\n    });\n    try {\n        const response = await Promise.race([\n            ai.models.generateContent({\n                model: DEFAULT_GEMINI_MODEL,\n                contents: instruction,\n                config: {\n                    maxOutputTokens: budget,\n                    thinkingConfig: { thinkingBudget: 0 },\n                    systemInstruction: [\n                        "Eres Jarvis, asistente multifuncional privado de Heberto Mendoza.",\n                        "Responde en espanol natural, completo, directo y verificable.",\n                        "Usa solamente la evidencia incluida en la solicitud.",\n                        "No inventes ejecuciones, archivos, accesos, fuentes ni resultados.",\n                        "Distingue claramente lo ejecutado, lo planeado y lo bloqueado."\n                    ].join("\\n")\n                }\n            }),\n            timeout\n        ]);\n        const message = String(response?.text || "").trim();\n        if (!message) throw new Error("SEMANTIC_RESPONSE_EMPTY");\n        return {\n            ok: true,\n            status: "SEMANTIC_RESPONSE_READY",\n            version: VERSION,\n            provider: String(ai.lastProvider || "gemini"),\n            model: DEFAULT_GEMINI_MODEL,\n            message\n        };\n    } catch(error) {\n        const message = String(error?.message || error || "FAILED");\n        if (message.startsWith("SEMANTIC_AUTHENTICATED_PROVIDER_")) throw error;\n        throw new Error(\`SEMANTIC_AUTHENTICATED_PROVIDER_\${message}\`);\n    } finally {\n        if (timer) clearTimeout(timer);\n    }\n}\n\n`;
semantic = replaceSection(
  semantic,
  "async function runJarvisSemanticResponse(",
  "module.exports = {",
  responseImpl,
  "authenticated-response"
)
  .replace("    DEFAULT_ENDPOINT,\n", "")
  .replace("    requestModel,\n", "")
  .replace("    runSimpleSemanticPlanner,\n", "");
for (const forbidden of ["text.pollinations.ai", "openai-fast", "pollinations-simple-json", "DEFAULT_ENDPOINT", "runSimpleSemanticPlanner", "requestModel"]) {
  if (semantic.includes(forbidden)) throw new Error(`V142_THIRD_PROVIDER_REMAINS:${forbidden}`);
}
need(semantic, 'const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";', "gemini-3.6");
write(P.semantic, semantic);

// Existing two-provider chain: Gemini 3 request hygiene + failover on a semantically empty plan.
let chain = read(P.chain);
if (!chain.includes('String(guardedRequest?.model || "").startsWith("gemini-3.")')) {
  const oldSanitizer = `function sanitizeGenerateContentRequest(request) {\n    const guardedRequest =\n        applyFreshnessGuardToGroundedRequest(request);\n    const tools = guardedRequest?.config?.tools;\n    if (!Array.isArray(tools)) return guardedRequest;\n\n    let changed = false;\n    const compactTools = tools.map(tool => {\n        const declarations = tool?.functionDeclarations;\n        if (!Array.isArray(declarations)) return tool;\n        changed = true;\n        return {\n            ...tool,\n            functionDeclarations: declarations.map(compactFunctionDeclaration)\n        };\n    });\n\n    if (!changed) return guardedRequest;\n\n    return {\n        ...guardedRequest,\n        config: {\n            ...guardedRequest.config,\n            tools: compactTools\n        }\n    };\n}`;
  const newSanitizer = `function sanitizeGenerateContentRequest(request) {\n    const guardedRequest = applyFreshnessGuardToGroundedRequest(request);\n    const sourceConfig = guardedRequest?.config && typeof guardedRequest.config === "object" ? guardedRequest.config : null;\n    let sanitizedConfig = sourceConfig;\n    if (sourceConfig && String(guardedRequest?.model || "").startsWith("gemini-3.")) {\n        const { temperature: _temperature, topP: _topP, topK: _topK, frequencyPenalty: _frequencyPenalty, presencePenalty: _presencePenalty, ...supported } = sourceConfig;\n        sanitizedConfig = supported;\n    }\n    const tools = sanitizedConfig?.tools;\n    if (!Array.isArray(tools)) return sanitizedConfig === sourceConfig ? guardedRequest : { ...guardedRequest, config: sanitizedConfig };\n    let changed = sanitizedConfig !== sourceConfig;\n    const compactTools = tools.map(tool => {\n        const declarations = tool?.functionDeclarations;\n        if (!Array.isArray(declarations)) return tool;\n        changed = true;\n        return { ...tool, functionDeclarations: declarations.map(compactFunctionDeclaration) };\n    });\n    if (!changed) return guardedRequest;\n    return { ...guardedRequest, config: { ...(sanitizedConfig || {}), tools: compactTools } };\n}`;
  need(chain, oldSanitizer, "request-sanitizer");
  chain = chain.replace(oldSanitizer, newSanitizer);
}
if (!chain.includes("function responseHasExecutableSemanticPlan(")) {
  const marker = "function createJarvisGenAIProviderChain({ providers = [] } = {}) {";
  const at = chain.indexOf(marker);
  if (at < 0) throw new Error("V142_PROVIDER_CHAIN_MISSING");
  const validator = `function requestRequiresExecutableSemanticPlan(request = {}) {\n    if (requestUsesFunctionDeclarations(request)) return true;\n    const text = collectRequestText(request?.contents);\n    return /CONTRATO_DE_MISION|MISSION_CONTRACT|GROUNDED_ARGUMENT_COMPLETION|COMPLETION_AUDIT|AUDITORIA_FINAL_OBLIGATORIA|AUDITORIA_DE_CIERRE_CONTROLADA/.test(text);\n}\n\nfunction responseHasExecutableSemanticPlan(response = {}, request = {}) {\n    if (!requestRequiresExecutableSemanticPlan(request)) return true;\n    if (Array.isArray(response?.functionCalls) && response.functionCalls.length > 0) return true;\n    const parts = Array.isArray(response?.candidates?.[0]?.content?.parts) ? response.candidates[0].content.parts : [];\n    if (parts.some(part => part?.functionCall?.name)) return true;\n    const text = String(response?.text || "").trim();\n    if (!text) return false;\n    try {\n        const payload = JSON.parse(text);\n        return (Array.isArray(payload?.toolCalls) && payload.toolCalls.length > 0) || payload?.missionComplete === true;\n    } catch {\n        return false;\n    }\n}\n\n`;
  chain = chain.slice(0, at) + validator + chain.slice(at);
}
if (!chain.includes("responseHasExecutableSemanticPlan(response, providerRequest)")) {
  const old = `                            if (!response) {\n                                throw new Error("EMPTY_PROVIDER_RESPONSE");\n                            }`;
  need(chain, old, "provider-response-guard");
  chain = chain.replace(old, `${old}\n                            if (!responseHasExecutableSemanticPlan(response, providerRequest)) {\n                                throw new Error("SEMANTIC_PLAN_EMPTY");\n                            }`);
}
if (!chain.includes("responseHasExecutableSemanticPlan(fallbackResponse, jsonFallbackRequest)")) {
  const old = `                                    if (!fallbackResponse) {\n                                        throw new Error("EMPTY_SCHEMA_JSON_FALLBACK_RESPONSE");\n                                    }`;
  need(chain, old, "schema-response-guard");
  chain = chain.replace(old, `${old}\n                                    if (!responseHasExecutableSemanticPlan(fallbackResponse, jsonFallbackRequest)) {\n                                        throw new Error("SEMANTIC_PLAN_EMPTY");\n                                    }`);
}
if (!chain.includes("    responseHasExecutableSemanticPlan,")) {
  chain = chain.replace("    resolveGroundingRedirectUrl,\n", "    resolveGroundingRedirectUrl,\n    responseHasExecutableSemanticPlan,\n");
}
write(P.chain, chain);

// Existing semantic tests: remove public-provider assumptions, keep the same coverage through authenticated mocks.
let semanticTest = read(P.semanticTest)
  .replace("    requestModel,\n", "")
  .replace("    runSimpleSemanticPlanner,\n", "")
  .split('"gemini-2.5-flash"').join('"gemini-3.6-flash"');
const catalogStart = semanticTest.indexOf("\nconst catalog = [");
const catalogEnd = catalogStart >= 0 ? semanticTest.indexOf("\n];", catalogStart) : -1;
if (catalogStart < 0 || catalogEnd < 0) throw new Error("V142_SHARED_CATALOG_MISSING");
const sharedCatalog = semanticTest.slice(catalogStart + 1, catalogEnd + 3);
semanticTest = semanticTest.slice(0, catalogStart) + "\n" + semanticTest.slice(catalogEnd + 3);
const parsed = testBlocks(semanticTest);
const kept = [];
for (const block of parsed.blocks) {
  if (block.startsWith('test("semantic response falls back when the authenticated providers are unavailable"')) {
    kept.push(`test("semantic response fails closed when both authenticated providers are unavailable", async () => {\n    await assert.rejects(\n        () => runJarvisSemanticResponse({ input: "Integra evidencia.", ai: { models: { generateContent: async () => { throw new Error("PROVIDERS_UNAVAILABLE"); } } } }),\n        /SEMANTIC_AUTHENTICATED_PROVIDER_PROVIDERS_UNAVAILABLE/\n    );\n});\n\n`);
    continue;
  }
  if (block.startsWith('test("semantic planner preserves mixed tools and never grants prompt approval"')) {
    kept.push(`test("semantic planner preserves mixed tools and never grants prompt approval", async () => {\n    const result = await runJarvisSemanticPlanner({\n        input: "analisa el repo y revisa conectores sin modificar nada",\n        catalog,\n        ai: { lastProvider: "gemini-developer", models: { generateContent: async request => {\n            assert.equal(request.model, "gemini-3.6-flash");\n            return { functionCalls: [\n                { name: "jarvis_tool_0", args: { query: "repo" } },\n                { name: "jarvis_tool_1", args: {} },\n                { name: "jarvis_tool_2", args: {} }\n            ] };\n        } } }\n    });\n    assert.deepEqual(result.toolCalls.map(call => call.name), ["repo.search", "connector.list", "system.supervision.runNow"]);\n    assert.equal(result.toolCalls[2].mutates, true);\n    assert.equal(result.toolCalls[2].approved, false);\n});\n\n`);
    continue;
  }
  if (block.startsWith('test("semantic planner accepts long and ten-page missions without losing mission state"')) {
    kept.push(`test("semantic planner accepts long and ten-page missions without losing mission state", async () => {\n    const longInstruction = Array.from({ length: 500 }, (_, index) => \`Pagina y requisito \${index}: conservar evidencia.\`).join("\\n");\n    assert.ok(longInstruction.length > 1600);\n    let providerRequest = null;\n    const result = await runJarvisSemanticPlanner({\n        input: longInstruction,\n        catalog,\n        missionState: {\n            missionId: "MISSION-LONG-1",\n            completedTasks: [{ name: "repo.search", args: { query: "evidencia" } }],\n            pendingTasks: [],\n            blockedTasks: [],\n            writeAllowed: false\n        },\n        ai: {\n            lastProvider: "gemini-developer",\n            models: {\n                generateContent: async request => {\n                    providerRequest = request;\n                    return { functionCalls: [{ name: "jarvis_tool_1", args: {} }] };\n                }\n            }\n        }\n    });\n    assert.equal(result.toolCalls[0].name, "connector.list");\n    assert.equal(providerRequest.model, "gemini-3.6-flash");\n    assert.ok(String(providerRequest.contents).includes(longInstruction));\n    assert.ok(String(providerRequest.contents).includes("MISSION-LONG-1"));\n    assert.ok(String(providerRequest.contents).includes("No repitas una herramienta completada"));\n});\n\n`);
    continue;
  }
  const legacyPublic =
    block.includes("runSimpleSemanticPlanner(") ||
    block.includes("requestModel(") ||
    block.includes("text.pollinations.ai") ||
    block.includes('provider: "pollinations"') ||
    block.includes('"openai-fast"') ||
    block.startsWith('test("public semantic fallback consumes native provider tool calls"') ||
    block.startsWith('test("semantic planner retries one malformed model output"');
  if (!legacyPublic) kept.push(block);
}
semanticTest = parsed.prefix + "\n" + sharedCatalog + "\n\n" + kept.join("");
semanticTest = semanticTest.replace(
  'test("semantic planner uses authenticated Gemini before the public fallback"',
  'test("semantic planner uses the authenticated two-provider authority without a public fallback"'
);
for (const forbidden of ["pollinations", "runSimpleSemanticPlanner", "requestModel", "openai-fast"]) {
  if (semanticTest.includes(forbidden)) throw new Error(`V142_OBSOLETE_TEST_REMAINS:${forbidden}`);
}
write(P.semanticTest, semanticTest);

// Existing provider-chain tests: prove empty primary output falls through to Vertex and Gemini 3 params are sanitized.
let chainTest = read(P.chainTest).split('"gemini-2.5-flash"').join('"gemini-3.6-flash"');
const chainParsed = testBlocks(chainTest);
const chainKept = [];
for (const block of chainParsed.blocks) {
  if (block.startsWith('test("provider chain continues from an invalid developer key to Vertex AI"')) {
    chainKept.push(`test("provider chain continues from an empty developer plan to Vertex AI", async () => {\n    const calls = [];\n    const chain = createJarvisGenAIProviderChain({ providers: [\n        { name: "gemini-developer", ai: { models: { generateContent: async () => { calls.push("developer"); return { text: JSON.stringify({ toolCalls: [], missionComplete: false }) }; } } } },\n        { name: "vertex-adc", ai: { models: { generateContent: async () => { calls.push("vertex"); return { functionCalls: [{ name: "jarvis_tool_0", args: { query: "ok" } }] }; } } } }\n    ] });\n    const result = await chain.models.generateContent({\n        model: "gemini-3.6-flash",\n        contents: "INSTRUCCION_ORIGINAL_INMUTABLE=plan",\n        config: { tools: [{ functionDeclarations: [{ name: "jarvis_tool_0", parametersJsonSchema: { type: "object" } }] }], toolConfig: { functionCallingConfig: { mode: "ANY" } } }\n    });\n    assert.deepEqual(calls, ["developer", "vertex"]);\n    assert.equal(result.functionCalls[0].name, "jarvis_tool_0");\n    assert.equal(chain.lastProvider, "vertex-adc");\n});\n\n`);
    continue;
  }
  chainKept.push(block);
}
chainTest = chainParsed.prefix + chainKept.join("");
if (!chainTest.includes('model: "gemini-3.6-flash"')) {
  chainTest = chainTest.replace(
    "    const functionRequest = {\n        config: {",
    "    const functionRequest = {\n        model: \"gemini-3.6-flash\",\n        config: {\n            temperature: 0,\n            topP: 0.9,"
  );
  chainTest = chainTest.replace(
    "    const declaration = sanitized.config.tools[0].functionDeclarations[0];\n\n    assert.notEqual(sanitized, functionRequest);",
    "    const declaration = sanitized.config.tools[0].functionDeclarations[0];\n\n    assert.notEqual(sanitized, functionRequest);\n    assert.equal(sanitized.config.temperature, undefined);\n    assert.equal(sanitized.config.topP, undefined);"
  );
}
write(P.chainTest, chainTest);

console.log(JSON.stringify({
  ok: true,
  status: "V142_TWO_PROVIDER_SEMANTIC_CONSOLIDATION_APPLIED",
  primaryProvider: "gemini-developer",
  secondaryProvider: "vertex-adc",
  model: "gemini-3.6-flash",
  publicFallbackRemoved: true,
  semanticEmptyTriggersFailover: true,
  longMissionCoveragePreserved: true,
  newFiles: false,
  newBrains: false
}));
