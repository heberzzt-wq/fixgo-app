from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'WAVE3_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


def remove_file(path):
    target = ROOT / path
    if target.exists():
        target.unlink()


# These modules form a self-contained legacy V4 natural-language cognition
# subtree. After wave2, no active terminal/app entrypoint calls it.
path = 'package.json'
text = read(path)
for old, label in [
    (' && node --check gestia-core/jarvis/jarvis-nlu-bridge.js', 'package-nlu'),
    (' && node --check gestia-core/jarvis/jarvis.vision.engine.js', 'package-vision'),
    (' && node --check gestia-core/hubs/analysis.hub.js', 'package-analysis-hub'),
    (' && node --check gestia-core/jarvis/jarvis.orchestrator.js', 'package-old-orchestrator'),
    (' tests/jarvis-vision-repo-analysis.test.mjs', 'package-vision-test'),
]:
    text = replace_once(text, old, '', label)
write(path, text)

for obsolete in [
    'gestia-core/jarvis/jarvis.orchestrator.js',
    'gestia-core/jarvis/jarvis.vision.engine.js',
    'gestia-core/jarvis/jarvis-nlu-bridge.js',
    'gestia-core/jarvis/jarvis.dsl.js',
    'gestia-core/hubs/analysis.hub.js',
    'tests/jarvis-vision-repo-analysis.test.mjs',
]:
    remove_file(obsolete)

print('V94_SINGLE_BRAIN_PRUNE_WAVE3_APPLIED')
