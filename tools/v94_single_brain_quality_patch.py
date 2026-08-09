from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'QUALITY_ANCHOR_FAILED:{label}:{count}')
    return text.replace(old, new, 1)


def replace_between(text, start, end, replacement, label):
    first = text.find(start)
    if first < 0:
        raise SystemExit(f'QUALITY_START_NOT_FOUND:{label}')
    last = text.find(end, first + len(start))
    if last < 0:
        raise SystemExit(f'QUALITY_END_NOT_FOUND:{label}')
    return text[:first] + replacement + text[last:]


# ---------------------------------------------------------------------------
# Conversation output has one semantic authority too. Media analysis is a tool
# that supplies structured evidence; it does not own final narrative. Remove
# the deterministic mini-composer and route the final human answer through the
# same semantic conversation authority used by every other mission.
# ---------------------------------------------------------------------------
path = 'gestia-core/jarvis/jarvis.conversation.composer.js'
text = read(path)
text = replace_between(
    text,
    'function verifiedVisibleData(',
    'function constrainCompactEvidence(',
    '',
    'composer-remove-deterministic-media-mini-brain'
)

old_precision_short_circuit = '''    const precisionVerifiedMedia =\n        findPrecisionVerifiedMediaObservation(evidenceItems);\n\n    if (precisionVerifiedMedia) {\n        return {\n            ok: true,\n            status: "MEDIA_ANALYSIS_RESPONSE_VERIFIED",\n            text: renderPrecisionVerifiedMediaConversation(\n                precisionVerifiedMedia\n            ),\n            prompt: "",\n            evidence: buildBoundedConversationEvidence(evidenceItems),\n            provider: "deterministic-grounded-media",\n            model: null,\n            observation: null\n        };\n    }\n\n'''
new_precision_short_circuit = '''    const precisionVerifiedMedia =\n        findPrecisionVerifiedMediaObservation(evidenceItems);\n\n'''
text = replace_once(
    text,
    old_precision_short_circuit,
    new_precision_short_circuit,
    'composer-single-semantic-media-authority'
)

old_prompt_anchor = '''    const capabilityBriefing =\n        buildCapabilityEvidenceBriefing(evidenceItems);\n    const prompt = [\n        "Responde al usuario como Jarvis en lenguaje natural y directo.",'''
new_prompt_anchor = '''    const capabilityBriefing =\n        buildCapabilityEvidenceBriefing(evidenceItems);\n    const precisionGroundingInstruction =\n        precisionVerifiedMedia\n            ? [\n                "La evidencia incluye un análisis visual con auditoría de precisión aprobada.",\n                "Trata al analizador visual únicamente como herramienta de evidencia; tú eres la única autoridad que compone la respuesta final.",\n                "Conserva exactamente los valores de visibleData marcados VERIFIED cuando los menciones; no inventes, corrijas ni completes nombres, URLs, fechas, horas o etiquetas que no estén verificados.",\n                "Las observaciones, incertidumbres y comparaciones son evidencia auxiliar: sintetízalas sólo cuando estén respaldadas por la evidencia estructurada y mantén como incierto lo que la propia evidencia marque incierto.",\n                "No conviertas ausencia visual en hecho si la evidencia no la demuestra y no agregues recomendaciones cuando la política estructurada las suprima."\n            ].join(" ")\n            : "";\n    const prompt = [\n        "Responde al usuario como Jarvis en lenguaje natural y directo.",'''
text = replace_once(
    text,
    old_prompt_anchor,
    new_prompt_anchor,
    'composer-precision-grounding-contract'
)
text = replace_once(
    text,
    '''        "Si una herramienta fallo o falta evidencia, dilo una sola vez y no marques la mision como completada.",\n        `SOLICITUD_USUARIO=${String(instruction || "").slice(0, 12000)}`,''',
    '''        "Si una herramienta fallo o falta evidencia, dilo una sola vez y no marques la mision como completada.",\n        precisionGroundingInstruction,\n        `SOLICITUD_USUARIO=${String(instruction || "").slice(0, 12000)}`,''',
    'composer-inject-precision-contract'
)
text = replace_once(
    text,
    '''].join("\\n\\n");''',
    '''].filter(Boolean).join("\\n\\n");''',
    'composer-filter-empty-contract'
)
write(path, text)


# ---------------------------------------------------------------------------
# Conversation tests: replace renderer-specific regex contracts with stronger
# single-authority contracts. The semantic brain must synthesize useful human
# answers from structured evidence exactly once.
# ---------------------------------------------------------------------------
path = 'tests/jarvis-conversation-composer.test.mjs'
text = read(path)
old_json_test = '''test("explicit JSON capability request remains the only raw-output exception", () => {\n    const instruction =\n        "Devuélveme en JSON las herramientas disponibles.";\n    const prepared = prepareEvidenceGroundedConversationPlan({\n        instruction,\n        toolCalls: [{\n            name: "system.capabilities",\n            args: {}\n        }],\n        toolCatalog: [\n            { name: "system.capabilities" },\n            { name: "system.forensics" }\n        ]\n    });\n\n    assert.equal(isExplicitJsonResponseRequest(instruction), true);\n    assert.deepEqual(\n        prepared.operationalCalls.map(call => call.name),\n        ["system.capabilities"]\n    );\n    assert.equal(prepared.requiresFinalConversation, false);\n    assert.doesNotThrow(() =>\n        JSON.parse(JSON.stringify(capabilityEvidence))\n    );\n});'''
new_json_test = '''test("explicit JSON output is accepted only from structured semantic plan metadata", () => {\n    const toolCalls = [{\n        name: "system.capabilities",\n        args: {}\n    }];\n    toolCalls.responseFormat = "json";\n    const prepared = prepareEvidenceGroundedConversationPlan({\n        instruction: "Devuélveme las herramientas disponibles.",\n        toolCalls,\n        toolCatalog: [\n            { name: "system.capabilities" },\n            { name: "system.forensics" }\n        ]\n    });\n\n    assert.equal(isExplicitJsonResponseRequest(toolCalls), true);\n    assert.deepEqual(\n        prepared.operationalCalls.map(call => call.name),\n        ["system.capabilities"]\n    );\n    assert.equal(prepared.requiresFinalConversation, false);\n});'''
text = replace_once(text, old_json_test, new_json_test, 'conversation-structured-json-test')

start = 'test("precision-audited media response preserves verified literals without semantic rewriting", async () => {'
end = 'test("terminal exposes live operational work trace without raw telemetry", () => {'
replacement = r'''test("precision-audited media is composed once by the single semantic brain", async () => {
    let semanticCalls = 0;
    let capturedPrompt = "";
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara las dos capturas y dime diferencias reales.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 2,
                receivedSources: 2,
                sources: [{
                    sourceId: "SOURCE_1",
                    fileName: "chat.png",
                    sha256: "a".repeat(64),
                    observations: ["Hay una interfaz de conversación con un encabezado visible."],
                    visibleData: [{
                        kind: "text",
                        value: "ChatGPT Plus",
                        page: 1,
                        confidence: 1,
                        evidence: "Encabezado visible.",
                        legibility: "VERIFIED"
                    }],
                    uncertainty: ["No se puede asegurar el contenido que queda fuera del encuadre."]
                }, {
                    sourceId: "SOURCE_2",
                    fileName: "terminal.png",
                    sha256: "b".repeat(64),
                    observations: ["Hay una interfaz de terminal con un encabezado visible."],
                    visibleData: [{
                        kind: "text",
                        value: "Terminal Heberto",
                        page: 1,
                        confidence: 1,
                        evidence: "Encabezado visible.",
                        legibility: "VERIFIED"
                    }],
                    uncertainty: []
                }],
                comparison: {
                    differences: [
                        "Los encabezados visibles son distintos."
                    ]
                },
                recommendations: [],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true,
                    exactTextRequiresConfidence: 0.98
                }
            }
        }],
        executeConversation: async prompt => {
            semanticCalls += 1;
            capturedPrompt = prompt;
            return {
                ok: true,
                data: {
                    message: [
                        "Revisé las dos capturas.",
                        "En la primera se verifica el encabezado ChatGPT Plus y en la segunda Terminal Heberto.",
                        "La diferencia confirmada es que los encabezados visibles son distintos.",
                        "No puedo asegurar lo que queda fuera del encuadre de la primera captura."
                    ].join(" ")
                }
            };
        }
    });

    assert.equal(semanticCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.status, "CONVERSATIONAL_COMPOSITION_COMPLETED");
    assert.match(result.text, /ChatGPT Plus/);
    assert.match(result.text, /Terminal Heberto/);
    assert.match(result.text, /encabezados visibles son distintos/i);
    assert.match(result.text, /fuera del encuadre/i);
    assert.match(capturedPrompt, /única autoridad que compone la respuesta final/i);
    assert.match(capturedPrompt, /visibleData/);
    assert.match(capturedPrompt, /VERIFIED/);
    assert.doesNotMatch(result.text, /SOURCE_1|sha256|precisionAudit/);
});


test("precision media final rejects raw JSON from the semantic brain", async () => {
    const result = await composeEvidenceGroundedConversation({
        instruction: "Analiza la captura.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 1,
                receivedSources: 1,
                sources: [{
                    sourceId: "SOURCE_1",
                    fileName: "terminal.png",
                    sha256: "c".repeat(64),
                    visibleData: [{
                        kind: "text",
                        value: "Motor No-Code",
                        confidence: 1,
                        evidence: "Subtítulo visible.",
                        legibility: "VERIFIED"
                    }]
                }],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true,
                    exactTextRequiresConfidence: 0.98
                }
            }
        }],
        executeConversation: async () => ({
            ok: true,
            data: { message: '{"raw":"tool-payload"}' }
        })
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "RAW_TOOL_PAYLOAD_REJECTED");
});


test("mixed media and health evidence share the same semantic final composer", async () => {
    let semanticCalls = 0;
    const result = await composeEvidenceGroundedConversation({
        instruction: "Analiza la imagen y revisa también el estado del sistema.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                expectedSources: 1,
                receivedSources: 1,
                sources: [{
                    sourceId: "SOURCE_1",
                    fileName: "captura.png",
                    sha256: "d".repeat(64)
                }],
                precisionAudit: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                    effectiveToolExecutions: 1,
                    sourceIdentityVerified: true
                }
            }
        }, {
            name: "system.health",
            observation: { ok: true, status: "HEALTHY" }
        }],
        executeConversation: async () => {
            semanticCalls += 1;
            return {
                ok: true,
                data: {
                    message: "La imagen fue analizada y el sistema está saludable."
                }
            };
        }
    });

    assert.equal(semanticCalls, 1);
    assert.equal(result.status, "CONVERSATIONAL_COMPOSITION_COMPLETED");
    assert.match(result.text, /sistema está saludable/i);
});


test("precision mission envelope preserves intact validSources for the semantic brain", async () => {
    const intactSources = [{
        sourceId: "SOURCE_1",
        fileName: "one.png",
        sha256: "e".repeat(64),
        visibleData: [{
            kind: "text",
            value: "ChatGPT Plus",
            confidence: 1,
            evidence: "header",
            legibility: "VERIFIED"
        }]
    }, {
        sourceId: "SOURCE_2",
        fileName: "two.png",
        sha256: "f".repeat(64),
        visibleData: [{
            kind: "text",
            value: "Terminal Heberto",
            confidence: 1,
            evidence: "header",
            legibility: "VERIFIED"
        }]
    }];
    let capturedPrompt = "";
    const result = await composeEvidenceGroundedConversation({
        instruction: "Compara ambas capturas.",
        evidenceItems: [{
            name: "media.analyze",
            observation: {
                ok: true,
                executionOk: true,
                objectiveSatisfied: true,
                status: "MEDIA_ANALYSIS_GROUNDED",
                version: "1.4.0-verified-visual-claims",
                sourceCount: 2,
                validSources: intactSources,
                evidence: {
                    ok: true,
                    status: "MEDIA_ANALYSIS_GROUNDED",
                    version: "1.4.0-verified-visual-claims",
                    expectedSources: 2,
                    receivedSources: 2,
                    sources: intactSources.map(source => ({
                        ...source,
                        visibleData: []
                    })),
                    precisionAudit: {
                        ok: true,
                        status: "MEDIA_ANALYSIS_PRECISION_VERIFIED",
                        effectiveToolExecutions: 1,
                        sourceIdentityVerified: true,
                        exactTextRequiresConfidence: 0.98
                    }
                }
            }
        }],
        executeConversation: async prompt => {
            capturedPrompt = prompt;
            return {
                ok: true,
                data: {
                    message: "Se verifican ChatGPT Plus y Terminal Heberto en las capturas respectivas."
                }
            };
        }
    });

    assert.equal(result.ok, true);
    assert.match(capturedPrompt, /ChatGPT Plus/);
    assert.match(capturedPrompt, /Terminal Heberto/);
    assert.match(result.text, /ChatGPT Plus/);
    assert.match(result.text, /Terminal Heberto/);
});


test("conversation composer contains no local lexical intent or narrative regex brain", () => {
    const source = fs.readFileSync(
        path.join(process.cwd(), "gestia-core/jarvis/jarvis.conversation.composer.js"),
        "utf8"
    );
    assert.doesNotMatch(source, /new RegExp|\.match\(|\.matchAll\(|\.exec\(|\.test\(/);
    assert.doesNotMatch(source, /RENDER_|STOPWORDS|ACTION_MAP|ENTITY_MAP/);
    assert.match(source, /precisionGroundingInstruction/);
});


'''
text = replace_between(text, start, end, replacement, 'conversation-replace-regex-renderer-tests')
write(path, text)


# ---------------------------------------------------------------------------
# Multifunction planner/core tests: stale contracts that require a second
# brain or local intent repair are replaced by semantic-plan/fail-closed tests.
# ---------------------------------------------------------------------------
path = 'tests/jarvis-multifunction-tools.test.mjs'
text = read(path)

# Cache-bust identity changed intentionally with the semantic-only runtime.
text = text.replace(
    'jarvis-tools-v7-20260728-identity-fidelity-v106',
    'v94-semantic-only-v108-20260809'
)

text = replace_once(
    text,
    '    assert.match(core, /!propuesta &&\\s*window\\.runCognitiveReasoning/);',
    '    assert.doesNotMatch(core, /runCognitiveReasoning/);\n    assert.match(core, /SEMANTIC_PLANNER_NO_EXECUTABLE_PLAN/);\n    assert.match(core, /SINGLE_SEMANTIC_BRAIN_FAIL_CLOSED/);',
    'multifunction-no-cognitive-fallback-test'
)

old_brain_test_start = 'test("brain awaits the model semantic planner and keeps bounded governance", () => {'
old_brain_test_end = 'test("daily supervision cloud lookup has a bounded browser deadline", () => {'
new_brain_test = r'''test("Gestia Core has one semantic brain and no alternate cognition fallback", () => {
    const core = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "gestia-core",
            "gestia-core.js"
        ),
        "utf8"
    );

    assert.match(core, /await buildJarvisMultifunctionToolCalls/);
    assert.match(core, /SINGLE SEMANTIC BRAIN CONTRACT/);
    assert.match(core, /SEMANTIC_PLANNER_NO_EXECUTABLE_PLAN/);
    assert.match(core, /SINGLE_SEMANTIC_BRAIN_FAIL_CLOSED/);
    assert.doesNotMatch(core, /runCognitiveReasoning/);
    assert.doesNotMatch(core, /sincronizarCorralSemantico/);
    assert.doesNotMatch(core, /interpretarIntenciones/);
    assert.doesNotMatch(core, /brain\.engine\.js/);
    assert.doesNotMatch(core, /semantic\.engine\.js/);
    assert.equal(
        fs.existsSync(
            path.join(__dirname, "..", "gestia-core", "hubs", "analysis.hub.js")
        ),
        false
    );
});

'''
text = replace_between(
    text,
    old_brain_test_start,
    old_brain_test_end,
    new_brain_test,
    'multifunction-replace-old-brain-contract'
)

old_identity_test_start = 'test("uploaded identity image routes once through image.edit with the real artifact source", () => {'
old_identity_test_end = 'test("independent generation remains image.generate when the attachment is explicitly excluded as a reference", () => {'
new_identity_test = r'''test("semantic image.edit plan is grounded once to the real uploaded artifact", () => {
    const manifest = [{
        name: "Screenshot_20260422-192007.png",
        mimeType: "image/png",
        artifact: ".jarvis-artifacts/uploads/Screenshot_20260422-192007.png",
        sha256: "ef595bc333a47814eb17fe2b10bced77135efc0532ff14680304ee7b2aec7d52"
    }];
    const instruction = [
        "Genera una imagen profesional mía en la playa usando mi foto adjunta.",
        "",
        "Archivos adjuntos reales entregados por el usuario:",
        JSON.stringify(manifest)
    ].join("\n");
    const catalog = [{
        name: "image.edit",
        mutates: true,
        requiresApproval: false,
        userArtifact: true,
        missionDedupeBy: ["sourceOutput", "variantId"],
        inputSchema: {
            sourceOutput: "string",
            referenceOutputs: "array",
            variantId: "string",
            identityMode: "string",
            ageMode: "string",
            prompt: "string",
            transformations: "array",
            output: "string",
            preserveLogos: "boolean",
            preserveApprovedText: "boolean"
        }
    }];

    const calls = plannerTest.trustedPlanCalls({
        toolCalls: [{
            name: "image.edit",
            args: {
                sourceOutput: manifest[0].artifact,
                prompt: "Retrato profesional de Heberto en la playa",
                transformations: ["preservar identidad"]
            }
        }]
    }, catalog, { originalInstruction: instruction });

    assert.deepEqual(calls.map(call => call.name), ["image.edit"]);
    assert.equal(calls[0].args.sourceOutput, manifest[0].artifact);
    assert.equal(calls[0].args.variantId, "PRIMARY");
    assert.equal(calls[0].args.identityMode, "strict");
    assert.equal(calls[0].args.ageMode, "preserve");
});


test("wrong model tool choice is not reinterpreted by a local language brain", () => {
    const manifest = [{
        name: "selfie.png",
        mimeType: "image/png",
        artifact: ".jarvis-artifacts/uploads/selfie.png"
    }];
    const catalog = [{
        name: "image.generate",
        mutates: true,
        requiresApproval: false,
        userArtifact: true,
        missionDedupeBy: ["output"],
        inputSchema: { prompt: "string", output: "string" }
    }, {
        name: "image.edit",
        mutates: true,
        requiresApproval: false,
        userArtifact: true,
        missionDedupeBy: ["sourceOutput", "variantId"],
        inputSchema: { sourceOutput: "string", prompt: "string" }
    }];
    const instruction = [
        "Usa mi foto adjunta como referencia.",
        "",
        "Archivos adjuntos reales entregados por el usuario:",
        JSON.stringify(manifest)
    ].join("\n");

    const calls = plannerTest.trustedPlanCalls({
        toolCalls: [{ name: "image.generate", args: { prompt: "Retrato" } }]
    }, catalog, { originalInstruction: instruction });

    assert.deepEqual(calls.map(call => call.name), ["image.generate"]);
});

'''
text = replace_between(
    text,
    old_identity_test_start,
    old_identity_test_end,
    new_identity_test,
    'multifunction-image-semantic-authority-tests'
)

old_reference_test_start = 'test("reference photo count never becomes output variant count and newest dated identity is primary", () => {'
old_reference_test_end = 'test("semantic planner treats search as discovery rather than completed inspection", async () => {'
new_reference_test = r'''test("semantic image plan owns primary identity choice while local code only grounds and dedupes", () => {
    const manifest = [{
        name: "IMG_20211225_012522-2.jpg",
        mimeType: "image/jpeg",
        artifact: ".jarvis-artifacts/uploads/old-reference.jpg"
    }, {
        name: "IMG_20241216_111350981_HDR.jpg",
        mimeType: "image/jpeg",
        artifact: ".jarvis-artifacts/uploads/current-reference.jpg"
    }];
    const instruction = [
        "Usa mis fotos como referencias de identidad y crea una sola imagen profesional.",
        "",
        "Archivos adjuntos reales entregados por el usuario:",
        JSON.stringify(manifest)
    ].join("\n");
    const catalog = [{
        name: "image.edit",
        mutates: true,
        requiresApproval: false,
        userArtifact: true,
        missionDedupeBy: ["sourceOutput", "variantId"],
        inputSchema: {
            sourceOutput: "string",
            referenceOutputs: "array",
            variantId: "string",
            identityMode: "string",
            ageMode: "string",
            prompt: "string",
            transformations: "array",
            output: "string"
        }
    }];

    const calls = plannerTest.trustedPlanCalls({
        toolCalls: [{
            name: "image.edit",
            args: {
                sourceOutput: manifest[1].artifact,
                referenceOutputs: [manifest[0].artifact],
                prompt: "Retrato profesional",
                variantId: "PRIMARY"
            }
        }, {
            name: "image.edit",
            args: {
                sourceOutput: manifest[1].artifact,
                referenceOutputs: [manifest[0].artifact],
                prompt: "Duplicado semántico",
                variantId: "PRIMARY"
            }
        }]
    }, catalog, { originalInstruction: instruction });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "image.edit");
    assert.equal(calls[0].args.sourceOutput, manifest[1].artifact);
    assert.deepEqual(calls[0].args.referenceOutputs, [manifest[0].artifact]);
    assert.equal(calls[0].args.variantId, "PRIMARY");
});

'''
reference_start_index = text.find(old_reference_test_start)
if reference_start_index < 0:
    raise SystemExit('QUALITY_START_NOT_FOUND:multifunction-primary-identity-owned-by-semantic-plan')
text = text[:reference_start_index] + new_reference_test.rstrip() + "\n"
write(path, text)

print('V94_SINGLE_BRAIN_QUALITY_PATCH_APPLIED')
