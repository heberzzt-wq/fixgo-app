from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one fixture anchor, found {count}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

replace_once(
    'tests/jarvis-marketing-real-delivery.test.mjs',
    '''            return nextRequirement\n                ? { toolCalls: [{ name: nextRequirement.toolName, args: {} }], missionComplete: false }\n                : { toolCalls: [], missionComplete: true };''',
    '''            const args = nextRequirement?.toolName === "reel.create"\n                ? {\n                    brandName: "Multiservicios Peninsulares HMH",\n                    durationSeconds: 30,\n                    scenes: [{\n                        durationSeconds: 30,\n                        overlay: "Servicio verificado",\n                        assetOutput: ".jarvis-artifacts/web-media/marketing-fixture/primary.mp4"\n                    }]\n                }\n                : {};\n            return nextRequirement\n                ? { toolCalls: [{ name: nextRequirement.toolName, args }], missionComplete: false }\n                : { toolCalls: [], missionComplete: true };'''
)

replace_once(
    'tests/jarvis-marketing-terminal-delivery.e2e.test.mjs',
    '''    if (requirement.toolName === "reel.create") {\n        return { brandName: "Península Tech", title: "Servicio con trazabilidad", cta: "Solicita tu servicio", durationSeconds: 30, scenes: [] };\n    }''',
    '''    if (requirement.toolName === "reel.create") {\n        return {\n            brandName: "Península Tech",\n            title: "Servicio con trazabilidad",\n            cta: "Solicita tu servicio",\n            durationSeconds: 30,\n            scenes: [{\n                durationSeconds: 30,\n                overlay: "Servicio con trazabilidad",\n                assetOutput: ".jarvis-artifacts/web-media/e2e/primary.mp4"\n            }]\n        };\n    }'''
)

print('v136 marketing fixtures aligned with explicit visual media')
