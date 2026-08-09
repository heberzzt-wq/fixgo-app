from pathlib import Path

RELEASE = "v94-semantic-memory-repo-v111-20260809"

html_path = Path("gestia-terminal.html")
html = html_path.read_text(encoding="utf-8")
replacements = {
    'fetch("/gestia-terminal.js")': f'fetch("/gestia-terminal.js?v={RELEASE}")',
    '/gestia-core/gestia-core.js?v=v94-marketing-real-delivery-v109-20260809': f'/gestia-core/gestia-core.js?v={RELEASE}',
    '/gestia-terminal.js?v=fixgo-real-runtime-e2e-v3-20260805': f'/gestia-terminal.js?v={RELEASE}',
}
for old, new in replacements.items():
    if old not in html:
        raise SystemExit(f"gestia-terminal.html missing cache-bust anchor: {old}")
    html = html.replace(old, new, 1)
html_path.write_text(html, encoding="utf-8")

core_path = Path("gestia-core/gestia-core.js")
core = core_path.read_text(encoding="utf-8")
core_replacements = {
    '/gestia-core/tools.runtime.js?v=v94-semantic-only-v108-20260809': f'/gestia-core/tools.runtime.js?v={RELEASE}',
    '/gestia-core/jarvis/jarvis.mission.orchestrator.js?v=v94-marketing-real-delivery-v109-20260809': f'/gestia-core/jarvis/jarvis.mission.orchestrator.js?v={RELEASE}',
}
for old, new in core_replacements.items():
    if old not in core:
        raise SystemExit(f"gestia-core.js missing cache-bust anchor: {old}")
    core = core.replace(old, new, 1)
core_path.write_text(core, encoding="utf-8")

# Keep a durable regression that prevents restoring the stale boot URLs that caused live drift.
test_path = Path("tests/jarvis-semantic-memory-integrity.test.mjs")
test_text = test_path.read_text(encoding="utf-8")
anchor = '''    assert.match(terminal, /KernelHeberto\\.inicializarAutoridad\\(\\)/);\n    assert.match(html, /memoria semántica de sesiones anteriores/);\n});\n'''
replacement = '''    assert.match(terminal, /KernelHeberto\\.inicializarAutoridad\\(\\)/);\n    assert.match(html, /memoria semántica de sesiones anteriores/);\n    assert.doesNotMatch(html, /fixgo-real-runtime-e2e-v3-20260805/);\n    assert.match(html, /v94-semantic-memory-repo-v111-20260809/);\n    const core = fs.readFileSync(new URL("../gestia-core/gestia-core.js", import.meta.url), "utf8");\n    assert.doesNotMatch(core, /tools\\.runtime\\.js\\?v=v94-semantic-only-v108-20260809/);\n    assert.match(core, /tools\\.runtime\\.js\\?v=v94-semantic-memory-repo-v111-20260809/);\n});\n'''
if anchor not in test_text:
    raise SystemExit("semantic memory boot regression anchor missing")
test_path.write_text(test_text.replace(anchor, replacement, 1), encoding="utf-8")

print(f"Terminal/Core cache-busted for {RELEASE}")
