from pathlib import Path
import re

runtime_path = Path("gestia-core/tools.runtime.js")
runtime = runtime_path.read_text(encoding="utf-8")
legacy_scan = re.compile(
    r'''\nJarvisToolRuntime\.register\(\{\n\s*name:\s*"repo\.scan",\n\s*description:\s*"Escanea la estructura de un directorio específico y devuelve metadatos\.",.*?\n\}\);\n''',
    re.S,
)
runtime, removed = legacy_scan.subn("\n", runtime)
if removed < 1:
    raise SystemExit("legacy repo.scan registration was not found")
if runtime.count('name: "repo.scan"') != 1:
    raise SystemExit(f"repo.scan must have one active registration, found {runtime.count('name: \"repo.scan\"')}")
if runtime.count('name: "repo.audit"') != 1:
    raise SystemExit(f"repo.audit must have one active registration, found {runtime.count('name: \"repo.audit\"')}")
runtime_path.write_text(runtime, encoding="utf-8")

index_path = Path("modules/terminal/repo-bootstrap-index.js")
index = index_path.read_text(encoding="utf-8")
for key in ["jarvis.context.memory.v6.js", "analysis.hub.js"]:
    pattern = re.compile(
        rf'''\n?window\.__REPO_INDEX__\["{re.escape(key)}"\]\s*=\s*\{{.*?\n\s*\}};\n?''',
        re.S,
    )
    index = pattern.sub("\n", index)
    if f'window.__REPO_INDEX__["{key}"]' in index:
        raise SystemExit(f"stale repo index entry remained: {key}")
index_path.write_text(index, encoding="utf-8")

print("Legacy repo scan and stale memory/analysis index duplicates removed")
