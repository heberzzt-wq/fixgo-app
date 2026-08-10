import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
    ensureExecutableArtifactDependencies,
    describeMissionDependencies
} from "../gestia-core/jarvis/jarvis.mission.dependencies.js";
import {
    buildPageArtifactHtml,
    describePageArtifact
} from "../jarvis-page-artifact.js";

const catalog = [
    { name: "page.plan" },
    { name: "page.compose" },
    { name: "page.create" }
];

test("selected incomplete page.create gets page.compose structurally without lexical intent routing", () => {
    const calls = ensureExecutableArtifactDependencies({
        toolCalls: [
            { name: "page.plan", args: { brandName: "Península Tech" } },
            { name: "page.create", args: { brandName: "Península Tech" } }
        ],
        catalog
    });
    assert.deepEqual(calls.map(call => call.name), ["page.plan", "page.compose", "page.create"]);
    assert.equal(calls[1].reason, "STRUCTURAL_PAGE_CREATE_DEPENDENCY");
    assert.equal(calls[1].args.brandName, "Península Tech");
    const description = describeMissionDependencies();
    assert.equal(description.lexicalRouting, false);
    assert.equal(description.architecture, "tool_contract_dependency");
});

test("complete direct page.create remains direct and does not add a duplicate composer", () => {
    const calls = ensureExecutableArtifactDependencies({
        toolCalls: [{
            name: "page.create",
            args: {
                brandName: "Península Tech",
                title: "Plataforma de servicios",
                description: "Una experiencia digital para coordinar y dar seguimiento a solicitudes de servicio.",
                services: [{ title: "Seguimiento", description: "Consulta el estado de cada solicitud." }]
            }
        }],
        catalog
    });
    assert.deepEqual(calls.map(call => call.name), ["page.create"]);
});

test("Península Tech informational page renders without fabricated phone or email", () => {
    const input = {
        brandName: "Península Tech",
        title: "Tecnología para coordinar servicios con claridad",
        description: "Plataforma para solicitar, coordinar y dar seguimiento a servicios desde una experiencia digital.",
        services: [
            { title: "Solicitud digital", description: "Inicia y organiza una solicitud de servicio desde una sola experiencia." },
            { title: "Seguimiento", description: "Consulta el estado operativo y la evidencia disponible del servicio." },
            { title: "Coordinación", description: "Centraliza la comunicación y los pasos necesarios para atender el servicio." }
        ],
        whatsapp: "",
        whatsappRequested: false,
        contactEmail: ""
    };
    const html = buildPageArtifactHtml(input);
    const report = describePageArtifact(input, html);
    assert.ok(Object.values(report.checks).every(Boolean));
    assert.equal(report.hasContactRoute, false);
    assert.match(html, /Península Tech/);
    assert.match(html, /Explorar servicios/);
    assert.doesNotMatch(html, /mailto:/);
    assert.doesNotMatch(html, /wa\.me/);
    assert.doesNotMatch(html, /Lorem ipsum|TODO|undefined/);
});

test("page physical result contract includes digest and truthful human response", () => {
    const bridge = fs.readFileSync(path.join(process.cwd(), "jarvis-fs-bridge.js"), "utf8");
    const response = fs.readFileSync(path.join(process.cwd(), "gestia-core", "tools.bridge.js"), "utf8");
    const runtime = fs.readFileSync(path.join(process.cwd(), "gestia-core", "tools.runtime.js"), "utf8");
    assert.match(bridge, /2\.38\.0-page-no-contact-route/);
    assert.match(bridge, /PAGE_BYTE_COUNT_MISMATCH/);
    assert.match(bridge, /sha256/);
    assert.match(response, /HTML fue creado físicamente/);
    assert.match(response, /SHA-256/);
    assert.match(runtime, /2\.38\.0-page-no-contact-route/);
});
