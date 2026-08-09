from pathlib import Path

path = Path('gestia-core/jarvis/jarvis.marketing.presenter.js')
text = path.read_text(encoding='utf-8')
old = '''function taskMatchesRequirement(item = {}, requirement = {}) {\n    if (String(item?.name || "") !== requirement.toolName) return false;\n    if (requirement.toolName === "document.create") {\n        if (item?.args?.contentSource !== "marketing.plan") return false;\n        if (requirement.format && String(item?.args?.format || "").toLowerCase() !== requirement.format) return false;\n    }\n    return true;\n}\n'''
new = '''function taskMatchesRequirement(item = {}, requirement = {}) {\n    if (String(item?.name || "") !== requirement.toolName) return false;\n    if (requirement.toolName === "document.create") {\n        const format = String(requirement.format || "").toLowerCase();\n        if (format && String(item?.args?.format || "").toLowerCase() !== format) return false;\n        if (["md", "pdf"].includes(format) && item?.args?.contentSource !== "marketing.plan") return false;\n    }\n    return true;\n}\n'''
count = text.count(old)
if count != 1:
    raise SystemExit(f'MARKETING_PRESENTER_MATCH_ANCHOR_FAILED:{count}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('V94_MARKETING_PRESENTER_MATCH_FIX_APPLIED')
