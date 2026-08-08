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



test("independent reconciliation removes an unverified uppercase UI label from provider narrative", () => {
    const initial = baseResult();
    const audited = baseResult();
    const terminalLabel = {
        kind: "text",
        value: "Terminal Heberto",
        page: 1,
        confidence: 1,
        evidence: "header",
        legibility: "VERIFIED"
    };
    initial.sources[1].visibleData = [terminalLabel];
    audited.sources[1].visibleData = [terminalLabel];
    audited.comparison = {
        differences: [
            "SOURCE_2 shows 'Terminal Heberto' (NEXO)."
        ]
    };

    const reconciled = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara solamente lo visible."
    );

    assert.deepEqual(
        reconciled.result.sources[1].visibleData.map(item => item.value),
        ["Terminal Heberto"]
    );
    assert.doesNotMatch(JSON.stringify(reconciled.result), /NEXO/);
    assert.deepEqual(reconciled.result.comparison.differences, []);
});

test("independent reconciliation suppresses unsupported negative cross-source absence claims", () => {
    const initial = baseResult();
    const audited = baseResult();
    const source1Items = [
        { kind: "text", value: "ChatGPT Plus", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" },
        { kind: "text", value: "Canva", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" }
    ];
    const source2Items = [
        { kind: "text", value: "Terminal Heberto", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" },
        { kind: "text", value: "Limitaciones reales:", page: 1, confidence: 1, evidence: "section", legibility: "VERIFIED" }
    ];
    initial.sources[0].visibleData = source1Items;
    audited.sources[0].visibleData = source1Items;
    initial.sources[1].visibleData = source2Items;
    audited.sources[1].visibleData = source2Items;
    audited.comparison = {
        differences: [
            "The primary application title differs: 'ChatGPT Plus' in SOURCE_1 versus 'Terminal Heberto' in SOURCE_2.",
            "SOURCE_1 shows 'Canva', which is absent in SOURCE_2.",
            "SOURCE_2 includes 'Limitaciones reales:', which is not present in SOURCE_1."
        ]
    };

    const reconciled = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara solamente lo visible."
    );

    assert.deepEqual(
        reconciled.result.comparison.differences,
        ["The primary application title differs: 'ChatGPT Plus' in SOURCE_1 versus 'Terminal Heberto' in SOURCE_2."]
    );
    assert.equal(reconciled.suppressedUnsupportedNegativeVisualClaimCount, 2);
    assert.equal(reconciled.result.policy.negativeVisualClaimsRequireStructuredEvidence, true);
    assert.doesNotMatch(JSON.stringify(reconciled.result), /absent in SOURCE_2|not present in SOURCE_1/i);
});


test("production A2 removes unsupported source-local contradiction residue", () => {
    const initial = baseResult();
    const audited = baseResult();
    const source1Items = [
        { kind: "text", value: "Añadir fotos y archivos", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
        { kind: "text", value: "Canva", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" }
    ];
    const source2Items = [
        { kind: "text", value: "Añadir fotos y archivos", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
        { kind: "text", value: "Crear una imagen", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" },
        { kind: "text", value: "Búsqueda en Internet", page: 1, confidence: 1, evidence: "menu", legibility: "VERIFIED" }
    ];
    initial.sources[0].visibleData = source1Items;
    audited.sources[0].visibleData = source1Items;
    initial.sources[1].visibleData = source2Items;
    audited.sources[1].visibleData = source2Items;
    audited.sources[1].observations = [
        "An attachment-like menu is open, displaying options: 'Añadir fotos y archivos', 'Crear una imagen', and 'Búsqueda en Internet'.",
        "This statement directly contradicts the visible attachment menu in the same image."
    ];
    audited.sources[1].uncertainty = [
        "The contradiction between the visible attachment menu and the text stating its absence is a notable inconsistency."
    ];
    audited.sources[1].evidence = [
        "The system tray date and time are clearly visible and match the other image."
    ];

    const reconciled = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara los menus de adjuntos visibles."
    );

    assert.deepEqual(
        reconciled.result.sources[1].observations,
        ["An attachment-like menu is open, displaying options: 'Añadir fotos y archivos', 'Crear una imagen', and 'Búsqueda en Internet'."]
    );
    assert.deepEqual(reconciled.result.sources[1].uncertainty, []);
    assert.deepEqual(reconciled.result.sources[1].evidence, []);
    assert.equal(reconciled.suppressedUnsupportedNegativeVisualClaimCount, 2);
    assert.equal(reconciled.suppressedPeripheralNarrativeCount, 1);
    assert.equal(reconciled.result.policy.sourceNarrativeClaimsRequireStructuredEvidence, true);
    assert.doesNotMatch(
        JSON.stringify(reconciled.result),
        /directly contradicts|text stating its absence|system tray date and time/i
    );
});

test("strict visual reconciliation suppresses unrequested recommendations but preserves explicit requests", () => {
    const initial = baseResult();
    const audited = baseResult();
    const source1Label = { kind: "text", value: "ChatGPT Plus", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" };
    const source2Label = { kind: "text", value: "Terminal Heberto", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" };
    initial.sources[0].visibleData = [source1Label];
    audited.sources[0].visibleData = [source1Label];
    initial.sources[1].visibleData = [source2Label];
    audited.sources[1].visibleData = [source2Label];
    audited.recommendations = [
        "If the goal is to compare attachment functionalities, a detailed feature matrix could be created to highlight the specific capabilities and integrations of each platform.",
        "If 'Terminal Heberto' is an internal tool, ensure its attachment capabilities meet the specific needs of its users, potentially by comparing them to widely used external tools like ChatGPT."
    ];

    const passive = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara solamente lo visible."
    );
    assert.deepEqual(passive.result.recommendations, []);
    assert.equal(passive.suppressedUnrequestedRecommendationCount, 2);
    assert.equal(passive.result.policy.strictVisualUnrequestedRecommendationsSuppressed, true);

    const requested = reconcileIndependentMediaAnalysis(
        initial,
        audited,
        files,
        "Compara lo visible y recomienda mejoras concretas."
    );
    assert.equal(requested.result.recommendations.length, 2);
    assert.equal(requested.suppressedUnrequestedRecommendationCount, 0);
});
