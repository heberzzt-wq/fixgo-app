import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

test("page artifact byte verification is browser compatible", async () => {
    const source = fs.readFileSync(path.join(root, "jarvis-page-artifact.js"), "utf8");
    assert.match(source, /function utf8ByteLength/);
    assert.match(source, /new TextEncoder\(\)/);
    assert.doesNotMatch(source, /bytes:\s*Buffer\.byteLength\(html/);
});

test("page.create falls back only on exact local bridge version mismatch", async () => {
    globalThis.window = globalThis;
    let clicks = 0;
    globalThis.document = {
        body: { appendChild() {} },
        createElement(name) {
            assert.equal(name, "a");
            return {
                href: "",
                download: "",
                rel: "",
                style: {},
                click() { clicks += 1; },
                remove() {}
            };
        }
    };
    globalThis.JarvisLocalBridge = {
        requestJson: async () => ({
            ok: false,
            success: false,
            status: "LOCAL_BRIDGE_VERSION_MISMATCH",
            error: "LOCAL_BRIDGE_VERSION_MISMATCH",
            bridgeVersion: "2.37.0-verified-reel-webm",
            requiredBridgeVersion: "2.38.0-page-no-contact-route"
        })
    };
    const registered = new Map();
    const runtime = {
        register(definition) {
            registered.set(definition.name, definition);
            return { ok: true, tool: definition.name };
        }
    };
    const module = await import(`../gestia-core/jarvis/jarvis.actuator.pack.js?v115-test=${Date.now()}`);
    module.registerJarvisActuatorTools(runtime);
    const pageCreate = registered.get("page.create");
    assert.ok(pageCreate);
    const result = await pageCreate.execute({
        brandName: "Península Tech",
        title: "Tecnología y servicios para resolver",
        description: "Servicios tecnológicos y operativos presentados sin inventar información de contacto no verificada.",
        services: [
            { title: "Soporte técnico", description: "Atención y diagnóstico técnico para necesidades verificadas del proyecto." },
            { title: "Soluciones digitales", description: "Implementación de herramientas digitales alineadas con los objetivos del negocio." }
        ]
    }, {});
    assert.equal(result.ok, true);
    assert.equal(result.status, "PAGE_ARTIFACT_CREATED_BROWSER_VERIFIED");
    assert.equal(result.artifactMode, "browser_verified_download");
    assert.equal(result.physicallyWritten, false);
    assert.equal(result.published, false);
    assert.equal(result.bridgeFallback.status, "LOCAL_BRIDGE_VERSION_MISMATCH");
    assert.equal(result.bridgeFallback.bridgeVersion, "2.37.0-verified-reel-webm");
    assert.equal(result.bridgeFallback.requiredBridgeVersion, "2.38.0-page-no-contact-route");
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.ok(result.bytes > 1000);
    assert.equal(clicks, 1);
});

test("bridge requirement remains 2.38 and browser delivery wording is truthful", () => {
    const runtime = fs.readFileSync(path.join(root, "gestia-core", "tools.runtime.js"), "utf8");
    const bridge = fs.readFileSync(path.join(root, "gestia-core", "tools.bridge.js"), "utf8");
    assert.match(runtime, /2\.38\.0-page-no-contact-route/);
    assert.match(bridge, /browser_verified_download/);
    assert.match(bridge, /bridge desactualizado no escribió el archivo/);
    assert.match(bridge, /creado físicamente por el bridge local/);
});

test("static repo bootstrap has no literal entries pointing to missing files", () => {
    const file = path.join(root, "modules", "terminal", "repo-bootstrap-index.js");
    const source = fs.readFileSync(file, "utf8");
    const blockPattern = /window\.__REPO_INDEX__\["([^"]+)"\]\s*=\s*\{([\s\S]*?)\n\};/g;
    const missing = [];
    for (const match of source.matchAll(blockPattern)) {
        const pathMatch = match[2].match(/\bpath\s*:\s*["']([^"']+)["']/);
        if (!pathMatch) continue;
        const declared = pathMatch[1].trim();
        const normalized = declared.startsWith("./") ? declared.slice(2) : declared.replace(/^\//, "");
        if (normalized && !fs.existsSync(path.join(root, normalized))) {
            missing.push(`${match[1]} -> ${declared}`);
        }
    }
    assert.deepEqual(missing, []);
    for (const phantom of [
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
    ]) {
        assert.doesNotMatch(source, new RegExp(`__REPO_INDEX__\\["${phantom.replaceAll(".", "\\.")}"\\]`));
    }
});

test("browser boot chain preserves v115 fallback while allowing later shell cache busts", () => {
    const html = fs.readFileSync(path.join(root, "gestia-terminal.html"), "utf8");
    const core = fs.readFileSync(path.join(root, "gestia-core", "gestia-core.js"), "utf8");
    const terminal = fs.readFileSync(path.join(root, "gestia-terminal.js"), "utf8");
    assert.match(html, /gestia-terminal\.js\?v=v94-[a-z0-9-]+-20260809/);
    assert.match(core, /v94-page-browser-fallback-v115-20260809/);
    assert.match(terminal, /repo-bootstrap-index\.js\?v=v94-page-browser-fallback-v115-20260809/);
});
