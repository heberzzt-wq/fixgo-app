from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)


composer_path = Path("gestia-core/jarvis/jarvis.conversation.composer.js")
composer = composer_path.read_text(encoding="utf-8")

replacements = [
    (
        '`Analisis visual verificado de ${sources.length} archivos, con evidencia separada por fuente.`',
        '`Pariente, revisé visualmente ${sources.length} archivos y esto es lo que sí pude confirmar.`',
        "human media intro",
    ),
    (
        'appendNaturalList(lines, "Elementos visuales confirmados:", objects);',
        'appendNaturalList(lines, "Lo que se ve con claridad:", objects);',
        "human objects label",
    ),
    (
        'appendNaturalList(lines, "Observaciones visuales verificadas:", observations);',
        'appendNaturalList(lines, "Lo que pude confirmar:", observations);',
        "human observations label",
    ),
    (
        '            lines.push("Lecturas literales verificadas:");',
        '            lines.push("Texto que pude leer con certeza:");',
        "human literal label",
    ),
    (
        '                "Lecturas literales verificadas: ninguna con confianza suficiente."',
        '                "No pude leer texto con suficiente claridad como para asegurarlo."',
        "human no literal label",
    ),
    (
        '            "Detalles inciertos o ilegibles:",',
        '            "Lo que prefiero dejar como incierto:",',
        "human uncertainty label",
    ),
    (
        '        "Diferencias verificadas:",',
        '        "Diferencias que sí pude comprobar:",',
        "human differences label",
    ),
    (
        '            "Diferencias verificadas: se omitieron comparaciones con etiquetas literales o afirmaciones de ausencia que no quedaron respaldadas por visibleData verificado."',
        '            "Había comparaciones que no quedaron suficientemente respaldadas, así que preferí dejarlas fuera en vez de asumir."',
        "human omitted comparison note",
    ),
    (
        '        "Mejoras sugeridas para la experiencia de adjuntos:",',
        '        "Si quieres mejorar esta experiencia:",',
        "human recommendations label",
    ),
    (
        '            "Mejoras sugeridas: no se muestran propuestas que dependan de etiquetas o capacidades no verificadas visualmente."',
        '            "Dejé fuera sugerencias que dependían de datos o capacidades que no pude comprobar visualmente."',
        "human omitted recommendation note",
    ),
    (
        '        "La mision uso una sola ejecucion efectiva de media.analyze con dos pases independientes de verificacion."',
        '        "Me quedé sólo con lo que pude verificar en las imágenes; lo dudoso lo dejé fuera."',
        "human closing",
    ),
]

for old, new, label in replacements:
    composer = replace_once(composer, old, new, label)

composer_path.write_text(composer, encoding="utf-8")

terminal_path = Path("gestia-terminal.html")
terminal = terminal_path.read_text(encoding="utf-8")

old_trace = '''                        ...(
                            finalResponse?.text &&
                            finalResponse?.source !== "EVIDENCE_GROUNDED_CONVERSATION"
                                ? [
                                    "Evidencia ejecutada:",
                                    ...agentObservations
                                        .map((item, index) =>
                                            `- ${getObservationToolName(item, index)}`
                                        )
                                        .filter((name, index, items) =>
                                            items.indexOf(name) === index
                                        )
                                ]
                                : agentObservations
                                    .map((item, index) =>
                                        [
                                            `Paso ${index + 1}`,
                                            summarizeObservation(item, index)
                                        ]
                                            .join("\\n")
                                    )
                        )'''

new_trace = '''                        ...(
                            finalResponse?.text
                                ? (
                                    finalResponse?.source === "EVIDENCE_GROUNDED_CONVERSATION"
                                        ? []
                                        : [
                                            "Evidencia ejecutada:",
                                            ...agentObservations
                                                .map((item, index) =>
                                                    `- ${getObservationToolName(item, index)}`
                                                )
                                                .filter((name, index, items) =>
                                                    items.indexOf(name) === index
                                                )
                                        ]
                                )
                                : agentObservations
                                    .map((item, index) =>
                                        [
                                            `Paso ${index + 1}`,
                                            summarizeObservation(item, index)
                                        ]
                                            .join("\\n")
                                    )
                        )'''

terminal = replace_once(
    terminal,
    old_trace,
    new_trace,
    "grounded conversation raw trace suppression",
)

old_title = '''                const multiToolTitle =
                    visualPatchProposal
                        ? "Propuesta visual SIA7"
                        : finalResponse?.title ||
                            (
                                isRepoGlobalAnalysis
                                    ? "Análisis del repositorio"
                                    : "Resultado de Jarvis"
                            );'''

new_title = '''                const multiToolTitle =
                    visualPatchProposal
                        ? "Propuesta visual SIA7"
                        : finalResponse?.source === "EVIDENCE_GROUNDED_CONVERSATION"
                            ? "Jarvis"
                            : finalResponse?.title ||
                                (
                                    isRepoGlobalAnalysis
                                        ? "Análisis del repositorio"
                                        : "Resultado de Jarvis"
                                );'''

terminal = replace_once(
    terminal,
    old_title,
    new_title,
    "grounded conversation title",
)

terminal_path.write_text(terminal, encoding="utf-8")

test_path = Path("tests/jarvis-conversation-composer.test.mjs")
tests = test_path.read_text(encoding="utf-8")

old_assertions = '''    assert.equal(result.ok, true);
    assert.doesNotMatch(result.text, /fewer options|more limited menu/i);
    assert.match(result.text, /ChatGPT Plus/);
    assert.match(result.text, /Terminal Heberto/);
});'''

new_assertions = '''    assert.equal(result.ok, true);
    assert.match(result.text, /Pariente, revisé visualmente 2 archivos/i);
    assert.doesNotMatch(result.text, /fewer options|more limited menu/i);
    assert.match(result.text, /ChatGPT Plus/);
    assert.match(result.text, /Terminal Heberto/);
    assert.match(result.text, /Me quedé sólo con lo que pude verificar/i);
    assert.doesNotMatch(result.text, /La mision uso una sola ejecucion efectiva/i);
});'''

tests = replace_once(
    tests,
    old_assertions,
    new_assertions,
    "human media composer regression",
)

marker = "terminal hides grounded multimodal telemetry from the human chat surface"
if marker not in tests:
    tests = tests.rstrip() + r'''


test("terminal hides grounded multimodal telemetry from the human chat surface", () => {
    const terminalSource = fs.readFileSync(
        path.join(process.cwd(), "gestia-terminal.html"),
        "utf8"
    );
    const start = terminalSource.indexOf("const multiToolSummarySource =");
    const end = terminalSource.indexOf("const multiToolSummary =", start);
    assert.ok(start >= 0 && end > start);
    const summaryBlock = terminalSource.slice(start, end);

    assert.match(
        summaryBlock,
        /finalResponse\?\.source === "EVIDENCE_GROUNDED_CONVERSATION"\s*\? \[\]/
    );
    assert.match(
        terminalSource,
        /finalResponse\?\.source === "EVIDENCE_GROUNDED_CONVERSATION"\s*\? "Jarvis"/
    );
});
'''

test_path.write_text(tests, encoding="utf-8")
