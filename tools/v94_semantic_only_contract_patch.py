from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'CONTRACT_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


path = 'scripts/check-nexo-private-engine.mjs'
text = read(path)
text = replace_once(
    text,
    '''    marketing.includes('const VERSION = "8.1.0-nexo-complete-marketing-package"') &&\n        marketing.includes('source: "nexo_natural_brief_and_optional_evidence"') &&\n        marketing.includes('routing: "natural_instruction_with_semantic_and_local_resilience"'),\n    "marketing usa el motor NEXO natural vigente"\n''',
    '''    marketing.includes('const VERSION = "8.1.0-nexo-complete-marketing-package"') &&\n        marketing.includes('source: "nexo_natural_brief_and_optional_evidence"') &&\n        marketing.includes('routing: "semantic_fields_with_editable_assumptions"'),\n    "marketing recibe campos semánticos y no reclasifica lenguaje localmente"\n''',
    'nexo-marketing-routing-contract'
)
write(path, text)

path = 'tests/jarvis-marketing-engine-v2.test.mjs'
text = read(path)
text = replace_once(
    text,
    '''        NexoMarketingEngine.routing,\n        "natural_instruction_with_semantic_and_local_resilience"\n''',
    '''        NexoMarketingEngine.routing,\n        "semantic_fields_with_editable_assumptions"\n''',
    'marketing-routing-test'
)

old_missing = '''test("NEXO marketing keeps a technically successful request pending when critical context is missing", () => {\n    const result = planMarketingRequest(\n        "Crea un plan de marketing completo para Multiservicios Peninsulares HMH."\n    );\n\n    assert.equal(result.ok, true);\n    assert.equal(result.executionOk, true);\n    assert.equal(result.objectiveSatisfied, false);\n    assert.equal(result.requiresInput, true);\n    assert.equal(result.readyForProduction, false);\n    assert.equal(result.status, "MARKETING_INPUT_REQUIRED");\n    assert.ok(result.missingInputs.includes("audience"));\n    assert.ok(result.questions.length <= 4);\n    assert.match(result.message, /conservaré lo ya proporcionado/i);\n});'''
new_missing = '''test("NEXO marketing requires only structured factual brand identity", () => {\n    const result = planMarketingRequest(\n        "Prepara el plan integral solicitado."\n    );\n\n    assert.equal(result.ok, true);\n    assert.equal(result.executionOk, true);\n    assert.equal(result.objectiveSatisfied, false);\n    assert.equal(result.requiresInput, true);\n    assert.equal(result.readyForProduction, false);\n    assert.equal(result.status, "MARKETING_INPUT_REQUIRED");\n    assert.deepEqual(result.missingInputs, ["brandName"]);\n    assert.equal(result.questions.length, 1);\n});'''
text = replace_once(text, old_missing, new_missing, 'marketing-brand-identity-only')

old_isolation = '''test("NEXO marketing isolates an explicitly named plan from stale completed context", () => {\n    const stale = {\n        brandName: "Peninsula Tech",\n        name: "Peninsula Tech",\n        campaignObjective: "Captar clientes anteriores",\n        audience: "Clientes residenciales y empresariales",\n        market: "México",\n        offer: "Oferta anterior",\n        pain: "Problema anterior",\n        promise: "Promesa anterior",\n        differentiator: "Diferenciador anterior",\n        budget: "escenario anterior",\n        horizon: "90 días",\n        cta: "Solicita una evaluación con Peninsula Tech",\n        channels: ["instagram", "facebook", "tiktok", "whatsapp"]\n    };\n    const result = planMarketingRequest(\n        "Crea un plan de marketing completo para Multiservicios Peninsulares HMH.",\n        { ...stale, marketingContext: { ...stale } }\n    );\n\n    assert.equal(result.status, "MARKETING_INPUT_REQUIRED");\n    assert.equal(result.requiresInput, true);\n    assert.equal(result.objectiveSatisfied, false);\n    assert.equal(result.preservedContext.brandName, "Multiservicios Peninsulares HMH");\n    assert.equal(result.preservedContext.name, "Multiservicios Peninsulares HMH");\n    assert.equal(result.preservedContext.contextIsolation, "EXPLICIT_BRAND_MISSION_ISOLATED");\n    assert.equal(result.preservedContext.campaignObjective, undefined);\n    assert.equal(result.preservedContext.audience, undefined);\n    assert.equal(result.preservedContext.cta, undefined);\n    assert.ok(result.missingInputs.includes("campaignObjective"));\n    assert.ok(result.missingInputs.includes("audience"));\n    assert.ok(result.missingInputs.includes("offer"));\n    assert.ok(result.missingInputs.includes("budget"));\n});'''
new_isolation = '''test("NEXO marketing isolates structured current brand identity from stale completed context", () => {\n    const stale = {\n        brandName: "Peninsula Tech",\n        name: "Peninsula Tech",\n        campaignObjective: "Captar clientes anteriores",\n        audience: "Clientes residenciales y empresariales",\n        market: "México",\n        offer: "Oferta anterior",\n        pain: "Problema anterior",\n        promise: "Promesa anterior",\n        differentiator: "Diferenciador anterior",\n        budget: "escenario anterior",\n        horizon: "90 días",\n        cta: "Solicita una evaluación con Peninsula Tech",\n        channels: ["instagram", "facebook", "tiktok", "whatsapp"]\n    };\n    const result = planMarketingRequest(\n        "Prepara el plan integral solicitado.",\n        {\n            brandName: "Multiservicios Peninsulares HMH",\n            name: "Multiservicios Peninsulares HMH",\n            marketingContext: { ...stale }\n        }\n    );\n\n    assert.equal(result.status, "MARKETING_PACKAGE_READY");\n    assert.equal(result.requiresInput, false);\n    assert.equal(result.objectiveSatisfied, true);\n    assert.equal(result.brand.name, "Multiservicios Peninsulares HMH");\n    assert.notEqual(result.brand.market, "México");\n    assert.equal(result.inferredInputs.includes("audience"), true);\n    assert.equal(result.inferredInputs.includes("offer"), true);\n    assert.equal(result.inferredInputs.includes("budget"), true);\n    assert.equal(result.inferredInputs.includes("campaignObjective"), true);\n});'''
text = replace_once(text, old_isolation, new_isolation, 'marketing-structured-brand-isolation')
write(path, text)

print('V94_SEMANTIC_ONLY_CONTRACT_PATCH_APPLIED')
