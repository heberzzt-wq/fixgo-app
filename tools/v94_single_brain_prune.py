from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'PRUNE_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


def remove_file(path):
    target = ROOT / path
    if target.exists():
        target.unlink()


# Terminal HTML: remove parallel cognition and local-only brain bootstraps.
path = 'gestia-terminal.html'
text = read(path)
text = replace_once(
    text,
    '<script src="/gestia-core/jarvis/jarvis.local.bootstrap.js?v=fixgo-real-runtime-e2e-v1-20260805"></script>\n',
    '',
    'terminal-local-bootstrap'
)
text = replace_once(
    text,
    '<script src="gestia-core/jarvis/jarvis.cognition.engine.js?v=jarvis-runtime-macro-v2-20260618"></script>\n',
    '',
    'terminal-cognition-engine'
)
write(path, text)

# Terminal module: remove duplicate local-only runtime bootstrap.
path = 'gestia-terminal.js'
text = read(path)
local_block = '''// Local-only bootstrap for browser E2E against the production terminal entrypoint.\nif (["127.0.0.1", "localhost"].includes(window.location.hostname) && new URLSearchParams(window.location.search).get("jarvisLocal") === "1") {\n    window.__FIXGO_LOCAL_BOOTSTRAP_SEEN__ = true;\n    setTimeout(() => import("./gestia-core/jarvis/jarvis.local.runtime.js?v=fixgo-memory-isolation-v2-20260806")\n        .catch(error => console.error("[FIXGO_LOCAL_RUNTIME_LOAD_FAILED]", error)), 2500);\n}\n'''
text = replace_once(
    text,
    local_block,
    '',
    'terminal-js-local-runtime'
)
write(path, text)

# Package contracts: deleted brains cannot remain in syntax/CI entry lists.
path = 'package.json'
text = read(path)
text = replace_once(
    text,
    ' && node --check gestia-core/jarvis/jarvis.cognition.engine.js',
    '',
    'package-cognition-syntax'
)
text = replace_once(
    text,
    ' tests/jarvis-local-runtime.test.mjs',
    '',
    'package-local-runtime-test'
)
write(path, text)

# Delete the parallel cognition stack that is now disconnected.
for obsolete in [
    'gestia-core/jarvis/jarvis.cognition.engine.js',
    'gestia-core/jarvis/jarvis.local.bootstrap.js',
    'gestia-core/jarvis/jarvis.local.runtime.js',
    'gestia-core/jarvis/jarvis.local.routing.js',
    'tests/jarvis-local-runtime.test.mjs',
]:
    remove_file(obsolete)

print('V94_SINGLE_BRAIN_PRUNE_WAVE1_APPLIED')
