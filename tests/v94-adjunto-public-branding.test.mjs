import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../gestia-terminal.html", import.meta.url), "utf8");
const branding = fs.readFileSync(new URL("../gestia-core/nexo/nexo.ui.branding.js", import.meta.url), "utf8");

test("Terminal public identity is ADJUNTO without renaming internal engines", () => {
    assert.match(html, /<title>Terminal Heberto \| ADJUNTO<\/title>/);
    assert.match(html, />ADJUNTO listo<\/h3>/);
    assert.match(html, /ADJUNTO \| Tecnología privada de Península Tech/);
    assert.match(html, /Tu asistente privado de Península Tech para conversar, analizar archivos y ejecutar misiones verificables\./);
    assert.match(html, /Dile a ADJUNTO qué debe investigar, crear, analizar o ejecutar/);
    assert.doesNotMatch(html, />Jarvis listo<\/h3>/);
    assert.doesNotMatch(html, />NEXO listo<\/h3>/);
    assert.doesNotMatch(html, />Motor No-Code \| GestiaPremium V5\.18<\/p>/);

    assert.match(branding, /ADJUNTO listo/);
    assert.match(branding, /Terminal Heberto \| ADJUNTO/);
    assert.match(branding, /Dile a ADJUNTO qué debe investigar, crear, analizar o ejecutar/);
    assert.match(branding, /__NEXO_RUNTIME_STAMP__/);
    assert.match(branding, /NEXO_UI_BRANDING_VERSION/);
});
