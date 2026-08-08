from pathlib import Path

pack_path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
terminal_path = Path("gestia-terminal.html")
test_path = Path("tests/v94-media-browser-precision-contract.test.mjs")
renderer_test_path = Path("tests/v94-media-evidence-render.test.cjs")

pack = pack_path.read_text(encoding="utf-8")
terminal = terminal_path.read_text(encoding="utf-8")
tests = test_path.read_text(encoding="utf-8")
renderer_tests = renderer_test_path.read_text(encoding="utf-8")

# Replace the audit prompt so pass 2 receives only identity metadata, never pass-1 literal values.
start = pack.index("export function buildMediaPrecisionAuditQuestion(question, result) {")
end = pack.index("\nasync function fetchGroundedMediaAnalysis", start)
new_audit = r'''export function buildMediaPrecisionAuditQuestion(question, result) {
    const auditSources = (Array.isArray(result?.sources) ? result.sources : [])
        .map(source => ({
            sourceId: source?.sourceId,
            fileName: source?.fileName || source?.name,
            sha256: source?.sha256
        }));
    return [
        "AUDITORIA_DE_PRECISION_VISUAL_INDEPENDIENTE",
        "Vuelve a inspeccionar directamente cada archivo desde cero.",
        "El segundo pase NO recibe ningun literal, transcripcion ni lectura del primer pase.",
        "No intentes confirmar el borrador anterior: produce una lectura independiente basada solo en los pixeles.",
        "Conserva cada afirmacion en la source del archivo donde sea visible y no mezcles fuentes.",
        "Separa descripcion visual de transcripcion literal.",
        "No traduzcas, autocorrijas, completes ni normalices texto visible.",
        "No emitas una URL, fecha, hora, ano, cifra o identificador si no puedes leerlo completo con certeza alta.",
        "Todo texto literal debe ir en visibleData con evidencia, confidence y legibility.",
        "Usa legibility=VERIFIED solamente para una lectura completa y confidence igual o mayor a 0.98.",
        "Si una lectura no cumple ese umbral, omite su valor y explica la limitacion en uncertainty.",
        "Responde en espanol y conserva los nombres de archivo literalmente.",
        "En comparison.differences incluye solo diferencias visibles entre las fuentes.",
        "En recommendations enumera carencias concretas comprobables por contraste visual.",
        "No uses recommendations para proponer investigar, explorar o documentar; si no hay evidencia visual suficiente, dilo expresamente.",
        `FUENTES_PARA_REINSPECCION=${JSON.stringify(auditSources)}`,
        `SOLICITUD_ORIGINAL=${String(question || "").slice(0, 3000)}`
    ].join("\n");
}
'''
pack = pack[:start] + new_audit + pack[end:]

# Insert deterministic independent-pass reconciliation before the audit prompt.
insert_at = pack.index("export function buildMediaPrecisionAuditQuestion(question, result) {")
helpers = r'''
function verifiedMediaContractItems(source = {}) {
    return (Array.isArray(source?.visibleData) ? source.visibleData : [])
        .filter(item =>
            String(item?.legibility || "").trim().toUpperCase() === "VERIFIED" &&
            Number(item?.confidence || 0) >= 0.98 &&
            Boolean(String(item?.value || "").trim()) &&
            Boolean(String(item?.evidence || "").trim())
        );
}

function mediaVisibleDataConsensusKey(item = {}) {
    const kind = String(item?.kind || "text").trim().toLowerCase();
    const value = normalizeMediaContractLiteral(item?.value || "");
    return kind && value ? `${kind}::${value}` : "";
}

function explicitSensitiveLiteralRequest(question = "", kind = "") {
    const text = String(question || "").toLowerCase();
    const verbs = "(?:lee|leer|extrae|extraer|identifica|identificar|reporta|reportar|dime|indica|indicar|cual|cuál|read|extract|identify|report|tell|what)";
    const terms = {
        date: "(?:fecha|date|dia|día)",
        time: "(?:hora|time|reloj|clock)",
        url: "(?:url|enlace|link|dominio|domain|direccion web|dirección web)",
        number: "(?:numero|número|cifra|cantidad|number|amount|count)",
        identifier: "(?:identificador|identifier|folio|expediente|hash|sha|id)"
    };
    const term = terms[String(kind || "").toLowerCase()];
    if (!term) return true;
    return new RegExp(
        `${verbs}[\\s\\S]{0,80}${term}|${term}[\\s\\S]{0,80}${verbs}`,
        "i"
    ).test(text);
}

function sanitizeNarrativeAgainstVerifiedValues(value, verifiedValues = []) {
    if (!Array.isArray(value)) return [];
    return value.filter(item =>
        !mediaContractContainsUngroundedLiteral(item, verifiedValues)
    );
}

export function reconcileIndependentMediaAnalysis(
    initial,
    audited,
    files,
    question = ""
) {
    const initialSources = Array.isArray(initial?.sources) ? initial.sources : [];
    const auditedSources = Array.isArray(audited?.sources) ? audited.sources : [];
    let disputedLiteralCount = 0;
    let suppressedPeripheralLiteralCount = 0;

    const sources = auditedSources.map((source, index) => {
        const first = initialSources[index] || {};
        const firstItems = verifiedMediaContractItems(first);
        const secondItems = verifiedMediaContractItems(source);
        const firstKeys = new Set(
            firstItems.map(mediaVisibleDataConsensusKey).filter(Boolean)
        );
        const secondKeys = new Set(
            secondItems.map(mediaVisibleDataConsensusKey).filter(Boolean)
        );

        for (const key of firstKeys) {
            if (!secondKeys.has(key)) disputedLiteralCount += 1;
        }
        for (const key of secondKeys) {
            if (!firstKeys.has(key)) disputedLiteralCount += 1;
        }

        const visibleData = secondItems.filter(item => {
            const key = mediaVisibleDataConsensusKey(item);
            if (!key || !firstKeys.has(key)) return false;
            const kind = String(item?.kind || "text").trim().toLowerCase();
            if (
                ["date", "time", "url", "number", "identifier"].includes(kind) &&
                !explicitSensitiveLiteralRequest(question, kind)
            ) {
                suppressedPeripheralLiteralCount += 1;
                return false;
            }
            return true;
        });

        const verifiedValues = verifiedMediaContractValues([{ visibleData }]);
        const uncertainty = sanitizeNarrativeAgainstVerifiedValues(
            source?.uncertainty,
            verifiedValues
        );
        if (firstKeys.size !== secondKeys.size || [...firstKeys].some(key => !secondKeys.has(key))) {
            uncertainty.push(
                "Una o mas lecturas literales difirieron entre pases independientes y se omitieron."
            );
        }

        return {
            ...source,
            description:
                audited?.strictVisualOnly === true
                    ? ""
                    : String(source?.description || ""),
            observations:
                sanitizeNarrativeAgainstVerifiedValues(
                    source?.observations,
                    verifiedValues
                ),
            inferences:
                audited?.strictVisualOnly === true
                    ? []
                    : sanitizeNarrativeAgainstVerifiedValues(
                        source?.inferences,
                        verifiedValues
                    ),
            visibleData,
            uncertainty: [...new Set(uncertainty)],
            evidence:
                sanitizeNarrativeAgainstVerifiedValues(
                    source?.evidence,
                    verifiedValues
                )
        };
    });

    const globalVerifiedValues = verifiedMediaContractValues(sources);
    const comparison = audited?.comparison && typeof audited.comparison === "object"
        ? {
            ...audited.comparison,
            differences:
                sanitizeNarrativeAgainstVerifiedValues(
                    audited.comparison?.differences,
                    globalVerifiedValues
                )
        }
        : audited?.comparison;
    const recommendations = sanitizeNarrativeAgainstVerifiedValues(
        audited?.recommendations,
        globalVerifiedValues
    );

    const sourceManifest = files.map((file, index) => ({
        sourceId: `SOURCE_${index + 1}`,
        fileName: file.name,
        sha256: String(file.sha256 || "").trim().toLowerCase()
    }));
    const verifiedVisualClaims = sources.flatMap(source =>
        verifiedMediaContractItems(source).map(item => ({
            sourceId: source?.sourceId || null,
            fileName: source?.fileName || source?.name || null,
            kind: item?.kind || "text",
            value: item?.value || "",
            page: item?.page || 1,
            confidence: Number(item?.confidence || 0),
            evidence: item?.evidence || "",
            legibility: "VERIFIED"
        }))
    );

    return {
        result: {
            ...audited,
            sources,
            sourceManifest,
            comparison,
            recommendations,
            verifiedVisualClaims,
            policy: {
                ...(audited?.policy || {}),
                independentPassLiteralConsensusRequired: true,
                peripheralSensitiveLiteralSuppression: true
            }
        },
        consensusVerifiedLiteralCount: verifiedVisualClaims.length,
        disputedLiteralCount,
        suppressedPeripheralLiteralCount
    };
}

'''
pack = pack[:insert_at] + helpers + pack[insert_at:]

# Reconcile the two independent provider passes instead of trusting pass 2 wholesale.
old = '''    const auditedPrecisionContract =
        verifyGroundedMediaPrecisionContract(audited, files);
    if (!auditedPrecisionContract.ok) {
        return {
            ...auditedPrecisionContract,
            status: "MEDIA_ANALYSIS_PRECISION_AUDIT_FAILED",
            error: auditedPrecisionContract.error
        };
    }
    const result = {
        ...audited,
        precisionAudit: {
            ok: true,
            status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
            providerPasses: 2,
            effectiveToolExecutions: 1,
            sourceIdentityVerified: true,
            exactTextRequiresConfidence: 0.98,
            initialVersion: initial.version || null,
            auditedVersion: audited.version || null
        }
    };'''
new = '''    const auditedPrecisionContract =
        verifyGroundedMediaPrecisionContract(audited, files);
    if (!auditedPrecisionContract.ok) {
        return {
            ...auditedPrecisionContract,
            status: "MEDIA_ANALYSIS_PRECISION_AUDIT_FAILED",
            error: auditedPrecisionContract.error
        };
    }

    const reconciled =
        reconcileIndependentMediaAnalysis(
            initial,
            audited,
            files,
            question
        );
    const reconciledPrecisionContract =
        verifyGroundedMediaPrecisionContract(
            reconciled.result,
            files
        );
    if (!reconciledPrecisionContract.ok) {
        return {
            ...reconciledPrecisionContract,
            status: "MEDIA_ANALYSIS_PRECISION_AUDIT_FAILED",
            error: reconciledPrecisionContract.error
        };
    }

    const result = {
        ...reconciled.result,
        precisionAudit: {
            ok: true,
            status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
            providerPasses: 2,
            effectiveToolExecutions: 1,
            sourceIdentityVerified: true,
            independentPassLiteralConsensusRequired: true,
            exactTextRequiresConfidence: 0.98,
            consensusVerifiedLiteralCount:
                reconciled.consensusVerifiedLiteralCount,
            disputedLiteralCount:
                reconciled.disputedLiteralCount,
            suppressedPeripheralLiteralCount:
                reconciled.suppressedPeripheralLiteralCount,
            initialVersion: initial.version || null,
            auditedVersion: audited.version || null
        }
    };'''
if old not in pack:
    raise SystemExit("v4m fetch reconciliation anchor missing")
pack = pack.replace(old, new, 1)

# Expose precision-audit metadata in the evidence renderer.
old_renderer = '''                                repairCount:\n                                    repoData?.repairCount ?? null,\n                                sources:\n'''
new_renderer = '''                                repairCount:\n                                    repoData?.repairCount ?? null,\n                                strictVisualOnly:\n                                    repoData?.strictVisualOnly === true,\n                                precisionAudit:\n                                    repoData?.precisionAudit || null,\n                                precisionSanitized:\n                                    repoData?.precisionSanitized === true,\n                                precisionSanitizedCount:\n                                    repoData?.precisionSanitizedCount ?? null,\n                                sources:\n'''
if old_renderer not in terminal:
    raise SystemExit("v4m terminal media evidence anchor missing")
terminal = terminal.replace(old_renderer, new_renderer, 1)

# Expand browser precision tests with the exact 2024-vs-2026 incident.
old_import = '''    buildMediaPrecisionAuditQuestion,\n    verifyGroundedMediaPrecisionContract\n} from "../gestia-core/jarvis/jarvis.multitool.pack.js";'''
new_import = '''    buildMediaPrecisionAuditQuestion,\n    reconcileIndependentMediaAnalysis,\n    verifyGroundedMediaPrecisionContract\n} from "../gestia-core/jarvis/jarvis.multitool.pack.js";'''
if old_import not in tests:
    raise SystemExit("v4m test import anchor missing")
tests = tests.replace(old_import, new_import, 1)

old_audit_test = '''test("independent audit prompt never re-injects untrusted provider narrative", () => {\n    const result = baseResult();\n    result.sources[0].description = "Screenshot of the ChatGPT Plus interface.";\n    result.sources[0].observations = ["Menu includes 'Añadir fotos y archivos'."];\n    result.sources[0].inferences = ["The user is preparing to attach a file."];\n    const prompt = buildMediaPrecisionAuditQuestion("Compara solamente lo visible.", result);\n    assert.doesNotMatch(prompt, /ChatGPT Plus|Añadir fotos y archivos|preparing to attach/i);\n    assert.match(prompt, /SOURCE_1/);\n    assert.match(prompt, /one\\.png/);\n});'''
new_audit_test = '''test("independent audit prompt never re-injects untrusted provider narrative or literals", () => {\n    const result = baseResult();\n    result.sources[0].description = "Screenshot of the ChatGPT Plus interface.";\n    result.sources[0].observations = ["Menu includes 'Añadir fotos y archivos'."];\n    result.sources[0].inferences = ["The user is preparing to attach a file."];\n    result.sources[0].visibleData = [{\n        kind: "date",\n        value: "07/08/2024",\n        page: 1,\n        confidence: 1,\n        evidence: "system tray",\n        legibility: "VERIFIED"\n    }];\n    const prompt = buildMediaPrecisionAuditQuestion("Compara solamente lo visible.", result);\n    assert.doesNotMatch(prompt, /ChatGPT Plus|Añadir fotos y archivos|preparing to attach|07\\/08\\/2024/i);\n    assert.match(prompt, /SOURCE_1/);\n    assert.match(prompt, /one\\.png/);\n    assert.match(prompt, /NO recibe ningun literal/i);\n});\n\ntest("independent reconciliation drops the production 2024-vs-2026 date disagreement", () => {\n    const initial = baseResult();\n    const audited = baseResult();\n    initial.sources[0].visibleData = [\n        { kind: "text", value: "ChatGPT Plus", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" },\n        { kind: "date", value: "07/08/2024", page: 1, confidence: 1, evidence: "tray", legibility: "VERIFIED" }\n    ];\n    audited.sources[0].visibleData = [\n        { kind: "text", value: "ChatGPT Plus", page: 1, confidence: 1, evidence: "header", legibility: "VERIFIED" },\n        { kind: "date", value: "07/08/2026", page: 1, confidence: 1, evidence: "tray", legibility: "VERIFIED" }\n    ];\n    audited.sources[0].observations = [\n        "The interface shows 'ChatGPT Plus'.",\n        "The system tray shows the date '07/08/2026'."\n    ];\n\n    const reconciled = reconcileIndependentMediaAnalysis(\n        initial,\n        audited,\n        files,\n        "Compara solamente elementos visuales. No inventes fechas."\n    );\n\n    assert.equal(reconciled.disputedLiteralCount, 2);\n    assert.deepEqual(\n        reconciled.result.sources[0].visibleData.map(item => item.value),\n        ["ChatGPT Plus"]\n    );\n    assert.doesNotMatch(JSON.stringify(reconciled.result), /07\\/08\\/2024|07\\/08\\/2026/);\n    assert.equal(reconciled.result.policy.independentPassLiteralConsensusRequired, true);\n});\n\ntest("peripheral date is suppressed even when both passes agree unless the user explicitly asks for it", () => {\n    const initial = baseResult();\n    const audited = baseResult();\n    const dateItem = { kind: "date", value: "07/08/2024", page: 1, confidence: 1, evidence: "tray", legibility: "VERIFIED" };\n    initial.sources[0].visibleData = [dateItem];\n    audited.sources[0].visibleData = [dateItem];\n\n    const visualOnly = reconcileIndependentMediaAnalysis(\n        initial,\n        audited,\n        files,\n        "Compara los menus visibles. No inventes fechas."\n    );\n    assert.equal(visualOnly.result.sources[0].visibleData.length, 0);\n    assert.equal(visualOnly.suppressedPeripheralLiteralCount, 1);\n\n    const explicitDate = reconcileIndependentMediaAnalysis(\n        initial,\n        audited,\n        files,\n        "Lee y reporta la fecha visible en SOURCE_1."\n    );\n    assert.equal(explicitDate.result.sources[0].visibleData[0].value, "07/08/2024");\n});'''
if old_audit_test not in tests:
    raise SystemExit("v4m audit regression anchor missing")
tests = tests.replace(old_audit_test, new_audit_test, 1)

# Ensure renderer regression requires the audit block to remain visible.
renderer_anchor = '''    assert.match(terminal, /policy:/);\n'''
renderer_replacement = '''    assert.match(terminal, /policy:/);\n    assert.match(terminal, /precisionAudit:/);\n    assert.match(terminal, /strictVisualOnly:/);\n'''
if renderer_anchor not in renderer_tests:
    raise SystemExit("v4m renderer test anchor missing")
renderer_tests = renderer_tests.replace(renderer_anchor, renderer_replacement, 1)

pack_path.write_text(pack, encoding="utf-8")
terminal_path.write_text(terminal, encoding="utf-8")
test_path.write_text(tests, encoding="utf-8")
renderer_test_path.write_text(renderer_tests, encoding="utf-8")
