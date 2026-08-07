from pathlib import Path
import subprocess

subprocess.run(
    ["python3", ".github/scripts/v94-media-ui-grounding-v4b.py"],
    check=True
)

function_path = Path("functions/jarvis-media-analysis.js")
source = function_path.read_text(encoding="utf-8")

old = r'''const PROPER_UI_LITERAL_PATTERN = /\b(?:[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*|[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*)+)\b/g;'''
new = r'''const PROPER_UI_LITERAL_PATTERN = /\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*|[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*)+)\b/g;'''

if old not in source:
    raise SystemExit("v4c proper UI literal detector anchor not found")

source = source.replace(old, new, 1)
function_path.write_text(source, encoding="utf-8")
