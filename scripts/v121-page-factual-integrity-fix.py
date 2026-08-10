from pathlib import Path

RELEASE = "v94-page-factual-integrity-v121-20260810"
V120 = "v94-generalist-page-integrity-v120-20260810"

module = r'''export function normalizePageFactualAudit(value = {}) {
    const payload = value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    const unsupportedClaims = Array.isArray(payload.unsupportedClaims)
        ? payload.unsupportedClaims
            .map(item => String(item || "").trim())
            .filter(Boolean)
            .slice(0, 40)
        : null;
    const pageInput = payload.pageInput &&
        typeof payload.pageInput === "object" &&
        !Array.isArray(payload.pageInput)
            ? payload.pageInput
            : null;
    const accepted =
        payload.ok === true &&
        Array.isArray(unsupportedClaims) &&
        unsupportedClaims.length === 0 &&
        Boolean(pageInput);
    return {
        ok: accepted,
        status: accepted
            ? "PAGE_FACTUAL_INTEGRITY_VERIFIED"
            : "PAGE_FACTUAL_INTEGRITY_INCOMPLETE",
        pageInput,
        unsupportedClaims:
            Array.isArray(unsupportedClaims)
                ? unsupportedClaims
                : ["FACTUAL_AUDIT_UNSUPPORTED_CLAIMS_REQUIRED"]
    };
}
'''
module_path = Path("gestia-core/jarvis/jarvis.page.factual.integrity.js")
if module_path.exists():
    raise SystemExit("V121_FACTUAL_MODULE_ALREADY_EXISTS")
module_path.write_text(module, encoding="utf-8")

pack_path = Path("gestia-core/jarvis/jarvis.multitool.pack.js")
pack = pack_path.read_text(encoding="utf-8")
identity_import = f'''import {{\n    repairCanonicalIdentityValue\n}} from "./jarvis.identity.integrity.js?v={V120}";\n'''
factual_import = identity_import + f'''import {{\n    normalizePageFactualAudit\n}} from "./jarvis.page.factual.integrity.js?v={RELEASE}";\n'''
if pack.count(identity_import) != 1:
    raise SystemExit(f"V121_IDENTITY_IMPORT_COUNT_{pack.count(identity_import)}")
pack = pack.replace(identity_import, factual_import, 1)

marker = '            name: "page.compose",'
if pack.count(marker) != 1:
    raise SystemExit(f"V121_PAGE_COMPOSE_MARKER_COUNT_{pack.count(marker)}")
head, tail = pack.split(marker, 1)

semantic_anchor = '''                let semantic = await fetchSemanticConversation(\n                    [\n                        "Redacta el contenido completo de una landing page como JSON estricto.",'''
semantic_replacement = '''                const canonicalEvidence =\n                    canonicalEvidenceEnvelope(context);\n                let semantic = await fetchSemanticConversation(\n                    [\n                        "Redacta el contenido completo de una landing page como JSON estricto.",'''
if tail.count(semantic_anchor) != 1:
    raise SystemExit(f"V121_PAGE_SEMANTIC_ANCHOR_COUNT_{tail.count(semantic_anchor)}")
tail = tail.replace(semantic_anchor, semantic_replacement, 1)

rule_anchor = '                        "No inventes clientes, certificaciones, testimonios, teléfonos, correos, garantías ni experiencia no proporcionada.",\n'
rule_replacement = rule_anchor + '''                        "REGLA_FACTUAL: cada afirmación concreta sobre el negocio debe derivarse de la solicitud actual o de EVIDENCIA_CANONICA_DE_MISION. Si no está sustentada, conviértela en lenguaje de propuesta/posibilidad o elimínala; nunca la presentes como capacidad, servicio, herramienta, resultado o característica existente.",\n                        "REGLA_ESTILO_NO_ES_HECHO: palabras de diseño como premium, tecnológico, minimalista, elegante, mobile-first o accesible describen la presentación solicitada; por sí solas no prueban que el negocio use tecnología, automatización, analítica, software, procesos avanzados ni ninguna capacidad operativa.",\n'''
if tail.count(rule_anchor) != 1:
    raise SystemExit(f"V121_FACTUAL_RULE_ANCHOR_COUNT_{tail.count(rule_anchor)}")
tail = tail.replace(rule_anchor, rule_replacement, 1)

request_anchor = '''                        `SECCIONES_PLANIFICADAS=${JSON.stringify(Array.isArray(args.sections) ? args.sections : [])}`,\n                        `SOLICITUD=${instruction}`'''
request_replacement = '''                        `SECCIONES_PLANIFICADAS=${JSON.stringify(Array.isArray(args.sections) ? args.sections : [])}`,\n                        `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`,\n                        `SOLICITUD=${instruction}`'''
if tail.count(request_anchor) != 1:
    raise SystemExit(f"V121_EVIDENCE_PROMPT_ANCHOR_COUNT_{tail.count(request_anchor)}")
tail = tail.replace(request_anchor, request_replacement, 1)

audit_anchor = '''                const missingSections = pageInput.requiredSections.filter(required =>\n                    !pageInput.contentSections.some(section =>'''
audit_block = '''                let factualAudit = {\n                    ok: false,\n                    status: "PAGE_FACTUAL_INTEGRITY_INCOMPLETE",\n                    pageInput: null,\n                    unsupportedClaims: ["FACTUAL_AUDIT_NOT_RUN"]\n                };\n                let factualAuditProvider = null;\n                let factualAuditModel = null;\n                try {\n                    const factualSemantic =\n                        await fetchSemanticConversation(\n                            [\n                                "AUDITORIA_FACTUAL_DE_PAGINA",\n                                "Audita y repara el JSON de página propuesto. Devuelve solamente JSON estricto con {ok,unsupportedClaims,pageInput}.",\n                                "pageInput debe conservar la intención, estructura y copy útil, pero no puede afirmar como hecho nada que no esté respaldado por SOLICITUD_ACTUAL o EVIDENCIA_CANONICA_DE_MISION.",\n                                "Las instrucciones de estilo visual no son evidencia de capacidades del negocio. No conviertas premium, tecnológico, mobile-first, accesible, moderno o similares en afirmaciones de automatización, analítica, software, herramientas, procesos o resultados del negocio.",\n                                "Si detectas una afirmación no sustentada, reescríbela como propuesta o posibilidad explícita, o elimínala. Sólo después de repararla devuelve ok=true y unsupportedClaims=[].",\n                                "Conserva literalmente MARCA_CANONICA y TITULO_CANONICO; conserva todas las SECCIONES_REQUERIDAS y no inventes canales de contacto.",\n                                `MARCA_CANONICA=${clean(args.brandName)}`,\n                                `TITULO_CANONICO=${clean(args.title)}`,\n                                `SECCIONES_REQUERIDAS=${JSON.stringify(Array.isArray(args.sections) ? args.sections : [])}`,\n                                `SOLICITUD_ACTUAL=${instruction}`,\n                                `EVIDENCIA_CANONICA_DE_MISION=${canonicalEvidence}`,\n                                `PAGINA_PROPUESTA=${JSON.stringify(pageInput).slice(0, 30000)}`\n                            ].join("\\n"),\n                            {\n                                maxOutputTokens: 4200\n                            }\n                        );\n                    factualAuditProvider =\n                        factualSemantic?.provider ||\n                        null;\n                    factualAuditModel =\n                        factualSemantic?.model ||\n                        null;\n                    if (factualSemantic?.ok === true) {\n                        factualAudit =\n                            normalizePageFactualAudit(\n                                extractSemanticJsonObject(\n                                    factualSemantic?.message ||\n                                    ""\n                                )\n                            );\n                    }\n                }\n                catch(error) {\n                    factualAudit = {\n                        ok: false,\n                        status: "PAGE_FACTUAL_INTEGRITY_INCOMPLETE",\n                        pageInput: null,\n                        unsupportedClaims: [\n                            error?.message ||\n                            "PAGE_FACTUAL_AUDIT_FAILED"\n                        ]\n                    };\n                }\n\n                if (factualAudit.ok === true) {\n                    pageInput =\n                        groundPageContactInput(\n                            normalizedPageArtifactInput(\n                                factualAudit.pageInput,\n                                clean(args.title),\n                                Array.isArray(args.sections) ? args.sections : [],\n                                clean(args.brandName),\n                                clean(args.title)\n                            ),\n                            instruction,\n                            {\n                                contactEmail:\n                                    args.contactEmail,\n                                whatsapp:\n                                    args.whatsapp,\n                                whatsappRequested:\n                                    args.whatsappRequested ===\n                                    true\n                            }\n                        );\n                }\n                const factualIntegrityPassed =\n                    factualAudit.ok === true;\n\n                const missingSections = pageInput.requiredSections.filter(required =>\n                    !pageInput.contentSections.some(section =>'''
if tail.count(audit_anchor) != 1:
    raise SystemExit(f"V121_AUDIT_INSERT_ANCHOR_COUNT_{tail.count(audit_anchor)}")
tail = tail.replace(audit_anchor, audit_block, 1)

ok_anchor = '''                    semantic?.ok === true &&\n                    identityPreserved &&'''
ok_replacement = '''                    semantic?.ok === true &&\n                    factualIntegrityPassed &&\n                    identityPreserved &&'''
if tail.count(ok_anchor) != 1:
    raise SystemExit(f"V121_OK_ANCHOR_COUNT_{tail.count(ok_anchor)}")
tail = tail.replace(ok_anchor, ok_replacement, 1)

status_anchor = '''                        ok\n                            ? "PAGE_CONTENT_COMPOSED"\n                            : "PAGE_CONTENT_COMPOSITION_INCOMPLETE",'''
status_replacement = '''                        ok\n                            ? "PAGE_CONTENT_COMPOSED"\n                            : !factualIntegrityPassed\n                                ? "PAGE_FACTUAL_INTEGRITY_INCOMPLETE"\n                                : "PAGE_CONTENT_COMPOSITION_INCOMPLETE",'''
if tail.count(status_anchor) != 1:
    raise SystemExit(f"V121_STATUS_ANCHOR_COUNT_{tail.count(status_anchor)}")
tail = tail.replace(status_anchor, status_replacement, 1)

return_anchor = '''                    identityPreserved,\n                    missingSections,\n                    provider:'''
return_replacement = '''                    identityPreserved,\n                    factualIntegrityPassed,\n                    factualAudit: {\n                        status: factualAudit.status,\n                        unsupportedClaims: factualAudit.unsupportedClaims,\n                        provider: factualAuditProvider,\n                        model: factualAuditModel\n                    },\n                    missingSections,\n                    provider:'''
if tail.count(return_anchor) != 1:
    raise SystemExit(f"V121_RETURN_ANCHOR_COUNT_{tail.count(return_anchor)}")
tail = tail.replace(return_anchor, return_replacement, 1)

pack_path.write_text(head + marker + tail, encoding="utf-8")
print("V121_PAGE_FACTUAL_INTEGRITY_PATCH_APPLIED")
