from pathlib import Path
import re


def replace(path, old, new, count=1):
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{path}: missing anchor ({actual}<{count}): {old[:120]!r}")
    target.write_text(text.replace(old, new, count), encoding="utf-8")


runtime_path = Path("gestia-core/tools.runtime.js")
runtime = runtime_path.read_text(encoding="utf-8")
legacy_scan = re.compile(
    r'''\nJarvisToolRuntime\.register\(\{\n\s*name:\s*"repo\.scan",\n\s*description:\s*"Escanea la estructura de un directorio específico y devuelve metadatos\.",.*?\n\}\);\n''',
    re.S,
)
runtime, removed = legacy_scan.subn("\n", runtime)
if removed < 1:
    raise SystemExit("legacy repo.scan registration was not found")
scan_count = runtime.count('name: "repo.scan"')
audit_count = runtime.count('name: "repo.audit"')
if scan_count != 1:
    raise SystemExit(f"repo.scan must have one active registration, found {scan_count}")
if audit_count != 1:
    raise SystemExit(f"repo.audit must have one active registration, found {audit_count}")
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

# Preserve exact repository file bytes when reading Git objects. Git metadata commands
# still trim their textual output, but source content must not lose leading/trailing lines.
replace(
    "jarvis-fs-bridge.js",
    '''function gitText(args = [], root = DEFAULT_ROOT, { allowFailure = false, maxBuffer = 16 * 1024 * 1024 } = {}) {\n    try {\n        return execFileSync("git", args, {\n            cwd: path.resolve(root),\n            encoding: "utf8",\n            stdio: ["ignore", "pipe", "pipe"],\n            maxBuffer\n        }).trim();''',
    '''function gitText(args = [], root = DEFAULT_ROOT, { allowFailure = false, maxBuffer = 16 * 1024 * 1024, trim = true } = {}) {\n    try {\n        const output = execFileSync("git", args, {\n            cwd: path.resolve(root),\n            encoding: "utf8",\n            stdio: ["ignore", "pipe", "pipe"],\n            maxBuffer\n        });\n        return trim ? output.trim() : output;'''
)
replace(
    "jarvis-fs-bridge.js",
    '''        { maxBuffer: Math.max(Number(maxBytes) || 300000, 1024 * 1024) * 2 }\n    );''',
    '''        { maxBuffer: Math.max(Number(maxBytes) || 300000, 1024 * 1024) * 2, trim: false }\n    );''',
    count=1
)

# Candidate ranking shares the graph cache but must resolve the requested repository/ref
# itself, otherwise a previous branch analysis could contaminate the next ranking call.
bridge_path = Path("jarvis-fs-bridge.js")
bridge = bridge_path.read_text(encoding="utf-8")
candidate_pattern = re.compile(
    r'''    app\.post\("/repo/candidates", async \(req, res\) => \{.*?\n    \}\);\n\n''',
    re.S,
)
candidate_route = r'''    app.post("/repo/candidates", async (req, res) => {
        try {
            const plannedFiles = Array.isArray(req.body?.plannedFiles)
                ? req.body.plannedFiles
                    .map(file => String(file || "").trim())
                    .filter(Boolean)
                : [];
            if (plannedFiles.length === 0) {
                return res.status(400).json({
                    ok: false,
                    status: "PLANNED_FILES_REQUIRED",
                    error: "PLANNED_FILES_REQUIRED"
                });
            }
            const maxFiles = Math.max(1, Math.min(5000, Number(req.body?.maxFiles) || 2500));
            const maxFileSizeBytes = Math.max(1000, Math.min(2000000, Number(req.body?.maxFileSizeBytes) || 800000));
            const resolved = resolveBridgeRepositoryTarget({
                target: req.body?.target || req.body?.url || "",
                ref: req.body?.ref || ""
            }, root);
            if (resolved.ok !== true) {
                return res.status(404).json({ ...resolved, version: JARVIS_FS_BRIDGE_VERSION });
            }
            const cacheKey = `${resolved.commit}:${maxFiles}:${maxFileSizeBytes}`;
            if (!repoGraphCache || req.body?.refresh === true || repoGraphCache.cacheKey !== cacheKey) {
                repoGraphCache = {
                    cacheKey,
                    maxFiles,
                    maxFileSizeBytes,
                    graph: buildGraphForResolvedTarget(resolved, { root, maxFiles, maxFileSizeBytes })
                };
            }
            const result = rankRepoCandidates({
                graph: repoGraphCache.graph,
                plannedFiles,
                limit: req.body?.limit || 8
            });
            return res.json({
                ...result,
                repositoryTarget: {
                    kind: resolved.kind,
                    provider: resolved.provider,
                    owner: resolved.owner || null,
                    repository: resolved.repository || null,
                    ref: resolved.ref,
                    commit: resolved.commit,
                    path: resolved.path || "",
                    objectType: resolved.objectType
                },
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(500).json({
                ok: false,
                status: "REPO_CANDIDATE_RANKING_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

'''
bridge, candidate_count = candidate_pattern.subn(candidate_route, bridge, count=1)
if candidate_count != 1:
    raise SystemExit(f"repo candidates route expected once, found {candidate_count}")
bridge_path.write_text(bridge, encoding="utf-8")

# Version change is intentional and the old test must certify the new contract.
replace(
    "tests/jarvis-fs-bridge-v2.test.mjs",
    '"2.35.0-read-only-document-extraction"',
    '"2.36.0-structural-repo-targets"',
    count=1
)

# Extend the new regression so exact source reads and ref-scoped candidate cache stay guarded.
test_path = Path("tests/jarvis-repo-target-runtime.test.mjs")
test_text = test_path.read_text(encoding="utf-8")
anchor = '''    assert.match(bridge, /resolveRepositorySelector/);\n});\n'''
replacement = '''    assert.match(bridge, /resolveRepositorySelector/);\n    assert.match(bridge, /trim: false/);\n    assert.match(bridge, /repoGraphCache\.cacheKey !== cacheKey/);\n    assert.match(bridge, /buildGraphForResolvedTarget\(resolved/);\n});\n'''
if anchor not in test_text:
    raise SystemExit("repo target regression anchor missing")
test_path.write_text(test_text.replace(anchor, replacement, 1), encoding="utf-8")

print("Legacy duplicates removed; ref reads/cache and version regression hardened")
