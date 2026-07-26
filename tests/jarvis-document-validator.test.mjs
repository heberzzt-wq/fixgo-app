import assert from "node:assert/strict";
import test from "node:test";

import {
    describeDocumentValidator,
    extractDocumentContract,
    validateDocumentBlueprint
} from "../gestia-core/jarvis/jarvis.document.validator.js";

const manualInstruction = [
    "Crea un manual profesional de mínimo 600 palabras, 18 secciones, 25 preguntas, clave completa de respuestas y siete formatos operativos con tablas reales.",
    "1. Portada",
    "2. Índice de contenido",
    "3. Objetivo y alcance",
    "4. Roles y responsabilidades",
    "5. Inventario de la flota",
    "6. Programa de mantenimiento preventivo",
    "7. Lista de inspección diaria",
    "8. Protocolo de emergencia",
    "9. Matriz de severidad",
    "10. Flujo de atención de incidentes",
    "11. Control de refacciones",
    "12. Indicadores KPI",
    "13. Plan de implementación de 30 días",
    "14. Formatos operativos",
    "15. Capacitación",
    "16. Evaluación final",
    "17. Glosario",
    "18. Anexos"
].join("\n");

function validManualContent() {
    const headings = [
        "Portada",
        "Índice de contenido",
        "Objetivo y alcance",
        "Roles y responsabilidades",
        "Inventario de la flota",
        "Programa de mantenimiento preventivo",
        "Lista de inspección diaria",
        "Protocolo de emergencia",
        "Matriz de severidad",
        "Flujo de atención de incidentes",
        "Control de refacciones",
        "Indicadores KPI",
        "Plan de implementación de 30 días",
        "Formatos operativos",
        "Capacitación",
        "Evaluación final",
        "Glosario",
        "Anexos"
    ];
    const sections = headings.map((heading, index) =>
        `# ${index + 1}. ${heading}\n\n${("Procedimiento operativo verificable con responsables, criterios, evidencias y acciones de control. ").repeat(5)}`
    );
    const tables = Array.from({ length: 7 }, (_, index) => [
        `## Formato ${index + 1}`,
        "| Responsable | Fecha | Observación | Acción requerida | Firma |",
        "|---|---|---|---|---|",
        `| Responsable ${index + 1} | 2026-07-25 | Registro verificable | Cerrar hallazgo | Pendiente de firma |`
    ].join("\n"));
    const questions = Array.from({ length: 25 }, (_, index) =>
        `${index + 1}. ¿Cuál es la acción operativa correcta para el caso ${index + 1}?`
    ).join("\n");
    const answers = Array.from({ length: 25 }, (_, index) =>
        `${index + 1}. Respuesta correcta ${index + 1}`
    ).join("\n");
    return [
        ...sections.slice(0, 16),
        questions,
        "## Clave completa de respuestas",
        answers,
        ...sections.slice(16),
        ...tables,
        ("Contenido adicional único para asegurar extensión suficiente, trazabilidad y consistencia documental. ").repeat(45)
    ].join("\n\n");
}

test("document validator describes the V68 structural gate", () => {
    const description = describeDocumentValidator();
    assert.equal(description.ok, true);
    assert.equal(description.version, "1.4.0-repair-candidate-contract");
    assert.ok(description.checks.includes("placeholder-and-diversity"));
});

test("document contract preserves explicit quantitative requirements", () => {
    const contract = extractDocumentContract(manualInstruction);
    assert.equal(contract.minWords, 600);
    assert.equal(contract.minSections, 18);
    assert.equal(contract.minQuestions, 25);
    assert.equal(contract.minTemplates, 7);
    assert.equal(contract.minTables, 1);
    assert.equal(contract.requireAnswerKey, true);
    assert.equal(contract.requiredSections.length, 18);
});

test("document validator rejects the real two-paragraph placeholder reproduction", () => {
    const result = validateDocumentBlueprint({
        instruction: manualInstruction,
        completionMarkerPresent: true,
        content: [
            "Manual Operativo de Mantenimiento Preventivo y Atención de Emergencias para una Flota de 25 Vehículos de Servicio en Cancún",
            "El contenido completo del manual generado por document.compose."
        ].join("\n\n")
    });

    assert.equal(result.ok, false);
    assert.equal(result.wordCount, 27);
    assert.equal(result.tableBlueprintCount, 0);
    assert.equal(result.placeholderDetected, true);
    assert.ok(result.failures.includes("DOCUMENT_PLACEHOLDER_DETECTED"));
    assert.ok(result.failures.some(item => item.startsWith("DOCUMENT_WORD_COUNT_BELOW_MINIMUM")));
    assert.ok(result.failures.some(item => item.startsWith("DOCUMENT_REQUIRED_SECTIONS_MISSING")));
    assert.ok(result.failures.some(item => item.startsWith("DOCUMENT_TABLE_COUNT_BELOW_MINIMUM")));
});

test("document validator rejects truncated content without the completion marker", () => {
    const result = validateDocumentBlueprint({
        instruction: "Crea un documento de al menos 80 palabras.",
        completionMarkerPresent: false,
        content: ("Contenido operativo todavía incompleto y sin cierre verificable. ").repeat(20)
    });

    assert.equal(result.ok, false);
    assert.ok(result.failures.includes("DOCUMENT_COMPLETION_MARKER_MISSING"));
});

test("document validator accepts a complete multi-section blueprint with tables and answer key", () => {
    const result = validateDocumentBlueprint({
        instruction: manualInstruction,
        completionMarkerPresent: true,
        content: validManualContent()
    });

    assert.equal(result.ok, true, JSON.stringify(result.failures));
    assert.ok(result.wordCount >= 600);
    assert.ok(result.sectionCount >= 18);
    assert.ok(result.tableBlueprintCount >= 7);
    assert.ok(result.templateCount >= 7);
    assert.equal(result.questionCount, 25);
    assert.equal(result.answerKeyCount, 25);
    assert.equal(result.missingSections.length, 0);
    assert.equal(result.validationPassed, true);
});

function table(headers, rows) {
    return [
        `| ${headers.join(" | ")} |`,
        `|${headers.map(() => "---").join("|")}|`,
        ...rows.map(row => `| ${row.join(" | ")} |`)
    ].join("\n");
}

function quantitativeContent({
    vehicles = 25,
    parts = 15,
    kpis = 12,
    days = 30
} = {}) {
    return [
        "# Inventario de la flota",
        table(
            ["Unidad", "Kilometraje", "Estado"],
            Array.from({ length: vehicles }, (_, index) => [
                `FG-${index + 1}`,
                String(1000 + index),
                "Operativa"
            ])
        ),
        "# Control de refacciones",
        table(
            ["Código", "Refacción", "Cantidad"],
            Array.from({ length: parts }, (_, index) => [
                `RF-${index + 1}`,
                `Refacción ${index + 1}`,
                "1"
            ])
        ),
        "# Indicadores KPI",
        table(
            ["Indicador", "Fórmula", "Meta"],
            Array.from({ length: kpis }, (_, index) => [
                `KPI ${index + 1}`,
                `Valor ${index + 1} / base`,
                "95 %"
            ])
        ),
        "# Plan de implementación de 30 días",
        table(
            ["Días", "Fase", "Actividad"],
            [["1", "Inicio", "Gobierno"], [`2-${days}`, "Ejecución", "Despliegue"]]
        ),
        ("Procedimiento verificable con responsables, evidencia, control, medición y cierre documentado. ").repeat(20)
    ].join("\n\n");
}

test("document contract enforces vehicles, parts, KPI and implementation-day cardinality", () => {
    const instruction = [
        "Crea un manual para una flota de servicio con tablas reales e inventario de 25 vehículos.",
        "Incluye un catálogo de 15 refacciones, 12 KPI y un plan de implementación de 30 días."
    ].join("\n");
    const contract = extractDocumentContract(instruction);
    assert.equal(contract.minVehicles, 25);
    assert.equal(contract.minParts, 15);
    assert.equal(contract.minKpis, 12);
    assert.equal(contract.implementationDays, 30);

    const valid = validateDocumentBlueprint({
        instruction,
        content: quantitativeContent(),
        completionMarkerPresent: true
    });
    assert.equal(valid.ok, true, JSON.stringify(valid.failures));
    assert.equal(valid.vehicleCount, 25);
    assert.equal(valid.partCount, 15);
    assert.equal(valid.kpiCount, 12);
    assert.equal(valid.implementationDayCoverage, 30);

    const incomplete = validateDocumentBlueprint({
        instruction,
        content: quantitativeContent({
            vehicles: 24,
            parts: 14,
            kpis: 11,
            days: 29
        }),
        completionMarkerPresent: true
    });
    assert.equal(incomplete.ok, false);
    assert.ok(incomplete.failures.some(item => item.startsWith("DOCUMENT_VEHICLE_COUNT_BELOW_MINIMUM")));
    assert.ok(incomplete.failures.some(item => item.startsWith("DOCUMENT_PART_COUNT_BELOW_MINIMUM")));
    assert.ok(incomplete.failures.some(item => item.startsWith("DOCUMENT_KPI_COUNT_BELOW_MINIMUM")));
    assert.ok(incomplete.failures.some(item => item.startsWith("DOCUMENT_IMPLEMENTATION_DAY_COVERAGE_BELOW_MINIMUM")));
});

test("document contract understands an implementation range from day 1 through day 30", () => {
    const contract =
        extractDocumentContract(
            "Incluye un plan de implementación que cubra los días 1 al 30."
        );

    assert.equal(
        contract
            .implementationDays,
        30
    );
});

test("document repairs can supersede an earlier incomplete plan and exam", () => {
    const questions =
        Array.from(
            {
                length:
                    25
            },
            (_unused, index) =>
                `${index + 1}. Pregunta operativa ${index + 1}?`
        );
    const answers =
        Array.from(
            {
                length:
                    25
            },
            (_unused, index) =>
                `${index + 1}. Respuesta operativa ${index + 1}`
        );
    const content =
        [
            "# Plan inicial incompleto",
            table(
                ["Dia", "Actividad", "Responsable", "Evidencia"],
                Array.from(
                    {
                        length:
                            20
                    },
                    (_unused, index) => [
                        String(index + 1),
                        `Actividad ${index + 1}`,
                        "Supervisor",
                        "Bitacora"
                    ]
                )
            ),
            "## Examen de 25 preguntas",
            "Bloque inicial incompleto.",
            "## Clave completa de respuestas",
            "1. Respuesta parcial",
            "# Reparacion del plan",
            table(
                ["Dia", "Actividad", "Responsable", "Evidencia"],
                Array.from(
                    {
                        length:
                            30
                    },
                    (_unused, index) => [
                        String(index + 1),
                        `Actividad reparada ${index + 1}`,
                        "Supervisor",
                        "Bitacora"
                    ]
                )
            ),
            "## Examen de 25 preguntas",
            ...questions,
            "## Clave completa de respuestas",
            ...answers,
            ("Procedimiento verificable con control, responsable y evidencia documental. ")
                .repeat(25)
        ].join("\n\n");
    const result =
        validateDocumentBlueprint({
            instruction:
                "Incluye un plan de implementacion de 30 dias, examen de 25 preguntas y clave completa de respuestas.",
            content,
            completionMarkerPresent:
                true
        });

    assert.equal(
        result.ok,
        true,
        JSON.stringify(
            result.failures
        )
    );
    assert.equal(
        result.implementationDayCoverage,
        30
    );
    assert.equal(
        result.questionCount,
        25
    );
    assert.equal(
        result.answerKeyCount,
        25
    );
});

test("index entries and following sections cannot inflate questions or answer keys", () => {
    const questions = Array.from({ length: 25 }, (_, index) =>
        `${index + 1}. ¿Pregunta operativa ${index + 1}?`
    );
    const answers = Array.from({ length: 23 }, (_, index) =>
        `${index + 1}. Respuesta ${index + 1}`
    );
    const result = validateDocumentBlueprint({
        instruction: "Crea un examen de 25 preguntas con clave completa de respuestas.",
        completionMarkerPresent: true,
        content: [
            "# Índice",
            "16. Evaluación final",
            "17. Glosario",
            "18. Anexos",
            "# 16. Evaluación final",
            ...questions,
            "## Clave completa de respuestas",
            ...answers,
            "# 17. Glosario",
            "# 18. Anexos",
            ("Contenido operativo verificable, específico y útil para la formación del equipo. ").repeat(20)
        ].join("\n")
    });
    assert.equal(result.questionCount, 25);
    assert.equal(result.answerKeyCount, 23);
    assert.ok(result.failures.some(item => item.startsWith("DOCUMENT_ANSWER_KEY_INCOMPLETE")));
});
