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
    assert.equal(result.version, "1.0.0-docx-post-write-gate");
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
