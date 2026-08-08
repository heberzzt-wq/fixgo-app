from pathlib import Path
import subprocess

subprocess.run(
    ['python3', '.github/scripts/v94-attachment-analysis-route-v4k.py'],
    check=True
)

planner_path = Path('gestia-core/jarvis/jarvis.multifunction.planner.js')
test_path = Path('tests/jarvis-multifunction-tools.test.mjs')
planner = planner_path.read_text(encoding='utf-8')
tests = test_path.read_text(encoding='utf-8')

old_creation_tail = '''    const positiveSignals = [
        "genera una imagen",
        "genera imagen",
        "generame una imagen",
        "crea una imagen",
        "crea imagen",
        "diseña una imagen",
        "disena una imagen",
        "produce una imagen",
        "renderiza una imagen",
        "edita esta imagen",
        "edita la imagen",
        "modifica esta imagen",
        "modifica la imagen",
        "transforma esta imagen",
        "transforma la imagen",
        "generate an image",
        "create an image",
        "edit this image",
        "modify this image",
        "transform this image"
    ];

    return positiveSignals.some(signal =>
        text.includes(signal)
    );
}'''
new_creation_tail = '''    const positiveSignals = [
        "genera una imagen",
        "genera imagen",
        "generame una imagen",
        "crea una imagen",
        "crea imagen",
        "diseña una imagen",
        "disena una imagen",
        "produce una imagen",
        "renderiza una imagen",
        "edita esta imagen",
        "edita la imagen",
        "modifica esta imagen",
        "modifica la imagen",
        "transforma esta imagen",
        "transforma la imagen",
        "generate an image",
        "create an image",
        "edit this image",
        "modify this image",
        "transform this image"
    ];

    if (positiveSignals.some(signal =>
        text.includes(signal)
    )) {
        return true;
    }

    const explicitVisualCreation =
        /\\b(genera|generar|generame|crea|crear|creame|diseña|disena|produce|producir|renderiza|generate|create|design|produce|render)\\b[\\s\\S]{0,100}\\b(imagen|image|foto|photo|paisaje|landscape|retrato|portrait|ilustracion|ilustración|illustration|grafico|gráfico|graphic|poster|banner|pieza visual|visual)\\b/;

    return explicitVisualCreation.exec(text) !== null;
}'''
if old_creation_tail not in planner:
    raise SystemExit('v4k2 visual creation anchor not found')
planner = planner.replace(old_creation_tail, new_creation_tail, 1)

planner = planner.replace(
    'if (creationVerb.test(text) && deliverableNoun.test(text)) {',
    'if (creationVerb.exec(text) && deliverableNoun.exec(text)) {',
    1
)
planner = planner.replace(
    'return externalResearch.test(text);',
    'return externalResearch.exec(text) !== null;',
    1
)

if '.test(' in planner:
    raise SystemExit('v4k2 planner still contains forbidden .test( phrase gate')

old_expected_version = '"4.14.0-identity-fidelity"'
new_expected_version = '"4.15.0-attachment-analysis-route"'
if old_expected_version not in tests:
    raise SystemExit('v4k2 expected planner version anchor not found')
tests = tests.replace(old_expected_version, new_expected_version, 1)

planner_path.write_text(planner, encoding='utf-8')
test_path.write_text(tests, encoding='utf-8')
