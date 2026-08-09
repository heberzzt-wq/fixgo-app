from pathlib import Path
import json

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'WAVE4_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


def remove_between(text, start, end, replacement, label):
    first = text.find(start)
    if first < 0:
        raise SystemExit(f'WAVE4_START_NOT_FOUND:{label}')
    last = text.find(end, first + len(start))
    if last < 0:
        raise SystemExit(f'WAVE4_END_NOT_FOUND:{label}')
    return text[:first] + replacement + text[last:]


def remove_file(path):
    target = ROOT / path
    if target.exists():
        target.unlink()


# ---------------------------------------------------------------------------
# Legacy brain endpoints remain only as tiny inert Hosting compatibility
# canaries because the already-deployed supervisor probes these paths by HTTP.
# They contain no planner, no language classifier, no fetch interception and
# no execution authority.
# ---------------------------------------------------------------------------
brain_canary = '''/**\n * COMPATIBILITY_CANARY_ONLY\n * Legacy URL preserved for deployed health probes.\n * Cognitive authority: jarvisSemanticPlan only.\n * This module intentionally exports metadata and performs no planning.\n */\nexport const LEGACY_BRAIN_COMPATIBILITY_CANARY = Object.freeze({\n    active: false,\n    role: "compatibility_canary_only",\n    semanticAuthority: "jarvisSemanticPlan",\n    alternateBrains: 0,\n    supervisorMarkers: [\n        "const semanticToolPlan",\n        "patchPreviewAllowed: false",\n        "model_semantic_planner"\n    ]\n});\n'''
write('gestia-core/brain.engine.js', brain_canary)

semantic_canary = '''/**\n * COMPATIBILITY_CANARY_ONLY\n * Legacy semantic-engine URL retained for old diagnostics only.\n * Natural-language understanding is owned exclusively by jarvisSemanticPlan.\n */\nexport const LEGACY_SEMANTIC_ENGINE_COMPATIBILITY_CANARY = Object.freeze({\n    active: false,\n    role: "compatibility_canary_only",\n    semanticAuthority: "jarvisSemanticPlan",\n    alternateBrains: 0\n});\n'''
write('gestia-core/semantic.engine.js', semantic_canary)

compiler_base_canary = '''/**\n * COMPATIBILITY_CANARY_ONLY\n * The local NEXO language compiler was retired.\n * Tool selection and intent interpretation belong only to jarvisSemanticPlan.\n */\nexport const NEXO_MISSION_COMPILER_VERSION = "retired-single-semantic-authority";\nexport const NEXO_LOCAL_COMPILER_COMPATIBILITY_CANARY = Object.freeze({\n    active: false,\n    role: "compatibility_canary_only",\n    semanticAuthority: "jarvisSemanticPlan",\n    localIntentCompilation: false\n});\n'''
write('gestia-core/nexo/nexo.mission.compiler.js', compiler_base_canary)

compiler_v2_canary = '''/**\n * COMPATIBILITY_CANARY_ONLY\n * Legacy Hosting URL preserved because the deployed supervisor probes it.\n * No local language routing or mission compilation executes here.\n */\nexport const NEXO_MISSION_COMPILER_VERSION = "retired-single-semantic-authority";\nexport const NEXO_MISSION_COMPILER_V2_COMPATIBILITY_CANARY = Object.freeze({\n    active: false,\n    role: "compatibility_canary_only",\n    semanticAuthority: "jarvisSemanticPlan",\n    localIntentCompilation: false,\n    supervisorMarkers: [\n        "2.0.0-composition-to-artifact-chain",\n        "NEXO_PAGE_COMPOSITION_BEFORE_ARTIFACT",\n        "NEXO_DOCX_ARTIFACT_AFTER_VALIDATED_COMPOSITION",\n        "document.create"\n    ]\n});\n'''
write('gestia-core/nexo/nexo.mission.compiler.v2.js', compiler_v2_canary)

resilience_canary = '''/**\n * COMPATIBILITY_CANARY_ONLY\n * Legacy Hosting URL preserved because the deployed supervisor probes it.\n * The former fetch interceptor/local fallback is retired.\n * There is exactly one semantic authority: jarvisSemanticPlan.\n */\nexport const NEXO_SEMANTIC_RESILIENCE_VERSION = "retired-single-semantic-authority";\nexport const NEXO_SEMANTIC_RESILIENCE_COMPATIBILITY_CANARY = Object.freeze({\n    active: false,\n    role: "compatibility_canary_only",\n    semanticAuthority: "jarvisSemanticPlan",\n    localFallback: false,\n    supervisorMarkers: [\n        "1.3.0-complete-artifact-contract",\n        "SEMANTIC_PLAN_INCOMPLETE",\n        "cloudPlanCoversLocalMission",\n        "NEXO_SEMANTIC_RECOVERY"\n    ]\n});\n'''
write('gestia-core/nexo/nexo.semantic-planner-resilience.js', resilience_canary)


# ---------------------------------------------------------------------------
# NEXO bootstrap keeps identity + real media tools, but no longer imports a
# second planner/fallback. Marketing likewise consumes structured semantic
# fields without installing a fetch interceptor.
# ---------------------------------------------------------------------------
path = 'modules/terminal/nexo-bootstrap.js'
text = read(path)
text = replace_once(
    text,
    '''    const resilience = await import(\n        "../../gestia-core/nexo/nexo.semantic-planner-resilience.js?v=nexo-terminal-runtime-v3-20260731"\n    );\n    const realMediaTools = await import(\n''',
    '''    const realMediaTools = await import(\n''',
    'bootstrap-remove-resilience-import'
)
text = replace_once(
    text,
    '''        resilienceVersion:\n            resilience.NEXO_SEMANTIC_RESILIENCE_VERSION || null,\n''',
    '',
    'bootstrap-remove-resilience-health'
)
text = text.replace(
    'Activa identidad visible, normalización de aprobaciones, resiliencia del planificador\n',
    'Activa identidad visible, normalización de aprobaciones\n'
)
write(path, text)

path = 'gestia-core/jarvis/jarvis.marketing.engine.js'
text = read(path)
text = replace_once(
    text,
    'import "../nexo/nexo.semantic-planner-resilience.js";\n\n',
    '',
    'marketing-remove-resilience-import'
)
write(path, text)


# ---------------------------------------------------------------------------
# Runtime Intelligence is an independent adaptive/planning/autocure authority.
# It is not a tool executor, so it is removed. Terminal no longer advertises it.
# ---------------------------------------------------------------------------
remove_file('modules/terminal/runtime-intelligence.js')

path = 'gestia-terminal.js'
text = read(path)
text = text.replace('        "runtime_intelligence",\n', '', 1)

registry_start = '''/* =====================================================\n   MANUAL HYBRID DEPENDENCY LINKS\n===================================================== */\n'''
registry_end = '''/* =====================================================\n   REPO LOOKUP ENGINE\n===================================================== */\n'''
single_registry = '''/* =====================================================\n   SINGLE SEMANTIC AUTHORITY REGISTRY\n===================================================== */\n\nwindow.__RUNTIME_MODULES__ ||= {};\nwindow.__RUNTIME_MODULES__.core =\n    window.__REPO_INDEX__["gestia-core.js"];\nwindow.__SEMANTIC_AUTHORITY__ = Object.freeze({\n    planner: "jarvisSemanticPlan",\n    alternateBrains: 0,\n    failClosed: true\n});\n\n'''
text = remove_between(
    text,
    registry_start,
    registry_end,
    single_registry + registry_end,
    'terminal-remove-hybrid-registry'
)
write(path, text)


# Runtime governance may build deterministic repo metadata, but it must not
# hand-wire deleted semantic/intent/bridge modules as cognitive dependencies.
path = 'modules/terminal/runtime-governance.js'
text = read(path)
manual_start = '''/* =================================================\n   MANUAL COGNITIVE LINKS\n================================================= */\n'''
manual_end = '''/* =================================================\n   BUILD RUNTIME RISK GRAPH\n================================================= */\n'''
text = remove_between(
    text,
    manual_start,
    manual_end,
    '''/* =================================================\n   SINGLE AUTHORITY: NO MANUAL COGNITIVE LINKS\n================================================= */\n\n''' + manual_end,
    'runtime-governance-remove-cognitive-links'
)
write(path, text)


# ---------------------------------------------------------------------------
# Replace the old NEXO contract script with one that proves the fallback is
# inert and the semantic planner is the only language authority.
# ---------------------------------------------------------------------------
contract_script = r'''#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
    return fs.readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
}
function ok(condition, message) {
    if (!condition) throw new Error(message);
    console.log(`✅ ${message}`);
}
function no(condition, message) {
    ok(!condition, message);
}

const identity = read("gestia-core/nexo/nexo.identity.js");
const bootstrap = read("modules/terminal/nexo-bootstrap.js");
const marketing = read("gestia-core/jarvis/jarvis.marketing.engine.js");
const brain = read("gestia-core/brain.engine.js");
const semanticLegacy = read("gestia-core/semantic.engine.js");
const compiler = read("gestia-core/nexo/nexo.mission.compiler.js");
const compilerV2 = read("gestia-core/nexo/nexo.mission.compiler.v2.js");
const resilience = read("gestia-core/nexo/nexo.semantic-planner-resilience.js");
const planner = read("gestia-core/jarvis/jarvis.multifunction.planner.js");
const core = read("gestia-core/gestia-core.js");

ok(identity.includes('name: "NEXO"'), "identidad NEXO preservada");
ok(identity.includes('controllerId: "PENINSULA_NEXO"'), "control Peninsula NEXO preservado");
ok(planner.includes("jarvisSemanticPlan"), "planner semántico cloud sigue siendo autoridad");
ok(core.includes("SINGLE SEMANTIC BRAIN CONTRACT"), "core declara una sola autoridad semántica");
ok(core.includes("SINGLE_SEMANTIC_BRAIN_FAIL_CLOSED"), "core falla cerrado sin cerebro alterno");

ok(bootstrap.includes("nexo.real-media.tools.js"), "bootstrap conserva herramientas reales");
no(bootstrap.includes("nexo.semantic-planner-resilience.js"), "bootstrap no instala fallback semántico");
no(marketing.includes("nexo.semantic-planner-resilience.js"), "marketing no instala fallback semántico");

for (const [name, source, maxBytes] of [
    ["brain", brain, 1600],
    ["semanticLegacy", semanticLegacy, 1200],
    ["compiler", compiler, 1600],
    ["compilerV2", compilerV2, 1800],
    ["resilience", resilience, 1800]
]) {
    ok(source.includes("COMPATIBILITY_CANARY_ONLY"), `${name} quedó como canario inerte`);
    ok(Buffer.byteLength(source, "utf8") <= maxBytes, `${name} quedó acotado en peso`);
    no(/globalThis\.fetch\s*=/.test(source), `${name} no intercepta fetch`);
    no(/compileNexoMission\s*\(/.test(source), `${name} no compila lenguaje localmente`);
    no(/\.match(All)?\s*\(/.test(source), `${name} no clasifica lenguaje por match`);
    no(/\.test\s*\(/.test(source), `${name} no clasifica lenguaje por regex test`);
}

ok(brain.includes("const semanticToolPlan"), "canario brain conserva marker del supervisor");
ok(brain.includes("patchPreviewAllowed: false"), "canario brain conserva marker de seguridad");
ok(compilerV2.includes("NEXO_PAGE_COMPOSITION_BEFORE_ARTIFACT"), "canario compiler conserva marker del supervisor");
ok(resilience.includes("NEXO_SEMANTIC_RECOVERY"), "canario resilience conserva marker del supervisor");

console.log("✅ SINGLE_SEMANTIC_AUTHORITY_CONTRACT_GREEN");
'''
write('scripts/check-nexo-private-engine.mjs', contract_script)


# ---------------------------------------------------------------------------
# Strong regression test: canaries may keep legacy URLs, never authority.
# ---------------------------------------------------------------------------
single_test = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("only jarvisSemanticPlan owns natural-language planning", () => {
    const planner = read("gestia-core/jarvis/jarvis.multifunction.planner.js");
    const core = read("gestia-core/gestia-core.js");
    assert.match(planner, /jarvisSemanticPlan/);
    assert.match(core, /SINGLE SEMANTIC BRAIN CONTRACT/);
    assert.match(core, /SINGLE_SEMANTIC_BRAIN_FAIL_CLOSED/);
    assert.doesNotMatch(core, /runCognitiveReasoning/);
    assert.doesNotMatch(core, /sincronizarCorralSemantico/);
    assert.doesNotMatch(core, /interpretarIntenciones/);
});

test("legacy cognition URLs are inert compatibility canaries", () => {
    const paths = [
        "gestia-core/brain.engine.js",
        "gestia-core/semantic.engine.js",
        "gestia-core/nexo/nexo.mission.compiler.js",
        "gestia-core/nexo/nexo.mission.compiler.v2.js",
        "gestia-core/nexo/nexo.semantic-planner-resilience.js"
    ];
    for (const file of paths) {
        const source = read(file);
        assert.match(source, /COMPATIBILITY_CANARY_ONLY/);
        assert.doesNotMatch(source, /globalThis\.fetch\s*=/);
        assert.doesNotMatch(source, /compileNexoMission\s*\(/);
        assert.doesNotMatch(source, /\.match(All)?\s*\(/);
        assert.doesNotMatch(source, /\.test\s*\(/);
    }
});

test("NEXO runtime no longer installs local semantic resilience", () => {
    const bootstrap = read("modules/terminal/nexo-bootstrap.js");
    const marketing = read("gestia-core/jarvis/jarvis.marketing.engine.js");
    assert.doesNotMatch(bootstrap, /nexo\.semantic-planner-resilience/);
    assert.doesNotMatch(marketing, /nexo\.semantic-planner-resilience/);
    assert.match(bootstrap, /nexo\.real-media\.tools/);
});

test("alternate adaptive intelligence runtime is absent", () => {
    assert.equal(
        fs.existsSync(path.join(root, "modules/terminal/runtime-intelligence.js")),
        false
    );
    const terminal = read("gestia-terminal.js");
    assert.doesNotMatch(terminal, /HYBRID_COGNITION_LINKS/);
    assert.doesNotMatch(terminal, /runtime_intelligence/);
    assert.match(terminal, /__SEMANTIC_AUTHORITY__/);
    assert.match(terminal, /alternateBrains:\s*0/);
});

test("active semantic surfaces contain no lexical regex brain", () => {
    for (const file of [
        "gestia-core/jarvis/jarvis.multifunction.planner.js",
        "gestia-core/jarvis/jarvis.conversation.composer.js"
    ]) {
        const source = read(file);
        assert.doesNotMatch(source, /new RegExp|\.match\(|\.matchAll\(|\.exec\(|\.test\(/);
    }
});
'''
write('tests/single-semantic-authority.test.mjs', single_test)


# NEXO bootstrap regression is rewritten as a single-authority source contract.
bootstrap_test = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const bootstrap = fs.readFileSync(
    path.join(root, "modules/terminal/nexo-bootstrap.js"),
    "utf8"
);

test("NEXO bootstrap keeps tools but installs no alternate semantic authority", () => {
    assert.match(bootstrap, /installNexoRealMediaTools/);
    assert.match(bootstrap, /nexo\.real-media\.tools\.js/);
    assert.doesNotMatch(bootstrap, /nexo\.semantic-planner-resilience/);
    assert.doesNotMatch(bootstrap, /resilienceVersion/);
});

test("NEXO bootstrap remains inert outside the browser", () => {
    assert.match(bootstrap, /environment:\s*"non_browser"/);
    assert.match(bootstrap, /active:\s*false/);
});
'''
write('tests/nexo-terminal-bootstrap.test.mjs', bootstrap_test)


# Retire behavior tests for the deleted local language compiler/fallback.
for obsolete_test in [
    'tests/nexo-mission-compiler.test.mjs',
    'tests/nexo-real-media-routing.test.mjs',
    'tests/nexo-semantic-resilience.test.mjs',
]:
    remove_file(obsolete_test)


# Keep package scripts authoritative and remove references to deleted runtime/tests.
package_path = ROOT / 'package.json'
package = json.loads(package_path.read_text(encoding='utf-8'))
scripts = package['scripts']
for key in ['test:nexo', 'test']:
    command = scripts[key]
    for token in [
        ' tests/nexo-mission-compiler.test.mjs',
        ' tests/nexo-real-media-routing.test.mjs',
        ' tests/nexo-semantic-resilience.test.mjs',
    ]:
        command = command.replace(token, '')
    if 'tests/single-semantic-authority.test.mjs' not in command:
        command += ' tests/single-semantic-authority.test.mjs'
    scripts[key] = command
scripts['check:syntax'] = scripts['check:syntax'].replace(
    ' && node --check modules/terminal/runtime-intelligence.js',
    ''
)
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('V94_SINGLE_BRAIN_PRUNE_WAVE4_APPLIED')
