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

test("reel studio creates a configurable 9:16 MP4-preferred production artifact", () => {
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
    assert.match(html, /fileName:'jarvis-reel-'\+spec\.durationSeconds\+'s\.'\+extension/);
    assert.ok(Object.values(report.checks).every(Boolean));
});

test("reel studio blocks short or inconsistent timelines", () => {
    assert.throws(() => buildReelStudioHtml({ ...input, durationSeconds: 15 }), /REEL_DURATION_NOT_ALLOWED/);
    assert.throws(() => buildReelStudioHtml({ ...input, durationSeconds: 45 }), /REEL_TIMELINE_DURATION_MISMATCH/);
});

test("v129 reel quality gate requires loaded media and executes production directions", () => {
    const qualityInput = {
        ...input,
        scenes: input.scenes.map((scene, index) => ({
            ...scene,
            transition: ["slide", "zoom", "cut", "dissolve", "fade"][index],
            ...(index === 0
                ? {
                    assetDataUrl: "data:image/png;base64,iVBORw0KGgo=",
                    mediaType: "image"
                }
                : {})
        }))
    };
    const html = buildReelStudioHtml(qualityInput);
    const report = describeReelStudio(qualityInput, html);

    assert.match(html, /async function waitForMediaReady/);
    assert.match(html, /REEL_SOURCE_MEDIA_NOT_READY/);
    assert.match(html, /function applySceneTransition/);
    assert.match(html, /function fitHeadline/);
    assert.match(html, /function syncVideoPlayback/);
    assert.match(html, /item\.loop=true/);
    assert.match(html, /local%sourceDuration/);
    assert.match(html, /scene\.mediaUrl\.startsWith\('https:'\)/);
    assert.match(html, /qualityGatePassed/);
    assert.match(html, /async function ensureAudioGraph/);
    assert.match(html, /source_video_audio_route/);
    assert.match(html, /mode=audio\?'explicit_audio'/);
    assert.match(html, /attachExportAudioTracks/);
    assert.doesNotMatch(html, /scene\.subtitle\|\|scene\.visualDescription/);
    assert.equal(report.checks.mediaReadinessGate, true);
    assert.equal(report.checks.effectiveTransitions, true);
    assert.equal(report.checks.adaptiveTypography, true);
    assert.equal(report.checks.inactiveVideoPause, true);
    assert.equal(report.checks.visualDirectionNotPublic, true);
    assert.equal(report.checks.qualityEvidence, true);
    assert.ok(Object.values(report.checks).every(Boolean));
});

test("v129 normalizes unsupported transitions without discarding visual direction", () => {
    const html = buildReelStudioHtml({
        ...input,
        scenes: input.scenes.map((scene, index) => ({
            ...scene,
            transition: index === 0 ? "spin-around" : scene.transition
        }))
    });
    assert.match(html, /"transition":"fade"/);
    assert.match(html, /"visualDescription":"Equipo detenido"/);
});

test("reel creation is approval-bound and connected to the local artifact bridge", () => {
    const bridge = fs.readFileSync(new URL("../jarvis-fs-bridge.js", import.meta.url), "utf8");
    const actuator = fs.readFileSync(new URL("../gestia-core/jarvis/jarvis.actuator.pack.js", import.meta.url), "utf8");
    assert.match(bridge, /app\.post\("\/reel\/create"/);
    assert.match(actuator, /name: "reel\.create"/);
    assert.match(actuator, /REEL_VIDEO_CREATED_VERIFIED/);
    assert.match(bridge, /exportReelVideoWithChrome/);
    assert.match(bridge, /REEL_VIDEO_SHA256_MISMATCH/);
    assert.match(bridge, /REEL_MP4_SIGNATURE_INVALID/);
    assert.match(bridge, /REEL_WEBM_SIGNATURE_INVALID/);
    assert.match(bridge, /audioMixMode/);
    assert.match(bridge, /audioTracksAdded/);
    assert.match(actuator, /audioGraphAvailable/);
});
