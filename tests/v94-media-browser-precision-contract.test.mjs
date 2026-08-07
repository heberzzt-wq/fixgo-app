import assert from "node:assert/strict";
import test from "node:test";

import {
    buildMediaPrecisionAuditQuestion,
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

test("independent audit prompt never re-injects untrusted provider narrative", () => {
    const result = baseResult();
    result.sources[0].description = "Screenshot of the ChatGPT Plus interface.";
    result.sources[0].observations = ["Menu includes 'Añadir fotos y archivos'."];
    result.sources[0].inferences = ["The user is preparing to attach a file."];
    const prompt = buildMediaPrecisionAuditQuestion("Compara solamente lo visible.", result);
    assert.doesNotMatch(prompt, /ChatGPT Plus|Añadir fotos y archivos|preparing to attach/i);
    assert.match(prompt, /SOURCE_1/);
    assert.match(prompt, /one\.png/);
});
