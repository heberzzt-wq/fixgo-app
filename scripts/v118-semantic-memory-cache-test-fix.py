from pathlib import Path

path = Path("tests/jarvis-semantic-memory-integrity.test.mjs")
source = path.read_text(encoding="utf-8")
old = '    assert.match(core, /tools\\.runtime\\.js\\?v=v94-page-browser-fallback-v115-20260809/);\n'
new = '    assert.match(core, /tools\\.runtime\\.js\\?v=v94-page-request-contract-v118-20260810/);\n'
if source.count(old) != 1:
    raise SystemExit(f"expected one v115 runtime cache identity assertion, found {source.count(old)}")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
print("v118 semantic memory cache identity regression aligned")
