from pathlib import Path

path = Path("tests/jarvis-reel-real-production-v134.test.mjs")
text = path.read_text(encoding="utf-8")
old = '''        has(name) {\n            return registry.has(name);\n        }\n'''
new = '''        has(name) {\n            return registry.has(name);\n        },\n        get(name) {\n            return registry.get(name);\n        }\n'''
if text.count(old) != 1:
    raise SystemExit(f"fixture match count={text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("v134 fixture aligned")
