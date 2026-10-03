import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { materialLibrary, assertOfficialMaterial } from "../jarvis-material-library.js";
import { registerArtifact } from "../jarvis-artifact-studio.js";
import { preparePageMaterialInput } from "../jarvis-fs-bridge.js";
import { buildPageArtifactHtml } from "../jarvis-page-artifact.js";
import { registerJarvisActuatorTools } from "../gestia-core/jarvis/jarvis.actuator.pack.js";

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-library-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const root = path.join(dir, "repo"), library = path.join(dir, "desktop", "Jarvis Material");
    fs.mkdirSync(path.join(root, ".jarvis-artifacts"), { recursive: true });
    fs.mkdirSync(path.join(library, "Entradas"), { recursive: true });
    fs.mkdirSync(path.join(library, "Logos"), { recursive: true });
    fs.writeFileSync(path.join(root, ".jarvis-artifacts/material-library.config.json"), JSON.stringify({ directory: library }));
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64");
    fs.writeFileSync(path.join(library, "Entradas", "anuncio.png"), png);
    return { root, library, png, dir };
}

test("configured Desktop library imports unchanged bytes into the canonical ledger and exports separately", t => {
    const { root, library, png } = fixture(t);
    const listing = materialLibrary({ root, action: "list" });
    assert.equal(listing.entries.length, 1);
    assert.equal(listing.entries[0].relativePath, "Entradas/anuncio.png");
    assert.equal(listing.entries[0].role, "input");
    const imported = materialLibrary({ root, action: "import", relativePath: "Entradas/anuncio.png" });
    assert.equal(imported.bytes, png.length);
    assert.equal(imported.sha256, imported.artifact.sha256);
    assert.deepEqual(fs.readFileSync(path.join(root, imported.output)), png);
    assert.deepEqual(fs.readFileSync(path.join(library, "Entradas/anuncio.png")), png);
    const exported = materialLibrary({ root, action: "export", output: imported.output });
    assert.ok(exported.relativePath.startsWith("Salidas/"));
    assert.deepEqual(fs.readFileSync(path.join(library, exported.relativePath)), png);
});

test("library excludes unsupported files and rejects traversal, wrong media and external links", t => {
    const { root, library, dir } = fixture(t);
    fs.writeFileSync(path.join(library, "Entradas", "secret.env"), "private");
    fs.writeFileSync(path.join(library, "Entradas", "fake.png"), "not an image");
    assert.deepEqual(materialLibrary({ root }).entries.map(x => x.relativePath), ["Entradas/anuncio.png"]);
    for (const relativePath of ["../private.png", path.join(dir, "private.png"), "Entradas/fake.png"]) {
        assert.throws(() => materialLibrary({ root, action: "import", relativePath }));
    }
    const outside = path.join(dir, "outside");
    fs.mkdirSync(outside);
    fs.copyFileSync(path.join(library, "Entradas/anuncio.png"), path.join(outside, "outside.png"));
    fs.symlinkSync(outside, path.join(library, "Entradas", "escape"), "junction");
    assert.throws(() => materialLibrary({ root, action: "import", relativePath: "Entradas/escape/outside.png" }), /OUTSIDE|LINK/);
    assert.throws(() => materialLibrary({ root, action: "export", output: "../outside/outside.png" }), /ARTIFACT/);
});

test("unconfigured library reports a recoverable missing input instead of scanning arbitrary user folders", t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-unconfigured-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const result = materialLibrary({ root: dir });
    assert.equal(result.ok, false);
    assert.equal(result.requiresInput, true);
    assert.equal(result.status, "MATERIAL_LIBRARY_NOT_CONFIGURED");
});

test("workstation policy stops cloud image generation before any external request", async t => {
    const previousBridge = globalThis.JarvisLocalBridge;
    t.after(() => { globalThis.JarvisLocalBridge = previousBridge; });
    const calls = [];
    globalThis.JarvisLocalBridge = { requestJson: async (route, args) => {
        calls.push({ route, args });
        return { ok: true, externalGenerationAllowed: false };
    } };
    const definitions = new Map();
    registerJarvisActuatorTools({ register: d => definitions.set(d.name, d) });
    await assert.rejects(definitions.get("image.generate").execute({ prompt: "Anuncio" }), /EXTERNAL_MEDIA_GENERATION_DISABLED/);
    assert.deepEqual(calls, [{ route: "/media/library", args: { action: "policy" } }]);
});

test("official-only policy accepts imported originals and rejects unregistered, changed and remote page references", t => {
    const { root, library, png } = fixture(t);
    fs.writeFileSync(path.join(root, ".jarvis-artifacts/material-library.config.json"), JSON.stringify({ directory: library, officialOnly: true }));
    assert.equal(materialLibrary({ root, action: "policy" }).externalGenerationAllowed, false);
    const imported = materialLibrary({ root, action: "import", relativePath: "Entradas/anuncio.png" });
    assert.doesNotThrow(() => assertOfficialMaterial({ root, output: imported.output }));
    const other = ".jarvis-artifacts/other.png";
    fs.writeFileSync(path.join(root, other), png);
    registerArtifact({ root, output: other, metadata: { mimeType: "image/png" } });
    assert.throws(() => assertOfficialMaterial({ root, output: other }), /OFFICIAL_LIBRARY_REQUIRED/);
    assert.throws(() => preparePageMaterialInput({ root, input: { heroImage: "https://example.com/arbitrary.png" } }), /OFFICIAL_LIBRARY_REQUIRED/);
    const { pageInput, materialSources } = preparePageMaterialInput({ root, input: {
        logoOutput: imported.output,
        sourceImages: [{ output: imported.output, role: "hero", alt: "Original aportado" }]
    } });
    assert.equal(materialSources.length, 2);
    assert.ok(pageInput.logoImage.startsWith("data:image/png;base64,"));
    const html = buildPageArtifactHtml({ ...pageInput, brandName: "Firma", title: "Asesoría", description: "Servicios profesionales para empresas locales.", services: [{ title: "Asesoría", description: "Atención profesional." }] });
    assert.ok(html.includes('alt="Logo de Firma"'));
    fs.appendFileSync(path.join(root, imported.output), "changed");
    assert.throws(() => assertOfficialMaterial({ root, output: imported.output }), /OFFICIAL_LIBRARY_REQUIRED/);
});
