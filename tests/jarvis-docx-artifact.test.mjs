import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    buildDocxArtifactBuffer,
    describeDocxArtifactGate,
    validateDocxArtifactFile
} from "../jarvis-docx-artifact.js";

async function writeArtifact(content, title = "Manual") {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-docx-v68-"));
    const file = path.join(directory, "artifact.docx");
    const artifact = await buildDocxArtifactBuffer({ title, content });
    fs.writeFileSync(file, artifact.buffer);
    return { directory, file, artifact };
}

const contract = {
    minWords: 80,
    minSections: 2,
    minTables: 1,
    minTemplates: 1,
    minQuestions: 2,
    requireAnswerKey: true,
    requiredSections: ["Objetivo y alcance", "Evaluación final"]
};

function validContent() {
    return [
        "# 1. Objetivo y alcance",
        ("Procedimiento verificable con responsables, controles, evidencias y criterios de aceptación. ").repeat(8),
        "# 2. Evaluación final",
        "1. ¿Cuál es la primera acción correcta?",
        "2. ¿Cuál es la segunda acción correcta?",
        "## Clave completa de respuestas",
        "1. Respuesta correcta uno",
        "2. Respuesta correcta dos",
        "## Formato operativo",
        "| Responsable | Fecha | Observación | Acción requerida | Firma |",
        "|---|---|---|---|---|",
        "| Supervisor | 2026-07-25 | Registro completo | Cerrar hallazgo | Firma |",
        ("Contenido adicional diferente para conservar una extensión documental suficiente y útil. ").repeat(8)
    ].join("\n\n");
}

test("DOCX artifact gate describes post-write OOXML validation", () => {
    const result = describeDocxArtifactGate();
    assert.equal(result.ok, true);
    assert.equal(result.version, "1.5.0-exact-template-contract");
    assert.ok(result.checks.includes("real-word-tables"));
});

test("DOCX builder converts markdown tables into real Word tables and passes the contract", async () => {
    const fixture = await writeArtifact(validContent());
    try {
        const validation = await validateDocxArtifactFile({
            file: fixture.file,
            contract,
            expectedValidation: {
                validationPassed: true,
                sectionCount: 2,
                tableBlueprintCount: 1,
                templateCount: 1,
                questionCount: 2,
                answerKeyCount: 2
            }
        });
        assert.equal(validation.ok, true, JSON.stringify(validation.failures));
        assert.ok(validation.actual.wordCount >= 80);
        assert.ok(validation.actual.headingCount >= 2);
        assert.equal(validation.actual.tableCount, 1);
        assert.equal(validation.actual.questionCount, 2);
        assert.equal(validation.actual.answerKeyCount, 2);
    } finally {
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});

test("DOCX post-write gate rejects more templates than an exact contract allows", async () => {
    const extraTemplate = [
        "## Formato 2. Registro adicional",
        "| Fecha | Responsable | Acción | Firma |",
        "|---|---|---|---|",
        "| 2026-07-25 | Coordinador | Cerrar | Firma |"
    ].join("\n");
    const fixture =
        await writeArtifact(
            `${validContent()}\n\n${extraTemplate}`
        );
    try {
        const validation =
            await validateDocxArtifactFile({
                file:
                    fixture.file,
                contract: {
                    ...contract,
                    exactTemplates:
                        1
                },
                expectedValidation: {
                    validationPassed:
                        true
                }
            });

        assert.equal(
            validation.actual
                .templateCount,
            2
        );
        assert.equal(
            validation.ok,
            false
        );
        assert.ok(
            validation.failures.includes(
                "DOCX_TEMPLATE_COUNT_MISMATCH:2:1"
            )
        );
    }
    finally {
        fs.rmSync(
            fixture.directory,
            {
                recursive:
                    true,
                force:
                    true
            }
        );
    }
});

test("DOCX gate does not promote incidental blueprint counts into new requirements", async () => {
    const fixture =
        await writeArtifact(
            validContent()
        );
    try {
        const validation =
            await validateDocxArtifactFile({
                file:
                    fixture.file,
                contract,
                expectedValidation: {
                    validationPassed:
                        true,
                    sectionCount:
                        200,
                    tableBlueprintCount:
                        100,
                    templateCount:
                        50,
                    questionCount:
                        90,
                    answerKeyCount:
                        90
                }
            });
        assert.equal(
            validation.ok,
            true,
            JSON.stringify(
                validation.failures
            )
        );
        assert.equal(
            validation.required
                .minSections,
            contract.minSections
        );
        assert.equal(
            validation.required
                .minTables,
            contract.minTables
        );
    }
    finally {
        fs.rmSync(
            fixture.directory,
            {
                recursive:
                    true,
                force:
                    true
            }
        );
    }
});

function markdownTable(headers, rows) {
    return [
        `| ${headers.join(" | ")} |`,
        `|${headers.map(() => "---").join("|")}|`,
        ...rows.map(row => `| ${row.join(" | ")} |`)
    ].join("\n");
}

function quantitativeArtifactContent({
    vehicles = 25,
    parts = 15,
    kpis = 12,
    days = 30
} = {}) {
    return [
        "# Inventario de la flota",
        markdownTable(
            ["Unidad", "Kilometraje", "Estado"],
            Array.from({ length: vehicles }, (_, index) => [
                `FG-${index + 1}`,
                String(1000 + index),
                "Operativa"
            ])
        ),
        "# Control de refacciones",
        markdownTable(
            ["Código", "Refacción", "Cantidad"],
            Array.from({ length: parts }, (_, index) => [
                `RF-${index + 1}`,
                `Refacción ${index + 1}`,
                "1"
            ])
        ),
        "# Indicadores KPI",
        markdownTable(
            ["Indicador", "Fórmula", "Meta"],
            Array.from({ length: kpis }, (_, index) => [
                `KPI ${index + 1}`,
                `Valor ${index + 1} / base`,
                "95 %"
            ])
        ),
        "# Plan de implementación de 30 días",
        markdownTable(
            ["Días", "Fase", "Actividad"],
            [["1", "Inicio", "Gobierno"], [`2-${days}`, "Ejecución", "Despliegue"]]
        ),
        ("Procedimiento verificable con responsables, evidencia, control, medición y cierre documentado. ").repeat(20)
    ].join("\n\n");
}

test("DOCX post-write gate enforces requested table cardinalities", async () => {
    const quantitativeContract = {
        minWords: 80,
        minSections: 4,
        minTables: 4,
        minTemplates: 0,
        minQuestions: 0,
        minVehicles: 25,
        minParts: 15,
        minKpis: 12,
        implementationDays: 30,
        requireAnswerKey: false,
        requiredSections: []
    };
    const validFixture = await writeArtifact(quantitativeArtifactContent());
    const invalidFixture = await writeArtifact(quantitativeArtifactContent({
        vehicles: 24,
        parts: 14,
        kpis: 11,
        days: 29
    }));
    try {
        const valid = await validateDocxArtifactFile({
            file: validFixture.file,
            contract: quantitativeContract,
            expectedValidation: { validationPassed: true }
        });
        assert.equal(valid.ok, true, JSON.stringify(valid.failures));
        assert.equal(valid.actual.vehicleCount, 25);
        assert.equal(valid.actual.partCount, 15);
        assert.equal(valid.actual.kpiCount, 12);
        assert.equal(valid.actual.implementationDayCoverage, 30);

        const invalid = await validateDocxArtifactFile({
            file: invalidFixture.file,
            contract: quantitativeContract,
            expectedValidation: { validationPassed: true }
        });
        assert.equal(invalid.ok, false);
        assert.ok(invalid.failures.some(item => item.startsWith("DOCX_VEHICLE_COUNT_BELOW_MINIMUM")));
        assert.ok(invalid.failures.some(item => item.startsWith("DOCX_PART_COUNT_BELOW_MINIMUM")));
        assert.ok(invalid.failures.some(item => item.startsWith("DOCX_KPI_COUNT_BELOW_MINIMUM")));
        assert.ok(invalid.failures.some(item => item.startsWith("DOCX_IMPLEMENTATION_DAY_COVERAGE_BELOW_MINIMUM")));
    } finally {
        fs.rmSync(validFixture.directory, { recursive: true, force: true });
        fs.rmSync(invalidFixture.directory, { recursive: true, force: true });
    }
});

test("DOCX builder preserves adjacent tables separated by a blank line", async () => {
    const fixture =
        await writeArtifact(
            [
                "# Estructuras operativas",
                markdownTable(
                    ["Codigo", "Refaccion", "Cantidad"],
                    Array.from(
                        {
                            length:
                                15
                        },
                        (_unused, index) => [
                            `RF-${index + 1}`,
                            `Refaccion ${index + 1}`,
                            "1"
                        ]
                    )
                ),
                markdownTable(
                    ["Dia", "Actividad", "Responsable", "Evidencia"],
                    Array.from(
                        {
                            length:
                                30
                        },
                        (_unused, index) => [
                            String(index + 1),
                            `Actividad ${index + 1}`,
                            "Supervisor",
                            "Bitacora"
                        ]
                    )
                ),
                ("Procedimiento verificable con control, responsable y evidencia documental. ")
                    .repeat(25)
            ].join("\n\n")
        );
    try {
        const validation =
            await validateDocxArtifactFile({
                file:
                    fixture.file,
                contract: {
                    minWords:
                        80,
                    minSections:
                        0,
                    minTables:
                        2,
                    minTemplates:
                        0,
                    minQuestions:
                        0,
                    minVehicles:
                        0,
                    minParts:
                        15,
                    minKpis:
                        0,
                    implementationDays:
                        30,
                    requireAnswerKey:
                        false,
                    requiredSections:
                        []
                },
                expectedValidation: {
                    validationPassed:
                        true
                }
            });

        assert.equal(
            validation.ok,
            true,
            JSON.stringify(
                validation.failures
            )
        );
        assert.equal(
            validation.actual
                .tableCount,
            2
        );
        assert.equal(
            validation.actual
                .partCount,
            15
        );
        assert.equal(
            validation.actual
                .implementationDayCoverage,
            30
        );
    }
    finally {
        fs.rmSync(
            fixture.directory,
            {
                recursive:
                    true,
                force:
                    true
            }
        );
    }
});

test("DOCX gate accepts complete repair blocks after incomplete candidates", async () => {
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
            markdownTable(
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
            markdownTable(
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
    const fixture =
        await writeArtifact(
            content
        );
    try {
        const validation =
            await validateDocxArtifactFile({
                file:
                    fixture.file,
                contract: {
                    minWords:
                        80,
                    minSections:
                        0,
                    minTables:
                        1,
                    minTemplates:
                        0,
                    minQuestions:
                        25,
                    minVehicles:
                        0,
                    minParts:
                        0,
                    minKpis:
                        0,
                    implementationDays:
                        30,
                    requireAnswerKey:
                        true,
                    requiredSections:
                        []
                },
                expectedValidation: {
                    validationPassed:
                        true
                }
            });

        assert.equal(
            validation.ok,
            true,
            JSON.stringify(
                validation.failures
            )
        );
        assert.equal(
            validation.actual
                .implementationDayCoverage,
            30
        );
        assert.equal(
            validation.actual
                .questionCount,
            25
        );
        assert.equal(
            validation.actual
                .answerKeyCount,
            25
        );
    }
    finally {
        fs.rmSync(
            fixture.directory,
            {
                recursive:
                    true,
                force:
                    true
            }
        );
    }
});

test("DOCX post-write gate rejects the real placeholder reproduction", async () => {
    const fixture = await writeArtifact([
        "# Manual Operativo",
        "El contenido completo del manual generado por document.compose."
    ].join("\n\n"));
    try {
        const validation = await validateDocxArtifactFile({
            file: fixture.file,
            contract,
            expectedValidation: { validationPassed: true }
        });
        assert.equal(validation.ok, false);
        assert.ok(validation.failures.includes("DOCX_PLACEHOLDER_DETECTED"));
        assert.ok(validation.failures.some(item => item.startsWith("DOCX_WORD_COUNT_BELOW_MINIMUM")));
        assert.ok(validation.failures.some(item => item.startsWith("DOCX_TABLE_COUNT_BELOW_MINIMUM")));
    } finally {
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});

test("DOCX post-write gate fails closed when the source blueprint was not validated", async () => {
    const fixture = await writeArtifact(validContent());
    try {
        const validation = await validateDocxArtifactFile({
            file: fixture.file,
            contract,
            expectedValidation: { validationPassed: false }
        });
        assert.equal(validation.ok, false);
        assert.ok(validation.failures.includes("DOCX_SOURCE_BLUEPRINT_NOT_VALIDATED"));
    } finally {
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});
