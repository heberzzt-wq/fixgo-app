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
    assert.equal(description.version, "1.0.0-docx-contract-gate");
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
