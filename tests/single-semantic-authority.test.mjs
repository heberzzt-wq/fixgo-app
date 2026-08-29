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

test("mission execution identity always wins over planner or provider copies", () => {
    const activeHands = [
        "gestia-core/jarvis/jarvis.actuator.pack.js",
        "gestia-core/jarvis/jarvis.multitool.pack.js",
        "gestia-core/nexo/nexo.real-media.tools.js",
        "gestia-core/tools.runtime.js",
        "modules/terminal/jarvis-attachments.js"
    ];
    for (const file of activeHands) {
        const source = read(file);
        assert.doesNotMatch(
            source,
            /args\??\.objectiveId\s*\|\|\s*context\??\.objectiveId|result\??\.objectiveId\s*\|\|\s*context\??\.objectiveId|(?:local|recovery|primary|final)Result\??\.objectiveId\s*\|\|\s*trace\.objectiveId|item\.objectiveId\s*\|\|\s*state\.caseRecord/,
            file
        );
        assert.doesNotMatch(
            source,
            /args\??\.caseId\s*\|\|\s*context\??\.caseId|result\??\.caseId\s*\|\|\s*context\??\.caseId|(?:local|recovery|primary|final)Result\??\.caseId\s*\|\|\s*trace\.caseId|item\.caseId\s*\|\|\s*state\.caseRecord/,
            file
        );
    }
});

test("technical recovery and observed repo follow-up never invoke a parallel semantic route", () => {
    const orchestrator = read("gestia-core/jarvis/jarvis.mission.orchestrator.js");
    const core = read("gestia-core/gestia-core.js");
    assert.doesNotMatch(orchestrator, /plannerMission\.phase\s*=\s*"REEL_MEDIA_SOURCE_RECOVERY"/);
    assert.equal(
        (core.match(/executeObservationDrivenFollowUp\s*\(/g) || []).length,
        1,
        "the helper may remain for compatibility tests but active mission flow must not execute it"
    );
    assert.match(core, /buildObservationDrivenFollowUpToolCalls\([\s\S]*mission\.observations/);
});

test("legacy patch state machines are retired from active Jarvis routes", () => {
    const runtime = read("gestia-core/tools.runtime.js");
    const bridge = read("gestia-core/tools.bridge.js");
    const core = read("gestia-core/gestia-core.js");
    const executor = read("gestia-core/operations-executor.engine.js");
    const terminal = read("gestia-terminal.html");
    const retiredTools = [
        "repo.postWriteVerify",
        "repo.snapshotStore",
        "repo.snapshotBeforeWrite",
        "repo.rollbackLastPatch",
        "repo.reviewCard",
        "repo.operatorQueue",
        "repo.safePatchApply",
        "repo.safePatchPlan",
        "repo.governanceCheck",
        "tests.codexPipeline",
        "repo.patchPreview"
    ];

    for (const name of retiredTools) {
        assert.match(
            runtime,
            new RegExp(`if \\(false\\) JarvisToolRuntime\\.register\\(\\{[\\s\\S]{0,180}?['\"]${name.replaceAll(".", "\\.")}['\"]`),
            name
        );
    }
    assert.match(runtime, /name:\s*"repo\.prepareWrite"/);
    assert.match(runtime, /name:\s*"repo\.authorizeWrite"/);
    assert.match(runtime, /name:\s*\n?\s*"repo\.write"/);
    assert.match(runtime, /if \(false && window\.JarvisToolRuntime\?\.register/);
    assert.match(runtime, /if \(false\) \(function initJarvisCodexV2Runtime/);
    assert.match(bridge, /if \(false\) \(function initJarvisCodexV2Bridge/);
    assert.match(core, /if \(false\) \(function initJarvisCodexV2CoreStatus/);
    assert.doesNotMatch(executor, /window\.JarvisCodexV2/);
    assert.match(executor, /CODE_WRITE_REQUIRES_CANONICAL_ONE_TIME_AUTHORITY/);
    assert.match(terminal, /if \(false && sia7TopLevelApprovalMatch\)/);
    assert.match(terminal, /if \(false && sia7ApprovalMatch\)/);
    assert.doesNotMatch(terminal, /"codex\.patch":\s*\{/);
});

