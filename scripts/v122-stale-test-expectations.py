from pathlib import Path

ROOT = Path('.')
RELEASE = 'v94-generalist-execution-contract-v122-20260810'


def patch(path, old, new, expected=1):
    target = ROOT / path
    text = target.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'V122_STALE_EXPECTATION_COUNT:{path}:{count}:{expected}:{old}')
    target.write_text(text.replace(old, new), encoding='utf-8')

patch(
    'tests/jarvis-current-turn-freshness-v119.test.mjs',
    'v94-generalist-production-integrity-v121-20260810',
    RELEASE
)
patch(
    'tests/jarvis-semantic-memory-integrity.test.mjs',
    'v94-generalist-production-integrity-v121-20260810',
    RELEASE
)
patch(
    'tests/jarvis-fs-bridge-v2.test.mjs',
    'assert.equal(contract.branch, "v5.9-polish");',
    'assert.equal(contract.branch, "v94-media-v4n-negative-claims");'
)
patch(
    'tests/jarvis-fs-bridge-v2.test.mjs',
    '        /^v5\\.9-polish-forensic-/\n',
    '        /^v94-generalist-execution-contract-v122-20260810$/\n'
)

print('V122_STALE_TEST_EXPECTATIONS_ALIGNED')
