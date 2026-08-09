from pathlib import Path

path = Path('tests/jarvis-multifunction-tools.test.mjs')
text = path.read_text(encoding='utf-8')
old = '''    assert.match(\n        brain,\n        /TOOL_PLANNER_ENABLED:\\s*false/\n    );'''
new = '''    assert.match(brain, /COMPATIBILITY_CANARY_ONLY/);\n    assert.match(\n        brain,\n        /semanticAuthority:\\s*"jarvisSemanticPlan"/\n    );\n    assert.match(brain, /alternateBrains:\\s*0/);\n    assert.doesNotMatch(brain, /TOOL_PLANNER_ENABLED/);\n    assert.doesNotMatch(brain, /globalThis\\.fetch\\s*=/);'''
count = text.count(old)
if count != 1:
    raise SystemExit(f'WAVE6_STALE_BRAIN_TEST_NOT_FOUND:{count}')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('V94_SINGLE_BRAIN_PRUNE_WAVE6_APPLIED')
