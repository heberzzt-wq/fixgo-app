const test = require("node:test");
const assert = require("node:assert/strict");

const {
    assessGroundingSupportFreshness,
    extractExplicitDatesFromText,
    filterGroundingSupportsByFreshness,
    isAggregateFreshnessUrl
} = require("../functions/jarvis-web-fact-freshness");

function responseWithSupports() {
    return {
        candidates: [{
            groundingMetadata: {
                groundingChunks: [{
                    web: {
                        uri: "https://developers.openai.com/api/docs/changelog",
                        title: "Changelog - OpenAI API"
                    }
                }, {
                    web: {
                        uri: "https://openai.com/index/example-release/",
                        title: "Example release"
                    }
                }],
                groundingSupports: [{
                    segment: {
                        text: "A partir del 2 de junio de 2026, las sesiones elegibles se facturan por minuto."
                    },
                    groundingChunkIndices: [0]
                }, {
                    segment: {
                        text: "El 6 de agosto de 2026 se actualizo chat-latest para la API."
                    },
                    groundingChunkIndices: [0]
                }, {
                    segment: {
                        text: "La API incorpora una nueva capacidad verificada en esta pagina individual."
                    },
                    groundingChunkIndices: [1]
                }]
            }
        }]
    };
}

test("parses explicit Spanish and English dates from grounded support text", () => {
    const dates = extractExplicitDatesFromText(
        "Cambios del 2 de junio de 2026; follow-up on August 6, 2026."
    );
    assert.deepEqual(dates, [
        "2026-08-06T12:00:00.000Z",
        "2026-06-02T12:00:00.000Z"
    ]);
});

test("recognizes changelog and news indexes as aggregate freshness sources", () => {
    assert.equal(
        isAggregateFreshnessUrl("https://developers.openai.com/api/docs/changelog"),
        true
    );
    assert.equal(
        isAggregateFreshnessUrl("https://openai.com/news/"),
        true
    );
    assert.equal(
        isAggregateFreshnessUrl("https://openai.com/index/example-release/"),
        false
    );
});

test("rejects an old fact from a freshly modified changelog but keeps a recent dated fact", () => {
    const response = responseWithSupports();
    const assessment = assessGroundingSupportFreshness({
        response,
        inspectedSources: [{
            url: "https://developers.openai.com/api/docs/changelog",
            publishedAt: "2026-08-19T10:00:00.000Z",
            fresh: true
        }, {
            url: "https://openai.com/index/example-release/",
            publishedAt: "2026-08-10T10:00:00.000Z",
            fresh: true
        }],
        cutoffMs: Date.parse("2026-06-20T00:00:00.000Z"),
        referenceMs: Date.parse("2026-08-19T23:00:00.000Z")
    });

    assert.equal(assessment.supports.length, 3);
    assert.equal(assessment.supports[0].fresh, false);
    assert.equal(
        assessment.supports[0].evidence,
        "EXPLICIT_GROUNDED_SUPPORT_DATE_STALE"
    );
    assert.equal(assessment.supports[1].fresh, true);
    assert.equal(
        assessment.supports[1].evidence,
        "EXPLICIT_GROUNDED_SUPPORT_DATE"
    );
    assert.equal(assessment.supports[2].fresh, true);
    assert.equal(
        assessment.supports[2].evidence,
        "FRESH_INDIVIDUAL_SOURCE_DATE"
    );
});

test("freshness filter removes stale and unverifiable facts before response composition", () => {
    const freshness = {
        required: true,
        supports: [{
            key: "old fact",
            text: "Old fact",
            fresh: false
        }, {
            key: "fresh fact",
            text: "Fresh fact",
            fresh: true,
            verifiedAt: "2026-08-06T12:00:00.000Z"
        }]
    };

    const filtered = filterGroundingSupportsByFreshness([
        { text: "Old fact", sourceIds: [1] },
        { text: "Fresh fact", sourceIds: [1] },
        { text: "Unknown fact", sourceIds: [1] }
    ], freshness);

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].text, "Fresh fact");
    assert.equal(filtered[0].freshness.verifiedAt, "2026-08-06T12:00:00.000Z");
});
