import assert from "node:assert/strict";
import test from "node:test";

import {
    buildMediaPrecisionAuditQuestion,
    reconcileIndependentMediaAnalysis,
    verifyGroundedMediaPrecisionContract
} from "../gestia-core/jarvis/jarvis.multitool.pack.js";

const files = [
    { name: "one.png", sha256: "a".repeat(64) },
    { name: "two.png", sha256: "b".repeat(64) }
];

function baseResult() {
    return {
        ok: true,
        status: "MEDIA_ANALYSIS_GROUNDED",
        version: "1.4.0-verified-visual-claims",
        strictVisualOnly: true,
        expectedSources: 2,
        receivedSources: 2,
        policy: {
            literalReadingsRequireStructuredEvidence: true,
            unverifiedLiteralValuesAreWithheld: true
        },
        sources: [
            {
                sourceId: "SOURCE_1",
                fileName: "one.png",
                sha256: "a".repeat(64),
                description: "",
                observations: ["Se observa un menu abierto con varias filas."],
                inferences: [],
                visibleData: []
            },
            {
                sourceId: "SOURCE_2",
                fileName: "two.png",
                sha256: "b".repeat(64),
                description: "",
                observations: ["Se observa un panel lateral."],
                inferences: [],
                visibleData: []
            }
        ],
        comparison: { differences: ["Las composiciones visuales son distintas."] },
        recommendations: []
    };
}

test("browser precision contract rejects the raw 1J quoted-label leak", () => {
    const result = baseResult();
    result.sources[0].observations.unshift("The application is identified as 'ChatGPT Plus'.");
    const checked = verifyGroundedMediaPrecisionContract(result, files);
    assert.equal(checked.ok, false);
    assert.equal(checked.status, "MEDIA_ANALYSIS_PRECISION_CONTRACT_UNAVAILABLE");
});

test("browser precision contract accepts strict visual narrative when literals are absent", () => {
    const checked = verifyGroundedMediaPrecisionContract(baseResult(), files);
    assert.deepEqual(checked, { ok: true });
});

test("independent audit prompt never re-injects untrusted provider narrative or literals", () => {
    const result = baseResult();
    result.sources[0].description = "Screenshot of the ChatGPT Plus interface.";
    result.sources[0].observations = ["Menu includes 'Añadir fotos y archivos'."];
    result.sources[0].inferences = ["The user is preparing to attach a file."];
    result.sources[0].visibleData = [{
        kind: "date",
        value: "07/08/2024",
        page: 1,
        confidence: 1,
        evidence: "system tray",
        legibility: "VERIFIED"
    }];
    const prompt = buildMediaPrecisionAuditQuestion("Compara solamente lo visible.", result);
    assert.doesNotMatch(prompt, /ChatGPT Plus|Añadir fotos y archivos|preparing to attach|07\/08\/2024/i);
    assert.match(prompt, /SOURCE_1/);
    assert.match(prompt, /one\.png/);
    assert.match(prompt, /NO recibe ningun literal/i);
});

test("independent reconciliation drops the production 2024-vs-2026 date disagreement", () => {
    const initial = baseResult();
    const audited = baseResult();
    initial.sources[0].visibleData = [
        { kind: "text", value: "ChatGPT Plus", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" },
        { kind: "date", value: "07/08/2024", page: 1, confidence: 1, evidence: "tray", legibility: "VERIFIED" }
    ];
    audited.sources[0].visibleData = [
        { kind: "text", value: "ChatGPT Plus", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" },
        { kind: "date", value: "07/08/2026", page: 1, confidence: 1, evidence: "tray", legibility: "VERIFIED" }
    ];
    audited.sources[0].observations = [
        "The interface shows 'ChatGPT Plus'.",
        "The system tray shows the date '07/08/2026'."
    ];

    const reconciled = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara solamente elementos visuales. No inventes fechas."
    );

    assert.equal(reconciled.disputedLiteralCount, 2);
    assert.deepEqual(
        reconciled.result.sources[0].visibleData.map(item => item.value),
        ["ChatGPT Plus"]
    );
    assert.doesNotMatch(JSON.stringify(reconciled.result), /07\/08\/2024|07\/08\/2026/);
    assert.equal(reconciled.result.policy.independentPassLiteralConsensusRequired, true);
});

test("peripheral date is suppressed even when both passes agree unless the user explicitly asks for it", () => {
    const initial = baseResult();
    const audited = baseResult();
    const dateItem = { kind: "date", value: "07/08/2024", page: 1, confidence: 1, evidence: "tray", legibility: "VERIFIED" };
    initial.sources[0].visibleData = [dateItem];
    audited.sources[0].visibleData = [dateItem];

    const visualOnly = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara los menus visibles. No inventes fechas."
    );
    assert.equal(visualOnly.result.sources[0].visibleData.length, 0);
    assert.equal(visualOnly.suppressedPeripheralLiteralCount, 1);

    const explicitDate = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Lee y reporta la fecha visible en SOURCE_1."
    );
    assert.equal(explicitDate.result.sources[0].visibleData[0].value, "07/08/2024");
});
