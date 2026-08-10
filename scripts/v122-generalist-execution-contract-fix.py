from pathlib import Path
import json
import re

ROOT = Path('.')
RELEASE = 'v94-generalist-execution-contract-v122-20260810'
BRANCH = 'v94-media-v4n-negative-claims'
BRIDGE_VERSION = '2.39.0-generalist-execution-contract-v122'


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_exact(path, old, new, expected=1):
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'V122_REPLACE_COUNT:{path}:{count}:{expected}:{old[:80]}')
    write(path, text.replace(old, new))


# 1) General tool dependency/stage contract. This is tool semantics, never lexical user routing.
dependencies = r'''const VERSION = "1.1.0-generalist-execution-contract-v122";

const MISSION_STAGE_BY_TOOL = Object.freeze({
    "web.research": 10,
    "web.media.collect": 15,
    "media.analyze": 18,
    "marketing.plan": 20,
    "page.plan": 20,
    "image.plan": 20,
    "page.compose": 30,
    "document.compose": 30,
    "spreadsheet.compose": 30,
    "reel.plan": 30,
    "page.create": 40,
    "reel.create": 40,
    "document.create": 40,
    "document.pdf": 40,
    "image.generate": 40,
    "marketing.package.real-media": 40
});

function object(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}

function directPageReady(args = {}) {
    const source = object(args);
    return Boolean(
        String(source.brandName || "").trim() &&
        String(source.title || "").trim() &&
        String(source.description || "").trim().length >= 20 &&
        Array.isArray(source.services) &&
        source.services.length > 0
    );
}

function stableSemanticStageSort(calls = []) {
    const staged = calls
        .map((call, index) => ({
            call,
            index,
            stage: MISSION_STAGE_BY_TOOL[String(call?.name || "")] ?? null
        }))
        .filter(item => item.stage !== null)
        .sort((a, b) => (a.stage - b.stage) || (a.index - b.index))
        .map(item => item.call);

    let stagedIndex = 0;
    return calls.map(call => {
        if (MISSION_STAGE_BY_TOOL[String(call?.name || "")] === undefined) {
            return call;
        }
        const next = staged[stagedIndex];
        stagedIndex += 1;
        return next;
    });
}

export function ensureExecutableArtifactDependencies({
    toolCalls = [],
    catalog = []
} = {}) {
    const calls = Array.isArray(toolCalls)
        ? toolCalls.filter(call => call && typeof call === "object").map(call => ({
            ...call,
            args: { ...object(call.args) }
        }))
        : [];
    const available = new Set(
        (Array.isArray(catalog) ? catalog : [])
            .map(tool => String(tool?.name || ""))
            .filter(Boolean)
    );
    const hasPageCreate = calls.some(call => call.name === "page.create");
    const hasPageCompose = calls.some(call => call.name === "page.compose");

    if (!hasPageCreate || hasPageCompose || !available.has("page.compose")) {
        return stableSemanticStageSort(calls);
    }

    const createIndex = calls.findIndex(call => call.name === "page.create");
    const createCall = calls[createIndex];
    if (directPageReady(createCall?.args)) {
        return stableSemanticStageSort(calls);
    }
    const pagePlan = [...calls]
        .slice(0, Math.max(0, createIndex))
        .reverse()
        .find(call => call?.name === "page.plan") || null;
    const seed = {
        ...object(pagePlan?.args),
        ...object(createCall?.args)
    };
    const composeCall = {
        name: "page.compose",
        args: {
            ...(String(seed.brandName || "").trim() ? { brandName: String(seed.brandName).trim() } : {}),
            ...(String(seed.title || "").trim() ? { title: String(seed.title).trim() } : {}),
            ...(String(seed.contactEmail || "").trim() ? { contactEmail: String(seed.contactEmail).trim() } : {}),
            ...(String(seed.whatsapp || "").trim() ? { whatsapp: String(seed.whatsapp).trim() } : {}),
            ...(seed.whatsappRequested === true ? { whatsappRequested: true } : {})
        },
        approved: false,
        reason: "STRUCTURAL_PAGE_CREATE_DEPENDENCY"
    };
    const expanded = [...calls];
    expanded.splice(createIndex, 0, composeCall);
    return stableSemanticStageSort(expanded);
}

export function describeMissionDependencies() {
    return {
        ok: true,
        version: VERSION,
        architecture: "tool_contract_dependency",
        lexicalRouting: false,
        currentDependency: "evidence -> planning -> composition -> artifact; page.create -> page.compose when direct page input is incomplete",
        stages: { ...MISSION_STAGE_BY_TOOL }
    };
}

export const __test = {
    directPageReady,
    stableSemanticStageSort,
    MISSION_STAGE_BY_TOOL
};
'''
write('gestia-core/jarvis/jarvis.mission.dependencies.js', dependencies)

# 2) Planner-facing state is bounded. Full evidence remains untouched in the mission itself.
planner_state = r'''const MAX_PLANNER_TEXT = 700;
const MAX_PLANNER_SOURCES = 3;

function object(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}

function text(value, max = MAX_PLANNER_TEXT) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function compactSource(source = {}) {
    const item = object(source);
    const title = text(item.title || item.name || item.label, 180);
    const url = text(item.url || item.href || item.link, 500);
    return {
        ...(title ? { title } : {}),
        ...(url ? { url } : {})
    };
}

export function compactMissionPlannerObservation(observation = {}) {
    const source = object(observation);
    const evidence = object(source.evidence);
    const sources = (
        Array.isArray(source.sources)
            ? source.sources
            : Array.isArray(evidence.sources)
                ? evidence.sources
                : []
    ).slice(0, MAX_PLANNER_SOURCES).map(compactSource);
    const sourceCount = Number(
        source.sourceCount ??
        source.sourcesCount ??
        evidence.sourceCount ??
        evidence.sourcesCount ??
        (Array.isArray(source.sources) ? source.sources.length : 0) ??
        (Array.isArray(evidence.sources) ? evidence.sources.length : 0)
    ) || 0;
    const summary = text(
        source.summary ||
        source.message ||
        source.answer ||
        source.result ||
        evidence.summary ||
        evidence.answer ||
        ""
    );
    const output = text(
        typeof source.output === "string" ? source.output : "",
        420
    );
    const sha256 = text(source.sha256 || evidence.sha256, 80);
    const mimeType = text(source.mimeType || evidence.mimeType, 100);
    const bytes = Number(source.bytes ?? evidence.bytes ?? 0) || 0;

    return {
        status: text(source.status || evidence.status, 120) || null,
        ok: source.ok === true,
        executionOk: source.executionOk === true || source.ok === true,
        objectiveSatisfied: source.objectiveSatisfied === true,
        blocked: source.blocked === true,
        requiresInput: source.requiresInput === true,
        retryable: source.retryable === true,
        sourceCount,
        ...(summary ? { summary } : {}),
        ...(sources.length ? { sources } : {}),
        ...(output ? { output } : {}),
        ...(sha256 ? { sha256 } : {}),
        ...(mimeType ? { mimeType } : {}),
        ...(bytes > 0 ? { bytes } : {})
    };
}

export function compactMissionPlannerTasks(tasks = []) {
    return (Array.isArray(tasks) ? tasks : []).map(item => ({
        name: String(item?.name || ""),
        args: item?.args && typeof item.args === "object" ? item.args : {},
        observation: compactMissionPlannerObservation(item?.observation)
    }));
}

export function plannerStateBytes(value) {
    return Buffer.byteLength(JSON.stringify(value || {}), "utf8");
}
'''
write('gestia-core/jarvis/jarvis.mission.planner-state.js', planner_state)

# 3) Core uses compact state only for planner re-entry and activates v122 dependency modules.
core_path = 'gestia-core/gestia-core.js'
core = read(core_path)
core = core.replace('v94-generalist-production-integrity-v121-20260810', RELEASE)
core = core.replace('jarvis.mission.orchestrator.js?v=v94-semantic-memory-repo-v111-20260809', f'jarvis.mission.orchestrator.js?v={RELEASE}')
old_dep = "import {\n    ensureExecutableArtifactDependencies\n} from '/gestia-core/jarvis/jarvis.mission.dependencies.js?v=v94-page-browser-fallback-v115-20260809';"
if old_dep not in core:
    raise SystemExit('V122_CORE_DEP_IMPORT_NOT_FOUND')
new_dep = old_dep.replace('v94-page-browser-fallback-v115-20260809', RELEASE) + "\nimport {\n    compactMissionPlannerObservation\n} from '/gestia-core/jarvis/jarvis.mission.planner-state.js?v=" + RELEASE + "';"
core = core.replace(old_dep, new_dep, 1)
core, compact_count = re.subn(r'observation:\s*item\.observation', 'observation:\n                                                        compactMissionPlannerObservation(item.observation)', core)
if compact_count != 2:
    raise SystemExit(f'V122_CORE_PLANNER_OBSERVATION_COUNT_{compact_count}')
write(core_path, core)

# 4) NEXO override must inherit the canonical marketing schema instead of weakening it.
nexo_path = 'gestia-core/nexo/nexo.real-media.tools.js'
nexo = read(nexo_path)
nexo = nexo.replace('nexo-marketing-runtime-v8-20260731', RELEASE)
nexo = nexo.replace('"1.0.0-real-media-mission-tools"', '"1.1.0-generalist-execution-contract-v122"', 1)
insert_after = 'const INSTALL_KEY = "__NEXO_REAL_MEDIA_TOOLS__";\n'
if insert_after not in nexo:
    raise SystemExit('V122_NEXO_INSTALL_KEY_NOT_FOUND')
marketing_schema = r'''

const MARKETING_REQUIRED_FIELDS = Object.freeze([
    "audience", "offer", "pain", "promise", "differentiator", "cta",
    "market", "campaignObjective", "horizon", "tone", "channels",
    "metrics", "productionRequested"
]);

const MARKETING_FALLBACK_SCHEMA = Object.freeze({
    type: "object",
    required: [...MARKETING_REQUIRED_FIELDS],
    properties: {
        prompt: { type: "string" },
        brandName: { type: "string" },
        audience: { type: "string" },
        offer: { type: "string" },
        pain: { type: "string" },
        promise: { type: "string" },
        differentiator: { type: "string" },
        cta: { type: "string" },
        market: { type: "string" },
        campaignObjective: { type: "string" },
        horizon: { type: "string" },
        tone: { type: "string" },
        channels: { type: "array", items: { type: "string" } },
        metrics: { type: "array", items: { type: "string" } },
        productionRequested: { type: "boolean" },
        productionArtifacts: { type: "array", items: { type: "string" } },
        assets: { type: "array", items: { type: "string" } },
        durationSeconds: { type: "number" },
        objectiveId: { type: "string" },
        caseId: { type: "string" }
    },
    additionalProperties: true
});

function previousDefinition(runtime, name) {
    if (typeof runtime?.get === "function") return runtime.get(name);
    return runtime?._registry?.get?.(name) || null;
}

function marketingInputSchema(runtime) {
    const existing = previousDefinition(runtime, "marketing.plan")?.inputSchema;
    const required = Array.isArray(existing?.required) ? existing.required : [];
    if (
        existing?.type === "object" &&
        MARKETING_REQUIRED_FIELDS.every(field => required.includes(field))
    ) {
        return existing;
    }
    return MARKETING_FALLBACK_SCHEMA;
}
'''
nexo = nexo.replace(insert_after, insert_after + marketing_schema, 1)
old_register = '''function registerOrReplace(runtime, definition) {
    return runtime.register({
        version: NEXO_REAL_MEDIA_TOOLS_VERSION,
        mutates: false,
        requiresApproval: false,
        ...definition
    });
}'''
new_register = '''function registerOrReplace(runtime, definition) {
    const previous = previousDefinition(runtime, definition?.name) || {};
    return runtime.register({
        ...previous,
        version: NEXO_REAL_MEDIA_TOOLS_VERSION,
        mutates: definition?.mutates ?? previous?.mutates ?? false,
        requiresApproval: definition?.requiresApproval ?? previous?.requiresApproval ?? false,
        ...definition,
        missionDedupeBy:
            definition?.missionDedupeBy ?? previous?.missionDedupeBy ?? null,
        missionIsolation:
            definition?.missionIsolation ?? previous?.missionIsolation ?? null
    });
}'''
if old_register not in nexo:
    raise SystemExit('V122_NEXO_REGISTER_NOT_FOUND')
nexo = nexo.replace(old_register, new_register, 1)
marketing_start = nexo.index('        name: "marketing.plan",')
schema_start = nexo.index('        inputSchema: {', marketing_start)
execute_start = nexo.index('        execute: async', schema_start)
nexo = nexo[:schema_start] + '        inputSchema: marketingInputSchema(runtime),\n' + nexo[execute_start:]
needle = '                retryable: result?.retryable === true,\n                runtimeOverride: NEXO_REAL_MEDIA_TOOLS_VERSION'
if needle not in nexo:
    raise SystemExit('V122_NEXO_MARKETING_RESULT_NOT_FOUND')
nexo = nexo.replace(needle, '                retryable: result?.retryable === true,\n                error:\n                    result?.ok === false\n                        ? (result?.error || result?.status || "MARKETING_PLAN_FAILED")\n                        : (result?.error || null),\n                runtimeOverride: NEXO_REAL_MEDIA_TOOLS_VERSION', 1)
write(nexo_path, nexo)

# 5) Mount real-media routes on the actual local bridge and bump identity.
bridge_path = 'jarvis-fs-bridge.js'
bridge = read(bridge_path)
import_anchor = 'import {\n    extractJarvisDocumentArtifact\n} from "./jarvis-document-extractor.js";\n'
if import_anchor not in bridge:
    raise SystemExit('V122_BRIDGE_IMPORT_ANCHOR_NOT_FOUND')
bridge = bridge.replace(import_anchor, import_anchor + 'import {\n    registerNexoWebMediaRoutes\n} from "./nexo-web-media-bridge.js";\n', 1)
bridge = bridge.replace('"2.38.0-page-no-contact-route"', f'"{BRIDGE_VERSION}"', 1)
mount_anchor = '''        return next();
    });

    app.post("/observability/snapshot", (req, res) => {'''
if bridge.count(mount_anchor) != 1:
    raise SystemExit(f'V122_BRIDGE_MOUNT_ANCHOR_COUNT_{bridge.count(mount_anchor)}')
bridge = bridge.replace(mount_anchor, '''        return next();
    });

    registerNexoWebMediaRoutes(app, { root });

    app.post("/observability/snapshot", (req, res) => {''', 1)
write(bridge_path, bridge)

# 6) Runtime contract becomes truly isolated to v94. No Hosting deploy in this certification wave.
write('jarvis-runtime-contract.json', json.dumps({
    'projectId': 'fixgo-app',
    'branch': BRANCH,
    'releaseId': RELEASE
}, indent=2, ensure_ascii=False) + '\n')

# 7) Cache chain for the later release activation.
for path in ['gestia-terminal.html', 'gestia-core/tools.runtime.js']:
    text_value = read(path)
    if 'v94-generalist-production-integrity-v121-20260810' not in text_value:
        raise SystemExit(f'V122_CACHE_BASE_NOT_FOUND:{path}')
    write(path, text_value.replace('v94-generalist-production-integrity-v121-20260810', RELEASE))

bootstrap_path = 'modules/terminal/nexo-bootstrap.js'
bootstrap = read(bootstrap_path)
bootstrap = bootstrap.replace('"1.1.0-real-media-runtime"', '"1.2.0-generalist-execution-contract-v122"', 1)
bootstrap = bootstrap.replace('nexo-real-media-runtime-v1-20260731', RELEASE, 1)
write(bootstrap_path, bootstrap)

proposal_path = 'modules/terminal/proposal-state.js'
proposal = read(proposal_path)
proposal = proposal.replace('nexo-terminal-runtime-v2-20260731', RELEASE, 1)
write(proposal_path, proposal)

# Existing bridge version assertion follows the actual product version.
bridge_test_path = 'tests/jarvis-fs-bridge-v2.test.mjs'
bridge_test = read(bridge_test_path)
if '2.38.0-page-no-contact-route' not in bridge_test:
    raise SystemExit('V122_BRIDGE_TEST_VERSION_NOT_FOUND')
write(bridge_test_path, bridge_test.replace('2.38.0-page-no-contact-route', BRIDGE_VERSION))

# 8) Focused regression reproducing the human reds without HMH/TikTok-specific product logic.
test_content = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

import {
    ensureExecutableArtifactDependencies,
    describeMissionDependencies
} from "../gestia-core/jarvis/jarvis.mission.dependencies.js";
import {
    compactMissionPlannerObservation,
    plannerStateBytes
} from "../gestia-core/jarvis/jarvis.mission.planner-state.js";
import {
    registerNexoRealMediaTools
} from "../gestia-core/nexo/nexo.real-media.tools.js";
import {
    createJarvisFsBridgeApp
} from "../jarvis-fs-bridge.js";

const names = calls => calls.map(call => call.name);
const catalog = [
    "web.research", "web.media.collect", "marketing.plan", "reel.plan",
    "page.plan", "page.compose", "page.create"
].map(name => ({ name }));

test("mission dependency contract executes evidence before page composition and artifact creation", () => {
    const calls = ensureExecutableArtifactDependencies({
        catalog,
        toolCalls: [
            { name: "page.create", args: { brandName: "Empresa Norte" } },
            { name: "page.compose", args: { brandName: "Empresa Norte" } },
            { name: "page.plan", args: { pageName: "empresa-norte" } },
            { name: "web.research", args: { query: "Empresa Norte sitio oficial" } }
        ]
    });
    assert.deepEqual(names(calls), ["web.research", "page.plan", "page.compose", "page.create"]);
    assert.equal(describeMissionDependencies().lexicalRouting, false);
});

test("mission dependency contract executes research and real media before marketing and reel planning", () => {
    const calls = ensureExecutableArtifactDependencies({
        catalog,
        toolCalls: [
            { name: "reel.plan", args: { title: "Reel A" } },
            { name: "marketing.plan", args: { brandName: "Marca A" } },
            { name: "web.media.collect", args: { url: "https://example.com/media" } },
            { name: "web.research", args: { query: "Marca A" } }
        ]
    });
    assert.deepEqual(names(calls), ["web.research", "web.media.collect", "marketing.plan", "reel.plan"]);
});

test("page.compose is inserted and then ordered before page.create when direct input is incomplete", () => {
    const calls = ensureExecutableArtifactDependencies({
        catalog,
        toolCalls: [
            { name: "page.create", args: { brandName: "Empresa Sur" } },
            { name: "web.research", args: { query: "Empresa Sur" } },
            { name: "page.plan", args: { pageName: "empresa-sur", brandName: "Empresa Sur" } }
        ]
    });
    assert.deepEqual(names(calls), ["web.research", "page.plan", "page.compose", "page.create"]);
});

test("planner-facing completion state is bounded without deleting the full mission evidence", () => {
    const giant = "dato-verificado ".repeat(8000);
    const observation = {
        ok: true,
        status: "GROUNDED",
        answer: giant,
        sources: Array.from({ length: 18 }, (_, index) => ({
            title: `Fuente ${index}`,
            url: `https://example.com/${index}`,
            snippet: giant
        })),
        evidence: { answer: giant }
    };
    const compact = compactMissionPlannerObservation(observation);
    assert.equal(observation.answer.length > 50000, true);
    assert.equal(compact.summary.length <= 700, true);
    assert.equal(compact.sources.length, 3);
    assert.equal("snippet" in compact.sources[0], false);
    assert.equal(plannerStateBytes({ completedTasks: [{ observation: compact }] }) < 5000, true);
    assert.equal(observation.sources[0].snippet.length > 50000, true);
});

class FakeRuntime {
    constructor(seed = null) {
        this.map = new Map();
        if (seed) this.map.set(seed.name, seed);
    }
    get(name) { return this.map.get(name) || null; }
    register(definition) { this.map.set(definition.name, definition); return { ok: true }; }
}

const canonicalRequired = [
    "audience", "offer", "pain", "promise", "differentiator", "cta",
    "market", "campaignObjective", "horizon", "tone", "channels",
    "metrics", "productionRequested"
];

test("NEXO marketing override preserves the canonical semantic brief schema", () => {
    const canonicalSchema = {
        type: "object",
        required: [...canonicalRequired, "brandName"],
        properties: Object.fromEntries([...canonicalRequired, "brandName"].map(name => [name, { type: "string" }]))
    };
    const runtime = new FakeRuntime({
        name: "marketing.plan",
        inputSchema: canonicalSchema,
        missionDedupeBy: ["brandName"],
        execute: async () => ({ ok: true })
    });
    registerNexoRealMediaTools(runtime);
    const installed = runtime.get("marketing.plan");
    assert.equal(installed.inputSchema, canonicalSchema);
    assert.deepEqual(installed.missionDedupeBy, ["brandName"]);
});

test("NEXO fallback marketing schema still requires the full semantic brief", () => {
    const runtime = new FakeRuntime();
    registerNexoRealMediaTools(runtime);
    const installed = runtime.get("marketing.plan");
    for (const field of canonicalRequired) {
        assert.equal(installed.inputSchema.required.includes(field), true, field);
    }
});

test("actual Jarvis FS bridge mounts /web/media/collect as JSON instead of 404", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-v122-media-route-"));
    execFileSync("git", ["init", "-b", "v94-media-v4n-negative-claims"], { cwd: root, stdio: "ignore" });
    fs.writeFileSync(path.join(root, "jarvis-runtime-contract.json"), JSON.stringify({
        projectId: "fixgo-test",
        branch: "v94-media-v4n-negative-claims",
        releaseId: "v122-test-release"
    }));
    const server = createJarvisFsBridgeApp({ root }).listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/web/media/collect`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-jarvis-release-id": "v122-test-release"
            },
            body: JSON.stringify({ url: "not-a-valid-url" })
        });
        const payload = await response.json();
        assert.notEqual(response.status, 404);
        assert.equal(typeof payload, "object");
        assert.equal(payload.ok, false);
        assert.equal(Boolean(payload.status || payload.error), true);
    } finally {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("release source no longer sends raw mission observations back into semantic planner", () => {
    const core = fs.readFileSync(path.resolve("gestia-core/gestia-core.js"), "utf8");
    const contract = JSON.parse(fs.readFileSync(path.resolve("jarvis-runtime-contract.json"), "utf8"));
    assert.doesNotMatch(core, /observation:\s*item\.observation/);
    assert.equal((core.match(/compactMissionPlannerObservation\(item\.observation\)/g) || []).length, 2);
    assert.equal(contract.branch, "v94-media-v4n-negative-claims");
    assert.equal(contract.releaseId, "v94-generalist-execution-contract-v122-20260810");
});
'''
write('tests/jarvis-generalist-execution-contract-v122.test.mjs', test_content)

print('V122_PATCH_APPLIED')
