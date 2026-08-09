from pathlib import Path

ROOT = Path('.')
CANDIDATES = [
    'gestia-core/brain.engine.js',
    'gestia-core/cognitive.bootstrap.js',
    'gestia-core/intent.engine.js',
    'gestia-core/intent.engine.v7.js',
    'gestia-core/semantic.engine.js',
    'gestia-core/plans.engine.js',
    'gestia-core/jarvis/jarvis-nlu-bridge.js',
    'gestia-core/jarvis/jarvis.cognition.engine.js',
    'gestia-core/jarvis/jarvis.intent.runtime.v7.js',
    'gestia-core/jarvis/jarvis.language.core.v5.js',
    'gestia-core/jarvis/jarvis.chief.architect.js',
    'gestia-core/jarvis/jarvis.vision.engine.js',
    'gestia-core/jarvis/jarvis.normalizer.js',
    'gestia-core/repo/repo.cognition.index.js',
    'jarvis-repo-intelligence.js',
    'modules/terminal/repo-cognition.js',
    'modules/terminal/runtime-intelligence.js',
    'gestia-core/nexo/nexo.semantic-planner-resilience.js',
    'gestia-core/nexo/nexo.mission.compiler.js',
    'gestia-core/nexo/nexo.mission.compiler.v2.js',
]
TEXT_SUFFIXES = {
    '.js', '.mjs', '.cjs', '.html', '.json', '.yml', '.yaml', '.md', '.txt'
}
SKIP_PARTS = {'.git', 'node_modules'}


def is_text_file(path: Path) -> bool:
    if any(part in SKIP_PARTS for part in path.parts):
        return False
    return path.suffix.lower() in TEXT_SUFFIXES


def read_text(path: Path):
    try:
        return path.read_text(encoding='utf-8')
    except Exception:
        return None


all_files = [p for p in ROOT.rglob('*') if p.is_file() and is_text_file(p)]

for candidate in CANDIDATES:
    target = ROOT / candidate
    if not target.exists():
        print(f'CANDIDATE\t{candidate}\tMISSING')
        continue

    basename = target.name
    references = []
    for path in all_files:
        rel = path.as_posix()
        if rel == candidate:
            continue
        text = read_text(path)
        if text is None:
            continue
        if candidate in text or basename in text:
            references.append(rel)

    runtime_refs = [
        ref for ref in references
        if not ref.startswith('tests/')
        and not ref.startswith('tools/')
        and not ref.startswith('.github/')
        and ref != 'package.json'
    ]
    support_refs = [ref for ref in references if ref not in runtime_refs]

    print(
        'CANDIDATE\t{}\tRUNTIME_REFS={}\tSUPPORT_REFS={}'.format(
            candidate,
            len(runtime_refs),
            len(support_refs),
        )
    )
    for ref in runtime_refs:
        print(f'  RUNTIME\t{ref}')
    for ref in support_refs:
        print(f'  SUPPORT\t{ref}')
