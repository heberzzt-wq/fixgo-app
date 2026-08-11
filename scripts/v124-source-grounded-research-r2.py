from pathlib import Path

base = Path('scripts/v124-source-grounded-research.py')
namespace = {'__name__': '__main__', '__file__': str(base)}
exec(compile(base.read_text(encoding='utf-8'), str(base), 'exec'), namespace)

replacements = {
    'tests/jarvis-fs-bridge-v2.test.mjs': [
        (
            '2.40.0-page-evidence-failclosed-v123',
            '2.41.0-source-grounded-research-v124'
        ),
        (
            'v94-page-evidence-failclosed-v123-20260810',
            'v94-source-grounded-research-v124-20260810'
        )
    ],
    'tests/jarvis-generalist-execution-contract-v122.test.mjs': [
        (
            'v94-page-evidence-failclosed-v123-20260810',
            'v94-source-grounded-research-v124-20260810'
        )
    ]
}

for file, pairs in replacements.items():
    path = Path(file)
    source = path.read_text(encoding='utf-8')
    for old, new in pairs:
        count = source.count(old)
        if count != 1:
            raise SystemExit(f'V124_STALE_EXPECTATION_COUNT:{file}:{old}:{count}')
        source = source.replace(old, new, 1)
    path.write_text(source, encoding='utf-8')

print('V124_R2_EXPECTATIONS_UPDATED=TRUE')
