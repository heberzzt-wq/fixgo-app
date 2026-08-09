from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'WAVE2_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


def remove_file(path):
    target = ROOT / path
    if target.exists():
        target.unlink()


path = 'gestia-terminal.html'
text = read(path)
text = replace_once(
    text,
    '<script type="module" src="/gestia-core/jarvis/jarvis.bridge.v4.js?v=jarvis-runtime-macro-v2-20260618"></script>\n',
    '',
    'terminal-legacy-bridge-script'
)
write(path, text)

path = 'gestia-terminal.js'
text = read(path)
for old, label in [
    ('''import {\n    sincronizarCorralSemantico\n} from "/gestia-core/semantic.engine.js";\n\n''', 'terminal-semantic-import'),
    ('''import {\n    interpretarIntenciones\n} from "/gestia-core/intent.engine.js?v=jarvis-runtime-macro-v2-20260618";\n\n''', 'terminal-intent-import'),
    ('''import {\n    runJarvis\n} from "/gestia-core/jarvis/jarvis.orchestrator.js";\n\n''', 'terminal-old-orchestrator-import'),
]:
    text = replace_once(text, old, '', label)

adapter_start = '''// ADAPTER LEGACY → CORE INTENT\n// =====================================================\n\nfunction resolveIntentsAdapter(input, contextoSemantico) {\n\n    const intentInput =\n        typeof input === "object" && input !== null\n            ? `${input.intent || ""}::${input.target || ""}`\n            : input;\n\n    return interpretarIntenciones([\n        {\n            raw: intentInput,\n            context: contextoSemantico\n        }\n    ]);\n}\n\n'''
text = replace_once(text, adapter_start, '', 'terminal-intent-adapter')

legacy_start = '''// 🔥 NORMALIZACIÓN DE COMANDO\n\nconst normalizedCmd = cmd\n    .replace(/^(hola|buenos dias|buenos días|buenas|qué onda|que onda|saludos)[,\\s]*/i, "")\n    .trim();\n\nconst isRepoReadOnlyAudit =\n    !isStructured &&\n    /^(analiza|analisis|análisis|revisa|audita)\\s+(el\\s+)?(repo|repositorio|repository|sistema)$/i.test(normalizedCmd);\n\n// ====================================================================\n// 🧠 [TERMINAL_CORE_FIRST] - GESTIAPREMIUM V16.0 (THE SUPREME SOVEREIGN)\n// ====================================================================\nconst core =\n    window.GestiaCore ||\n    window.SIA7_CORE;\n'''
legacy_end = '''        return await this.runPlan(\n            opId,\n            intents\n        );\n'''
first = text.find(legacy_start)
last = text.find(legacy_end, first + len(legacy_start)) if first >= 0 else -1
if first < 0 or last < 0:
    raise SystemExit('WAVE2_ANCHOR_FAILED:terminal-dead-natural-fallback')
last += len(legacy_end)
replacement = '''// Natural-language interpretation already returned through GestiaCore at the\n// top of execute(). Reaching this point means the input is structured and must\n// follow deterministic governance/execution only. No secondary language brain\n// or lexical fallback is allowed here.\n'''
text = text[:first] + replacement + text[last:]
write(path, text)

path = 'gestia-core/gestia-core.js'
text = read(path)
text = replace_once(
    text,
    '''import {\n    sincronizarCorralSemantico,\n    getSemanticCognitiveState\n} from '/gestia-core/semantic.engine.js?v=sia7-model-context-v8-20260714';\nimport '/gestia-core/brain.engine.js?v=sia7-multimodal-batch-integrity-v95-20260727';\n''',
    '',
    'core-old-brain-imports'
)

fallback_start = '''                /**\n                 * =====================================================================================\n                 * V7.5 HYBRID COGNITION\n                 * =====================================================================================\n                 */\n'''
fallback_end = '''                /**\n * =====================================================================================\n * AGENT LOOP V7 — TOOL PLAN EXECUTION\n'''
first = text.find(fallback_start)
last = text.find(fallback_end, first + len(fallback_start)) if first >= 0 else -1
if first < 0 or last < 0:
    raise SystemExit('WAVE2_ANCHOR_FAILED:core-hybrid-fallback')
replacement = '''                /**\n                 * =====================================================================================\n                 * SINGLE SEMANTIC BRAIN CONTRACT\n                 * =====================================================================================\n                 * terminalPlannerSeed is produced by jarvis.multifunction.planner.\n                 * There is deliberately no Brain/Semantic/Intent fallback.\n                 */\n\n                if (!propuesta) {\n                    atomicState.isHalted = true;\n                    atomicState.haltReason =\n                        "SEMANTIC_PLANNER_NO_EXECUTABLE_PLAN";\n                    atomicState.agentResult = {\n                        version: "8.0.0-single-semantic-brain",\n                        mode: "SEMANTIC_PLANNER_NO_EXECUTABLE_PLAN",\n                        toolCalls: [],\n                        observations: [],\n                        mission: null,\n                        verified: false,\n                        finalResponse: {\n                            ok: false,\n                            title: "ADJUNTO no pudo iniciar la misión",\n                            text: [\n                                "El único planificador semántico no entregó un plan ejecutable.",\n                                "No se activó ningún cerebro alterno ni clasificador local.",\n                                "No se ejecutó ninguna herramienta, no se modificó código y la misión no se reporta como completada."\n                            ].join("\\n"),\n                            source: "SINGLE_SEMANTIC_BRAIN_FAIL_CLOSED"\n                        }\n                    };\n                    return;\n                }\n\n'''
text = text[:first] + replacement + text[last:]
text = text.replace(
    '"HYBRID_REASONING"',
    '"SINGLE_SEMANTIC_PLANNER"',
    1
)
write(path, text)

path = 'app-main.js'
text = read(path)
for old, label in [
    ('''/* =====================================================\n   JARVIS ORCHESTRATION\n===================================================== */\n\nimport {\n\n  runJarvis\n\n} from\n"./gestia-core/jarvis/jarvis.orchestrator.js";\n\nimport {\n\n  analyzeIntent\n\n} from\n"./gestia-core/jarvis/jarvis.vision.engine.js";\n\n''', 'app-main-old-jarvis-imports'),
    ('''/* =====================================================\n   LEGACY BRAIN BRIDGE\n===================================================== */\n\nimport {\n\n  invocarArquitectoIA\n\n} from\n"./gestia-core/brain.engine.js?v=mixed-intent-v2-20260713-technical-diagnostics-v1-multifunction-planner-v1.3-supervision-v1";\n''', 'app-main-brain-import'),
    ('''window.invocarArquitectoIA = invocarArquitectoIA;\n\nconsole.log("🧠 Brain Engine conectado a app-main");\n\n''', 'app-main-brain-global'),
]:
    text = replace_once(text, old, '', label)

old_preload = '''async function smartPreload() {\n  const mods = [\n    "./gestia-core/jarvis/jarvis.orchestrator.js",\n    "./gestia-core/jarvis/jarvis.vision.engine.js",\n    "./app-panel.js",\n    "./app-bi.js"\n  ];'''
new_preload = '''async function smartPreload() {\n  const mods = [\n    "./app-panel.js",\n    "./app-bi.js"\n  ];'''
text = replace_once(text, old_preload, new_preload, 'app-main-smart-preload')
write(path, text)

path = 'package.json'
text = read(path)
for old, label in [
    ('node --check gestia-core/jarvis/jarvis.intent.runtime.v7.js && ', 'package-intent-runtime'),
    (' && node --check gestia-core/jarvis/jarvis.bridge.v4.js', 'package-bridge-v4'),
    (' && node --check gestia-core/intent.engine.js', 'package-intent-engine'),
    (' && node --check gestia-core/repo/repo.cognition.index.js', 'package-repo-cognition-index'),
    (' tests/jarvis-intent-runtime-v7.test.mjs', 'package-intent-runtime-test'),
]:
    text = replace_once(text, old, '', label)
write(path, text)

for obsolete in [
    'gestia-core/cognitive.bootstrap.js',
    'gestia-core/intent.engine.js',
    'gestia-core/intent.engine.v7.js',
    'gestia-core/repo/repo.cognition.index.js',
    'gestia-core/jarvis/jarvis.bridge.v4.js',
    'gestia-core/jarvis/jarvis.intent.runtime.v7.js',
    'gestia-core/jarvis/jarvis.language.core.v5.js',
    'gestia-core/jarvis/jarvis.normalizer.js',
    'tests/jarvis-intent-runtime-v7.test.mjs',
]:
    remove_file(obsolete)

print('V94_SINGLE_BRAIN_PRUNE_WAVE2_APPLIED')
