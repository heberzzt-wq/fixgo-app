from pathlib import Path

path = Path("tests/jarvis-fs-bridge-v2.test.mjs")
text = path.read_text(encoding="utf-8")
old = 'assert.equal(description.version, "2.34.0-pdf-safe-placement");'
new = 'assert.equal(description.version, "2.35.0-read-only-document-extraction");'
if text.count(old) != 1:
    raise SystemExit("FS_BRIDGE_VERSION_CONTRACT_ANCHOR_MISSING")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
