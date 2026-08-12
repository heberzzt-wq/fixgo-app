from pathlib import Path

path = Path('tests/jarvis-multifunction-tools.test.mjs')
text = path.read_text(encoding='utf-8')
old = '''    assert.equal(
        planner.version,
        "4.18.0-reel-mission-fidelity-v133"
    );'''
new = '''    assert.equal(
        planner.version,
        "4.19.0-reel-media-source-recovery-v136"
    );'''
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected exactly one stale planner version assertion, found {count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('v136 planner version contract aligned')
