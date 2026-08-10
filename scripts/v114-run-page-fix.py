from pathlib import Path

source_path = Path("scripts/v114-peninsula-page-fix.py")
source = source_path.read_text(encoding="utf-8")
label = '    "PAGE_ROUTE_DIGEST"\n)'
label_index = source.find(label)
if label_index < 0:
    raise SystemExit("V114_ROUTE_DIGEST_LABEL_MISSING")
call_start = source.rfind('\nreplace_once(\n    "jarvis-fs-bridge.js",', 0, label_index)
if call_start < 0:
    raise SystemExit("V114_ROUTE_DIGEST_CALL_MISSING")
call_end = label_index + len(label)
replacement = r'''
# Insert physical byte/SHA verification using a stable short anchor.
_bridge_source = read("jarvis-fs-bridge.js")
_bridge_anchor = "            const artifact = registerArtifact({ root, output:"
if _bridge_source.count(_bridge_anchor) < 1:
    raise SystemExit("PAGE_ROUTE_DIGEST_ANCHOR_MISSING")
_page_route_start = _bridge_source.find('app.post("/page/create"')
_page_artifact_index = _bridge_source.find(_bridge_anchor, _page_route_start)
if _page_route_start < 0 or _page_artifact_index < 0:
    raise SystemExit("PAGE_ROUTE_DIGEST_PAGE_ARTIFACT_MISSING")
_digest_block = '''            const written = fs.readFileSync(target);
            const sha256 = createHash("sha256").update(written).digest("hex");
            if (written.length !== verification.bytes) {
                fs.rmSync(target, { force: true });
                throw new Error("PAGE_BYTE_COUNT_MISMATCH");
            }
'''
_bridge_source = (
    _bridge_source[:_page_artifact_index]
    + _digest_block
    + _bridge_source[_page_artifact_index:]
)
write("jarvis-fs-bridge.js", _bridge_source)
'''
patched = source[:call_start] + replacement + source[call_end:]
temp = Path("/tmp/v114-peninsula-page-fix-patched.py")
temp.write_text(patched, encoding="utf-8")
exec(compile(patched, str(temp), "exec"), {"__name__": "__main__", "__file__": str(temp)})
