from pathlib import Path

ROOT = Path('.')
path = ROOT / 'gestia-core/jarvis/jarvis.multitool.pack.js'
text = path.read_text(encoding='utf-8')

old = '''        horizon: { type: "string" },\n        durationSeconds: { type: "number" }\n'''
new = '''        horizon: { type: "string" },\n        productionRequested: { type: "boolean" },\n        productionArtifacts: {\n            type: "array",\n            items: {\n                type: "object",\n                properties: {\n                    id: { type: "string" },\n                    type: { type: "string" },\n                    toolName: { type: "string" },\n                    format: { type: "string" },\n                    label: { type: "string" }\n                },\n                required: ["type", "toolName", "label"],\n                additionalProperties: false\n            }\n        },\n        durationSeconds: { type: "number" }\n'''

count = text.count(old)
if count != 1:
    raise SystemExit(f'MARKETING_ARGUMENT_SCHEMA_ANCHOR_FAILED:{count}')

text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('V94_MARKETING_ARGUMENT_SCHEMA_FIX_APPLIED')
