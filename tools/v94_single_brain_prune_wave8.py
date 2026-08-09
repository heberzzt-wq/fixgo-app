from pathlib import Path

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
        raise SystemExit(f'WAVE8_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


def replace_between(text, start, end, replacement, label):
    first = text.find(start)
    if first < 0:
        raise SystemExit(f'WAVE8_START_NOT_FOUND:{label}')
    last = text.find(end, first + len(start))
    if last < 0:
        raise SystemExit(f'WAVE8_END_NOT_FOUND:{label}')
    return text[:first] + replacement + text[last:]


# ---------------------------------------------------------------------------
# Terminal natural language already returns through GestiaCore at the top of
# execute(). Everything after that point is structured-only. Delete the dead
# lexical command router instead of keeping keyword/regex shadow brains.
# ---------------------------------------------------------------------------
path = 'gestia-terminal.js'
text = read(path)
text = replace_once(
    text,
    'naturalIntentAuthority: "brain",',
    'naturalIntentAuthority: "jarvisSemanticPlan",',
    'terminal-semantic-authority-label'
)
text = replace_once(
    text,
    'type: "BRAIN_AUTHORITY_EMPTY_CORE_RESULT",',
    'type: "SEMANTIC_AUTHORITY_EMPTY_CORE_RESULT",',
    'terminal-empty-result-label'
)
text = replace_once(
    text,
    'type: "BRAIN_AUTHORITY_REQUIRED",',
    'type: "SEMANTIC_AUTHORITY_REQUIRED",',
    'terminal-required-label'
)
text = text.replace(
    'GestiaCore/Brain Router',
    'GestiaCore/jarvisSemanticPlan'
)

router_start = '''/* =====================================================\n   🔥 INSERTAR AQUÍ (ANTES DE BLOQUEO)\n===================================================== */\n'''
router_end = '''    /* =====================================================\n       OPID\n    ===================================================== */\n'''
structured_context = '''/* =====================================================\n   STRUCTURED EXECUTION CONTEXT — NO LANGUAGE ROUTING\n===================================================== */\n\nconst ctx = {\n    userId: this.session?.uid,\n    tenantId: this.session?.tenantId || "uxmal39",\n    authorized: this.session?.authorized === true,\n    source: "GESTIA_TERMINAL_STRUCTURED_V16",\n    naturalIntentAuthority: "jarvisSemanticPlan",\n    lexicalFallbackAllowed: false\n};\n\n'''
text = replace_between(
    text,
    router_start,
    router_end,
    structured_context + router_end,
    'terminal-remove-dead-lexical-router'
)
write(path, text)


# ---------------------------------------------------------------------------
# NEXO UI is branding only. It no longer classifies natural phrases into local
# approval commands. Any natural-language approval/cancellation is interpreted
# by the same semantic authority as every other user instruction.
# ---------------------------------------------------------------------------
path = 'gestia-core/nexo/nexo.ui.branding.js'
text = read(path)

approval_start = '''const APPROVAL_BRIDGE_KEY = "__NEXO_APPROVAL_NORMALIZER__";\n\nconst EXACT_APPROVAL_COMMANDS = new Set([\n'''
branding_helper = '''function replaceExactText(selector, expected, replacement) {\n'''
text = replace_between(
    text,
    approval_start,
    branding_helper,
    branding_helper,
    'branding-remove-natural-approval-parser'
)
text = replace_once(
    text,
    '"1.1.0-approval-normalization-runtime-stamp";',
    '"2.0.0-branding-only-single-semantic-authority";',
    'branding-version'
)
text = text.replace(
    ' * También normaliza aprobaciones naturales antes de que el listener legacy las procese.\n',
    ' * No interpreta lenguaje natural ni decisiones de aprobación.\n'
)
text = text.replace(
    '    root.dataset.nexoApprovalNormalizer = "active";\n',
    ''
)
text = text.replace(
    '        approvalNormalizer: true,\n',
    '        semanticAuthority: "jarvisSemanticPlan",\n'
)
text = replace_once(
    text,
    '''    const approvalNormalizer =\n        installApprovalNormalizer();\n\n''',
    '',
    'branding-no-approval-install'
)
text = text.replace(
    '            approvalNormalizer,\n',
    ''
)
text = text.replace(
    '                approvalNormalizer?.uninstall?.();\n',
    ''
)
text = text.replace(
    '        approvalNormalizer,\n',
    ''
)
text = text.replace(
    '            approvalNormalizer?.uninstall?.();\n',
    ''
)
write(path, text)


# ---------------------------------------------------------------------------
# The former approval test now certifies that UI branding owns no language
# understanding. Keeping the file name avoids weakening the package test graph.
# ---------------------------------------------------------------------------
approval_test = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const source = fs.readFileSync(
    path.join(process.cwd(), "gestia-core/nexo/nexo.ui.branding.js"),
    "utf8"
);

test("NEXO UI branding contains no natural-language approval brain", () => {
    assert.doesNotMatch(source, /EXACT_APPROVAL_COMMANDS/);
    assert.doesNotMatch(source, /isNexoApprovalCommand/);
    assert.doesNotMatch(source, /normalizeNexoCommand/);
    assert.doesNotMatch(source, /APPROVAL_BRIDGE_KEY/);
    assert.doesNotMatch(source, /nexoApprovalNormalized/);
    assert.doesNotMatch(source, /input\.value\s*=\s*"proceder"/);
    assert.doesNotMatch(source, /\.test\s*\(/);
    assert.doesNotMatch(source, /\bapruebo\b|\barre\b|\bhazlo\b/);
});

test("NEXO UI branding declares the single semantic authority", () => {
    assert.match(source, /2\.0\.0-branding-only-single-semantic-authority/);
    assert.match(source, /semanticAuthority:\s*"jarvisSemanticPlan"/);
    assert.match(source, /replaceExactText/);
    assert.match(source, /__NEXO_RUNTIME_STAMP__/);
});
'''
write('tests/nexo-approval-normalization.test.mjs', approval_test)


# Extend the global single-authority contract to the UI and terminal legacy
# surface so these language routers cannot quietly return later.
path = 'tests/single-semantic-authority.test.mjs'
text = read(path)
append = r'''

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
'''
text = text.rstrip() + append + '\n'
write(path, text)

print('V94_SINGLE_BRAIN_PRUNE_WAVE8_APPLIED')
