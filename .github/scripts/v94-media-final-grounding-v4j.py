from pathlib import Path

media_path = Path("functions/jarvis-media-analysis.js")
pack_path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
media_test_path = Path("tests/jarvis-media-analysis.test.cjs")
browser_test_path = Path("tests/v94-media-browser-precision-contract.test.mjs")

media = media_path.read_text(encoding="utf-8")
pack = pack_path.read_text(encoding="utf-8")
media_tests = media_test_path.read_text(encoding="utf-8")

old_policy = '''function applyQuestionGroundingPolicy(parsed, question = "") {
    if (!strictVisualOnlyRequested(question)) return parsed;
    return {
        ...parsed,
        sources: (Array.isArray(parsed?.sources) ? parsed.sources : [])
            .map(source => ({
                ...source,
                description: "",
                observations: (Array.isArray(source?.observations)
                    ? source.observations
                    : [])
                    .filter(item =>
                        !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                            String(item || "")
                        )
                    ),
                inferences: []
            })),
        comparison: parsed?.comparison && typeof parsed.comparison === "object"
            ? {
                ...parsed.comparison,
                differences: (Array.isArray(parsed.comparison?.differences)
                    ? parsed.comparison.differences
                    : [])
                    .filter(item =>
                        !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                            String(item || "")
                        )
                    )
            }
            : parsed?.comparison,
        recommendations: (Array.isArray(parsed?.recommendations)
            ? parsed.recommendations
            : [])
            .filter(item =>
                !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                    String(item || "")
                )
            )
    };
}'''
new_policy = '''function applyQuestionGroundingPolicy(parsed, question = "") {
    if (!strictVisualOnlyRequested(question)) return parsed;
    const strictParsed = {
        ...parsed,
        sources: (Array.isArray(parsed?.sources) ? parsed.sources : [])
            .map(source => ({
                ...source,
                description: "",
                observations: (Array.isArray(source?.observations)
                    ? source.observations
                    : [])
                    .filter(item =>
                        !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                            String(item || "")
                        )
                    ),
                inferences: []
            })),
        comparison: parsed?.comparison && typeof parsed.comparison === "object"
            ? {
                ...parsed.comparison,
                differences: (Array.isArray(parsed.comparison?.differences)
                    ? parsed.comparison.differences
                    : [])
                    .filter(item =>
                        !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                            String(item || "")
                        )
                    )
            }
            : parsed?.comparison,
        recommendations: (Array.isArray(parsed?.recommendations)
            ? parsed.recommendations
            : [])
            .filter(item =>
                !CONVERSATION_TRANSCRIPT_OBSERVATION_PATTERN.test(
                    String(item || "")
                )
            )
    };

    return sanitizePrecisionNarrative(strictParsed).parsed;
}'''
if old_policy not in media:
    raise SystemExit("v4j strict policy anchor missing")
media = media.replace(old_policy, new_policy, 1)

old_combined_return = '''                analysisMode: "COMBINED",
                combinedAnalysisFailed: false,
                repairCount: repairAttempt,'''
new_combined_return = '''                analysisMode: "COMBINED",
                combinedAnalysisFailed: false,
                strictVisualOnly: strictVisualOnlyRequested(question),
                repairCount: repairAttempt,'''
if old_combined_return not in media:
    raise SystemExit("v4j combined return anchor missing")
media = media.replace(old_combined_return, new_combined_return, 1)

old_sanitized_return = '''                        analysisMode:
                            "COMBINED_PRECISION_SANITIZED",
                        combinedAnalysisFailed: false,
                        repairCount: repairAttempt,'''
new_sanitized_return = '''                        analysisMode:
                            "COMBINED_PRECISION_SANITIZED",
                        combinedAnalysisFailed: false,
                        strictVisualOnly: strictVisualOnlyRequested(question),
                        repairCount: repairAttempt,'''
if old_sanitized_return not in media:
    raise SystemExit("v4j sanitized return anchor missing")
media = media.replace(old_sanitized_return, new_sanitized_return, 1)

old_isolated_return = '''        analysisMode:
            "ISOLATED_PER_FILE_FALLBACK",
        combinedAnalysisFailed:
            true,
        repairCount,'''
new_isolated_return = '''        analysisMode:
            "ISOLATED_PER_FILE_FALLBACK",
        combinedAnalysisFailed:
            true,
        strictVisualOnly: strictVisualOnlyRequested(question),
        repairCount,'''
if old_isolated_return not in media:
    raise SystemExit("v4j isolated return anchor missing")
media = media.replace(old_isolated_return, new_isolated_return, 1)

old_candidate = '''    const candidateSources = (Array.isArray(result?.sources) ? result.sources : [])
        .map(source => ({
            sourceId: source?.sourceId,
            fileName: source?.fileName || source?.name,
            description: source?.description,
            observations: source?.observations,
            inferences: source?.inferences,
            visibleData: source?.visibleData,
            uncertainty: source?.uncertainty,
            evidence: source?.evidence
        }));'''
new_candidate = '''    const candidateSources = (Array.isArray(result?.sources) ? result.sources : [])
        .map(source => ({
            sourceId: source?.sourceId,
            fileName: source?.fileName || source?.name,
            sha256: source?.sha256,
            visibleData: (Array.isArray(source?.visibleData) ? source.visibleData : [])
                .filter(item =>
                    String(item?.legibility || "").trim().toUpperCase() === "VERIFIED" &&
                    Number(item?.confidence || 0) >= 0.98 &&
                    Boolean(String(item?.value || "").trim()) &&
                    Boolean(String(item?.evidence || "").trim())
                )
        }));'''
if old_candidate not in pack:
    raise SystemExit("v4j audit candidate anchor missing")
pack = pack.replace(old_candidate, new_candidate, 1)

old_verify_decl = '''function verifyGroundedMediaPrecisionContract(result, files) {'''
new_verify_decl = '''export function verifyGroundedMediaPrecisionContract(result, files) {'''
if old_verify_decl not in pack:
    raise SystemExit("v4j verify export anchor missing")
pack = pack.replace(old_verify_decl, new_verify_decl, 1)

old_audit_decl = '''function buildMediaPrecisionAuditQuestion(question, result) {'''
new_audit_decl = '''export function buildMediaPrecisionAuditQuestion(question, result) {'''
if old_audit_decl not in pack:
    raise SystemExit("v4j audit export anchor missing")
pack = pack.replace(old_audit_decl, new_audit_decl, 1)

verify_anchor = '''const VERIFIED_VISUAL_CLAIMS_CONTRACT =
    "1.4.0-verified-visual-claims";

export function verifyGroundedMediaPrecisionContract(result, files) {'''
verify_helpers = '''const VERIFIED_VISUAL_CLAIMS_CONTRACT =
    "1.4.0-verified-visual-claims";
const MEDIA_CONTRACT_SENSITIVE_LITERAL_PATTERN = /(?:https?:\\/\\/[^\\s\"'<>]+|www\\.[^\\s\"'<>]+|\\b(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\\.)+(?:com|net|org|app|dev|io|mx|ai|co|es|tech|cloud|web)\\b|\\b\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}\\b|\\b(?:19|20)\\d{2}\\b|\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\b)/gi;
const MEDIA_CONTRACT_QUOTED_LITERAL_PATTERN = /[\"'`“”‘’]([^\"'`“”‘’\\n]{2,1000})[\"'`“”‘’]/g;
const MEDIA_CONTRACT_PROPER_UI_LITERAL_PATTERN = /\\b(?:[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+[A-Z][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*|[A-ZÁÉÍÓÚÑ][a-záéíóúüñ0-9-]+(?:\\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*[a-záéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9-]*)+)\\b/g;

function normalizeMediaContractLiteral(value = "") {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\\u0300-\\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[),.;!?]+$/g, "");
}

function verifiedMediaContractValues(sources = []) {
    return [...new Set((Array.isArray(sources) ? sources : [])
        .flatMap(source =>
            (Array.isArray(source?.visibleData) ? source.visibleData : [])
                .filter(item =>
                    String(item?.legibility || "").trim().toUpperCase() === "VERIFIED" &&
                    Number(item?.confidence || 0) >= 0.98 &&
                    Boolean(String(item?.value || "").trim()) &&
                    Boolean(String(item?.evidence || "").trim())
                )
                .map(item => normalizeMediaContractLiteral(item.value))
        )
        .filter(Boolean))];
}

function mediaContractNarrativeLiterals(value = "") {
    const text = String(value || "");
    const patterns = [
        MEDIA_CONTRACT_SENSITIVE_LITERAL_PATTERN,
        MEDIA_CONTRACT_QUOTED_LITERAL_PATTERN,
        MEDIA_CONTRACT_PROPER_UI_LITERAL_PATTERN
    ];
    const literals = [];
    for (const template of patterns) {
        const pattern = new RegExp(template.source, template.flags);
        for (const match of text.matchAll(pattern)) {
            literals.push(String(match?.[1] || match?.[0] || "").trim());
        }
    }
    return [...new Set(literals.filter(Boolean))];
}

function mediaContractContainsUngroundedLiteral(value, verifiedValues = []) {
    if (value == null) return false;
    if (typeof value === "string") {
        return mediaContractNarrativeLiterals(value).some(literal => {
            const candidate = normalizeMediaContractLiteral(literal);
            return candidate && !verifiedValues.some(verified =>
                verified === candidate ||
                verified.includes(candidate)
            );
        });
    }
    if (Array.isArray(value)) {
        return value.some(item =>
            mediaContractContainsUngroundedLiteral(item, verifiedValues)
        );
    }
    if (typeof value !== "object") return false;
    return Object.values(value).some(item =>
        mediaContractContainsUngroundedLiteral(item, verifiedValues)
    );
}

function mediaNarrativeContractIsValid(result, sources) {
    for (const source of sources) {
        const verifiedValues = verifiedMediaContractValues([source]);
        if (result?.strictVisualOnly === true) {
            if (String(source?.description || "").trim()) return false;
            if (Array.isArray(source?.inferences) && source.inferences.length > 0) return false;
        }
        const narrative = [
            source?.description,
            source?.observations,
            source?.inferences,
            source?.objects,
            source?.composition,
            source?.pages,
            source?.marketingUse,
            source?.quality,
            source?.uncertainty,
            source?.evidence
        ];
        if (narrative.some(value =>
            mediaContractContainsUngroundedLiteral(value, verifiedValues)
        )) {
            return false;
        }
    }

    const globalVerifiedValues = verifiedMediaContractValues(sources);
    return ![
        result?.comparison,
        result?.recommendations
    ].some(value =>
        mediaContractContainsUngroundedLiteral(value, globalVerifiedValues)
    );
}

export function verifyGroundedMediaPrecisionContract(result, files) {'''
if verify_anchor not in pack:
    raise SystemExit("v4j verify helper anchor missing")
pack = pack.replace(verify_anchor, verify_helpers, 1)

old_source_contract = '''    const sourceContractIsValid =
        sources.length === files.length &&
        sources.every(source =>'''
new_source_contract = '''    const sourceContractIsValid =
        sources.length === files.length &&
        sources.every(source =>'''
if old_source_contract not in pack:
    raise SystemExit("v4j source contract anchor missing")
# kept as a structural anchor only

old_if = '''        policy.unverifiedLiteralValuesAreWithheld !== true ||
        sourceContractIsValid !== true
    ) {'''
new_if = '''        policy.unverifiedLiteralValuesAreWithheld !== true ||
        sourceContractIsValid !== true ||
        mediaNarrativeContractIsValid(result, sources) !== true
    ) {'''
if old_if not in pack:
    raise SystemExit("v4j contract condition anchor missing")
pack = pack.replace(old_if, new_if, 1)

media_marker = 'test("production raw strict-visual result removes the exact 1J literal leak before returning", async () => {'
if media_marker not in media_tests:
    media_tests += r'''


test("production raw strict-visual result removes the exact 1J literal leak before returning", async () => {
    const result = await runJarvisMediaAnalysis({
        ai: {
            models: {
                generateContent: async () => ({
                    text: JSON.stringify({
                        sources: [
                            {
                                sourceId: "SOURCE_1",
                                fileName: "chat-gpt-aduntos-1.png",
                                mimeType: "image/png",
                                description: "Screenshot of the ChatGPT Plus interface showing a detailed dropdown menu.",
                                observations: [
                                    "The application is identified as 'ChatGPT Plus'.",
                                    "An open menu displays options including 'Añadir fotos y archivos'.",
                                    "Se observa un menu abierto con varias filas."
                                ],
                                inferences: ["The user is likely preparing to attach a file."],
                                objects: [],
                                composition: {},
                                visibleData: [],
                                pages: [],
                                marketingUse: [],
                                quality: {},
                                uncertainty: [],
                                evidence: []
                            },
                            {
                                sourceId: "SOURCE_2",
                                fileName: "terminal-adjunto-1.png",
                                mimeType: "image/png",
                                description: "Screenshot of Terminal Heberto.",
                                observations: ["A panel on the right side displays code-like content."],
                                inferences: [],
                                objects: [],
                                composition: {},
                                visibleData: [],
                                pages: [],
                                marketingUse: [],
                                quality: {},
                                uncertainty: [],
                                evidence: []
                            }
                        ],
                        comparison: {
                            beforeAfter: false,
                            differences: ["The two layouts are visually distinct."],
                            confidence: 0.99
                        },
                        recommendations: []
                    })
                })
            }
        },
        input: {
            files: [
                {
                    name: "chat-gpt-aduntos-1.png",
                    mimeType: "image/png",
                    dataBase64: Buffer.from("run-1j-source-one").toString("base64")
                },
                {
                    name: "terminal-adjunto-1.png",
                    mimeType: "image/png",
                    dataBase64: Buffer.from("run-1j-source-two").toString("base64")
                }
            ],
            question: "Describe solamente elementos visuales verificables. No infieras intenciones."
        }
    });

    assert.equal(result.status, "MEDIA_ANALYSIS_GROUNDED");
    assert.equal(result.strictVisualOnly, true);
    assert.equal(result.sources[0].description, "");
    assert.equal(result.sources[1].description, "");
    assert.deepEqual(result.sources[0].inferences, []);
    assert.deepEqual(result.sources[1].inferences, []);
    assert.deepEqual(result.sources[0].observations, ["Se observa un menu abierto con varias filas."]);
    assert.deepEqual(result.sources[1].observations, ["A panel on the right side displays code-like content."]);
    assert.doesNotMatch(
        JSON.stringify(result),
        /ChatGPT Plus|Añadir fotos y archivos|Terminal Heberto|preparing to attach/i
    );
});
'''

browser_test_path.write_text(r'''import assert from "node:assert/strict";
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
''', encoding="utf-8")

media_path.write_text(media, encoding="utf-8")
pack_path.write_text(pack, encoding="utf-8")
media_test_path.write_text(media_tests, encoding="utf-8")
