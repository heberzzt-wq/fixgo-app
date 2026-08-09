from pathlib import Path

path = Path('scripts/check-nexo-private-engine.mjs')
text = path.read_text(encoding='utf-8')

old = '''ok(
    resilience.includes("1.3.0-complete-artifact-contract"),
    "resiliencia semántica exige contrato completo de artefacto"
);
ok(
    resilience.includes("cloudPlanCoversLocalMission") &&
        resilience.includes("SEMANTIC_PLAN_INCOMPLETE"),
    "plan cloud incompleto activa recuperación local"
);'''

new = '''ok(
    resilience.includes("1.4.0-semantic-intent-authority") &&
        resilience.includes("localCompilerMayAssist"),
    "resiliencia semántica deja la intención inicial al planificador generalista"
);
ok(
    resilience.includes('phase === "GROUNDED_ARGUMENT_COMPLETION"') &&
        resilience.includes("toolName.length > 0") &&
        resilience.includes("const localPlan = localCompilerMayAssist(requestPayload)"),
    "compilador local sólo asiste argumentos de una herramienta ya seleccionada"
);'''

count = text.count(old)
if count != 1:
    raise SystemExit(f'NEXO_CONTRACT_PATCH_ANCHOR_FAILED:{count}')

path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('V94_GENERALIST_NEXO_CONTRACT_FIX_APPLIED')
