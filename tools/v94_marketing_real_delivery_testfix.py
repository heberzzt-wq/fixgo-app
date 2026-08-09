from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'MARKETING_TESTFIX_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


path = 'tests/jarvis-marketing-engine-v2.test.mjs'
text = read(path)
text = replace_once(
    text,
    '''            objectiveId: "MKT-TEST-1",\n            assets: ["landing_page", "flyer", "reel"],\n            channels: ["instagram", "tiktok"],\n            pain: "Las fallas técnicas detienen la operación del negocio",\n''',
    '''            objectiveId: "MKT-TEST-1",\n            assets: ["landing_page", "flyer", "reel"],\n            channels: ["instagram", "tiktok"],\n            audience: "hogares y negocios que necesitan soporte técnico confiable",\n            offer: "servicios técnicos coordinados con seguimiento",\n            market: "Cancún, Quintana Roo",\n            campaignObjective: "generar conversaciones calificadas y solicitudes de servicio",\n            horizon: "90 días",\n            productionRequested: true,\n            productionArtifacts: [\n                { type: "landing_page", toolName: "page.create", label: "Landing HTML" },\n                { type: "flyer", toolName: "image.generate", label: "Imagen publicitaria" },\n                { type: "reel", toolName: "reel.create", label: "Reel 9:16" }\n            ],\n            pain: "Las fallas técnicas detienen la operación del negocio",\n''',
    'first-production-context'
)
text = replace_once(
    text,
    '    assert.equal(plan.version, "8.1.0-nexo-complete-marketing-package");',
    '    assert.equal(plan.version, "8.2.0-semantic-brief-real-delivery-contract");',
    'marketing-version-expectation'
)
text = replace_once(
    text,
    '''        differentiator: "Experiencia documentada",\n        cta: "Agenda una consulta",\n        webResearch: [\n''',
    '''        differentiator: "Experiencia documentada",\n        cta: "Agenda una consulta",\n        market: "México",\n        campaignObjective: "generar consultas calificadas",\n        horizon: "90 días",\n        channels: ["Google", "LinkedIn"],\n        productionRequested: false,\n        webResearch: [\n''',
    'grounded-context-complete'
)
write(path, text)


path = 'tests/jarvis-mission-orchestrator.test.mjs'
text = read(path)
text = replace_once(
    text,
    '''            offer: "Multiservicios verificados",\n            budget: "bajo y medio",\n''',
    '''            offer: "Multiservicios verificados",\n            pain: "Dificultad para encontrar profesionales confiables con seguimiento",\n            budget: "bajo y medio",\n''',
    'resume-context-pain'
)
write(path, text)

print('V94_MARKETING_REAL_DELIVERY_TESTFIX_APPLIED')
