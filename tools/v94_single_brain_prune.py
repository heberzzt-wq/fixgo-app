#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHANGED = []


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    current = target.read_text(encoding="utf-8")
    if current == text:
        return
    target.write_text(text, encoding="utf-8")
    CHANGED.append(path)


def remove_between(text: str, start: str, end: str, replacement: str = "") -> str:
    start_index = text.find(start)
    if start_index < 0:
        return text
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"SINGLE_BRAIN_END_ANCHOR_MISSING:{end!r}")
    return text[:start_index] + replacement + text[end_index:]


def unwrap_runtime_registration(block: str, definition: str, saved_execute: str) -> str:
    header = (
        "    runtime.register({\n"
        f"        ...{definition},\n"
        "        version: NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION,\n"
        "        execute: async (args = {}, context = {}) => {"
    )
    replacement = (
        f"    const {saved_execute} = {definition}.execute.bind({definition});\n"
        f"    {definition}.runtimeGuardVersion = NEXO_REAL_MEDIA_RUNTIME_GUARD_VERSION;\n"
        f"    {definition}.execute = async (args = {{}}, context = {{}}) => {{"
    )
    if header not in block:
        raise SystemExit(f"SINGLE_BRAIN_GUARD_HEADER_MISSING:{definition}")
    block = block.replace(header, replacement, 1)
    old_call = f"await {definition}.execute("
    new_call = f"await {saved_execute}("
    if old_call not in block:
        raise SystemExit(f"SINGLE_BRAIN_GUARD_EXECUTE_CALL_MISSING:{definition}")
    block = block.replace(old_call, new_call, 1)
    stripped = block.rstrip()
    suffix = "\n    });"
    if not stripped.endswith(suffix):
        raise SystemExit(f"SINGLE_BRAIN_GUARD_END_MISSING:{definition}")
    stripped = stripped[:-len(suffix)] + ";"
    return stripped


# 1) Terminal is transport/UI/security only. Natural-language planning belongs to
# jarvisSemanticPlan inside GestiaCore; do not pre-plan in the HTML terminal.
terminal_path = "gestia-terminal.html"
terminal = read(terminal_path)
terminal = remove_between(
    terminal,
    "    const buildTerminalBrainRoute =",
    "const countUnescapedPatchCharacter =",
)
terminal = remove_between(
    terminal,
    "        const terminalBrainRoute =",
    "        console.info(\n            \"🧠 [TERMINAL_CORE_FIRST]\"",
    (
        "        activeWorkTracker?.complete(\n"
        "            \"routing\",\n"
        "            \"Misión enviada al núcleo semántico único\"\n"
        "        );\n\n"
    ),
)
readiness_old = (
    "            window.GestiaCore?.procesarIntencion ||\n"
    "            window.GestiaCore?.analizarIntencionLigera ||\n"
)
if readiness_old in terminal:
    terminal = terminal.replace(
        readiness_old,
        "            window.GestiaCore?.procesarIntencion ||\n",
        1,
    )
for forbidden in (
    "buildTerminalBrainRoute",
    "decideTerminalModeFromContext",
    "routeTerminalNaturalIntent",
    "TERMINAL_BRAIN_ROUTER_41_42",
    "GestiaCore?.analizarIntencionLigera",
):
    if forbidden in terminal:
        raise SystemExit(f"SINGLE_BRAIN_TERMINAL_AUTHORITY_REMAINS:{forbidden}")
if "JarvisToolRuntime.execute" not in terminal:
    raise SystemExit("SINGLE_BRAIN_TOOL_RUNTIME_ROUTE_MISSING")
write(terminal_path, terminal)


# 2) NEXO runtime guard protects the already-registered tool definitions in place.
# It must not register a second version of web.media.collect or reel.create.
guard_path = "gestia-core/nexo/nexo.real-media.runtime-guard-v128.js"
guard = read(guard_path)
collector_marker = "    runtime.register({\n        ...collectorDefinition,"
reel_marker = "    runtime.register({\n        ...reelDefinition,"
if collector_marker in guard or reel_marker in guard:
    collector_start = guard.find(collector_marker)
    reel_start = guard.find(reel_marker, max(collector_start, 0))
    install_start = guard.find("    const installation = {", max(reel_start, 0))
    if min(collector_start, reel_start, install_start) < 0:
        raise SystemExit("SINGLE_BRAIN_GUARD_REGISTRATION_ANCHOR_MISSING")
    collector_block = guard[collector_start:reel_start]
    reel_block = guard[reel_start:install_start]
    collector_block = unwrap_runtime_registration(
        collector_block,
        "collectorDefinition",
        "collectorExecute",
    )
    reel_block = unwrap_runtime_registration(
        reel_block,
        "reelDefinition",
        "reelExecute",
    )
    guard = (
        guard[:collector_start]
        + collector_block
        + "\n\n"
        + reel_block
        + "\n\n"
        + guard[install_start:]
    )
if "runtime.register({" in guard:
    raise SystemExit("SINGLE_BRAIN_GUARD_STILL_REGISTERS_TOOLS")
for required in (
    "collectorDefinition.execute = async",
    "reelDefinition.execute = async",
    "collectorExecute",
    "reelExecute",
):
    if required not in guard:
        raise SystemExit(f"SINGLE_BRAIN_GUARD_IN_PLACE_WRAP_MISSING:{required}")
write(guard_path, guard)


# 3) Extend the existing single-authority contract test. No new contract/test file.
test_path = "tests/single-semantic-authority.test.mjs"
test_source = read(test_path)
if "const terminalHtml = read(\"gestia-terminal.html\");" not in test_source:
    anchor = "    const core = read(\"gestia-core/gestia-core.js\");\n"
    if anchor not in test_source:
        raise SystemExit("SINGLE_BRAIN_TEST_CORE_ANCHOR_MISSING")
    test_source = test_source.replace(
        anchor,
        anchor + "    const terminalHtml = read(\"gestia-terminal.html\");\n",
        1,
    )
    assertion_anchor = "    assert.doesNotMatch(core, /interpretarIntenciones/);\n"
    if assertion_anchor not in test_source:
        raise SystemExit("SINGLE_BRAIN_TEST_ASSERTION_ANCHOR_MISSING")
    test_source = test_source.replace(
        assertion_anchor,
        assertion_anchor
        + "    assert.doesNotMatch(terminalHtml, /routeTerminalNaturalIntent/);\n"
        + "    assert.doesNotMatch(terminalHtml, /TERMINAL_BRAIN_ROUTER_41_42/);\n"
        + "    assert.doesNotMatch(terminalHtml, /GestiaCore\\?\\.analizarIntencionLigera/);\n"
        + "    assert.match(terminalHtml, /JarvisToolRuntime\\.execute/);\n",
        1,
    )
if "const runtimeGuard = read(\"gestia-core/nexo/nexo.real-media.runtime-guard-v128.js\");" not in test_source:
    anchor = "    const marketing = read(\"gestia-core/jarvis/jarvis.marketing.engine.js\");\n"
    if anchor not in test_source:
        raise SystemExit("SINGLE_BRAIN_TEST_NEXO_ANCHOR_MISSING")
    test_source = test_source.replace(
        anchor,
        anchor
        + "    const runtimeGuard = read(\"gestia-core/nexo/nexo.real-media.runtime-guard-v128.js\");\n",
        1,
    )
    assertion_anchor = "    assert.match(bootstrap, /nexo\\.real-media\\.tools/);\n"
    if assertion_anchor not in test_source:
        raise SystemExit("SINGLE_BRAIN_TEST_NEXO_ASSERTION_ANCHOR_MISSING")
    test_source = test_source.replace(
        assertion_anchor,
        assertion_anchor
        + "    assert.doesNotMatch(runtimeGuard, /runtime\\.register\\s*\\(/);\n"
        + "    assert.match(runtimeGuard, /collectorDefinition\\.execute\\s*=\\s*async/);\n"
        + "    assert.match(runtimeGuard, /reelDefinition\\.execute\\s*=\\s*async/);\n",
        1,
    )
write(test_path, test_source)


# 4) Keep the existing multifunction regression aligned with the same authority.
# Old positive assertions certified the inline terminal semantic router that is
# intentionally removed. Replace them in place; do not create another contract.
multifunction_test_path = "tests/jarvis-multifunction-tools.test.mjs"
multifunction_test = read(multifunction_test_path)
terminal_brain_assertion_replacements = (
    (
        "    assert.match(terminal, /Array\\.isArray\\(semantic\\.toolCalls\\)/);\n",
        "    assert.doesNotMatch(terminal, /Array\\.isArray\\(semantic\\.toolCalls\\)/);\n"
        "    assert.doesNotMatch(terminal, /routeTerminalNaturalIntent/);\n"
        "    assert.doesNotMatch(terminal, /TERMINAL_BRAIN_ROUTER_41_42/);\n",
    ),
    (
        "    assert.match(terminal, /await window\\.consultarCerebroIA\\(comando\\)/);\n",
        "    assert.doesNotMatch(terminal, /await window\\.consultarCerebroIA\\(comando\\)/);\n",
    ),
    (
        "    assert.match(terminal, /await window\\.hablarJarvis\\?\\.\\(\\s*casualResponse/);\n",
        "    assert.doesNotMatch(terminal, /await window\\.hablarJarvis\\?\\.\\(\\s*casualResponse/);\n",
    ),
)
for old_assertion, new_assertion in terminal_brain_assertion_replacements:
    if old_assertion in multifunction_test:
        multifunction_test = multifunction_test.replace(old_assertion, new_assertion, 1)
    if old_assertion in multifunction_test:
        raise SystemExit(f"SINGLE_BRAIN_STALE_MULTIFUNCTION_ASSERTION_REMAINS:{old_assertion.strip()}")
for required in (
    "assert.doesNotMatch(terminal, /Array\\.isArray\\(semantic\\.toolCalls\\)/);",
    "assert.doesNotMatch(terminal, /routeTerminalNaturalIntent/);",
    "assert.doesNotMatch(terminal, /TERMINAL_BRAIN_ROUTER_41_42/);",
    "assert.doesNotMatch(terminal, /await window\\.consultarCerebroIA\\(comando\\)/);",
    "assert.doesNotMatch(terminal, /await window\\.hablarJarvis\\?\\.\\(\\s*casualResponse/);",
):
    if required not in multifunction_test:
        raise SystemExit(f"SINGLE_BRAIN_MULTIFUNCTION_ASSERTION_MISSING:{required}")
write(multifunction_test_path, multifunction_test)


# 5) Keep existing repository-authority tests focused on deterministic UI/write
# governance while natural-language routing goes directly to the single core.
repo_authority_test_path = "tests/repo-authority-v2.test.cjs"
repo_authority_test = read(repo_authority_test_path)
repo_authority_replacements = (
    (
        "    assert.match(terminal, /hasProposalAdjustmentRequest/);\n",
        "    assert.doesNotMatch(terminal, /hasProposalAdjustmentRequest/);\n",
    ),
    (
        "    assert.match(terminal, /controlled_adjustment_prompt_from_visual_card/);\n",
        "    assert.doesNotMatch(terminal, /controlled_adjustment_prompt_from_visual_card/);\n",
    ),
)
for old_assertion, new_assertion in repo_authority_replacements:
    if old_assertion in repo_authority_test:
        repo_authority_test = repo_authority_test.replace(old_assertion, new_assertion, 1)
    if old_assertion in repo_authority_test:
        raise SystemExit(f"SINGLE_BRAIN_STALE_REPO_AUTHORITY_ASSERTION_REMAINS:{old_assertion.strip()}")

repo_router_test_start = 'test("terminal keeps natural repository analysis in the brain route", () => {'
repo_router_test_end = 'test("Codex V2 write path fails closed without governed repo.write runtime", () => {'
repo_router_test_replacement = '''test("terminal sends natural repository analysis directly to the single core route", () => {
    const terminal =
        fs.readFileSync(
            path.join(
                __dirname,
                "..",
                "gestia-terminal.html"
            ),
            "utf8"
        );

    const routerIndex =
        terminal.indexOf("routeTerminalNaturalIntent");

    const coreCallIndex =
        terminal.indexOf("await window.GestiaCore.procesarIntencion");

    assert.equal(routerIndex, -1);
    assert.ok(coreCallIndex > 0);
    assert.doesNotMatch(terminal, /GestiaCore\.analizarIntencionLigera/);
    assert.doesNotMatch(terminal, /BRAIN_DELEGATED/);
    assert.doesNotMatch(terminal, /Delegate freeform natural input to GestiaCore cognitive reasoning/);
    assert.match(terminal, /TERMINAL_CORE_FIRST/);
    assert.doesNotMatch(terminal, /terminal_global_repo_audit_41_44/);
    assert.doesNotMatch(terminal, /isExactGlobalRepoAuditCommand/);
    assert.doesNotMatch(terminal, /ANÁLISIS GLOBAL DEL REPOSITORIO SIA7/);
    assert.doesNotMatch(terminal, /legacyRepoBypassEnabled/);
    assert.doesNotMatch(terminal, /__JARVIS_ENABLE_LEGACY_EXACT_PATCH_BUILDER__/);
    assert.doesNotMatch(terminal, /legacyExactPatchBuilderEnabled/);
    assert.doesNotMatch(terminal, /__JARVIS_ENABLE_LEGACY_COMBINED_REPO_FILE_ROUTE__/);
    assert.doesNotMatch(terminal, /legacyCombinedRepoFileRouteEnabled/);
    assert.doesNotMatch(terminal, /combinedRepoFileMatch/);
});

'''
if repo_router_test_start in repo_authority_test:
    repo_authority_test = remove_between(
        repo_authority_test,
        repo_router_test_start,
        repo_router_test_end,
        repo_router_test_replacement,
    )
if repo_router_test_start in repo_authority_test:
    raise SystemExit("SINGLE_BRAIN_STALE_REPO_ROUTER_TEST_REMAINS")
for required in (
    'test("terminal sends natural repository analysis directly to the single core route"',
    "assert.equal(routerIndex, -1);",
    "assert.ok(coreCallIndex > 0);",
    "assert.doesNotMatch(terminal, /GestiaCore\\.analizarIntencionLigera/);",
    "assert.match(terminal, /TERMINAL_CORE_FIRST/);",
):
    if required not in repo_authority_test:
        raise SystemExit(f"SINGLE_BRAIN_REPO_AUTHORITY_ASSERTION_MISSING:{required}")
write(repo_authority_test_path, repo_authority_test)


print("SINGLE_SEMANTIC_BRAIN=jarvisSemanticPlan")
print("SINGLE_TOOL_EXECUTION_AUTHORITY=JarvisToolRuntime")
print("NEW_CONTRACTS_CREATED=0")
print("CHANGED_FILES=" + ",".join(CHANGED))
