from pathlib import Path

path = Path("tests/jarvis-fs-bridge-v2.test.mjs")
text = path.read_text(encoding="utf-8")
old = 'assert.equal(description.version, "2.41.0-source-grounded-research-v124");'
new = 'assert.equal(description.version, "2.42.0-browser-network-media-fallback-v135");'
count = text.count(old)
if count != 1:
    raise SystemExit(f"expected exactly one stale bridge-version assertion, found {count}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("v135 bridge version contract aligned")
