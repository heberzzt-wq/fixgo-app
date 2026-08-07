from pathlib import Path

html_path = Path("gestia-terminal.html")
branding_path = Path("gestia-core/nexo/nexo.ui.branding.js")
test_path = Path("tests/v94-adjunto-public-branding.test.mjs")

html = html_path.read_text(encoding="utf-8")
branding = branding_path.read_text(encoding="utf-8")

replacements = [
    ("<title>Terminal Heberto | GestiaPremium</title>", "<title>Terminal Heberto | ADJUNTO</title>"),
    ("<p class=\"text-xs text-slate-400 font-mono\">Motor No-Code | GestiaPremium V5.18</p>", "<p class=\"text-xs text-slate-400 font-mono\">ADJUNTO | Tecnología privada de Península Tech</p>"),
    ("<h3 class=\"font-semibold text-white mb-2 text-lg\">Jarvis listo</h3>", "<h3 class=\"font-semibold text-white mb-2 text-lg\">ADJUNTO listo</h3>"),
    ("Soy tu asistente privado para conversar, investigar, analizar archivos y ejecutar misiones verificables con herramientas gobernadas.", "Tu asistente privado de Península Tech para conversar, analizar archivos y ejecutar misiones verificables."),
    ("placeholder=\"Describe el módulo que vamos a construir (Ej. 'Crea un control de accesos...')\"", "placeholder=\"Dile a ADJUNTO qué debe investigar, crear, analizar o ejecutar...\""),
    ('? "Describe el módulo que vamos a construir..."', '? "Dile a ADJUNTO qué debe investigar, crear, analizar o ejecutar..."')
]
for old, new in replacements:
    if old not in html:
        raise SystemExit(f"HTML_BRANDING_ANCHOR_MISSING:{old[:80]}")
    html = html.replace(old, new, 1)

branding_replacements = [
    ('if (document.title === "Terminal Heberto | GestiaPremium") {\n        document.title = "NEXO | Terminal privada Peninsula Tech";\n    }', 'if (["Terminal Heberto | GestiaPremium", "NEXO | Terminal privada Peninsula Tech"].includes(document.title)) {\n        document.title = "Terminal Heberto | ADJUNTO";\n    }'),
    ('replaceExactText("h3", "Jarvis listo", "NEXO listo");', 'replaceExactText("h3", "Jarvis listo", "ADJUNTO listo");\n    replaceExactText("h3", "NEXO listo", "ADJUNTO listo");'),
    ('        "Motor No-Code | GestiaPremium V5.18",\n        "NEXO | Motor privado no-code de Peninsula Tech"', '        "Motor No-Code | GestiaPremium V5.18",\n        "ADJUNTO | Tecnología privada de Península Tech"'),
    ('            "Dile a NEXO qué debe investigar, crear, analizar o ejecutar...";', '            "Dile a ADJUNTO qué debe investigar, crear, analizar o ejecutar...";')
]
for old, new in branding_replacements:
    if old not in branding:
        raise SystemExit(f"BRANDING_BRIDGE_ANCHOR_MISSING:{old[:80]}")
    branding = branding.replace(old, new, 1)

html_path.write_text(html, encoding="utf-8")
branding_path.write_text(branding, encoding="utf-8")

test_path.write_text(r'''import assert from "node:assert/strict";
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
''', encoding="utf-8")
