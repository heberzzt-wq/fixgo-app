import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildReelStudioHtml, describeReelStudio } from "../jarvis-reel-artifact.js";

const input = {
    brandName: "Multiservicios Peninsulares HMH",
    title: "Diagnóstico y mantenimiento sin vueltas",
    cta: "Solicita diagnóstico",
    durationSeconds: 30,
    scenes: [
        { durationSeconds: 4, overlay: "¿Una falla detuvo tu operación?", subtitle: "Actuar temprano reduce riesgos.", visualDescription: "Equipo detenido" },
        { durationSeconds: 7, overlay: "Diagnóstico técnico", subtitle: "Revisión clara y documentada.", visualDescription: "Técnico inspeccionando" },
        { durationSeconds: 8, overlay: "Refrigeración y electricidad", subtitle: "Servicios coordinados para tu negocio.", visualDescription: "Trabajo técnico" },
        { durationSeconds: 7, overlay: "Evidencia del trabajo", subtitle: "Seguimiento directo y verificable.", visualDescription: "Reporte de servicio" },
        { durationSeconds: 4, overlay: "Multiservicios HMH", subtitle: "Solicita diagnóstico por WhatsApp.", visualDescription: "Logotipo y llamada a la acción" }
    ]
};

test("reel studio creates a configurable 9:16 WebM production artifact", () => {
    const html = buildReelStudioHtml(input);
    const report = describeReelStudio(input, html);
    assert.match(html, /width="1080" height="1920"/);
    assert.match(html, /new MediaRecorder/);
    assert.match(html, /canvas\.captureStream\(30\)/);
    assert.match(html, /crypto\.subtle\.digest\('SHA-256'/);
    assert.match(html, /jarvis:reel-exported/);
    assert.match(html, /recordCapabilityEvidence\("reel_video"/);
    assert.match(html, /window\.parent\.dispatchEvent/);
    assert.ok(Object.values(report.checks).every(Boolean));
    assert.ok(report.bytes > 8000);
});

test("reel studio builds a complete editable 45-second production timeline", () => {
    const fortyFiveSecondInput = {
        ...input,
        durationSeconds: 45,
        scenes: [
            { ...input.scenes[0], durationSeconds: 6 },
            { ...input.scenes[1], durationSeconds: 10 },
            { ...input.scenes[2], durationSeconds: 12 },
            { ...input.scenes[3], durationSeconds: 10 },
            { ...input.scenes[4], durationSeconds: 7 }
        ]
    };
    const html = buildReelStudioHtml(fortyFiveSecondInput);
    const report = describeReelStudio(fortyFiveSecondInput, html);
    assert.equal(fortyFiveSecondInput.scenes.reduce((total, scene) => total + scene.durationSeconds, 0), 45);
    assert.match(html, /"durationSeconds":45/);
    assert.match(html, /jarvis-reel-'\+spec\.durationSeconds\+'s\.webm/);
    assert.ok(Object.values(report.checks).every(Boolean));
});

test("reel studio blocks short or inconsistent timelines", () => {
    assert.throws(() => buildReelStudioHtml({ ...input, durationSeconds: 15 }), /REEL_DURATION_NOT_ALLOWED/);
    assert.throws(() => buildReelStudioHtml({ ...input, durationSeconds: 45 }), /REEL_TIMELINE_DURATION_MISMATCH/);
});

test("reel creation is approval-bound and connected to the local artifact bridge", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
    assert.match(bridge, /app\.post\("\/reel\/create"/);
    assert.match(actuator, /name: "reel\.create"/);
    assert.match(actuator, /REEL_STUDIO_CREATED_VERIFIED/);
});
