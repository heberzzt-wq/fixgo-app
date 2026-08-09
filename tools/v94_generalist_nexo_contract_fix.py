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
text = text.replace(old, new, 1)

old_tests = '''ok(
    resilienceTests.includes("cloud page plan without page.create") &&
        resilienceTests.includes("cloudPlanCoversLocalMission"),
    "prueba rechaza un plan cloud de página incompleto"
);
ok(
    resilienceTests.includes("complete cloud artifact contract is accepted"),
    "prueba conserva un plan cloud completo"
);'''

new_tests = '''ok(
    resilienceTests.includes("local compiler never owns initial or contract intent") &&
        resilienceTests.includes("semantic cloud plan is authoritative when no grounded tool requires completion"),
    "pruebas exigen autoridad semántica del turno inicial"
);
ok(
    resilienceTests.includes("grounded argument completion still requires the semantically selected tool") &&
        resilienceTests.includes("local compiler may assist only an already selected grounded tool"),
    "pruebas conservan recuperación local sólo para argumentos ya seleccionados"
);'''

count = text.count(old_tests)
if count != 1:
    raise SystemExit(f'NEXO_TEST_CONTRACT_PATCH_ANCHOR_FAILED:{count}')
text = text.replace(old_tests, new_tests, 1)

path.write_text(text, encoding='utf-8')
print('V94_GENERALIST_NEXO_CONTRACT_FIX_APPLIED')
