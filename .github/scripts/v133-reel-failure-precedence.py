from pathlib import Path

path = Path("gestia-core/jarvis/jarvis.mission.orchestrator.js")
source = path.read_text(encoding="utf-8")
old = '''        if (\n            !genericRuntimeEnvelopeStatus(\n                current?.status\n            )\n        ) {\n            break;\n        }\n\n        const nested =\n'''
new = '''        const currentStatus =\n            text(\n                current?.status,\n                120\n            )\n                .toUpperCase();\n        const outerFailureEnvelope =\n            depth === 0 &&\n            isFailureStatus(\n                currentStatus\n            );\n        if (\n            !genericRuntimeEnvelopeStatus(\n                currentStatus\n            ) &&\n            !outerFailureEnvelope\n        ) {\n            break;\n        }\n\n        const nested =\n'''
if source.count(old) != 1:
    raise SystemExit(f"V133_FAILURE_PRECEDENCE_TARGET_COUNT={source.count(old)}")
source = source.replace(old, new, 1)
path.write_text(source, encoding="utf-8")
print("V133_FAILURE_PRECEDENCE_PATCHED=true")
