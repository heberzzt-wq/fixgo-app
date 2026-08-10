import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
    normalizePageFactualAudit
} from "../gestia-core/jarvis/jarvis.page.factual.integrity.js";

test("factual page audit is fail-closed unless unsupportedClaims is explicitly empty", () => {
    const pageInput = {
        brandName: "Clínica Aurora Norte",
        title: "Clínica Aurora Norte",
        description: "Página sustentada en la solicitud actual.",
        services: [{ title: "Citas", description: "Solicita información." }],
        requiredSections: ["Citas"],
        contentSections: [{ title: "Citas", description: "Solicita información.", items: [] }]
    };

    assert.equal(normalizePageFactualAudit({
        ok: true,
        unsupportedClaims: [],
        pageInput
    }).ok, true);

    const unsupported = normalizePageFactualAudit({
        ok: true,
        unsupportedClaims: ["Afirma automatización sin evidencia"],
        pageInput
    });
    assert.equal(unsupported.ok, false);
    assert.equal(unsupported.status, "PAGE_FACTUAL_INTEGRITY_INCOMPLETE");

    const omitted = normalizePageFactualAudit({
        ok: true,
        pageInput
    });
    assert.equal(omitted.ok, false);
    assert.ok(omitted.unsupportedClaims.includes("FACTUAL_AUDIT_UNSUPPORTED_CLAIMS_REQUIRED"));
});

test("page composition binds current request and canonical evidence to a second semantic factual audit", () => {
    const pack = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url),
        "utf8"
    );
    const pageMarker = 'name: "page.compose"';
    const pageStart = pack.indexOf(pageMarker);
    assert.ok(pageStart >= 0);
    const pageSource = pack.slice(pageStart, pack.indexOf('name: "page.create"', pageStart) > pageStart
        ? pack.indexOf('name: "page.create"', pageStart)
        : undefined);

    assert.match(pageSource, /EVIDENCIA_CANONICA_DE_MISION/);
    assert.match(pageSource, /REGLA_FACTUAL/);
    assert.match(pageSource, /REGLA_ESTILO_NO_ES_HECHO/);
    assert.match(pageSource, /AUDITORIA_FACTUAL_DE_PAGINA/);
    assert.match(pageSource, /SOLICITUD_ACTUAL=/);
    assert.match(pageSource, /PAGINA_PROPUESTA=/);
    assert.match(pageSource, /normalizePageFactualAudit/);
    assert.match(pageSource, /factualIntegrityPassed/);
    assert.match(pageSource, /PAGE_FACTUAL_INTEGRITY_INCOMPLETE/);
    assert.match(pageSource, /factualIntegrityPassed\s*&&\s*identityPreserved/);
});

test("factual integrity policy treats design language as design rather than business evidence", () => {
    const pack = fs.readFileSync(
        new URL("../gestia-core/jarvis/jarvis.multitool.pack.js", import.meta.url),
        "utf8"
    );
    const pageStart = pack.indexOf('name: "page.compose"');
    const pageSource = pack.slice(pageStart);
    for (const required of [
        "palabras de diseño",
        "no son evidencia de capacidades del negocio",
        "no puede afirmar como hecho nada que no esté respaldado",
        "No conviertas ausencia de evidencia en capacidades plausibles"
    ]) {
        assert.equal(pageSource.includes(required), true, required);
    }
});
