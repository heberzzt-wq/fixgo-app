from pathlib import Path


def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{path}: expected {count} match(es), found {actual}: {old[:120]!r}")
    p.write_text(text.replace(old, new, count), encoding="utf-8")

# Existing tests must provide the semantic fields that production planner is now required to provide.
replace(
    "tests/jarvis-marketing-engine-v2.test.mjs",
    '''            cta: "Solicita un diagnóstico",\n            services: [{ name: "Diagnóstico técnico", source: "landing" }],''',
    '''            cta: "Solicita un diagnóstico",\n            tone: "directo, confiable y profesional",\n            metrics: ["conversaciones calificadas", "conversión de landing", "costo por lead", "solicitudes de servicio"],\n            hashtags: ["#FixGo", "#Cancún", "#ServiciosTécnicos"],\n            services: [{ name: "Diagnóstico técnico", source: "landing" }],''',
)
replace(
    "tests/jarvis-marketing-engine-v2.test.mjs",
    '''        channels: ["Google", "LinkedIn"],\n        productionRequested: false,''',
    '''        channels: ["Google", "LinkedIn"],\n        tone: "serio y profesional",\n        metrics: ["consultas calificadas", "conversión", "costo por consulta", "citas"],\n        productionRequested: false,''',
)
replace(
    "tests/jarvis-marketing-engine-v2.test.mjs",
    '''            cta: "Solicitar servicio o registrarse como profesional",\n            channels: ["Meta Ads", "Google Ads", "contenido local", "WhatsApp", "referidos"]''',
    '''            cta: "Solicitar servicio o registrarse como profesional",\n            tone: "claro, confiable y local",\n            metrics: ["solicitudes de servicio", "registros de profesionales", "conversión", "costo por adquisición"],\n            channels: ["Meta Ads", "Google Ads", "contenido local", "WhatsApp", "referidos"]''',
)

replace(
    "tests/jarvis-marketing-real-delivery.test.mjs",
    '''    horizon: "90 días",\n    channels: ["Instagram", "Facebook", "TikTok", "WhatsApp"],''',
    '''    horizon: "90 días",\n    tone: "claro, confiable y profesional",\n    metrics: ["conversaciones calificadas", "solicitudes", "conversión", "costo por lead"],\n    channels: ["Instagram", "Facebook", "TikTok", "WhatsApp"],''',
)

replace(
    "tests/jarvis-marketing-terminal-delivery.e2e.test.mjs",
    '''    horizon: "90 días",\n    channels: ["Instagram", "Facebook", "TikTok", "WhatsApp"],''',
    '''    horizon: "90 días",\n    tone: "claro, confiable y tecnológico",\n    metrics: ["conversaciones calificadas", "solicitudes", "conversión", "costo por lead"],\n    channels: ["Instagram", "Facebook", "TikTok", "WhatsApp"],''',
)

replace(
    "tests/jarvis-mission-orchestrator.test.mjs",
    '''            differentiator: "Profesionales verificados, evidencia digital y seguimiento",\n            channels: ["Meta Ads", "Google Ads", "WhatsApp"],''',
    '''            differentiator: "Profesionales verificados, evidencia digital y seguimiento",\n            tone: "claro, confiable y profesional",\n            metrics: ["solicitudes", "conversaciones calificadas", "conversión", "costo por lead"],\n            channels: ["Meta Ads", "Google Ads", "WhatsApp"],''',
)

print("Marketing fixtures aligned with semantic-only contract")
