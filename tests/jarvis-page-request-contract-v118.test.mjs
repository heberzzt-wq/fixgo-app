import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPageArtifactHtml, describePageArtifact } from "../jarvis-page-artifact.js";

const humanPrompt = "Créame una página web para Jarvis V7 con introducción, cómo funciona, beneficios, herramientas disponibles, casos de uso y contacto. Quiero diseño de tecnología premium, mobile-first y accesible.";
const requiredSections = [
    "Introducción",
    "Cómo funciona",
    "Beneficios",
    "Herramientas disponibles",
    "Casos de uso",
    "Contacto"
];
const contentSections = requiredSections.map((title, index) => ({
    title,
    description: `Contenido verificable de ${title.toLowerCase()} para Jarvis V7, bloque ${index + 1}.`,
    items: [{ title: `Punto ${index + 1}`, description: `Detalle específico del bloque ${title}.` }]
}));
const input = {
    brandName: "Jarvis V7",
    title: "Jarvis V7: asistencia inteligente",
    description: "Una presentación clara de Jarvis V7 con experiencia premium, adaptable y accesible.",
    services: [
        { title: "Asistencia", description: "Apoya tareas y decisiones con una interfaz clara." },
        { title: "Automatización", description: "Coordina acciones y artefactos verificables." }
    ],
    requiredSections,
    contentSections,
    whatsapp: "",
    contactEmail: "",
    whatsappRequested: true
};

test("v118 live-human page request renders every explicitly requested section and verifies coverage", () => {
    assert.match(humanPrompt, /introducción/);
    const html = buildPageArtifactHtml(input);
    const report = describePageArtifact(input, html);
    for (const expected of ["introduccion", "como-funciona", "beneficios", "herramientas-disponibles", "casos-de-uso", "contacto"]) {
        assert.match(html, new RegExp(`data-requested-section="${expected}"`));
    }
    assert.equal(report.checks.requestedSections, true);
    assert.equal(report.ok, true);
    assert.equal(report.requiredSections.length, 6);
    assert.equal(report.renderedSections.length, 6);
    assert.doesNotMatch(html, /https:\/\/wa\.me\/\?text=/);
    assert.match(html, /href="#servicios"/);
});

test("v118 verification fails closed when page.create material omits one requested content objective", () => {
    const incomplete = {
        ...input,
        contentSections: contentSections.filter(section => section.title !== "Casos de uso")
    };
    const html = buildPageArtifactHtml(incomplete);
    const report = describePageArtifact(incomplete, html);
    assert.equal(report.checks.requestedSections, false);
    assert.equal(report.ok, false);
    assert.doesNotMatch(html, /data-requested-section="casos-de-uso"/);
});

test("v118 semantic page compose preserves section objectives instead of collapsing them into services", () => {
    const multitool = fs.readFileSync(path.join(process.cwd(), "gestia-core", "jarvis", "jarvis.multitool.pack.js"), "utf8");
    const planner = fs.readFileSync(path.join(process.cwd(), "gestia-core", "jarvis", "jarvis.multifunction.planner.js"), "utf8");
    const actuator = fs.readFileSync(path.join(process.cwd(), "gestia-core", "jarvis", "jarvis.actuator.pack.js"), "utf8");
    assert.match(multitool, /requiredSections, contentSections/);
    assert.match(multitool, /sections: "array"/);
    assert.match(multitool, /PAGE_REQUESTED_SECTION_COVERAGE_INCOMPLETE/);
    assert.match(multitool, /missionDedupeBy: \["pageName"\]/);
    assert.match(planner, /copia en args\.sections cada sección de contenido pedida explícitamente/);
    assert.match(actuator, /requiredSections: "array", contentSections: "array"/);
});
