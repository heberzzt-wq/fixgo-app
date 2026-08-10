import fs from "node:fs";

function read(path) {
    return fs.readFileSync(path, "utf8");
}

function write(path, content) {
    fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(source, pattern, replacement, label) {
    let count = 0;
    const output = source.replace(pattern, (...args) => {
        count += 1;
        return typeof replacement === "function"
            ? replacement(...args)
            : replacement;
    });
    if (count !== 1) {
        throw new Error(`${label}_COUNT_${count}`);
    }
    return output;
}

const token = "v94-runtime-health-truth-v116-20260809";

{
    const path = "modules/terminal/runtime-repair-health.js";
    let source = read(path);
    const replacement = `        const previousHealthMap =
            window.__RUNTIME_HEALTH_MAP__ || {};

        const loadedRegistry =
            window.MODULE_CONTEXT?.loaded || {};

        const healthMap = {};

        const normalizeLoadEvidence = value => {
            if (value === true) {
                return { observed: true, status: "ONLINE" };
            }

            if (typeof value === "string") {
                const status = value.trim().toUpperCase();
                if (["ONLINE", "LOADED", "READY", "RUNNING"].includes(status)) {
                    return { observed: true, status: "ONLINE" };
                }
                if (["DEGRADED", "ISOLATED"].includes(status)) {
                    return { observed: true, status };
                }
                return null;
            }

            if (value && typeof value === "object") {
                const status = String(value.status || value.state || "").trim().toUpperCase();
                if (value.loaded === true || value.online === true || value.ready === true || value.running === true) {
                    return {
                        observed: true,
                        status: ["DEGRADED", "ISOLATED"].includes(status) ? status : "ONLINE"
                    };
                }
                if (["ONLINE", "LOADED", "READY", "RUNNING", "DEGRADED", "ISOLATED"].includes(status)) {
                    return {
                        observed: true,
                        status: ["DEGRADED", "ISOLATED"].includes(status) ? status : "ONLINE"
                    };
                }
            }

            return null;
        };

        Object.entries(
            cognition
        ).forEach(([file, meta]) => {

            const previous =
                previousHealthMap[file] || {};

            const candidates = [
                file,
                meta?.path,
                meta?.module
            ].filter(Boolean);

            let loadEvidence = null;
            for (const candidate of candidates) {
                loadEvidence = normalizeLoadEvidence(
                    loadedRegistry?.[candidate]
                );
                if (loadEvidence?.observed === true) break;
            }

            const observed =
                loadEvidence?.observed === true;

            healthMap[file] = {
                ...previous,
                file,
                status:
                    observed
                        ? loadEvidence.status
                        : "CATALOGED",
                health:
                    observed
                        ? (previous.health ?? 100)
                        : null,
                degraded:
                    observed && loadEvidence.status === "DEGRADED",
                isolated:
                    observed && loadEvidence.status === "ISOLATED",
                blocked:
                    previous.blocked === true,
                observed,
                evidenceSource:
                    observed
                        ? "runtime_loaded_registry"
                        : "repo_catalog_only",
                lastCheck:
                    Date.now()
            };
        });

        window.__RUNTIME_HEALTH_MAP__ =
            healthMap;`;

    source = replaceOnce(
        source,
        /        const previousHealthMap =\n[\s\S]*?        window\.__RUNTIME_HEALTH_MAP__ =\n            healthMap;/,
        replacement,
        "HEALTH_MAP_PATCH"
    );

    source = replaceOnce(
        source,
        `                isolated:\n                    node.isolated === true\n            }));`,
        `                isolated:\n                    node.isolated === true,\n                observed:\n                    node.observed === true,\n                evidenceSource:\n                    node.evidenceSource || "unknown"\n            }));`,
        "BOOT_TABLE_ROW_PATCH"
    );

    source = replaceOnce(
        source,
        `            online:\n                rows.filter(row => row.status === "ONLINE").length,\n            degraded:`,
        `            online:\n                rows.filter(row => row.status === "ONLINE").length,\n            cataloged:\n                rows.filter(row => row.status === "CATALOGED").length,\n            degraded:`,
        "BOOT_TABLE_SUMMARY_PATCH"
    );

    write(path, source);
}

{
    const path = "modules/terminal/runtime-persistence.js";
    let source = read(path);
    const replacement = `        const moduleCount =

            Object.keys(
                runtimeModules
            ).length;

        const observedHealthNodes =

            Object.values(
                runtimeHealthMap
            )
            .filter(
                (m) =>
                    m?.observed === true
            );

        const observedModuleCount =
            observedHealthNodes.length;

        const healthyModules =

            observedHealthNodes
            .filter(
                (m) =>
                    m?.status === "ONLINE"
            ).length;

        const degradedModules =

            observedHealthNodes
            .filter(
                (m) =>
                    m?.status === "DEGRADED"
            ).length;

        const isolatedModules =

            observedHealthNodes
            .filter(
                (m) =>
                    m?.status === "ISOLATED"
            ).length;

        const runtimeHealth =

            observedModuleCount > 0

                ? Math.floor(

                    (
                        healthyModules /
                        observedModuleCount
                    ) * 100
                )

                : 100;`;

    source = replaceOnce(
        source,
        /        const moduleCount =\n[\s\S]*?        const runtimeHealth =\n\n            moduleCount > 0\n\n                \? Math\.floor\(\n\n                    \(\n                        healthyModules \/\n                        moduleCount\n                    \) \* 100\n                \)\n\n                : 100;/,
        replacement,
        "SNAPSHOT_HEALTH_PATCH"
    );

    source = replaceOnce(
        source,
        `moduleCount,\n\nhealthyModules,`,
        `moduleCount,\n\nobservedModuleCount,\n\nhealthyModules,`,
        "SNAPSHOT_FIELD_PATCH"
    );

    write(path, source);
}

{
    const path = "gestia-terminal.js";
    let source = read(path);
    source = replaceOnce(
        source,
        /\.\/modules\/terminal\/runtime-repair-health\.js\?v=[^"']+/,
        `./modules/terminal/runtime-repair-health.js?v=${token}`,
        "TERMINAL_HEALTH_CACHE_PATCH"
    );
    write(path, source);
}

{
    const path = "gestia-terminal.html";
    let source = read(path);
    source = source.replaceAll("v94-page-browser-fallback-v115-20260809", token);
    source = source.replaceAll("fixgo-real-runtime-e2e-20260805", token);
    if (!source.includes(token)) {
        throw new Error("TERMINAL_HTML_CACHE_PATCH_MISSING");
    }
    write(path, source);
}

{
    const path = "gestia-core/gestia.runtime.v7.js";
    let source = read(path);
    source = source.replace(
        /(runtime-persistence\.js\?v=)[^"']+/g,
        `$1${token}`
    );
    write(path, source);
}

const testSource = `import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("runtime health does not call catalog-only nodes ONLINE", () => {
    const source = fs.readFileSync("modules/terminal/runtime-repair-health.js", "utf8");
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
        console: { log() {}, warn() {}, error() {}, table() {} },
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
    const rendered = window.renderRuntimeBootTable({ source: "test" });
    assert.equal(rendered.rows.find(row => row.file === "ghost.js").status, "CATALOGED");
});

test("runtime snapshots calculate health only from observed nodes", () => {
    const source = fs.readFileSync("modules/terminal/runtime-persistence.js", "utf8");
    assert.match(source, /const observedHealthNodes/);
    assert.match(source, /m\\?\\.observed === true/);
    assert.match(source, /const observedModuleCount/);
    assert.match(source, /observedModuleCount > 0/);
    assert.doesNotMatch(source, /healthyModules \\/\\s*moduleCount/);
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
`;

write("tests/jarvis-runtime-health-truth-v116.test.mjs", testSource);
console.log("V116_RUNTIME_HEALTH_PATCH_STAGED");
