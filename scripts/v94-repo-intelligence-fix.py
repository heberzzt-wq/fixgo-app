from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def replace(path, old, new, count=1):
    text = read(path)
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{path}: missing anchor ({actual}<{count}): {old[:140]!r}")
    write(path, text.replace(old, new, count))


def regex_replace(path, pattern, replacement, count=1, flags=re.S):
    text = read(path)
    next_text, actual = re.subn(pattern, replacement, text, count=count, flags=flags)
    if actual != count:
        raise SystemExit(f"{path}: regex expected {count}, got {actual}: {pattern[:140]!r}")
    write(path, next_text)


# -----------------------------------------------------------------------------
# Bridge: structural GitHub target resolution + ref-specific AST graph/read.
# -----------------------------------------------------------------------------
replace(
    "jarvis-fs-bridge.js",
    '''import {\n    buildRepoIntelligence,\n    rankRepoCandidates\n} from "./jarvis-repo-intelligence.js";''',
    '''import {\n    buildRepoIntelligence,\n    rankRepoCandidates\n} from "./jarvis-repo-intelligence.js";\nimport {\n    parseRepositoryTarget,\n    resolveRepositorySelector,\n    normalizeRepositoryRefs\n} from "./gestia-core/repo/repo.target.js";'''
)
replace(
    "jarvis-fs-bridge.js",
    '"2.35.0-read-only-document-extraction";',
    '"2.36.0-structural-repo-targets";'
)
bridge_helpers = r'''
function gitText(args = [], root = DEFAULT_ROOT, { allowFailure = false, maxBuffer = 16 * 1024 * 1024 } = {}) {
    try {
        return execFileSync("git", args, {
            cwd: path.resolve(root),
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer
        }).trim();
    } catch (error) {
        if (allowFailure) return "";
        throw error;
    }
}

function repositoryRefs(root = DEFAULT_ROOT) {
    const output = gitText([
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads",
        "refs/remotes/origin"
    ], root, { allowFailure: true });
    return normalizeRepositoryRefs(output.split(/\r?\n/).filter(Boolean));
}

function resolveCommitForRef(ref = "", root = DEFAULT_ROOT) {
    const cleanRef = String(ref || "").trim().replace(/^refs\/heads\//, "").replace(/^origin\//, "");
    const candidates = [...new Set([
        cleanRef,
        cleanRef ? `origin/${cleanRef}` : ""
    ].filter(Boolean))];
    for (const candidate of candidates) {
        const commit = gitText(["rev-parse", "--verify", `${candidate}^{commit}`], root, { allowFailure: true });
        if (commit) return { ok: true, ref: cleanRef || candidate, resolvedRef: candidate, commit };
    }
    if (cleanRef) {
        const fetched = gitText(["fetch", "--quiet", "origin", cleanRef], root, { allowFailure: true });
        void fetched;
        const commit = gitText(["rev-parse", "--verify", "FETCH_HEAD^{commit}"], root, { allowFailure: true });
        if (commit) return { ok: true, ref: cleanRef, resolvedRef: "FETCH_HEAD", commit, fetched: true };
    }
    return { ok: false, status: "REPOSITORY_REF_NOT_FOUND", error: "REPOSITORY_REF_NOT_FOUND", ref: cleanRef };
}

export function resolveBridgeRepositoryTarget({ target = "", ref = "", file = "" } = {}, root = DEFAULT_ROOT) {
    const git = readGitIdentity(root);
    const refs = repositoryRefs(root);
    const rawTarget = String(target || "").trim();
    const explicitRef = String(ref || "").trim().replace(/^origin\//, "");
    let parsed = rawTarget
        ? parseRepositoryTarget(rawTarget)
        : {
            ok: true,
            kind: "local_repository",
            provider: "local",
            raw: "",
            ref: explicitRef || git.branch,
            path: String(file || "").trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "")
        };

    if (parsed.ok !== true) return parsed;
    if (parsed.kind === "github_selector") {
        parsed = resolveRepositorySelector(parsed, refs);
        if (parsed.ok !== true) return parsed;
    }
    if (parsed.provider === "github" && explicitRef && !parsed.ref) {
        parsed = { ...parsed, ref: explicitRef, kind: parsed.path ? "github_path" : "github_ref" };
    }
    const selectedRef = String(parsed.ref || explicitRef || git.branch || "HEAD").trim();
    const commitResult = selectedRef === "HEAD" && git.head
        ? { ok: true, ref: selectedRef, resolvedRef: "HEAD", commit: git.head }
        : resolveCommitForRef(selectedRef, root);
    if (commitResult.ok !== true) return { ...parsed, ...commitResult };

    const normalizedPath = String(parsed.path || file || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/^\//, "");
    let objectType = normalizedPath ? "" : "tree";
    if (normalizedPath) {
        objectType = gitText(
            ["cat-file", "-t", `${commitResult.commit}:${normalizedPath}`],
            root,
            { allowFailure: true }
        );
        if (!objectType) {
            return {
                ...parsed,
                ...commitResult,
                ok: false,
                status: "REPOSITORY_PATH_NOT_FOUND",
                error: "REPOSITORY_PATH_NOT_FOUND",
                path: normalizedPath,
                refs
            };
        }
    }
    return {
        ...parsed,
        ...commitResult,
        ok: true,
        status: "REPOSITORY_TARGET_RESOLVED",
        ref: commitResult.ref || selectedRef,
        path: normalizedPath,
        objectType,
        repositoryRoot: path.resolve(root),
        refs
    };
}

function buildGraphForResolvedTarget(resolved, { root = DEFAULT_ROOT, maxFiles = 2500, maxFileSizeBytes = 800000 } = {}) {
    if (!resolved?.ok || !resolved.commit) throw new Error("REPOSITORY_TARGET_NOT_RESOLVED");
    const currentHead = gitText(["rev-parse", "HEAD"], root, { allowFailure: true });
    if (resolved.commit === currentHead) {
        return buildRepoIntelligence({ root, maxFiles, maxFileSizeBytes });
    }
    const worktree = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-repo-ref-"));
    try {
        gitText(["worktree", "add", "--detach", "--force", worktree, resolved.commit], root);
        return buildRepoIntelligence({ root: worktree, maxFiles, maxFileSizeBytes });
    } finally {
        gitText(["worktree", "remove", "--force", worktree], root, { allowFailure: true });
        fs.rmSync(worktree, { recursive: true, force: true });
    }
}

function readResolvedRepositoryFile(resolved, { root = DEFAULT_ROOT, maxBytes = 300000, lineRange = null } = {}) {
    if (!resolved?.ok || !resolved.commit || !resolved.path) throw new Error("REPOSITORY_FILE_TARGET_REQUIRED");
    if (resolved.objectType !== "blob") throw new Error("REPOSITORY_TARGET_NOT_FILE");
    const content = gitText(
        ["show", `${resolved.commit}:${resolved.path}`],
        root,
        { maxBuffer: Math.max(Number(maxBytes) || 300000, 1024 * 1024) * 2 }
    );
    const size = Buffer.byteLength(content, "utf8");
    if (size > Number(maxBytes) && !lineRange) throw new Error("FILE_TOO_LARGE");
    const ranged = applyReadLineRange(content, lineRange);
    if (Buffer.byteLength(ranged.content, "utf8") > Number(maxBytes)) throw new Error("FILE_TOO_LARGE");
    return { ...ranged, size: Buffer.byteLength(ranged.content, "utf8"), totalSize: size };
}
'''
replace(
    "jarvis-fs-bridge.js",
    '''function normalizeRelativePath(file) {''',
    bridge_helpers + '''\nfunction normalizeRelativePath(file) {'''
)

repo_routes = r'''    app.post("/repo/resolve-target", async (req, res) => {
        try {
            const resolved = resolveBridgeRepositoryTarget({
                target: req.body?.target || req.body?.url || "",
                ref: req.body?.ref || "",
                file: req.body?.file || req.body?.path || ""
            }, root);
            return res.status(resolved.ok === true ? 200 : 404).json({
                ...resolved,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(400).json({ ok: false, status: "REPOSITORY_TARGET_RESOLUTION_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

    app.post("/repo/graph", async (req, res) => {
        try {
            const maxFiles = Math.max(1, Math.min(5000, Number(req.body?.maxFiles) || 2500));
            const maxFileSizeBytes = Math.max(1000, Math.min(2000000, Number(req.body?.maxFileSizeBytes) || 800000));
            const refresh = req.body?.refresh === true;
            const target = req.body?.target || req.body?.url || "";
            const ref = req.body?.ref || "";
            const resolved = resolveBridgeRepositoryTarget({ target, ref }, root);
            if (resolved.ok !== true) {
                return res.status(404).json({ ...resolved, version: JARVIS_FS_BRIDGE_VERSION });
            }
            const cacheKey = `${resolved.commit}:${maxFiles}:${maxFileSizeBytes}`;
            if (!repoGraphCache || refresh || repoGraphCache.cacheKey !== cacheKey) {
                repoGraphCache = {
                    cacheKey,
                    maxFiles,
                    maxFileSizeBytes,
                    graph: buildGraphForResolvedTarget(resolved, { root, maxFiles, maxFileSizeBytes })
                };
            }
            const transportNodes = Object.fromEntries(
                Object.entries(repoGraphCache.graph.nodes || {}).map(([file, node]) => {
                    const { literals: privateLiterals, ...safeNode } = node;
                    return [file, safeNode];
                })
            );
            return res.json({
                ...repoGraphCache.graph,
                nodes: transportNodes,
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
                cache: refresh ? "REFRESHED" : "READY",
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(500).json({ ok: false, status: "REPO_GRAPH_FAILED", error: error.message, version: JARVIS_FS_BRIDGE_VERSION });
        }
    });

'''
regex_replace(
    "jarvis-fs-bridge.js",
    r'\s+app\.post\("/repo/graph", async \(req, res\) => \{.*?\n\s+app\.post\("/repo/candidates",',
    "\n" + repo_routes + '    app.post("/repo/candidates",',
    count=1
)
read_target_route = r'''    app.post("/repo/read-target", async (req, res) => {
        try {
            const lineRange = normalizeReadLineRange({
                startLine: req.body?.startLine,
                endLine: req.body?.endLine,
                fromLine: req.body?.fromLine,
                toLine: req.body?.toLine
            });
            const resolved = resolveBridgeRepositoryTarget({
                target: req.body?.target || req.body?.url || "",
                ref: req.body?.ref || "",
                file: req.body?.file || req.body?.path || ""
            }, root);
            if (resolved.ok !== true) {
                return res.status(404).json({ ...resolved, version: JARVIS_FS_BRIDGE_VERSION });
            }
            if (!resolved.path || resolved.objectType !== "blob") {
                return res.status(400).json({
                    ok: false,
                    status: "REPOSITORY_TARGET_NOT_FILE",
                    error: "REPOSITORY_TARGET_NOT_FILE",
                    repositoryTarget: resolved,
                    version: JARVIS_FS_BRIDGE_VERSION
                });
            }
            const read = readResolvedRepositoryFile(resolved, {
                root,
                maxBytes: req.body?.maxBytes || 300000,
                lineRange
            });
            return res.json({
                ok: true,
                status: "REPOSITORY_FILE_READ",
                file: resolved.path,
                path: resolved.path,
                ...read,
                repositoryTarget: {
                    kind: resolved.kind,
                    ref: resolved.ref,
                    commit: resolved.commit,
                    path: resolved.path,
                    objectType: resolved.objectType
                },
                source: "jarvis_fs_bridge_git_object_read_v1",
                version: JARVIS_FS_BRIDGE_VERSION
            });
        } catch (error) {
            return res.status(error.message === "FILE_TOO_LARGE" ? 413 : 400).json({
                ok: false,
                status: "REPOSITORY_FILE_READ_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });

'''
replace(
    "jarvis-fs-bridge.js",
    '''        app.post("/read", async (req, res) => {''',
    read_target_route + '''        app.post("/read", async (req, res) => {'''
)

# -----------------------------------------------------------------------------
# Browser runtime: live graph is repo authority; URLs are not file paths.
# -----------------------------------------------------------------------------
replace(
    "gestia-core/tools.runtime.js",
    '''import {\n    analyzeRepoSourceStructure,\n    buildExecutableSourceView,\n    extractQualifiedSourceIdentifiers\n} from "./repo/repo.source.structure.js?v=sia7-explicit-repo-targets-v3-20260724";''',
    '''import {\n    analyzeRepoSourceStructure,\n    buildExecutableSourceView,\n    extractQualifiedSourceIdentifiers\n} from "./repo/repo.source.structure.js?v=sia7-explicit-repo-targets-v3-20260724";\nimport {\n    parseRepositoryTarget\n} from "./repo/repo.target.js?v=v94-structural-repo-target-v1-20260809";'''
)
repo_audit_scan = r'''JarvisToolRuntime.register({
    name: "repo.audit",
    description: "Audita el repositorio real desde el grafo AST del bridge; nunca usa el indice manual como prueba de existencia.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_AUDIT_RESULT_V8",
    execute: async (args = {}) => {
        if (!window.JarvisLocalBridge?.buildRepoGraph) {
            return { ok: false, status: "LOCAL_BRIDGE_REQUIRED", error: "LIVE_REPO_GRAPH_REQUIRED", tool: "repo.audit" };
        }
        const graph = await window.JarvisLocalBridge.buildRepoGraph({
            target: args.target || args.url || args.repository || "",
            ref: args.ref || "",
            refresh: args.refresh === true,
            maxFiles: args.maxFiles || 2500,
            maxFileSizeBytes: args.maxFileSizeBytes || 800000,
            source: "repo_audit_live_graph_v8"
        });
        if (graph?.ok !== true || Number(graph?.summary?.filesScanned || 0) < 1) {
            return { ...graph, ok: false, status: graph?.status || "REPO_EVIDENCE_UNAVAILABLE", error: graph?.error || "REPO_EVIDENCE_UNAVAILABLE", tool: "repo.audit" };
        }
        return {
            ok: true,
            success: true,
            status: "REPO_AUDIT_READY",
            source: "live_repo_ast_graph",
            repositoryTarget: graph.repositoryTarget || null,
            total: Number(graph.summary.filesScanned),
            summary: graph.summary,
            files: Object.keys(graph.nodes || {}).slice(0, 1000),
            duplicateEndpoints: graph.duplicateEndpoints || [],
            tool: "repo.audit"
        };
    }
});

JarvisToolRuntime.register({
    name: "repo.scan",
    description: "Escanea archivos reales desde el grafo AST vivo; el indice manual solo puede aportar metadata secundaria.",
    mutates: false,
    requiresApproval: false,
    output: "REPO_SCAN_RESULT_V8",
    execute: async (args = {}) => {
        if (!window.JarvisLocalBridge?.buildRepoGraph) {
            return { ok: false, status: "LOCAL_BRIDGE_REQUIRED", error: "LIVE_REPO_GRAPH_REQUIRED", tool: "repo.scan" };
        }
        const graph = await window.JarvisLocalBridge.buildRepoGraph({
            target: args.target || args.url || args.repository || "",
            ref: args.ref || "",
            refresh: args.refresh === true,
            maxFiles: args.maxFiles || 2500,
            maxFileSizeBytes: args.maxFileSizeBytes || 800000,
            source: "repo_scan_live_graph_v8"
        });
        if (graph?.ok !== true) return { ...graph, ok: false, tool: "repo.scan" };
        const requestedModule = String(args.module || "").trim();
        const requestedType = String(args.type || "").trim();
        const files = Object.values(graph.nodes || {}).filter(node => {
            if (requestedModule && !String(node.file || "").includes(requestedModule)) return false;
            if (requestedType === "test" && node.isTest !== true) return false;
            if (requestedType === "runtime" && node.isTest === true) return false;
            return true;
        }).map(node => ({
            file: node.file,
            path: node.file,
            bytes: node.bytes,
            dependencies: node.dependencies || [],
            dependents: node.dependents || [],
            relatedTests: node.relatedTests || [],
            verified: true,
            source: "live_repo_ast_graph"
        }));
        return {
            ok: true,
            success: true,
            status: "REPO_SCAN_READY",
            source: "live_repo_ast_graph",
            repositoryTarget: graph.repositoryTarget || null,
            total: files.length,
            files,
            summary: graph.summary,
            tool: "repo.scan"
        };
    }
});
'''
regex_replace(
    "gestia-core/tools.runtime.js",
    r'// Registro de herramientas Read-Only iniciales.*?// ==========================================\n// REPO TOOL PACK V7\n// ==========================================\n',
    '// Registro de herramientas Read-Only iniciales\n' + repo_audit_scan + '\n// ==========================================\n// REPO TOOL PACK V8\n// ==========================================\n',
    count=1
)

# Bridge client methods all derive from one identity-checked request channel.
bridge_clients = r'''
window.JarvisLocalBridge.readFile ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson("/read", payload, { timeoutMs: payload.timeoutMs || 30000 });
};
window.JarvisLocalBridge.grepRepo ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson("/grep", payload, { timeoutMs: payload.timeoutMs || 30000 });
};
window.JarvisLocalBridge.buildRepoGraph ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson("/repo/graph", payload, { timeoutMs: payload.timeoutMs || 90000 });
};
window.JarvisLocalBridge.rankRepoCandidates ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson("/repo/candidates", payload, { timeoutMs: payload.timeoutMs || 90000 });
};
window.JarvisLocalBridge.resolveRepoTarget ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson("/repo/resolve-target", payload, { timeoutMs: payload.timeoutMs || 30000 });
};
window.JarvisLocalBridge.readRepoTarget ||= async function(payload = {}) {
    return await window.JarvisLocalBridge.requestJson("/repo/read-target", payload, { timeoutMs: payload.timeoutMs || 30000 });
};

'''
replace(
    "gestia-core/tools.runtime.js",
    '''window.JarvisLocalBridge.prepareWrite ||= async function(payload = {}) {''',
    bridge_clients + '''window.JarvisLocalBridge.prepareWrite ||= async function(payload = {}) {'''
)

remote_read_block = r'''
        const structuralTarget = parseRepositoryTarget(file);
        if (structuralTarget?.ok === true && structuralTarget.provider === "github") {
            if (!window.JarvisLocalBridge?.resolveRepoTarget || !window.JarvisLocalBridge?.buildRepoGraph) {
                return { ok: false, status: "LOCAL_BRIDGE_REQUIRED", error: "REPOSITORY_TARGET_BRIDGE_REQUIRED", target: file, tool: "repo.read" };
            }
            const resolvedTarget = await window.JarvisLocalBridge.resolveRepoTarget({ target: file, source: "repo_read_structural_target_v8" });
            if (resolvedTarget?.ok !== true) {
                return { ...resolvedTarget, ok: false, target: file, tool: "repo.read" };
            }
            if (!resolvedTarget.path || resolvedTarget.objectType === "tree") {
                const graph = await window.JarvisLocalBridge.buildRepoGraph({ target: file, refresh: args.refresh === true, source: "repo_read_repository_reference_v8" });
                if (graph?.ok !== true) return { ...graph, ok: false, target: file, tool: "repo.read" };
                return {
                    ok: true,
                    success: true,
                    status: "REPOSITORY_REFERENCE_ANALYZED",
                    target: file,
                    repositoryTarget: graph.repositoryTarget || resolvedTarget,
                    summary: graph.summary,
                    files: Object.keys(graph.nodes || {}).slice(0, 1000),
                    note: "La referencia apunta a un repositorio o rama, no a un archivo; se analizó el árbol real en lugar de producir FILE_NOT_FOUND.",
                    tool: "repo.read"
                };
            }
            const remoteRead = await window.JarvisLocalBridge.readRepoTarget({
                target: file,
                maxBytes: args.maxBytes || 300000,
                ...(requestedLineRange || {}),
                source: "repo_read_git_object_v8"
            });
            if (remoteRead?.ok !== true) return { ...remoteRead, ok: false, target: file, tool: "repo.read" };
            return {
                ...remoteRead,
                ok: true,
                success: true,
                sourceStructure: analyzeRepoSourceStructure(remoteRead.content || ""),
                numberedContent: numberedSourceContent(remoteRead.content || "", remoteRead.startLine || 1),
                tool: "repo.read"
            };
        }
'''
replace(
    "gestia-core/tools.runtime.js",
    '''        const hasRequestedLineRange =\n            Boolean(\n                requestedStartLine ||\n                requestedEndLine\n            );''',
    '''        const hasRequestedLineRange =\n            Boolean(\n                requestedStartLine ||\n                requestedEndLine\n            );'''
)
# Insert after requestedLineRange exists, before applyRequestedLineRange helper.
replace(
    "gestia-core/tools.runtime.js",
    '''        const applyRequestedLineRange =\n            function(result = {}) {''',
    remote_read_block + '''\n        const applyRequestedLineRange =\n            function(result = {}) {'''
)

# Structural URL search returns repository evidence, never searches the literal URL as source text.
remote_search_block = r'''
        const structuralSearchTarget = parseRepositoryTarget(query);
        if (structuralSearchTarget?.ok === true && structuralSearchTarget.provider === "github") {
            if (!window.JarvisLocalBridge?.buildRepoGraph) {
                return { ok: false, success: false, status: "LOCAL_BRIDGE_REQUIRED", error: "LIVE_REPO_GRAPH_REQUIRED", query, tool: "repo.search" };
            }
            const graph = await window.JarvisLocalBridge.buildRepoGraph({ target: query, refresh: true, source: "repo_search_structural_target_v8" });
            if (graph?.ok !== true) return { ...graph, ok: false, query, tool: "repo.search" };
            const files = Object.keys(graph.nodes || {});
            return {
                ok: true,
                success: true,
                status: "REPOSITORY_REFERENCE_ANALYZED",
                query,
                repositoryTarget: graph.repositoryTarget || null,
                summary: graph.summary,
                results: files.slice(0, 1000).map(file => ({ file, path: file, verified: true, source: "live_repo_ast_graph" })),
                totalResults: files.length,
                totalFilesScanned: Number(graph.summary?.filesScanned || files.length),
                matches: [],
                metadataHints: [],
                tool: "repo.search"
            };
        }
'''
replace(
    "gestia-core/tools.runtime.js",
    '''        const normalizeSearchText =\n            value =>''',
    remote_search_block + '''\n        const normalizeSearchText =\n            value =>'''
)

remote_impact_block = r'''
        const structuralImpactTarget = parseRepositoryTarget(cleanFile);
        if (structuralImpactTarget?.ok === true && structuralImpactTarget.provider === "github") {
            if (!window.JarvisLocalBridge?.buildRepoGraph) {
                return { ok: false, status: "LOCAL_BRIDGE_REQUIRED", error: "LIVE_REPO_GRAPH_REQUIRED", requestedFile: cleanFile, tool: "repo.impact" };
            }
            const graph = await window.JarvisLocalBridge.buildRepoGraph({ target: cleanFile, refresh: args.refresh === true, source: "repo_impact_structural_target_v8" });
            if (graph?.ok !== true) return { ...graph, ok: false, requestedFile: cleanFile, tool: "repo.impact" };
            const targetPath = graph.repositoryTarget?.path || "";
            const node = targetPath ? graph.nodes?.[targetPath] : null;
            if (targetPath && !node) return { ok: false, status: "REPOSITORY_PATH_NOT_IN_GRAPH", requestedFile: cleanFile, repositoryTarget: graph.repositoryTarget, tool: "repo.impact" };
            const hotspots = Object.values(graph.nodes || {})
                .map(item => ({ file: item.file, dependents: (item.dependents || []).length, dependencies: (item.dependencies || []).length, relatedTests: item.relatedTests || [] }))
                .sort((left, right) => (right.dependents + right.dependencies) - (left.dependents + left.dependencies))
                .slice(0, 20);
            return {
                ok: true,
                success: true,
                status: targetPath ? "IMPACT_READY_LIVE_REF" : "REPOSITORY_IMPACT_READY",
                requestedFile: cleanFile,
                resolvedFile: targetPath || null,
                repositoryTarget: graph.repositoryTarget,
                summary: graph.summary,
                dependencies: node?.dependencies || [],
                dependents: node?.dependents || [],
                relatedTests: node?.relatedTests || [],
                hotspots,
                source: "live_repo_ast_graph",
                tool: "repo.impact"
            };
        }
'''
replace(
    "gestia-core/tools.runtime.js",
    '''        const basename =\n            cleanFile''',
    remote_impact_block + '''\n        const basename =\n            cleanFile''',
    count=1
)

remote_diagnose_block = r'''
        const structuralDiagnoseTarget = parseRepositoryTarget(normalizedFile);
        if (structuralDiagnoseTarget?.ok === true && structuralDiagnoseTarget.provider === "github") {
            if (!window.JarvisLocalBridge?.buildRepoGraph) {
                return { ok: false, success: false, status: "LOCAL_BRIDGE_REQUIRED", error: "LIVE_REPO_GRAPH_REQUIRED", requestedFile: normalizedFile, tool: "repo.diagnose" };
            }
            const graph = await window.JarvisLocalBridge.buildRepoGraph({ target: normalizedFile, refresh: args.refresh === true, source: "repo_diagnose_structural_target_v8" });
            if (graph?.ok !== true) return { ...graph, ok: false, requestedFile: normalizedFile, tool: "repo.diagnose" };
            const targetPath = graph.repositoryTarget?.path || "";
            if (!targetPath) {
                const hotspots = Object.values(graph.nodes || {})
                    .map(item => ({ file: item.file, dependencies: (item.dependencies || []).length, dependents: (item.dependents || []).length, tests: (item.relatedTests || []).length }))
                    .sort((left, right) => (right.dependencies + right.dependents) - (left.dependencies + left.dependents))
                    .slice(0, 20);
                return {
                    ok: true,
                    success: true,
                    status: "REPOSITORY_DIAGNOSIS_READY",
                    requestedFile: normalizedFile,
                    repositoryTarget: graph.repositoryTarget,
                    summary: graph.summary,
                    hotspots,
                    duplicateEndpoints: graph.duplicateEndpoints || [],
                    source: "live_repo_ast_graph",
                    tool: "repo.diagnose"
                };
            }
            if (graph.repositoryTarget?.objectType !== "blob") {
                return {
                    ok: true,
                    success: true,
                    status: "REPOSITORY_DIRECTORY_DIAGNOSIS_READY",
                    requestedFile: normalizedFile,
                    repositoryTarget: graph.repositoryTarget,
                    summary: graph.summary,
                    files: Object.keys(graph.nodes || {}).filter(file => file === targetPath || file.startsWith(`${targetPath}/`)).slice(0, 1000),
                    source: "live_repo_ast_graph",
                    tool: "repo.diagnose"
                };
            }
            const remoteRead = await window.JarvisLocalBridge.readRepoTarget({ target: normalizedFile, maxBytes: args.maxBytes || 300000, source: "repo_diagnose_git_object_v8" });
            if (remoteRead?.ok !== true) return { ...remoteRead, ok: false, requestedFile: normalizedFile, tool: "repo.diagnose" };
            args = { ...args, file: targetPath, path: targetPath, __resolvedRemoteRead: remoteRead };
        }
'''
replace(
    "gestia-core/tools.runtime.js",
    '''        const indexedFile =\n            window.__REPO_INDEX__?.[normalizedFile] ||''',
    remote_diagnose_block + '''\n        const indexedFile =\n            window.__REPO_INDEX__?.[normalizedFile] ||''',
    count=1
)
# If remote file was resolved, feed its content into the existing detailed diagnostics.
replace(
    "gestia-core/tools.runtime.js",
    '''        let content =\n            "";\n\n        let readSource =\n            "unavailable";''',
    '''        let content =\n            args.__resolvedRemoteRead?.content ||\n            "";\n\n        let readSource =\n            args.__resolvedRemoteRead?.source ||\n            "unavailable";''',
    count=1
)

# -----------------------------------------------------------------------------
# Repo hub fails closed; terminal static index becomes metadata-only fallback.
# -----------------------------------------------------------------------------
repo_hub = r'''/* =====================================================================================
   GESTIA REPO HUB V2
   Compatibility facade. Live repository evidence is owned by JarvisLocalBridge/repo.graph.
===================================================================================== */

export const REPO_HUB_VERSION = "2.1.0-fail-closed-live-evidence";

export function describeRepoHub() {
    return {
        ok: true,
        hub: "repo",
        version: REPO_HUB_VERSION,
        authority: "live_repo_bridge",
        staticIndexRole: "metadata_only",
        capabilities: ["scan_repo", "impact_analysis", "patch_generation", "patch_application", "repo_cognition", "dependency_graph"]
    };
}

function invokeGlobal(name, args) {
    const fn = globalThis?.window?.[name];
    if (typeof fn !== "function") {
        return { ok: false, status: "REPO_RUNTIME_CAPABILITY_UNAVAILABLE", error: `${name.toUpperCase()}_UNAVAILABLE`, capability: name };
    }
    const result = fn(...args);
    return result === undefined
        ? { ok: false, status: "REPO_RUNTIME_EMPTY_RESULT", error: `${name.toUpperCase()}_EMPTY_RESULT`, capability: name }
        : result;
}

export const scanRepo = (...args) => invokeGlobal("scanRepo", args);
export const analyzeRepoImpact = (...args) => invokeGlobal("analyzeRepoImpact", args);
export const generatePatch = (...args) => invokeGlobal("generatePatch", args);
export const applyPatch = (...args) => invokeGlobal("applyPatch", args);
export const createRepoSnapshot = (...args) => invokeGlobal("createRepoSnapshot", args);
export const loadRepoContext = (...args) => invokeGlobal("loadRepoContext", args);
export const findRepoFile = (...args) => invokeGlobal("findRepoFile", args);
export const findRepoDependents = (...args) => invokeGlobal("findRepoDependents", args);
export const buildRepoCognitionIndex = (...args) => invokeGlobal("buildRepoCognitionIndex", args);
export const buildRepoDependencyGraph = (...args) => invokeGlobal("buildRepoDependencyGraph", args);
export const bootstrapRepoCognition = (...args) => invokeGlobal("bootstrapRepoCognition", args);
export const isSafeEditZone = (...args) => invokeGlobal("isSafeEditZone", args);
export const isSafeRepoPath = (...args) => invokeGlobal("isSafeRepoPath", args);
export const canModifyRepoFile = (...args) => invokeGlobal("canModifyRepoFile", args);

console.log("🧠 [REPO_HUB] ONLINE", REPO_HUB_VERSION);
'''
write("gestia-core/hubs/repo.hub.js", repo_hub)

# Kernel must not import a non-existent analysis hub or register it as authority.
text = read("gestia-core/jarvis.kernel.js")
text = re.sub(
    r'/\* =====================================================\n   ANALYSIS HUB\n===================================================== \*/\n\nimport \* as analysis\nfrom "\.\/hubs\/analysis\.hub\.js";\n',
    '''/* =====================================================\n   ANALYSIS CONTRACT — delegated to the single Gestia semantic core\n===================================================== */\n\nconst analysis = Object.freeze({\n    describeAnalysisHub() {\n        return {\n            ok: true,\n            status: "SEMANTIC_ANALYSIS_DELEGATED",\n            authority: "gestia-core-single-semantic-brain",\n            alternateBrain: false\n        };\n    }\n});\n''',
    text,
    count=1
)
if 'from "./hubs/analysis.hub.js"' in text:
    raise SystemExit("jarvis.kernel.js: phantom analysis import remained")
text = text.replace('module:\n            "analysis.hub",', 'module:\n            "gestia-core.semantic-analysis",', 1)
write("gestia-core/jarvis.kernel.js", text)

# Fix findRepoFile object callers; replace static scan authority with bridge graph.
replace(
    "gestia-terminal.js",
    '''        const q =\n            String(query)\n            .toLowerCase()\n            .trim();''',
    '''        const lookupValue =\n            query && typeof query === "object"\n                ? (query.file || query.path || query.target || query.query || "")\n                : query;\n\n        const q =\n            String(lookupValue || "")\n            .toLowerCase()\n            .trim();''',
    count=1
)
terminal_scan = r'''window.scanRepo = async function(filters = {}) {
    try {
        if (!window.JarvisLocalBridge?.buildRepoGraph) {
            return {
                ok: false,
                status: "LOCAL_BRIDGE_REQUIRED",
                error: "LIVE_REPO_GRAPH_REQUIRED",
                total: 0,
                files: [],
                staticIndexRole: "metadata_only"
            };
        }
        const graph = await window.JarvisLocalBridge.buildRepoGraph({
            target: filters.target || filters.url || filters.repository || "",
            ref: filters.ref || "",
            refresh: filters.refresh === true,
            maxFiles: filters.maxFiles || 2500,
            maxFileSizeBytes: filters.maxFileSizeBytes || 800000,
            source: "terminal_scan_live_repo_graph_v8"
        });
        if (graph?.ok !== true) {
            return { ...graph, ok: false, total: 0, files: [], staticIndexRole: "metadata_only" };
        }
        const files = Object.values(graph.nodes || {}).map(node => ({
            file: node.file,
            path: node.file,
            bytes: node.bytes,
            dependencies: node.dependencies || [],
            dependents: node.dependents || [],
            relatedTests: node.relatedTests || [],
            verified: true
        }));
        return {
            ok: true,
            status: "REPO_SCAN_READY",
            total: files.length,
            files,
            summary: graph.summary,
            repositoryTarget: graph.repositoryTarget || null,
            source: "live_repo_ast_graph",
            staticIndexRole: "metadata_only"
        };
    } catch (err) {
        console.warn("⚠️ REPO_SCAN_FAIL:", err);
        return { ok: false, status: "REPO_SCAN_FAILED", error: err.message, total: 0, files: [] };
    }
};
'''
regex_replace(
    "gestia-terminal.js",
    r'window\.scanRepo = function\(filters = \{\}\) \{.*?\n\};\n\n\n/\*\*',
    terminal_scan + '\n\n/**',
    count=1
)

# Static bootstrap is explicitly not evidence and stale critical nodes are removed.
text = read("modules/terminal/repo-bootstrap-index.js")
for key in ["jarvis.context.memory.v6.js", "analysis.hub.js"]:
    pattern = rf'\nwindow\.__REPO_INDEX__\["{re.escape(key)}"\]\s*=\s*\{{.*?\n\}};\n'
    text, count = re.subn(pattern, "\n", text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"repo-bootstrap-index.js: unable to remove stale {key}")
if "__REPO_INDEX_AUTHORITY__" not in text:
    text += '''\n\n// Legacy hand-curated catalog: metadata only. Real existence/analysis comes from repo.graph.\nwindow.__REPO_INDEX_AUTHORITY__ = "LEGACY_METADATA_ONLY";\n'''
write("modules/terminal/repo-bootstrap-index.js", text)

# -----------------------------------------------------------------------------
# CI compatibility: fixtures provide semantic values; tests assert one module boot.
# -----------------------------------------------------------------------------
replace(
    "tests/jarvis-multifunction-tools.test.mjs",
    '''                cta: "Solicita una demostración",\n                channels: ["instagram"],''',
    '''                cta: "Solicita una demostración",\n                tone: "directo, confiable y profesional",\n                metrics: ["demostraciones calificadas", "conversión", "costo por lead", "solicitudes"],\n                channels: ["instagram"],''',
    count=1
)
replace(
    "tests/jarvis-multifunction-tools.test.mjs",
    '''                cta: "Solicitar una reunión",\n                channels: ["linkedin", "facebook", "instagram"],''',
    '''                cta: "Solicitar una reunión",\n                tone: "sobrio, estratégico y profesional",\n                metrics: ["reuniones calificadas", "conversión", "costo por reunión", "formularios completos"],\n                channels: ["linkedin", "facebook", "instagram"],''',
    count=1
)
# Direct script assertions are obsolete: core owns those imports, terminal must not duplicate them.
replace(
    "tests/jarvis-multifunction-tools.test.mjs",
    '''    assert.match(terminal, /gestia-core\\/tools\\.bridge\\.js/);''',
    '''    assert.doesNotMatch(terminal, /<script[^>]+gestia-core\\/tools\\.bridge\\.js/);''',
    count=1
)
replace(
    "tests/jarvis-multifunction-tools.test.mjs",
    '''    assert.match(\n        terminal,\n        /jarvis-tools-v7-20260725-semantic-envelope-v64/\n    );''',
    '''    assert.doesNotMatch(\n        terminal,\n        /<script[^>]+response\\.composer\\.js/\n    );''',
    count=1
)

repo_test = r'''import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
    parseRepositoryTarget,
    resolveRepositorySelector
} from "../gestia-core/repo/repo.target.js";

const BRANCH = "codex/jarvis-v8-runtime-foundation";
const BRANCH_URL = `https://github.com/heberzzt-wq/fixgo-app/blob/${BRANCH}`;

test("GitHub blob URL whose selector is a slash branch resolves as a branch, not a file", () => {
    const parsed = parseRepositoryTarget(BRANCH_URL);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.kind, "github_selector");
    const resolved = resolveRepositorySelector(parsed, [BRANCH, "v94-media-v4n-negative-claims"]);
    assert.equal(resolved.ok, true);
    assert.equal(resolved.kind, "github_ref");
    assert.equal(resolved.ref, BRANCH);
    assert.equal(resolved.path, "");
});

test("GitHub file URL keeps the slash branch and separates the repository path", () => {
    const target = `${BRANCH_URL}/gestia-core/tools.runtime.js`;
    const resolved = resolveRepositorySelector(parseRepositoryTarget(target), [BRANCH]);
    assert.equal(resolved.kind, "github_path");
    assert.equal(resolved.ref, BRANCH);
    assert.equal(resolved.path, "gestia-core/tools.runtime.js");
});

test("repo audit and scan use live graph and never the manual scan shim", () => {
    const runtime = fs.readFileSync(new URL("../gestia-core/tools.runtime.js", import.meta.url), "utf8");
    const auditStart = runtime.indexOf('name: "repo.audit"');
    const readStart = runtime.indexOf('name: "repo.read"');
    const pack = runtime.slice(auditStart, readStart);
    assert.match(pack, /JarvisLocalBridge\.buildRepoGraph/);
    assert.doesNotMatch(pack, /import\('\/gestia-core\/hubs\/repo\.hub\.js'\)/);
    assert.match(runtime, /REPOSITORY_REFERENCE_ANALYZED/);
    assert.match(runtime, /resolveRepoTarget/);
    assert.match(runtime, /readRepoTarget/);
});

test("boot has no phantom analysis hub and legacy repo index is metadata only", () => {
    const kernel = fs.readFileSync(new URL("../gestia-core/jarvis.kernel.js", import.meta.url), "utf8");
    const terminal = fs.readFileSync(new URL("../gestia-terminal.js", import.meta.url), "utf8");
    const index = fs.readFileSync(new URL("../modules/terminal/repo-bootstrap-index.js", import.meta.url), "utf8");
    assert.doesNotMatch(kernel, /from "\.\/hubs\/analysis\.hub\.js"/);
    assert.match(kernel, /SEMANTIC_ANALYSIS_DELEGATED/);
    assert.match(terminal, /LIVE_REPO_GRAPH_REQUIRED/);
    assert.match(index, /LEGACY_METADATA_ONLY/);
    assert.doesNotMatch(index, /__REPO_INDEX__\["analysis\.hub\.js"\]/);
    assert.doesNotMatch(index, /__REPO_INDEX__\["jarvis\.context\.memory\.v6\.js"\]/);
});

test("bridge exposes ref-aware graph and git-object read routes", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    assert.match(bridge, /\/repo\/resolve-target/);
    assert.match(bridge, /\/repo\/read-target/);
    assert.match(bridge, /buildGraphForResolvedTarget/);
    assert.match(bridge, /worktree.*add/);
    assert.match(bridge, /resolveRepositorySelector/);
});
'''
write("tests/jarvis-repo-target-runtime.test.mjs", repo_test)

# Include new regression in multifunction CI leg.
replace(
    "package.json",
    'tests/repo-source-structure.test.mjs tests/jarvis-semantic-memory-integrity.test.mjs"',
    'tests/repo-source-structure.test.mjs tests/jarvis-semantic-memory-integrity.test.mjs tests/jarvis-repo-target-runtime.test.mjs"',
    count=1
)

print("V94 repo intelligence repair staged")
