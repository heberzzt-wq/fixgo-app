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

planner_path = Path('gestia-core/jarvis/jarvis.multifunction.planner.js')
planner = planner_path.read_text(encoding='utf-8')
old_url_scan = r'''    const matches =
        source.match(
            /https?:\/\/[^\s<>"'`]+/gi
        ) || [];'''
new_url_scan = '''    const matches = [];
    let cursor = 0;
    while (cursor < source.length) {
        const httpIndex =
            source.indexOf("http://", cursor);
        const httpsIndex =
            source.indexOf("https://", cursor);
        let start = -1;

        if (httpIndex < 0) start = httpsIndex;
        else if (httpsIndex < 0) start = httpIndex;
        else start = Math.min(httpIndex, httpsIndex);
        if (start < 0) break;

        let end = start;
        while (end < source.length) {
            const character = source[end];
            if (
                character.charCodeAt(0) <= 32 ||
                "<>\\\"'`".includes(character)
            ) {
                break;
            }
            end += 1;
        }
        const candidate =
            source.slice(start, end);
        if (candidate) matches.push(candidate);
        cursor = Math.max(end, start + 1);
        if (matches.length >= 16) break;
    }'''
count = planner.count(old_url_scan)
if count != 1:
    raise SystemExit(f'V124_STRUCTURAL_URL_SCAN_COUNT:{count}')
planner = planner.replace(old_url_scan, new_url_scan, 1)
planner_path.write_text(planner, encoding='utf-8')

print('V124_R2_EXPECTATIONS_UPDATED=TRUE')
print('V124_STRUCTURAL_URL_SCAN=TRUE')
