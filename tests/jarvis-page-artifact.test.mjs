import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPageArtifactHtml, describePageArtifact } from "../jarvis-page-artifact.js";

const input = {
    brandName: "Multiservicios Peninsulares HMH",
    title: "Soluciones confiables para hogares y negocios",
    description: "Mantenimiento y servicios profesionales con atención directa, evidencia y cobertura en la península.",
    services: [
        { title: "Mantenimiento", description: "Atención preventiva y correctiva." },
        { title: "Instalación", description: "Instalaciones cuidadas y verificadas." }
    ],
    whatsapp: "529981234567",
    contactEmail: "contacto@example.com",
    testimonials: [{ quote: "Atención clara y trabajo limpio.", name: "Cliente verificado" }]
};

test("page studio creates a complete responsive accessible SEO HTML artifact", () => {
    const html = buildPageArtifactHtml(input);
    const report = describePageArtifact(input, html);
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /meta property="og:title"/);
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /wa\.me\/529981234567/);
    assert.match(html, /class="contact-form"/);
    assert.match(html, /@media\(max-width:780px\)/);
    assert.ok(Object.values(report.checks).every(Boolean));
    assert.ok(report.bytes > 5000);
});

test("page studio fails closed instead of filling missing business content", () => {
    assert.throws(() => buildPageArtifactHtml({ brandName: "Sin contenido" }), /PAGE_CONTENT_REQUIRED/);
    assert.throws(() => buildPageArtifactHtml({ ...input, whatsapp: "", contactEmail: "" }), /PAGE_CONTACT_ROUTE_REQUIRED/);
});

test("page studio accepts natural business field aliases without generic filler", () => {
    const html = buildPageArtifactHtml({
        ...input,
        services: [{ name: "Refrigeración", description: "Diagnóstico y mantenimiento profesional." }],
        testimonials: [{ quote: "Trabajo comprobado.", author: "Cliente HMH" }]
    });
    assert.match(html, /Refrigeración/);
    assert.match(html, /Cliente HMH/);
    assert.doesNotMatch(html, /Servicio 1/);
});

test("page creation is connected to bridge, approval-bound actuator and HTML preview", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
    const renderer = fs.readFileSync(new URL("../modules/terminal/jarvis-attachments.js", import.meta.url), "utf8");
    assert.match(bridge, /app\.post\("\/page\/create"/);
    assert.match(actuator, /name: "page\.create"/);
    assert.match(actuator, /requiresApproval: true/);
    assert.match(renderer, /jarvis-html-preview/);
});
