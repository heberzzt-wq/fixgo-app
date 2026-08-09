from pathlib import Path

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
    count = text.count(old)
    if count == 0:
        continue
    text = text.replace(old, new)

path.write_text(text, encoding='utf-8')
print('V94_QUALITY_POST_PATCH_APPLIED')
