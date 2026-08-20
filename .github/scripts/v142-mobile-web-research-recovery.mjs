import fs from "node:fs";

const paths = {
  clientPlanner: "gestia-core/jarvis/jarvis.multifunction.planner.js",
  core: "gestia-core/gestia-core.js",
  multitool: "gestia-core/jarvis/jarvis.multitool.pack.js",
  marketing: "gestia-core/jarvis/jarvis.marketing.engine.js",
  semanticPlanner: "functions/jarvis-semantic-planner.js",
  webResearch: "functions/jarvis-web-research.js",
  functionsIndex: "functions/index.js",
  multifunctionTest: "tests/jarvis-multifunction-tools.test.mjs",
  semanticTest: "tests/jarvis-semantic-planner.test.cjs",
  webTest: "tests/jarvis-web-research.test.cjs",
  v142Test: "tests/jarvis-mobile-web-research-recovery-v142.test.mjs"
};

function read(file) { return fs.readFileSync(file, "utf8"); }
function write(file, value) { fs.writeFileSync(file, value, "utf8"); }
function assertHas(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`V142_PATCH_MARKER_MISSING:${label}`);
}
function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`V142_PATCH_MARKER_MISSING:${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}

let clientPlanner = read(paths.clientPlanner);
clientPlanner = replaceOnce(
  clientPlanner,
  'const CLOUD_MISSION_CONTRACT_TIMEOUT_MS =\n    12000;',
  'const CLOUD_MISSION_CONTRACT_TIMEOUT_MS =\n    45000;',
  'client-cloud-timeout'
);
clientPlanner = clientPlanner.replace(
  /const BROWSER_MISSION_ATTEMPT_TIMEOUT_MS =\n\s*6000;\n\nconst BROWSER_PLAN_ATTEMPT_TIMEOUT_MS =\n\s*5000;\n\n/,
  ""
);
if (clientPlanner.includes("async function fetchBrowserPlanText(")) {
  const start = clientPlanner.indexOf("async function fetchBrowserPlanText(");
  const end = clientPlanner.indexOf("function runtimeCatalog(", start);
  if (end < 0) throw new Error("V142_PATCH_MARKER_MISSING:client-browser-planner-section");
  clientPlanner = clientPlanner.slice(0, start) + clientPlanner.slice(end);
}
const timeoutOld = `    const timeoutMs =\n        missionState?.phase ===\n            "MISSION_CONTRACT"\n            ? CLOUD_MISSION_CONTRACT_TIMEOUT_MS\n            : 12000;`;
const timeoutNew = `    const timeoutMs =\n        [\n            "MISSION_CONTRACT",\n            "COMPLETION_AUDIT",\n            "GROUNDED_ARGUMENT_COMPLETION"\n        ].includes(String(missionState?.phase || ""))\n            ? CLOUD_MISSION_CONTRACT_TIMEOUT_MS\n            : 30000;`;
clientPlanner = replaceOnce(clientPlanner, timeoutOld, timeoutNew, "client-phase-timeout");
if (clientPlanner.includes('        const contractPlanner = context?.missionState?.phase === "MISSION_CONTRACT"')) {
  const start = clientPlanner.indexOf('        const contractPlanner = context?.missionState?.phase === "MISSION_CONTRACT"');
  const end = clientPlanner.indexOf("        const plan = await resolveSemanticPlan(", start);
  if (end < 0) throw new Error("V142_PATCH_MARKER_MISSING:client-contract-planner-end");
  clientPlanner = clientPlanner.slice(0, start) +
    "        const contractPlanner = context.semanticPlanner;\n" +
    clientPlanner.slice(end);
}
assertHas(clientPlanner, "        const contractPlanner = context.semanticPlanner;", "client-cloud-only-contract");
const catchBrowserStart = `    } catch (error) {\n        if (\n            context?.missionState?.phase !== "MISSION_CONTRACT"`;
if (clientPlanner.includes(catchBrowserStart)) {
  const start = clientPlanner.indexOf(catchBrowserStart);
  const health = clientPlanner.indexOf("        globalThis.__JARVIS_SEMANTIC_PLANNER_HEALTH__ = {", start);
  if (health < 0) throw new Error("V142_PATCH_MARKER_MISSING:client-browser-catch-end");
  clientPlanner = clientPlanner.slice(0, start) + "    } catch (error) {\n" + clientPlanner.slice(health);
}
const completionFn = clientPlanner.indexOf("export async function completeJarvisPlanningArguments({");
if (completionFn < 0) throw new Error("V142_PATCH_MARKER_MISSING:client-completion-function");
const completionPlanStart = clientPlanner.indexOf("    let plan;\n    try {\n        plan = await resolveSemanticPlan(", completionFn);
if (completionPlanStart >= 0) {
  const completionPlanEnd = clientPlanner.indexOf("\n\n    const call = trustedPlanCalls", completionPlanStart);
  if (completionPlanEnd < 0) throw new Error("V142_PATCH_MARKER_MISSING:client-completion-plan-end");
  const directPlan = `    const plan = await resolveSemanticPlan(\n        briefingInstruction,\n        catalog,\n        semanticPlanner,\n        {\n            phase: "GROUNDED_ARGUMENT_COMPLETION",\n            toolName: name,\n            sourceCount: sources.length,\n            writeAllowed: false\n        }\n    );`;
  clientPlanner = clientPlanner.slice(0, completionPlanStart) + directPlan + clientPlanner.slice(completionPlanEnd);
}
clientPlanner = clientPlanner
  .replace(/\n\s*callBrowserMissionContract,/, "")
  .replace(/\n\s*callBrowserSemanticPlan,/, "");
if (clientPlanner.includes("text.pollinations.ai") || clientPlanner.includes("callBrowserMissionContract") || clientPlanner.includes("callBrowserSemanticPlan")) {
  throw new Error("V142_CLIENT_SECOND_PLANNER_STILL_ACTIVE");
}
write(paths.clientPlanner, clientPlanner);

let core = read(paths.core);
const auditMarker = 'phase:\n                                                "COMPLETION_AUDIT"';
const auditStart = core.indexOf(auditMarker);
if (auditStart < 0) throw new Error("V142_PATCH_MARKER_MISSING:completion-audit-state");
const auditEnd = core.indexOf("                                        }\n                                    }\n                                );", auditStart);
if (auditEnd < 0) throw new Error("V142_PATCH_MARKER_MISSING:completion-audit-state-end");
let auditSlice = core.slice(auditStart, auditEnd);
auditSlice = auditSlice.replace(
  /,?\n\s*advisorySemanticContext:\s*compactJarvisSemanticMemoryForPlanner\(semanticMemoryContext\)/,
  ""
);
core = core.slice(0, auditStart) + auditSlice + core.slice(auditEnd);
write(paths.core, core);

let semantic = read(paths.semanticPlanner);
const genericRequestMarker = `    const request = {\n        model,\n        contents: [`;
if (!semantic.includes('planKind: phase')) {
  const genericPos = semantic.indexOf(genericRequestMarker, semantic.indexOf("async function runGeminiSemanticPlanner"));
  if (genericPos < 0) throw new Error("V142_PATCH_MARKER_MISSING:semantic-generic-request");
  const phaseBlock = `    const phase =\n        String(missionState?.phase || "");\n\n    if (\n        phase === "COMPLETION_AUDIT" ||\n        phase === "GROUNDED_ARGUMENT_COMPLETION"\n    ) {\n        const phaseCatalog =\n            phase === "GROUNDED_ARGUMENT_COMPLETION"\n                ? safeCatalog.slice(0, 1)\n                : safeCatalog;\n        if (\n            phase === "GROUNDED_ARGUMENT_COMPLETION" &&\n            phaseCatalog.length !== 1\n        ) {\n            throw new Error("SEMANTIC_GROUNDED_TOOL_REQUIRED");\n        }\n\n        let lastPhaseError = null;\n        for (let attempt = 1; attempt <= 2; attempt += 1) {\n            try {\n                const phaseResponse =\n                    await ai.models.generateContent({\n                        model,\n                        contents: [\n                            buildSemanticSystemInstruction(phaseCatalog, missionState),\n                            \`INSTRUCCION_ORIGINAL_INMUTABLE=\${instruction}\`,\n                            phase === "GROUNDED_ARGUMENT_COMPLETION"\n                                ? "COMPLETA solamente los argumentos de la herramienta ya seleccionada. Devuelve JSON con esa toolCall y missionComplete=false. No selecciones otra herramienta."\n                                : "AUDITORIA_FINAL: compara la instruccion original con completedTasks y blockedTasks. Si falta un entregable devuelve exactamente una toolCall ejecutable. Solo si todo esta satisfecho devuelve toolCalls=[] y missionComplete=true.",\n                            attempt > 1\n                                ? "REINTENTO: la salida anterior no fue ejecutable. Conserva el mismo objetivo y devuelve JSON valido."\n                                : ""\n                        ].filter(Boolean).join("\\n\\n"),\n                        config: {\n                            temperature: 0,\n                            maxOutputTokens: 3000,\n                            thinkingConfig: {\n                                thinkingBudget: 0\n                            },\n                            responseMimeType: "application/json"\n                        }\n                    });\n                const payload =\n                    extractJsonObject(\n                        String(phaseResponse?.text || "")\n                    );\n                const validated =\n                    validatePlan(\n                        {\n                            ...(payload || {}),\n                            ...(phase === "GROUNDED_ARGUMENT_COMPLETION"\n                                ? { missionComplete: false }\n                                : {})\n                        },\n                        phaseCatalog,\n                        instruction\n                    );\n\n                if (phase === "GROUNDED_ARGUMENT_COMPLETION") {\n                    const selected =\n                        validated.toolCalls.find(call =>\n                            call.name === phaseCatalog[0].name\n                        );\n                    if (\n                        !selected ||\n                        !hasRequiredToolArguments(\n                            phaseCatalog[0],\n                            selected.args || {}\n                        )\n                    ) {\n                        throw new Error("SEMANTIC_GROUNDED_ARGUMENTS_REQUIRED");\n                    }\n                }\n\n                return requireExecutablePlan({\n                    ...validated,\n                    provider: String(ai.lastProvider || "gemini"),\n                    model,\n                    catalogSize: phaseCatalog.length,\n                    planKind: phase\n                });\n            }\n            catch(error) {\n                lastPhaseError = error;\n            }\n        }\n\n        throw lastPhaseError ||\n            new Error(\n                phase === "GROUNDED_ARGUMENT_COMPLETION"\n                    ? "SEMANTIC_GROUNDED_ARGUMENTS_REQUIRED"\n                    : "SEMANTIC_COMPLETION_AUDIT_REQUIRED"\n            );\n    }\n\n`;
  semantic = semantic.slice(0, genericPos) + phaseBlock + semantic.slice(genericPos);
}
const aiFallbackStart = `        if (ai?.models?.generateContent) {\n            try {\n                return await runGeminiSemanticPlanner({`;
const aiStart = semantic.indexOf(aiFallbackStart, semantic.indexOf("async function runJarvisSemanticPlanner"));
if (aiStart >= 0) {
  const simpleStart = semantic.indexOf("\n\n        if (typeof simpleFetchImpl === \"function\") {", aiStart);
  if (simpleStart < 0) throw new Error("V142_PATCH_MARKER_MISSING:semantic-ai-fallback-end");
  const authenticatedOnly = `        if (ai?.models?.generateContent) {\n            try {\n                return await runGeminiSemanticPlanner({\n                    ai,\n                    input: instruction,\n                    catalog: safeCatalog,\n                    missionState\n                });\n            }\n            catch(geminiError) {\n                throw new Error(\n                    \`SEMANTIC_AUTHENTICATED_PROVIDER_\${geminiError?.message || "FAILED"}\`\n                );\n            }\n        }`;
  semantic = semantic.slice(0, aiStart) + authenticatedOnly + semantic.slice(simpleStart);
}
assertHas(semantic, "SEMANTIC_AUTHENTICATED_PROVIDER_", "semantic-authenticated-failclosed");
assertHas(semantic, 'phase === "COMPLETION_AUDIT"', "semantic-json-audit");
assertHas(semantic, 'phase === "GROUNDED_ARGUMENT_COMPLETION"', "semantic-json-arguments");
write(paths.semanticPlanner, semantic);

let index = read(paths.functionsIndex);
index = replaceOnce(
  index,
  "                simpleFetchImpl: fetch,",
  "                simpleFetchImpl: null,",
  "index-disable-simple-planner"
);
const fallbackThrow = `                } catch (fallbackError) {\n                    throw new Error(\n                        [\n                            primaryMessage,\n                            fallbackError?.message ||\n                            String(fallbackError)\n                        ].join(" | ")\n                    );\n                }`;
const fallbackEnvelope = `                } catch (fallbackError) {\n                    result = {\n                        ok: false,\n                        grounded: false,\n                        status: "WEB_RESEARCH_NOT_GROUNDED",\n                        error: "WEB_RESEARCH_UNAVAILABLE",\n                        message: [\n                            primaryMessage,\n                            fallbackError?.message ||\n                            String(fallbackError)\n                        ].filter(Boolean).join(" | "),\n                        query,\n                        requestedDomain,\n                        objectiveId: data?.objectiveId || "",\n                        caseId: data?.caseId || "",\n                        researchedAt: new Date().toISOString(),\n                        provider: "fail_closed",\n                        answer: "",\n                        sources: [],\n                        discardedSources: [],\n                        supports: [],\n                        facts: [],\n                        inferences: [],\n                        searchQueries: [],\n                        sourceCount: 0,\n                        readOnly: true,\n                        policy: {\n                            citationsRequired: true,\n                            consultedSourcesOnly: true,\n                            requestedDomainEnforced: Boolean(requestedDomain),\n                            factsSeparatedFromInference: true,\n                            codeWrite: false,\n                            externalSideEffects: false\n                        }\n                    };\n                }`;
index = replaceOnce(index, fallbackThrow, fallbackEnvelope, "index-web-failclosed-envelope");
index = index.replace(
  "                searchQueryCount:\n                    result.searchQueries.length,\n                factCount: result.facts.length,",
  "                searchQueryCount:\n                    Array.isArray(result.searchQueries) ? result.searchQueries.length : 0,\n                factCount:\n                    Array.isArray(result.facts) ? result.facts.length : 0,"
);
const postCheck = `            if (\n                !result.grounded &&\n                result?.status !==\n                    "ENTITY_NOT_VERIFIED"\n            ) {\n                throw new functions.https.HttpsError(\n                    "failed-precondition",\n                    "La investigacion no devolvio fuentes verificables."\n                );\n            }\n\n            return result;`;
const postCheckNew = `            if (\n                !result.grounded &&\n                result?.status !==\n                    "ENTITY_NOT_VERIFIED"\n            ) {\n                return {\n                    ...result,\n                    ok: false,\n                    grounded: false,\n                    status:\n                        result?.status ||\n                        "WEB_RESEARCH_NOT_GROUNDED",\n                    transportOk: true\n                };\n            }\n\n            return result;`;
index = replaceOnce(index, postCheck, postCheckNew, "index-web-transport-failclosed");
write(paths.functionsIndex, index);

let web = read(paths.webResearch);
const domainStart = web.indexOf("function requestedDomainFromQuery(");
const domainEnd = web.indexOf("function requestedHostsFromQuery(", domainStart);
if (domainStart < 0 || domainEnd < 0) throw new Error("V142_PATCH_MARKER_MISSING:web-domain-functions");
const domainBlock = `function requestedDomainFromQuery(query = "", explicitDomain = "") {\n    const leading = new Set(["(", "[", "{", "<", "\\\"", "'"]);\n    const trailing = new Set([".", ",", ";", ":", ")", "]", "}", ">", "!", "?", "\\\"", "'"]);\n    const parseCandidate = value => {\n        let token = String(value || "").trim();\n        while (token && leading.has(token[0])) token = token.slice(1);\n        while (token && trailing.has(token.at(-1))) token = token.slice(0, -1);\n        if (!token || token.includes("@")) return "";\n        try {\n            const parsed = new URL(token.includes("://") ? token : \`https://\${token}\`);\n            if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";\n            const host = String(parsed.hostname || "").trim().toLowerCase();\n            if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}$/i.test(host)) return "";\n            return cleanHost(host);\n        }\n        catch {\n            return "";\n        }\n    };\n\n    if (explicitDomain) return parseCandidate(explicitDomain);\n\n    for (const rawToken of String(query || "").split(/\\s+/)) {\n        const domain = parseCandidate(rawToken);\n        if (domain) return domain;\n    }\n    return "";\n}\n\n`;
web = web.slice(0, domainStart) + domainBlock + web.slice(domainEnd);
const noPagesOld = '    if (pages.length === 0) throw new Error("DIRECT_RESEARCH_NO_PRIMARY_PAGES");';
const noPagesNew = `    if (pages.length === 0) {\n        return {\n            ok: false,\n            grounded: false,\n            engine: "jarvis_direct_primary_domain_research",\n            model: null,\n            query: normalizedQuery,\n            requestedDomain: domain,\n            objectiveId: String(objectiveId || ""),\n            caseId: String(caseId || ""),\n            researchedAt: new Date().toISOString(),\n            provider: "direct_primary_domain_crawl",\n            answer: "",\n            sources: [],\n            discardedSources: [],\n            supports: [],\n            facts: [],\n            inferences: [],\n            searchQueries: [],\n            sourceCount: 0,\n            readOnly: true,\n            status: directFreshnessWindowDays\n                ? "FRESHNESS_NOT_VERIFIED"\n                : "DIRECT_RESEARCH_NO_PRIMARY_PAGES",\n            error: directFreshnessWindowDays\n                ? "FRESCURA_NO_VERIFICADA"\n                : "DIRECT_RESEARCH_NO_PRIMARY_PAGES",\n            policy: {\n                citationsRequired: true,\n                consultedSourcesOnly: true,\n                requestedDomainEnforced: true,\n                factsSeparatedFromInference: true,\n                duplicatesRemoved: true,\n                freshnessVerified: directFreshnessWindowDays ? false : null,\n                codeWrite: false,\n                externalSideEffects: false,\n                fallbackReason:\n                    String(fallbackReason || "")\n                        .trim()\n                        .slice(0, 160) ||\n                    "PRIMARY_GROUNDED_RESEARCH_UNAVAILABLE"\n            }\n        };\n    }`;
web = replaceOnce(web, noPagesOld, noPagesNew, "web-no-pages-failclosed");
write(paths.webResearch, web);

let multitool = read(paths.multitool);
const scopeOld = `        const scopedAnchor = Boolean(seedUrl || trace.allowedDomain);\n        const needsCrossSourceRecovery =\n            scopedAnchor &&\n            (\n                !primaryResult ||\n                (seedUrl && exactAnchorVerified !== true)\n            );`;
const scopeNew = `        let seedDomain = "";\n        try {\n            seedDomain = new URL(seedUrl).hostname\n                .toLowerCase()\n                .replace(/^www\\./, "");\n        } catch {}\n        const allowedDomain = String(trace.allowedDomain || "")\n            .trim()\n            .toLowerCase()\n            .replace(/^https?:\\/\\//, "")\n            .replace(/^www\\./, "")\n            .split("/")[0];\n        const allowedDomainDerivedFromSeed =\n            Boolean(seedDomain) &&\n            Boolean(allowedDomain) &&\n            seedDomain === allowedDomain;\n        const hardDomainScope =\n            Boolean(allowedDomain) &&\n            !allowedDomainDerivedFromSeed;\n        const needsCrossSourceRecovery =\n            Boolean(seedUrl) &&\n            !hardDomainScope &&\n            (\n                !primaryResult ||\n                exactAnchorVerified !== true\n            );`;
multitool = replaceOnce(multitool, scopeOld, scopeNew, "client-hard-domain-scope");
write(paths.multitool, multitool);

let marketing = read(paths.marketing);
marketing = marketing.replace(
  '`NEXO preparó una campaña específica para ${brand.name}. `',
  '`ADJUNTO preparó una campaña específica para ${brand.name}. `'
);
write(paths.marketing, marketing);

let multifunctionTest = read(paths.multifunctionTest);
const browserTestsStart = multifunctionTest.indexOf('test("browser mission contract returns every model-selected high-level tool"');
const browserTestsEnd = multifunctionTest.indexOf('test("browser planner blocks tool calls with missing required arguments"', browserTestsStart);
if (browserTestsStart >= 0) {
  if (browserTestsEnd < 0) throw new Error("V142_PATCH_MARKER_MISSING:browser-tests-end");
  const singleAuthorityTest = `test("client planner keeps jarvisSemanticPlan as the single planning authority", () => {\n    const source = fs.readFileSync(\n        path.resolve("gestia-core/jarvis/jarvis.multifunction.planner.js"),\n        "utf8"\n    );\n\n    assert.match(source, /CLOUD_MISSION_CONTRACT_TIMEOUT_MS =\\s*45000/);\n    assert.doesNotMatch(source, /text\\.pollinations\\.ai/);\n    assert.doesNotMatch(source, /callBrowserMissionContract/);\n    assert.doesNotMatch(source, /callBrowserSemanticPlan/);\n    assert.match(source, /const contractPlanner = context\\.semanticPlanner/);\n});\n\n`;
  multifunctionTest = multifunctionTest.slice(0, browserTestsStart) + singleAuthorityTest + multifunctionTest.slice(browserTestsEnd);
}
write(paths.multifunctionTest, multifunctionTest);

let semanticTest = read(paths.semanticTest);
if (!semanticTest.includes('test("authenticated completion audit uses JSON without function declarations"')) {
  semanticTest += `\n\ntest("authenticated completion audit uses JSON without function declarations", async () => {\n    let request = null;\n    const catalog = [{\n        name: "marketing.plan",\n        description: "Completa marketing pendiente.",\n        mutates: false,\n        inputSchema: {\n            type: "object",\n            required: ["brandName"],\n            properties: { brandName: { type: "string" } }\n        }\n    }];\n    const result = await runGeminiSemanticPlanner({\n        input: "Completa la mision actual.",\n        catalog,\n        missionState: { phase: "COMPLETION_AUDIT", completedTasks: [] },\n        ai: {\n            lastProvider: "vertex-adc",\n            models: {\n                generateContent: async value => {\n                    request = value;\n                    return {\n                        text: JSON.stringify({\n                            toolCalls: [{ name: "marketing.plan", args: { brandName: "Taquería El Dorado" } }],\n                            missionComplete: false\n                        })\n                    };\n                }\n            }\n        }\n    });\n    assert.equal(request.config.responseMimeType, "application/json");\n    assert.equal(Object.prototype.hasOwnProperty.call(request.config, "tools"), false);\n    assert.equal(result.provider, "vertex-adc");\n    assert.equal(result.planKind, "COMPLETION_AUDIT");\n    assert.equal(result.toolCalls[0].name, "marketing.plan");\n});\n\ntest("authenticated grounded argument completion retries JSON and never needs the public planner", async () => {\n    let attempts = 0;\n    const reelTool = {\n        name: "reel.plan",\n        description: "Completa el reel seleccionado.",\n        mutates: false,\n        inputSchema: {\n            type: "object",\n            required: ["durationSeconds", "scenes"],\n            properties: {\n                durationSeconds: { type: "integer" },\n                scenes: {\n                    type: "array",\n                    minItems: 1,\n                    items: {\n                        type: "object",\n                        required: ["id", "durationSeconds"],\n                        properties: {\n                            id: { type: "string" },\n                            durationSeconds: { type: "integer" }\n                        }\n                    }\n                }\n            }\n        }\n    };\n    const result = await runGeminiSemanticPlanner({\n        input: "Prepara solo argumentos ejecutables para reel.plan.",\n        catalog: [reelTool],\n        missionState: { phase: "GROUNDED_ARGUMENT_COMPLETION", toolName: "reel.plan" },\n        ai: {\n            lastProvider: "vertex-adc",\n            models: {\n                generateContent: async request => {\n                    attempts += 1;\n                    assert.equal(request.config.responseMimeType, "application/json");\n                    assert.equal(Object.prototype.hasOwnProperty.call(request.config, "tools"), false);\n                    return {\n                        text: JSON.stringify(attempts === 1\n                            ? { toolCalls: [], missionComplete: false }\n                            : {\n                                toolCalls: [{\n                                    name: "reel.plan",\n                                    args: {\n                                        durationSeconds: 30,\n                                        scenes: [{ id: "scene-1", durationSeconds: 30 }]\n                                    }\n                                }],\n                                missionComplete: false\n                            })\n                    };\n                }\n            }\n        }\n    });\n    assert.equal(attempts, 2);\n    assert.equal(result.provider, "vertex-adc");\n    assert.equal(result.planKind, "GROUNDED_ARGUMENT_COMPLETION");\n    assert.equal(result.toolCalls[0].args.durationSeconds, 30);\n});\n`;
}
write(paths.semanticTest, semanticTest);

let webTest = read(paths.webTest);
const domainAssertion = '    assert.equal(requestedDomainFromQuery("Investiga https://www.summ.com.mx/ para una campana"), "summ.com.mx");';
if (webTest.includes(domainAssertion) && !webTest.includes('requestedDomainFromQuery("Investiga únicamente en openai.com las novedades actuales"')) {
  webTest = webTest.replace(
    domainAssertion,
    `${domainAssertion}\n    assert.equal(requestedDomainFromQuery("Investiga únicamente en openai.com las novedades actuales"), "openai.com");`
  );
}
if (!webTest.includes('test("direct domain freshness miss returns a fail-closed envelope instead of throwing"')) {
  webTest += `\n\ntest("direct domain freshness miss returns a fail-closed envelope instead of throwing", async () => {\n    const result = await runJarvisDirectDomainResearch({\n        query: "novedades actuales openai.com",\n        allowedDomain: "openai.com",\n        fetchImpl: async url => ({\n            ok: true,\n            url: String(url),\n            headers: { get: () => "text/html; charset=utf-8" },\n            text: async () => "<html><head><title>OpenAI</title></head><body><h1>API</h1><p>Pagina sin fecha verificable para este contrato de actualidad.</p></body></html>"\n        })\n    });\n    assert.equal(result.ok, false);\n    assert.equal(result.grounded, false);\n    assert.equal(result.status, "FRESHNESS_NOT_VERIFIED");\n    assert.equal(result.error, "FRESCURA_NO_VERIFICADA");\n    assert.deepEqual(result.facts, []);\n});\n`;
}
write(paths.webTest, webTest);

let v142Test = read(paths.v142Test);
if (!v142Test.includes('test("v142 hard domain scope never relaxes an unrelated allowedDomain"')) {
  v142Test += `\n\ntest("v142 hard domain scope never relaxes an unrelated allowedDomain", async () => {\n    const previousAuth = globalThis.auth;\n    const previousWindow = globalThis.window;\n    const previousFetch = globalThis.fetch;\n    const previousBridge = globalThis.JarvisLocalBridge;\n    const calls = [];\n    globalThis.auth = { currentUser: { getIdToken: async () => "firebase-user-token" } };\n    globalThis.window = globalThis.window || {};\n    globalThis.JarvisLocalBridge = undefined;\n    globalThis.fetch = async (_url, options = {}) => {\n        const body = JSON.parse(String(options.body || "{}"));\n        calls.push(body?.data || {});\n        return {\n            ok: false,\n            status: 200,\n            json: async () => ({ result: { ok: false, grounded: false, status: "WEB_RESEARCH_NOT_GROUNDED", message: "scope unavailable", sources: [] } })\n        };\n    };\n    try {\n        const result = await fetchGroundedWebResearch(\n            "Facebook oficial de la empresa",\n            {\n                allowedDomain: "multiserviciospeninsulareshmh.com",\n                seedUrl,\n                exactEntity: "Taquería El Dorado"\n            }\n        );\n        assert.equal(calls.length, 1);\n        assert.equal(calls[0].allowedDomain, "multiserviciospeninsulareshmh.com");\n        assert.equal(result.ok, false);\n        assert.equal(result.error, "WEB_RESEARCH_UNAVAILABLE");\n    } finally {\n        if (previousAuth === undefined) delete globalThis.auth; else globalThis.auth = previousAuth;\n        if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;\n        if (previousFetch === undefined) delete globalThis.fetch; else globalThis.fetch = previousFetch;\n        if (previousBridge === undefined) delete globalThis.JarvisLocalBridge; else globalThis.JarvisLocalBridge = previousBridge;\n    }\n});\n`;
}
write(paths.v142Test, v142Test);

const finalClient = read(paths.clientPlanner);
const finalSemantic = read(paths.semanticPlanner);
const finalIndex = read(paths.functionsIndex);
const finalMultitool = read(paths.multitool);
const finalMarketing = read(paths.marketing);
if (/text\.pollinations\.ai/.test(finalClient)) throw new Error("V142_CLIENT_PUBLIC_PLANNER_PRESENT");
if (!finalSemantic.includes("SEMANTIC_AUTHENTICATED_PROVIDER_")) throw new Error("V142_SERVER_PROVIDER_FAILCLOSED_MISSING");
if (!finalIndex.includes("simpleFetchImpl: null")) throw new Error("V142_INDEX_SIMPLE_PLANNER_STILL_ENABLED");
if (!finalMultitool.includes("hardDomainScope")) throw new Error("V142_HARD_DOMAIN_SCOPE_MISSING");
if (finalMarketing.includes("NEXO preparó una campaña específica")) throw new Error("V142_PUBLIC_NEXO_MARKETING_STRING_PRESENT");

console.log("V142_EXISTING_CONTRACT_CONSOLIDATION_APPLIED=true");
