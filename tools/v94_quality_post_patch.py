from pathlib import Path

# Cache-bust strings are not behavioral contracts.
path = Path('tests/jarvis-multifunction-tools.test.mjs')
text = path.read_text(encoding='utf-8')
replacements = [
    (
        '    assert.match(\n        terminal,\n        /jarvis-tools-v7-20260728-identity-fidelity-v106/\n    );',
        '    assert.match(terminal, /gestia-core\\/tools\\.runtime\\.js/);'
    ),
    (
        '    assert.match(\n        toolRuntime,\n        /sia7-test-outcome-evidence-v100-20260727/\n    );',
        '    assert.match(toolRuntime, /registerJarvisMultifunctionTools/);'
    ),
    (
        '    assert.match(terminal, /jarvis-tools-v7-20260728-identity-fidelity-v106/);',
        '    assert.match(terminal, /gestia-core\\/tools\\.runtime\\.js/);'
    ),
    (
        '    assert.match(terminal, /jarvis-tools-bridge-v7-20260726-chief-review-response-v93/);',
        '    assert.match(terminal, /gestia-core\\/tools\\.bridge\\.js/);'
    ),
    (
        '    assert.match(terminal, /sia7-identity-fidelity-v106-20260728/);',
        '    assert.match(terminal, /gestia-core\\/gestia-core\\.js/);'
    )
]
for old, new in replacements:
    text = text.replace(old, new)
path.write_text(text, encoding='utf-8')

# These repo-authority tests certified the retired local language brain:
# keyword candidate ranking, phrase-driven patch extraction, lexical CSS repair,
# pre-planner natural-language memory gates, and the old brain.engine fallback.
path = Path('tests/repo-authority-v2.test.cjs')
text = path.read_text(encoding='utf-8')
obsolete = [
    'agent loop follow-up focuses a strong product UI primary candidate',
    'agent loop preserves short B2B qualifiers when ranking repo candidates',
    'agent loop extracts exact patchPreview candidate from anchored read',
    'exact repo reads answer requested tool registrations from source structure',
    'verified executable definitions outrank files that only mention a tool',
    'read-only auth routing response explains causal route evidence',
    'agent loop patchPreview rewrite validator blocks malformed Tailwind classes',
    'agent loop compact replacement does not corrupt decimal Tailwind classes',
    'terminal has natural patchPreview follow-up memory gate before core planner',
    'brain delegates natural intent to the bounded semantic model planner'
]

for name in obsolete:
    marker = f'test("{name}"'
    start = text.find(marker)
    if start < 0:
        continue
    next_test = text.find('\ntest("', start + len(marker))
    if next_test < 0:
        text = text[:start].rstrip() + '\n'
    else:
        text = text[:start].rstrip() + '\n\n' + text[next_test + 1:]

contract = r'''

test("repo authority obeys the single semantic brain contract", () => {
    const core = fs.readFileSync(
        path.join(process.cwd(), "gestia-core", "gestia-core.js"),
        "utf8"
    );
    assert.match(core, /await buildJarvisMultifunctionToolCalls/);
    assert.match(core, /SEMANTIC_PLANNER_NO_EXECUTABLE_PLAN/);
    assert.doesNotMatch(core, /runCognitiveReasoning/);
    assert.doesNotMatch(core, /sincronizarCorralSemantico/);
    assert.doesNotMatch(core, /interpretarIntenciones/);
});
'''
if 'repo authority obeys the single semantic brain contract' not in text:
    text = text.rstrip() + contract
path.write_text(text.rstrip() + '\n', encoding='utf-8')

print('V94_QUALITY_POST_PATCH_APPLIED')
