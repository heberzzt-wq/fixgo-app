import fs from "node:fs";

const P = Object.freeze({
    client: "gestia-core/jarvis/jarvis.multifunction.planner.js",
    core: "gestia-core/gestia-core.js",
    multitool: "gestia-core/jarvis/jarvis.multitool.pack.js",
    fsBridge: "jarvis-fs-bridge.js",
    functionsIndex: "functions/index.js",
    intentLegacy: "functions/jarvis-intent-runtime-v7.cjs",
    repoPlannerLegacy: "functions/repo-semantic-tool-planner.js",
    nexoIdentity: "gestia-core/nexo/nexo.identity.js",
    terminalBootstrap: "modules/terminal/nexo-bootstrap.js"
});

const read = file => fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");

function need(source, value, label) {
    if (!source.includes(value)) {
        throw new Error(`V142_LOCAL_ONLY_MARKER_MISSING:${label}`);
    }
}

function forbid(source, value, label) {
    if (source.includes(value)) {
        throw new Error(`V142_ALTERNATE_BRAIN_FORBIDDEN:${label}`);
    }
}

const client = read(P.client);
const fsBridge = read(P.fsBridge);
const functionsIndex = read(P.functionsIndex);
const intentLegacy = read(P.intentLegacy);
const repoPlannerLegacy = read(P.repoPlannerLegacy);
const nexoIdentity = read(P.nexoIdentity);
const terminalBootstrap = read(P.terminalBootstrap);

need(client, 'const LOCAL_SEMANTIC_ROUTE = "/semantic/plan";', "local-semantic-route");
need(client, 'localOnly: true', "planner-local-only-health");
need(client, 'alternateBrains: 0', "planner-zero-alternate-brains");
need(client, 'LOCAL_SEMANTIC_BRIDGE_REQUIRED', "planner-fail-closed-without-bridge");
forbid(client, "cloudfunctions.net/jarvisSemanticPlan", "cloud-semantic-endpoint");
forbid(client, "getIdToken()", "cloud-semantic-auth-token");

need(fsBridge, '"LOCAL_ONLY"', "local-only-provider-mode");
need(fsBridge, 'env.JARVIS_LOCAL_LLM_MODEL || "qwen2.5-coder:7b"', "default-qwen-coder");
need(fsBridge, 'env.JARVIS_LOCAL_LLM_BASE_URL || "http://127.0.0.1:11434/v1"', "default-ollama-loopback");
need(fsBridge, 'provider: "ollama-openai-compatible-local"', "local-provider-identity");
need(fsBridge, "fallbackAllowed: false", "zero-cloud-fallback");
forbid(fsBridge, '"LOCAL_PREFERRED"', "local-preferred-mode");
forbid(fsBridge, '"CURRENT_STABLE"', "current-stable-cloud-mode");

need(functionsIndex, 'status: "LEGACY_AI_INTENT_RETIRED"', "legacy-ai-intent-retired");
need(functionsIndex, '"LOCAL_JARVIS_ONLY"', "cloud-semantic-callables-retired");

need(intentLegacy, "COMPATIBILITY_CANARY_ONLY", "legacy-intent-canary");
need(intentLegacy, "lexicalClassification: false", "legacy-intent-no-lexical-classification");
need(intentLegacy, 'semanticAuthority: "jarvisSemanticPlan"', "legacy-intent-defers-to-jarvis");

need(repoPlannerLegacy, "COMPATIBILITY_VALIDATOR_ONLY", "legacy-repo-planner-validator-only");
need(repoPlannerLegacy, "inferredToolCalls: false", "legacy-repo-planner-no-tool-inference");

need(nexoIdentity, "COMPATIBILITY_CANARY_ONLY", "nexo-identity-canary");
need(nexoIdentity, "active: false", "nexo-inactive");
need(nexoIdentity, "alternateBrain: false", "nexo-no-alternate-brain");
forbid(nexoIdentity, "__PENINSULA_PRIVATE_ENGINE__", "nexo-private-engine");

need(terminalBootstrap, "__JARVIS_TERMINAL_BOOTSTRAP__", "jarvis-terminal-bootstrap");
need(terminalBootstrap, 'identity: "JARVIS"', "jarvis-runtime-identity");
need(terminalBootstrap, 'semanticAuthority: "jarvisSemanticPlan"', "jarvis-single-semantic-authority");
need(terminalBootstrap, "alternateBrains: 0", "terminal-zero-alternate-brains");
forbid(terminalBootstrap, "__NEXO_TERMINAL_BOOTSTRAP__", "active-nexo-bootstrap");

need(read(P.core), 'call?.name === "speech.synthesize"', "speech-grounding");
need(read(P.core), 'call?.name === "reel.plan"', "reel-grounding");
need(read(P.multitool), 'status: "GROUNDED_LOCAL_FALLBACK"', "local-research");

console.log(JSON.stringify({
    ok: true,
    status: "V142_LOCAL_ONLY_SINGLE_JARVIS_AUTHORITY_CERTIFIED",
    semanticAuthority: "jarvisSemanticPlan",
    runtimeIdentity: "JARVIS",
    localProvider: "ollama-openai-compatible-local",
    defaultModel: "qwen2.5-coder:7b",
    localEndpoint: "http://127.0.0.1:11434/v1",
    cloudSemanticFallback: false,
    alternateBrains: 0,
    nexoAuthorityActive: false,
    lexicalIntentRuntimeActive: false,
    inferredLegacyRepoToolRouting: false,
    writesAppliedByCertificationScript: 0,
    newFiles: false,
    newBrains: false
}, null, 2));
