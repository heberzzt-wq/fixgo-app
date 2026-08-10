import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("runtime health is evidence-based and boot table is quiet by default", () => {
    const source = fs.readFileSync("modules/terminal/runtime-repair-health.js", "utf8");
    let tableCalls = 0;
    let readyLogs = 0;
    const window = {
        __REPO_INDEX__: {},
        __REPO_COGNITION__: {
            "ghost.js": { file: "ghost.js", path: "ghost.js", module: "ghost" },
            "live.js": { file: "live.js", path: "live.js", module: "live" }
        },
        __RUNTIME_HEALTH_MAP__: {
            "ghost.js": { file: "ghost.js", status: "ONLINE", health: 100 }
        },
        MODULE_CONTEXT: {
            loaded: {
                "live.js": { loaded: true, status: "READY" }
            }
        },
        addEventListener() {}
    };
    const sandbox = {
        window,
        console: {
            log: (...args) => {
                if (args[0] === "✅ [RUNTIME_BOOT_TABLE_READY]") readyLogs += 1;
            },
            warn() {},
            error() {},
            table() { tableCalls += 1; }
        },
        setTimeout() { return 0; },
        Date
    };

    vm.runInNewContext(source, sandbox, { filename: "runtime-repair-health.js" });
    const result = window.buildRuntimeHealthMap();
    assert.equal(result.ok, true);
    assert.equal(window.__RUNTIME_HEALTH_MAP__["live.js"].status, "ONLINE");
    assert.equal(window.__RUNTIME_HEALTH_MAP__["live.js"].observed, true);
    assert.equal(window.__RUNTIME_HEALTH_MAP__["live.js"].evidenceSource, "runtime_loaded_registry");
    assert.equal(window.__RUNTIME_HEALTH_MAP__["ghost.js"].status, "CATALOGED");
    assert.equal(window.__RUNTIME_HEALTH_MAP__["ghost.js"].health, null);
    assert.equal(window.__RUNTIME_HEALTH_MAP__["ghost.js"].observed, false);
    assert.equal(window.__RUNTIME_HEALTH_MAP__["ghost.js"].evidenceSource, "repo_catalog_only");

    const quiet = window.renderRuntimeBootTable({ source: "test" });
    assert.equal(quiet.rows.find(row => row.file === "ghost.js").status, "CATALOGED");
    assert.equal(quiet.summary.cataloged, 1);
    assert.equal(tableCalls, 0);
    assert.equal(readyLogs, 0);

    window.__JARVIS_RUNTIME_HEALTH_DEBUG__ = true;
    const debug = window.renderRuntimeBootTable({ source: "debug-test" });
    assert.equal(debug.ok, true);
    assert.equal(tableCalls, 1);
    assert.equal(readyLogs, 1);
});

test("runtime snapshots calculate health only from observed nodes", () => {
    const source = fs.readFileSync("modules/terminal/runtime-persistence.js", "utf8");
    assert.match(source, /const observedHealthNodes/);
    assert.match(source, /m\?\.observed === true/);
    assert.match(source, /const observedModuleCount/);
    assert.match(source, /observedModuleCount > 0/);
    assert.doesNotMatch(source, /healthyModules \/\s*moduleCount/);
});

test("phantom bootstrap entries remain absent", () => {
    const source = fs.readFileSync("modules/terminal/repo-bootstrap-index.js", "utf8");
    const names = [
        "jarvis-nlu-bridge.js",
        "jarvis.intent.runtime.v7.js",
        "jarvis.language.core.v5.js",
        "jarvis.dsl.js",
        "jarvis.orchestrator.js",
        "jarvis.vision.engine.js",
        "jarvis.normalizer.js",
        "jarvis.bridge.v4.js",
        "intent.engine.v7.js",
        "repo.cognition.index.js",
        "jarvis.cognition.engine.js",
        "intent.engine.js",
        "cognitive.bootstrap.js"
    ];
    for (const name of names) {
        assert.equal(source.includes('window.__REPO_INDEX__["' + name + '"]'), false, name);
    }
});
