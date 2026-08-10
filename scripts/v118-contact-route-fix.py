from pathlib import Path

path = Path("jarvis-page-artifact.js")
source = path.read_text(encoding="utf-8")
old = '''    const phoneHref = whatsapp
        ? `https://wa.me/${whatsapp}`
        : whatsappRequested
            ? "https://wa.me/"
            : "";
'''
new = '''    const phoneHref = whatsapp
        ? `https://wa.me/${whatsapp}`
        : "";
'''
if source.count(old) != 1:
    raise SystemExit(f"expected one unverified WhatsApp fallback, found {source.count(old)}")
source = source.replace(old, new, 1)
path.write_text(source, encoding="utf-8")
print("v118 verified contact route repair applied")
