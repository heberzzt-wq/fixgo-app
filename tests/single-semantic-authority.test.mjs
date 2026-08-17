import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("only jarvisSemanticPlan owns natural-language planning", () => {
    const planner = read("gestia-core/jarvis/jarvis.multifunction.planner.js");
    const core = read("gestia-core/gestia-core.js");
    const terminalHtml = read("gestia-terminal.html");
    assert.match(planner, /jarvisSemanticPlan/);
    assert.match(core, /SINGLE SEMANTIC BRAIN CONTRACT/);
    assert.match(core, /SINGLE_SEMANTIC_BRAIN_FAIL_CLOSED/);
    assert.doesNotMatch(core, /runCognitiveReasoning/);
    assert.doesNotMatch(core, /sincronizarCorralSemantico/);
    assert.doesNotMatch(core, /interpretarIntenciones/);
    assert.doesNotMatch(terminalHtml, /routeTerminalNaturalIntent/);
    assert.doesNotMatch(terminalHtml, /TERMINAL_BRAIN_ROUTER_41_42/);
    assert.doesNotMatch(terminalHtml, /GestiaCore\?\.analizarIntencionLigera/);
    assert.match(terminalHtml, /JarvisToolRuntime\.execute/);
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
    const runtimeGuard = read("gestia-core/nexo/nexo.real-media.runtime-guard-v128.js");
    assert.doesNotMatch(bootstrap, /nexo\.semantic-planner-resilience/);
    assert.doesNotMatch(marketing, /nexo\.semantic-planner-resilience/);
    assert.match(bootstrap, /nexo\.real-media\.tools/);
    assert.doesNotMatch(runtimeGuard, /runtime\.register\s*\(/);
    assert.match(runtimeGuard, /collectorDefinition\.execute\s*=\s*async/);
    assert.match(runtimeGuard, /reelDefinition\.execute\s*=\s*async/);
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

test("terminal has no dead lexical natural-command router after semantic return", () => {
    const terminal = read("gestia-terminal.js");
    assert.match(terminal, /naturalIntentAuthority:\s*"jarvisSemanticPlan"/);
    assert.match(terminal, /lexicalFallbackAllowed:\s*false/);
    assert.doesNotMatch(terminal, /APPROVAL_WORDS/);
    assert.doesNotMatch(terminal, /CANCEL_WORDS/);
    assert.doesNotMatch(terminal, /REPO SEARCH INTERCEPTOR/);
    assert.doesNotMatch(terminal, /QUICK COMMANDS JARVIS/);
    assert.doesNotMatch(terminal, /REPO AUDIT INTERCEPTORS/);
    assert.doesNotMatch(terminal, /APPROVAL DETECTED/);
});

test("UI branding never interprets natural approval language", () => {
    const branding = read("gestia-core/nexo/nexo.ui.branding.js");
    assert.doesNotMatch(branding, /EXACT_APPROVAL_COMMANDS/);
    assert.doesNotMatch(branding, /isNexoApprovalCommand/);
    assert.doesNotMatch(branding, /normalizeNexoCommand/);
    assert.doesNotMatch(branding, /input\.value\s*=\s*"proceder"/);
    assert.match(branding, /semanticAuthority:\s*"jarvisSemanticPlan"/);
});

