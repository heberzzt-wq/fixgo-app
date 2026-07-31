import assert from "node:assert/strict";
import { test } from "node:test";

import {
    isNexoApprovalCommand,
    normalizeNexoCommand,
    NEXO_UI_BRANDING_VERSION
} from "../gestia-core/nexo/nexo.ui.branding.js";

test("NEXO normalizes accented and punctuated approval language", () => {
    assert.equal(
        normalizeNexoCommand("  ¡Aprobación AUTORIZADA!  "),
        "aprobacion autorizada"
    );
    assert.match(
        NEXO_UI_BRANDING_VERSION,
        /approval-normalization/
    );
});

test("NEXO recognizes the real approval phrase reported by the owner", () => {
    assert.equal(
        isNexoApprovalCommand("aprobación autorizada"),
        true
    );
    assert.equal(
        isNexoApprovalCommand("Apruebo el plan de marketing"),
        true
    );
    assert.equal(
        isNexoApprovalCommand("Autorizo la publicación"),
        true
    );
    assert.equal(
        isNexoApprovalCommand("arre"),
        true
    );
});

test("NEXO never turns rejection or analysis prose into approval", () => {
    assert.equal(
        isNexoApprovalCommand("no autorizo el plan"),
        false
    );
    assert.equal(
        isNexoApprovalCommand("analiza la autorización de pagos"),
        false
    );
    assert.equal(
        isNexoApprovalCommand("rechazo la propuesta"),
        false
    );
});
