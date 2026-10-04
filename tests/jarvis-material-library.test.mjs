import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { materialLibrary, assertOfficialMaterial, resolveMaterialReference, availableMaterialToolCatalog } from "../jarvis-material-library.js";
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

test("advertising history persists and blocks renamed bytes and repeated copy across deliveries", t => {
    const { root, library, png } = fixture(t);
    const create = (name, headline, suffix = name) => {
        const output = `.jarvis-artifacts/${name}.png`;
        fs.writeFileSync(path.join(root, output), Buffer.concat([png, Buffer.from(suffix)]));
        registerArtifact({ root, output, metadata: { mimeType: "image/png", transformations: [{
            type: "local_ad_composition", composition: { brandName: "Firma", headline, body: "Asesoría para tu empresa" }
        }] } });
        return output;
    };
    const first = create("first", "Defensa fiscal");
    assert.equal(materialLibrary({ root, action: "export", output: first }).historyRecorded, true);
    assert.equal(materialLibrary({ root, action: "export", output: create("renamed", "Other", "first") }).status, "ADVERTISING_DUPLICATE_BLOCKED");
    assert.equal(materialLibrary({ root, action: "export", output: create("resized", "  DEFENSA FISCAL! ") }).status, "ADVERTISING_DUPLICATE_BLOCKED");
    const historyFile=path.join(library,"Historial/publicidad.jsonl");
    const legacy=JSON.parse(fs.readFileSync(historyFile,"utf8").trim());
    legacy.creative.body += " www.summ.com.mx";
    legacy.creativeFingerprint="a".repeat(64);
    fs.writeFileSync(historyFile,JSON.stringify(legacy)+"\n");
    assert.equal(materialLibrary({ root, action: "export", output: create("contact-removed", "Defensa fiscal") }).status,"ADVERTISING_DUPLICATE_BLOCKED","legacy history is compared using content, not only its old fingerprint");
    assert.equal(materialLibrary({ root, action: "export", output: create("new", "Conoce tus opciones legales") }).ok, true);
    const history = JSON.parse(fs.readFileSync(path.join(library, "Historial/publicidad.jsonl"), "utf8").trim().split("\n")[0]);
    assert.equal(history.creative.headline, "Defensa fiscal");
    assert.equal(materialLibrary({ root }).advertisingHistory.length, 2);
    assert.equal(fs.readdirSync(path.join(library, "Salidas")).length, 2);
});

test("existing deliveries are indexed before allowing a duplicate and history corruption fails closed", t => {
    const { root, library, png } = fixture(t);
    fs.mkdirSync(path.join(library, "Salidas"));
    fs.writeFileSync(path.join(library, "Salidas", "yesterday.png"), png);
    const imported = materialLibrary({ root, action: "import", relativePath: "Entradas/anuncio.png" });
    assert.equal(materialLibrary({ root, action: "export", output: imported.output }).status, "ADVERTISING_DUPLICATE_BLOCKED");
    fs.appendFileSync(path.join(library, "Historial/publicidad.jsonl"), "corrupt\n");
    assert.throws(() => materialLibrary({ root }), /JSON|Unexpected|MATERIAL_HISTORY/);
});

test("new words and bytes cannot reuse a delivered photograph and layout, including legacy history", t => {
    const {root,library,png}=fixture(t);
    const source=materialLibrary({root,action:"import",relativePath:"Entradas/anuncio.png"});
    const create=(name,layout)=>{
        const output=`.jarvis-artifacts/${name}.png`;
        fs.writeFileSync(path.join(root,output),Buffer.concat([png,Buffer.from(name)]));
        registerArtifact({root,output,metadata:{mimeType:"image/png",originalFile:source.output,transformations:[{type:"local_ad_composition",composition:{brandName:"Firma",headline:name,body:`Nuevo texto ${name}`,layout}}]}});
        return output;
    };
    assert.equal(materialLibrary({root,action:"export",output:create("first-visual","split")}).ok,true);
    const file=path.join(library,"Historial/publicidad.jsonl");
    const legacy=JSON.parse(fs.readFileSync(file,"utf8").trim()); delete legacy.visual;
    fs.writeFileSync(file,JSON.stringify(legacy)+"\n");
    assert.deepEqual(materialLibrary({root}).advertisingHistory[0].visual,{sourceRef:"library:Entradas/anuncio.png",layout:"split"});
    const repeated=materialLibrary({root,action:"export",output:create("different-words","split")});
    assert.equal(repeated.status,"ADVERTISING_DUPLICATE_BLOCKED");
    assert.equal(repeated.physicallyWritten,false);
    assert.equal(materialLibrary({root,action:"export",output:create("different-layout","stack")}).ok,true);
    assert.equal(fs.readdirSync(path.join(library,"Salidas")).length,2);
});

test("exact library references import the chosen original and sidecars are bound to source bytes", t => {
    const { root, library } = fixture(t);
    const listed = materialLibrary({ root }).entries[0];
    fs.writeFileSync(path.join(library, listed.relativePath + ".material.json"), JSON.stringify({
        sourceSha256: listed.sha256, description: "Foto aprobada", verifiedContacts:["www.summ.com.mx","invented contact"], photoRegion: { x: 0, y: 0, width: 1, height: 1 }
    }));
    assert.equal(materialLibrary({ root }).entries[0].description, "Foto aprobada");
    assert.deepEqual(materialLibrary({ root }).entries[0].verifiedContacts,["www.summ.com.mx"]);
    const output = resolveMaterialReference({ root, output: listed.ref });
    assert.equal(output, materialLibrary({ root, action: "import", relativePath: listed.relativePath }).output);
    assert.throws(() => resolveMaterialReference({ root, output: "library:../outside.png" }));
    fs.appendFileSync(path.join(library, listed.relativePath), "changed");
    assert.equal(materialLibrary({ root }).entries[0].description, undefined);
    assert.equal(materialLibrary({ root }).entries[0].verifiedContacts, undefined);
    assert.equal(materialLibrary({ root }).entries[0].metadataIssue, "MATERIAL_METADATA_SOURCE_CHANGED");
});

test("disabled external generation is absent from the semantic catalog, not retried as recovery", t => {
    const { root } = fixture(t);
    const catalog = ["image.generate", "image.edit", "video.generate", "image.adapt", "media.library", "reel.create"].map(name => ({ name }));
    assert.deepEqual(availableMaterialToolCatalog({ root, catalog }).map(tool => tool.name), ["image.adapt", "media.library", "reel.create"]);
});

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
