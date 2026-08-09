from pathlib import Path

FILES = [
    'gestia-terminal.html',
    'gestia-terminal.js',
    'app-main.js',
    'gestia-core/gestia-core.js',
    'gestia-core/self-repair.engine.js',
    'gestia-core/jarvis/jarvis.bridge.v4.js',
    'gestia-core/jarvis/jarvis.orchestrator.js',
    'gestia-core/jarvis/jarvis.vision.engine.js',
    'gestia-core/hubs/analysis.hub.js',
    'modules/terminal/runtime-governance.js',
    'modules/terminal/repo-bootstrap-index.js',
]
TOKENS = [
    'brain.engine.js',
    'semantic.engine.js',
    'intent.engine.js',
    'intent.engine.v7.js',
    'plans.engine.js',
    'cognitive.bootstrap.js',
    'repo.cognition.index.js',
    'jarvis-nlu-bridge.js',
    'jarvis.intent.runtime.v7.js',
    'jarvis.language.core.v5.js',
    'jarvis.cognition.engine.js',
    'jarvis.vision.engine.js',
    'jarvis.normalizer.js',
    'sincronizarCorralSemantico',
    'interpretarIntenciones',
    'resolveIntentsAdapter',
    'approvePlan',
    'invocarArquitectoIA',
    'runCognitiveReasoning',
    'JarvisCognitionEngine',
    'understandIntentV7',
]

for file in FILES:
    path = Path(file)
    if not path.exists():
        continue
    lines = path.read_text(encoding='utf-8').splitlines()
    hits = []
    for number, line in enumerate(lines, 1):
        found = [token for token in TOKENS if token in line]
        if found:
            hits.append((number, found, line.strip()))
    if not hits:
        continue
    print(f'FILE\t{file}\tHITS={len(hits)}')
    for number, found, line in hits:
        print(f'  L{number}\t{"|".join(found)}\t{line[:320]}')
