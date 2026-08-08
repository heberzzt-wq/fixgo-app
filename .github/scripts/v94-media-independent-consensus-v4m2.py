from pathlib import Path
import subprocess

subprocess.run(
    ["python3", ".github/scripts/v94-media-independent-consensus-v4m.py"],
    check=True
)

pack_path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
pack = pack_path.read_text(encoding="utf-8")
old = '"En recommendations enumera carencias concretas comprobables por contraste visual.",'
new = '"En recommendations enumera carencias concretas de la experiencia de adjuntos que puedan comprobarse por contraste visual.",'
if old not in pack:
    raise SystemExit("v4m2 recommendation compatibility anchor missing")
pack = pack.replace(old, new, 1)
pack_path.write_text(pack, encoding="utf-8")
