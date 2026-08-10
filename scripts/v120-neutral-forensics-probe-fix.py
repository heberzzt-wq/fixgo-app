from pathlib import Path

path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
source = path.read_text(encoding="utf-8")
old = '["web.research", { query: "Multiservicios Peninsulares HMH sitio oficial" }],'
new = '["web.research", { query: "IANA Example Domains", allowedDomain: "iana.org" }],'
if source.count(old) != 1:
    raise SystemExit(f"V120_FORENSICS_BUSINESS_PROBE_COUNT_{source.count(old)}")
source = source.replace(old, new, 1)
path.write_text(source, encoding="utf-8")
print("V120_NEUTRAL_FORENSICS_PROBE_APPLIED")
