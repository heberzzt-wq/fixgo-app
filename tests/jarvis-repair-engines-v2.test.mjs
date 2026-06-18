import assert from "node:assert/strict";
import { test } from "node:test";

import { scanFile } from "../gestia-core/jarvis/jarvis.scanner.engine.js";
import { buildAutoFix } from "../gestia-core/jarvis/jarvis.autofix.engine.js";
import { buildAutoPatch } from "../gestia-core/jarvis/jarvis.autopatch.engine.js";

test("scanner V2 detects runtime Date.now casing and builds safe patch", () => {
    const source = `
export function runtimehealth() {
    return {
        status: "online",
        timestamp: date.now()
    };
}
`;

    const scan =
        scanFile(
            "runtime-health.js",
            source
        );

    assert.equal(scan.version, "2.0.0-structural-evidence");
    assert.equal(scan.structure.exports.length, 1);
    assert.equal(scan.structure.functions[0].name, "runtimehealth");
    assert.ok(scan.flags.includes("LOWERCASE_DATE_NOW"));
    assert.equal(scan.findings.find(item => item.id === "LOWERCASE_DATE_NOW").patchable, true);

    const autofix =
        buildAutoFix(
            scan
        );

    assert.equal(autofix.version, "2.0.0-evidence-actions");
    assert.equal(autofix.patchable, 1);
    assert.equal(autofix.fixes[0].id, "FIX_LOWERCASE_DATE_NOW");
    assert.equal(autofix.fixes[0].actions[0].replace, "Date.now()");

    const autopatch =
        buildAutoPatch(
            scan
        );

    assert.equal(autopatch.version, "2.0.0-safe-operations");
    assert.equal(autopatch.safePatches, 1);
    assert.equal(autopatch.patches[0].operations[0].find, "date.now()");
});

test("scanner V2 blocks hardcoded secret literals from autopatch", () => {
    const source = `
const auth_token = "Heberto_SIA7_2026_Secure!";
export function run() {
    return auth_token;
}
`;

    const scan =
        scanFile(
            "legacy-commit.js",
            source
        );

    const finding =
        scan.findings.find(item => item.id === "HARDCODED_SECRET_LITERAL");

    assert.equal(scan.risk, "CRITICAL");
    assert.equal(finding.severity, "CRITICAL");
    assert.equal(finding.patchable, false);
    assert.match(finding.evidence.snippet, /\*\*\*REDACTED\*\*\*/);

    const autofix =
        buildAutoFix(
            scan
        );

    assert.equal(autofix.blocking, true);
    assert.equal(autofix.fixes[0].id, "FIX_SECRET_TO_ENV");

    const autopatch =
        buildAutoPatch(
            scan
        );

    assert.equal(autopatch.safePatches, 0);
    assert.equal(autopatch.patches[0].safe, false);
});

test("scanner V2 preserves V1 summary fields and flags empty source", () => {
    const scan =
        scanFile(
            "empty.js",
            ""
        );

    assert.equal(scan.ok, true);
    assert.equal(scan.type, "JAVASCRIPT");
    assert.equal(scan.metrics.imports, 0);
    assert.ok(Array.isArray(scan.flags));
    assert.ok(Array.isArray(scan.recommendations));
    assert.ok(scan.flags.includes("EMPTY_SOURCE"));
    assert.equal(scan.findings[0].id, "EMPTY_SOURCE");

    const autofix =
        buildAutoFix(
            scan
        );

    assert.equal(autofix.blocking, true);
    assert.equal(autofix.fixes[0].type, "BLOCK");
});
