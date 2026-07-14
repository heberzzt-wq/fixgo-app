import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    buildRepoIntelligence,
    rankRepoCandidates
} from "../jarvis-repo-intelligence.js";

function makeFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-repo-graph-"));
    fs.writeFileSync(path.join(root, "auth.js"), `
        import { db } from "./firebase.js";
        export function routeAdmin(user) {
            onAuthStateChanged(user.auth, () => {});
            collection("usuarios");
            return redirect(user.rol);
        }
    `);
    fs.writeFileSync(path.join(root, "firebase.js"), "export const db = {};\n");
    fs.writeFileSync(path.join(root, "server.js"), `
        import { routeAdmin } from "./auth.js";
        app.post("/session/admin", routeAdmin);
    `);
    fs.writeFileSync(path.join(root, "auth.test.js"), `
        import { routeAdmin } from "./auth.js";
        routeAdmin({ rol: "admin" });
    `);
    fs.writeFileSync(path.join(root, "login.html"), '<script type="module" src="./auth.js?v=1"></script>');
    return root;
}

test("live repo graph discovers syntax, dependencies, listeners, endpoints, collections and tests", () => {
    const root = makeFixture();
    try {
        const graph = buildRepoIntelligence({ root });
        assert.equal(graph.ok, true);
        assert.equal(graph.source, "live_repo_syntax_graph");
        assert.deepEqual(graph.nodes["server.js"].dependencies, ["auth.js"]);
        assert.ok(graph.nodes["auth.js"].dependents.includes("server.js"));
        assert.ok(graph.nodes["auth.js"].dependents.includes("login.html"));
        assert.ok(graph.nodes["auth.js"].functions.includes("routeAdmin"));
        assert.equal(graph.nodes["auth.js"].listeners[0].call, "onAuthStateChanged");
        assert.ok(graph.nodes["auth.js"].collections.includes("usuarios"));
        assert.deepEqual(graph.nodes["server.js"].endpoints, [{ method: "POST", route: "/session/admin" }]);
        assert.ok(graph.nodes["auth.js"].relatedTests.includes("auth.test.js"));
        assert.equal(graph.summary.endpoints, 1);
        assert.equal(graph.summary.tests, 1);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("candidate ranking explains every additive factor and honors a planned owner file", () => {
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
});

test("bridge and browser runtime expose the live graph and explainable ranking end to end", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const runtime = fs.readFileSync(new URL("../gestia-core/tools.runtime.js", import.meta.url), "utf8");
    const brain = fs.readFileSync(new URL("../gestia-core/brain.engine.js", import.meta.url), "utf8");
    assert.match(bridge, /app\.post\("\/repo\/graph"/);
    assert.match(bridge, /app\.post\("\/repo\/candidates"/);
    assert.match(runtime, /name: "repo\.graph"/);
    assert.match(runtime, /name: "repo\.rankCandidates"/);
    assert.match(brain, /LOCAL_SEMANTIC_EXPLAINABLE_CANDIDATE_RANKING/);
});
