from pathlib import Path

ROOT = Path('.')
path = ROOT / 'gestia-core/jarvis/jarvis.multitool.pack.js'
text = path.read_text(encoding='utf-8')

old = '''function hasPlanningValue(value) {\n    if (typeof value === "string") return Boolean(value.trim());\n    if (Array.isArray(value)) return value.length > 0;\n    if (typeof value === "number") return Number.isFinite(value);\n    return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);\n}\n'''
new = '''function hasPlanningValue(value) {\n    if (typeof value === "string") return Boolean(value.trim());\n    if (Array.isArray(value)) return value.length > 0;\n    if (typeof value === "number") return Number.isFinite(value);\n    if (typeof value === "boolean") return true;\n    return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);\n}\n'''

count = text.count(old)
if count != 1:
    raise SystemExit(f'MARKETING_BOOLEAN_SCOPE_ANCHOR_FAILED:{count}')

text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('V94_MARKETING_BOOLEAN_SCOPE_FIX_APPLIED')
