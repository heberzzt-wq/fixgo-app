import assert from "node:assert/strict";
import test from "node:test";

import {
    registerJarvisMultifunctionTools
} from "../gestia-core/jarvis/jarvis.multitool.pack.js";
import {
    ensureExecutableArtifactDependencies
} from "../gestia-core/jarvis/jarvis.mission.dependencies.js";
import {
    buildPageArtifactHtml,
    describePageArtifact
} from "../jarvis-page-artifact.js";

class Runtime {
    constructor() { this.map = new Map(); }
    register(definition) {
        this.map.set(definition.name, definition);
        return { ok: true };
    }
    get(name) { return this.map.get(name) || null; }
    list() { return [...this.map.values()]; }
}

test("page.compose fails closed when web research cannot anchor the exact entity identity", async () => {
    const runtime = new Runtime();
    registerJarvisMultifunctionTools(runtime);
    const compose = runtime.get("page.compose");
    assert.ok(compose);

    const result = await compose.execute({
        brandName: "Orbe Delta Talleres ZXQ",
        title: "Sitio informativo de Orbe Delta Talleres ZXQ",
        sections: ["Servicios", "Contacto"]
    }, {
        canonicalEvidence: [{
            tool: "web.research",
            status: "GROUNDED",
            validSources: [
                {
                    title: "Talleres Delta del Norte",
                    snippet: "Empresa distinta dedicada a mantenimiento industrial."
                },
                {
                    title: "Directorio industrial regional",
                    description: "Listado de negocios sin coincidencia exacta para el nombre consultado."
                }
            ]
        }]
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "PAGE_CONTENT_COMPOSED");
    assert.equal(result.limitedEvidence, true);
    assert.equal(result.pageInput.evidenceMode, "insufficient");
    assert.deepEqual(result.pageInput.services, []);
    assert.equal(result.pageInput.whatsapp, "");
    assert.equal(result.pageInput.contactEmail, "");
    assert.equal(result.evidenceIntegrity.researchObserved, true);
    assert.equal(result.evidenceIntegrity.identityGrounded, false);

    const html = buildPageArtifactHtml(result.pageInput);
    const report = describePageArtifact(result.pageInput, html);
    assert.equal(report.ok, true);
    assert.equal(report.evidenceMode, "insufficient");
    assert.match(html, /"@type":"WebPage"/);
    assert.match(html, /id="verificacion"/);
    assert.match(html, /No hay evidencia suficiente para publicar como hechos/);
    assert.doesNotMatch(html, /"@type":"Organization"/);
    assert.doesNotMatch(html, /id="servicios"/);
    assert.doesNotMatch(html, /id="contacto"/);
    assert.doesNotMatch(html, /contact-form/);
    assert.doesNotMatch(html, /wa\.me|mailto:/);
    assert.doesNotMatch(html, /Servicios y capacidades|ofrece una variedad|soluciones integrales|Ofrecemos una gama/i);
});

test("page dependency contract does not reinsert page.compose for an explicit insufficient-evidence blueprint", () => {
    const calls = ensureExecutableArtifactDependencies({
        catalog: [
            { name: "page.compose" },
            { name: "page.create" }
        ],
        toolCalls: [{
            name: "page.create",
            args: {
                brandName: "Orbe Delta Talleres ZXQ",
                title: "Sitio informativo de Orbe Delta Talleres ZXQ",
                description: "No hay evidencia suficiente para publicar hechos asociados a este nombre.",
                services: [],
                evidenceMode: "insufficient"
            }
        }]
    });
    assert.deepEqual(calls.map(call => call.name), ["page.create"]);
});

test("verified page mode keeps normal business rendering unchanged when content is supplied", () => {
    const input = {
        brandName: "Empresa Demostración",
        title: "Servicios verificados",
        description: "Contenido de demostración suministrado directamente para probar el renderer normal.",
        services: [{ title: "Servicio A", description: "Descripción suministrada para la prueba." }]
    };
    const html = buildPageArtifactHtml(input);
    const report = describePageArtifact(input, html);
    assert.equal(report.ok, true);
    assert.match(html, /"@type":"Organization"/);
    assert.match(html, /id="servicios"/);
});
