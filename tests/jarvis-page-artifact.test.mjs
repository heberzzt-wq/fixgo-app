import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPageArtifactHtml, describePageArtifact } from "../jarvis-page-artifact.js";
import { preparePageMaterialInput } from "../jarvis-fs-bridge.js";

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

test("page studio supports an honest generic WhatsApp CTA without inventing a number", () => {
    const html = buildPageArtifactHtml({
        ...input,
        whatsapp: "",
        contactEmail: "",
        whatsappRequested: true
    });
    assert.match(html, /https:\/\/wa\.me\/\?text=/);
    assert.doesNotMatch(html, /529981234567/);
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

test("page studio embeds real received image artifacts without inventing material", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-page-materials-"));
    try {
        const imageDir = path.join(root, ".jarvis-artifacts", "images");
        fs.mkdirSync(imageDir, { recursive: true });
        const heroBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
        const galleryBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3, 4]);
        fs.writeFileSync(path.join(imageDir, "hero.jpg"), heroBytes);
        fs.writeFileSync(path.join(imageDir, "trabajo.png"), galleryBytes);
        const prepared = preparePageMaterialInput({
            root,
            input: {
                ...input,
                sourceImages: [
                    { output: ".jarvis-artifacts/images/hero.jpg", role: "hero", alt: "Técnico de MPH durante un servicio real" },
                    { output: ".jarvis-artifacts/images/trabajo.png", role: "gallery", alt: "Evidencia real del trabajo terminado" }
                ]
            }
        });
        const html = buildPageArtifactHtml(prepared.pageInput);
        assert.equal(prepared.embeddedBytes, heroBytes.length + galleryBytes.length);
        assert.deepEqual(prepared.materialSources.map(source => source.output), [".jarvis-artifacts/images/hero.jpg", ".jarvis-artifacts/images/trabajo.png"]);
        assert.match(html, /data:image\/jpeg;base64/);
        assert.match(html, /data:image\/png;base64/);
        assert.match(html, /Evidencia real del trabajo terminado/);
        assert.throws(() => preparePageMaterialInput({ root, input: { sourceImages: [{ output: ".jarvis-artifacts/images/hero.jpg", role: "hero", alt: "" }] } }), /PAGE_MATERIAL_METADATA_REQUIRED/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("page creation is connected as a local user artifact with HTML preview", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
    const renderer = fs.readFileSync(new URL("../modules/terminal/jarvis-attachments.js", import.meta.url), "utf8");
    assert.match(bridge, /app\.post\("\/page\/create"/);
    assert.match(actuator, /name: "page\.create"/);
    assert.match(actuator, /name: "page\.create"[\s\S]{0,900}requiresApproval: false/);
    assert.match(actuator, /name: "page\.create"[\s\S]{0,950}userArtifact: true/);
    assert.match(renderer, /jarvis-html-preview/);
});
