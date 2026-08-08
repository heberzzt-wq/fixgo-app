from pathlib import Path

path = Path("tests/jarvis-multifunction-tools.test.mjs")
text = path.read_text(encoding="utf-8")
old = '''        assert.match(precisionAuditQuestion, /carencias concretas de la experiencia de adjuntos/);\n        assert.match(precisionAuditQuestion, /No uses recommendations para proponer investigar/);\n'''
new = '''        assert.match(precisionAuditQuestion, /solicitud original no pide recomendaciones/i);\n        assert.match(precisionAuditQuestion, /recommendations=\\[\\]/);\n        assert.doesNotMatch(precisionAuditQuestion, /carencias concretas de la experiencia de adjuntos/i);\n'''
if old not in text:
    raise SystemExit("missing old recommendation audit assertion anchor")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
