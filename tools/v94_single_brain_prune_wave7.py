from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_between(text, start, end, replacement, label):
    first = text.find(start)
    if first < 0:
        raise SystemExit(f'WAVE7_START_NOT_FOUND:{label}')
    last = text.find(end, first + len(start))
    if last < 0:
        raise SystemExit(f'WAVE7_END_NOT_FOUND:{label}')
    return text[:first] + replacement + text[last:]


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'WAVE7_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Repo intelligence remains a structural AST/dependency tool. It no longer
# tokenizes or interprets the user's natural-language objective. Candidate
# ownership comes exclusively from the semantic plan through plannedFiles.
# ---------------------------------------------------------------------------
path = 'jarvis-repo-intelligence.js'
text = read(path)
start = text.find('function queryTerms(')
if start < 0:
    raise SystemExit('WAVE7_QUERY_TERMS_NOT_FOUND')
new_tail = r'''function normalizePlannedFiles(plannedFiles = []) {
    return [...new Set(
        (Array.isArray(plannedFiles) ? plannedFiles : [])
            .map(file => String(file || "").trim().split("\\").join("/"))
            .filter(Boolean)
    )].slice(0, 50);
}

export function rankRepoCandidates({ graph, plannedFiles = [], limit = 8 } = {}) {
    if (!graph?.ok || !graph.nodes) throw new Error("REPO_GRAPH_REQUIRED");

    const planned = normalizePlannedFiles(plannedFiles);
    if (planned.length === 0) {
        throw new Error("PLANNED_FILES_REQUIRED");
    }

    const graphNodes = Object.values(graph.nodes);
    const selected = graphNodes.filter(node => planned.includes(node.file));
    const missingPlannedFiles = planned.filter(file => !graph.nodes[file]);

    const ranked = selected.map(node => {
        const relationCount = node.dependencies.length + node.dependents.length;
        const breakdown = {
            plannedFile: 120,
            moduleRelation: relationCount > 0
                ? Math.min(30, relationCount * 3)
                : 0,
            incomingCalls: Math.min(25, node.dependents.length * 5),
            outgoingCalls: Math.min(20, node.calls.length),
            imports: Math.min(20, node.dependencies.length * 4),
            uiContext: node.page || node.file.endsWith(".html") ? 25 : 0,
            executionEvidence: node.endpoints.length || node.listeners.length ? 20 : 0,
            existingTests: Math.min(30, node.relatedTests.length * 10),
            authoritySensitivity: node.authoritySensitive ? 10 : 0,
            decorativePenalty: node.isDecorative ? -50 : 0,
            generatedFilePenalty: node.isGenerated ? -100 : 0
        };
        const score = Object.values(breakdown)
            .reduce((sum, value) => sum + value, 0);
        const reasons = Object.entries(breakdown)
            .filter(([, value]) => value !== 0)
            .map(([factor, value]) =>
                `${factor}: ${value > 0 ? "+" : ""}${value}`
            );

        return {
            file: node.file,
            score,
            breakdown,
            reasons,
            controls: unique([
                ...node.functions,
                ...node.exports,
                ...node.endpoints.map(item => `${item.method} ${item.route}`)
            ]).slice(0, 15),
            dependsOn: node.dependencies,
            dependedOnBy: node.dependents,
            coveredByTests: node.relatedTests,
            risks: [
                node.authoritySensitive ? "AUTHORITY_SENSITIVE" : null,
                node.isGenerated ? "GENERATED_FILE" : null,
                node.isMeta ? "META_FILE" : null
            ].filter(Boolean)
        };
    })
        .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
        .slice(0, Math.max(1, Math.min(25, Number(limit) || 8)));

    return {
        ok: true,
        status: "CANDIDATE_RANKING_READY",
        source: "semantic_plan_plus_live_repo_graph",
        graphGeneratedAt: graph.generatedAt,
        scoring: "structural_evidence_for_semantic_selection",
        semanticSelection: planned,
        missingPlannedFiles,
        candidates: ranked,
        recommendation: ranked[0]
            ? {
                file: ranked[0].file,
                why: ranked[0].reasons,
                doNotTouch: ranked
                    .filter(item => item.risks.includes("GENERATED_FILE"))
                    .map(item => item.file)
            }
            : null
    };
}
'''
text = text[:start] + new_tail
write(path, text)


# ---------------------------------------------------------------------------
# Local bridge refuses free-text candidate ranking. It only evaluates files
# already selected by the semantic brain.
# ---------------------------------------------------------------------------
path = 'jarvis-fs-bridge.js'
text = read(path)
route_start = text.find('    app.post("/repo/candidates", async (req, res) => {')
if route_start < 0:
    raise SystemExit('WAVE7_REPO_CANDIDATES_ROUTE_NOT_FOUND')
route_end = text.find('\n\n        app.post("/read", async (req, res) => {', route_start + 20)
if route_end < 0:
    raise SystemExit('WAVE7_REPO_READ_BOUNDARY_NOT_FOUND')
new_route = r'''    app.post("/repo/candidates", async (req, res) => {
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
            if (!repoGraphCache || req.body?.refresh === true) {
                repoGraphCache = {
                    generatedAt: Date.now(),
                    maxFiles: 2500,
                    maxFileSizeBytes: 800000,
                    graph: buildRepoIntelligence({
                        root,
                        maxFiles: 2500,
                        maxFileSizeBytes: 800000
                    })
                };
            }
            const result = rankRepoCandidates({
                graph: repoGraphCache.graph,
                plannedFiles,
                limit: req.body?.limit || 8
            });
            return res.json(result);
        } catch (error) {
            return res.status(500).json({
                ok: false,
                status: "REPO_CANDIDATE_RANKING_FAILED",
                error: error.message,
                version: JARVIS_FS_BRIDGE_VERSION
            });
        }
    });'''
text = text[:route_start] + new_route + text[route_end:]
write(path, text)


# ---------------------------------------------------------------------------
# Browser tool contract carries structured semantic selection only.
# ---------------------------------------------------------------------------
path = 'gestia-core/tools.runtime.js'
text = read(path)
rank_start = '''JarvisToolRuntime.register({
    name: "repo.rankCandidates",'''
rank_end = '''JarvisToolRuntime.register({
    name: "repo.architectReview",'''
new_rank_tool = r'''JarvisToolRuntime.register({
    name: "repo.rankCandidates",
    description: "Evalúa evidencia estructural de archivos ya seleccionados por el plan semántico: dependencias, llamadas, pruebas, riesgos y controles.",
    mutates: false,
    requiresApproval: false,
    inputSchema: {
        plannedFiles: "array",
        limit: "number",
        refresh: "boolean"
    },
    output: "REPO_CANDIDATE_RANKING_RESULT",
    execute: async (args = {}) => {
        const plannedFiles = Array.isArray(args.plannedFiles)
            ? args.plannedFiles.map(file => String(file || "").trim()).filter(Boolean)
            : [];
        if (plannedFiles.length === 0) {
            return {
                ok: false,
                status: "CONTRACT_INVALID",
                error: "PLANNED_FILES_REQUIRED",
                tool: "repo.rankCandidates"
            };
        }
        if (!window.JarvisLocalBridge?.rankRepoCandidates) {
            return {
                ok: false,
                status: "LOCAL_BRIDGE_REQUIRED",
                error: "JarvisLocalBridge.rankRepoCandidates no está disponible.",
                tool: "repo.rankCandidates"
            };
        }
        const result = await window.JarvisLocalBridge.rankRepoCandidates({
            plannedFiles,
            limit: args.limit || 8,
            refresh: args.refresh === true,
            source: "semantic_plan_structural_repo_ranking_v1"
        });
        return {
            ...result,
            success: result?.ok === true,
            tool: "repo.rankCandidates"
        };
    }
});

'''
text = replace_between(
    text,
    rank_start,
    rank_end,
    new_rank_tool,
    'tools-runtime-structural-ranking'
)
write(path, text)


# ---------------------------------------------------------------------------
# Tests now prove that repo graph analysis is a tool, not a language brain.
# ---------------------------------------------------------------------------
path = 'tests/jarvis-repo-intelligence.test.mjs'
text = read(path)
old_rank_test = r'''test("candidate ranking explains every additive factor and honors a planned owner file", () => {
    const root = makeFixture();
    try {
        const graph = buildRepoIntelligence({ root });
        const result = rankRepoCandidates({
            graph,
            query: "corrige la sesion admin y su redireccion",
            plannedFiles: ["auth.js"],
            limit: 5
        });
        assert.equal(result.ok, true);
        assert.equal(result.scoring, "additive_evidence_breakdown_not_percentage");
        assert.equal(result.candidates[0].file, "auth.js");
        assert.equal(result.candidates[0].breakdown.plannedFile, 120);
        assert.ok(result.candidates[0].breakdown.incomingCalls > 0);
        assert.ok(result.candidates[0].breakdown.existingTests > 0);
        assert.ok(result.candidates[0].reasons.some(reason => reason.startsWith("plannedFile:")));
        assert.deepEqual(result.candidates[0].coveredByTests, ["auth.test.js"]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});'''
new_rank_test = r'''test("candidate ranking explains structural evidence only for semantic-selected files", () => {
    const root = makeFixture();
    try {
        const graph = buildRepoIntelligence({ root });
        const result = rankRepoCandidates({
            graph,
            plannedFiles: ["auth.js"],
            limit: 5
        });
        assert.equal(result.ok, true);
        assert.equal(result.source, "semantic_plan_plus_live_repo_graph");
        assert.equal(result.scoring, "structural_evidence_for_semantic_selection");
        assert.deepEqual(result.semanticSelection, ["auth.js"]);
        assert.equal(result.candidates[0].file, "auth.js");
        assert.equal(result.candidates[0].breakdown.plannedFile, 120);
        assert.ok(result.candidates[0].breakdown.incomingCalls > 0);
        assert.ok(result.candidates[0].breakdown.existingTests > 0);
        assert.ok(result.candidates[0].reasons.some(reason => reason.startsWith("plannedFile:")));
        assert.deepEqual(result.candidates[0].coveredByTests, ["auth.test.js"]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("candidate ranking fails closed without semantic-selected files", () => {
    const root = makeFixture();
    try {
        const graph = buildRepoIntelligence({ root });
        assert.throws(
            () => rankRepoCandidates({ graph, plannedFiles: [] }),
            /PLANNED_FILES_REQUIRED/
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});'''
text = replace_once(text, old_rank_test, new_rank_test, 'repo-ranking-test')
old_end = r'''test("bridge and browser runtime expose the live graph and explainable ranking end to end", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const runtime = fs.readFileSync(new URL("../gestia-core/tools.runtime.js", import.meta.url), "utf8");
    const brain = fs.readFileSync(new URL("../gestia-core/brain.engine.js", import.meta.url), "utf8");
    assert.match(bridge, /app\.post\("\/repo\/graph"/);
    assert.match(bridge, /app\.post\("\/repo\/candidates"/);
    assert.match(runtime, /name: "repo\.graph"/);
    assert.match(runtime, /name: "repo\.rankCandidates"/);
    assert.match(brain, /LOCAL_SEMANTIC_EXPLAINABLE_CANDIDATE_RANKING/);
});'''
new_end = r'''test("bridge exposes structural repo evidence while the semantic brain owns file selection", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const runtime = fs.readFileSync(new URL("../gestia-core/tools.runtime.js", import.meta.url), "utf8");
    const brain = fs.readFileSync(new URL("../gestia-core/brain.engine.js", import.meta.url), "utf8");
    const intelligence = fs.readFileSync(new URL("../jarvis-repo-intelligence.js", import.meta.url), "utf8");
    assert.match(bridge, /app\.post\("\/repo\/graph"/);
    assert.match(bridge, /app\.post\("\/repo\/candidates"/);
    assert.match(bridge, /PLANNED_FILES_REQUIRED/);
    assert.match(runtime, /name: "repo\.graph"/);
    assert.match(runtime, /name: "repo\.rankCandidates"/);
    assert.match(runtime, /plannedFiles: "array"/);
    assert.match(brain, /COMPATIBILITY_CANARY_ONLY/);
    assert.match(brain, /semanticAuthority:\s*"jarvisSemanticPlan"/);
    assert.doesNotMatch(brain, /LOCAL_SEMANTIC_EXPLAINABLE_CANDIDATE_RANKING/);
    assert.doesNotMatch(intelligence, /function queryTerms/);
    assert.doesNotMatch(intelligence, /lexicalSemantic/);
    assert.doesNotMatch(intelligence, /normalizedQuery/);
    assert.match(intelligence, /structural_evidence_for_semantic_selection/);
});'''
text = replace_once(text, old_end, new_end, 'repo-end-to-end-test')
write(path, text)

print('V94_SINGLE_BRAIN_PRUNE_WAVE7_APPLIED')
