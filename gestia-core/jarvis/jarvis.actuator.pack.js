import {
    recordCapabilityEvidence
} from "./jarvis.capability.evidence.js";
import { adaptImageSource } from "./jarvis.image.adapter.js";

const VERSION = "7.19.0-verified-complete-artifacts";

export function normalizeImageArtifactOutput(output, mimeType) {
    const extensions = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp"
    };
    const extension = extensions[String(mimeType || "").trim().toLowerCase()];
    const candidate = String(output || "").trim().replaceAll("\\", "/");

    if (
        !extension ||
        !candidate.startsWith(".jarvis-artifacts/images/") ||
        candidate.includes("../") ||
        candidate.includes("//") ||
        !candidate.toLowerCase().endsWith(extension)
    ) {
        return undefined;
    }

    return candidate;
}

function bridgeRequest(path, payload, timeoutMs = 60000) {
    if (typeof globalThis?.JarvisLocalBridge?.requestJson !== "function") {
        return Promise.resolve({
            ok: false,
            status: "LOCAL_BRIDGE_REQUIRED",
            error: "LOCAL_BRIDGE_REQUIRED"
        });
    }

    return globalThis.JarvisLocalBridge.requestJson(
        path,
        payload,
        { timeoutMs }
    );
}

async function callAdminFunction(name, data = {}) {
    const user =
        globalThis?.auth?.currentUser ||
        globalThis?.window?.auth?.currentUser ||
        null;

    if (!user) {
        return {
            ok: false,
            status: "AUTH_REQUIRED",
            error: "AUTH_REQUIRED"
        };
    }

    const token = await user.getIdToken();
    const response = await fetch(
        `https://us-central1-fixgo-44e4d.cloudfunctions.net/${name}`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ data })
        }
    );
    const rawText = await response.text();
    let payload = null;

    try {
        payload = JSON.parse(rawText);
    }
    catch(error) {
        return {
            ok: false,
            status: `CLOUD_FUNCTION_INVALID_RESPONSE_${response.status}`,
            error: `La funcion ${name} no devolvio JSON valido.`,
            responsePreview: rawText.slice(0, 160)
        };
    }
    const result = payload?.result || payload?.data || null;

    if (!response.ok || !result) {
        const errorDetails = payload?.error?.details;
        const errorMessage =
            payload?.error?.message ||
            errorDetails?.message ||
            errorDetails?.error ||
            (typeof errorDetails === "string" ? errorDetails : "") ||
            `CLOUD_FUNCTION_HTTP_${response.status}`;
        return {
            ok: false,
            status: `CLOUD_FUNCTION_HTTP_${response.status}`,
            error: errorMessage,
            cloudCode: payload?.error?.status || payload?.error?.code || null
        };
    }

    return result;
}

function register(runtime, definition) {
    return runtime.register({
        version: VERSION,
        mutates: false,
        requiresApproval: false,
        ...definition
    });
}

export function registerJarvisActuatorTools(runtime) {
    if (!runtime || typeof runtime.register !== "function") {
        throw new Error("JARVIS_TOOL_RUNTIME_REQUIRED");
    }

    const registrations = [
        register(runtime, {
            name: "system.supervision.runNow",
            description: "Ejecuta bajo autorizacion administrativa la supervision persistida sin esperar al horario diario.",
            output: "SUPERVISION_RUN_NOW_RESULT",
            mutates: true,
            requiresApproval: true,
            execute: async () =>
                await callAdminFunction("jarvisSupervisionRunNow", {})
        }),
        register(runtime, {
            name: "browser.inspect",
            description: "Carga una URL en Chrome/Edge headless real y devuelve el DOM renderizado.",
            output: "BROWSER_INSPECTION",
            inputSchema: { url: "string", timeoutMs: "number" },
            execute: async (args = {}) =>
                await bridgeRequest("/browser", {
                    action: "inspect",
                    url: args.url,
                    timeoutMs: args.timeoutMs || 45000
                }, (args.timeoutMs || 45000) + 5000)
        }),
        register(runtime, {
            name: "browser.screenshot",
            description: "Renderiza una URL en Chrome/Edge real y guarda una captura PNG verificable.",
            output: "BROWSER_SCREENSHOT",
            inputSchema: { url: "string", output: "string", timeoutMs: "number" },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) =>
                await bridgeRequest("/browser", {
                    action: "screenshot",
                    url: args.url,
                    output: args.output || ".jarvis-artifacts/browser/latest.png",
                    timeoutMs: args.timeoutMs || 45000
                }, (args.timeoutMs || 45000) + 5000)
        }),
        register(runtime, {
            name: "browser.open",
            description: "Abre una URL HTTP(S) en el navegador local visible.",
            output: "BROWSER_OPEN_RESULT",
            inputSchema: { url: "string" },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) =>
                await bridgeRequest("/browser", {
                    action: "open",
                    url: args.url
                })
        }),
        register(runtime, {
            name: "system.observability",
            description: "Consulta evidencia funcional agregada: latencia, errores, writes, aprobaciones, artefactos, uploads, web, PDF, reels y páginas.",
            output: "FUNCTIONAL_OBSERVABILITY_SNAPSHOT",
            inputSchema: { limit: "number" },
            mutates: false,
            execute: async (args = {}) => {
                const result = await bridgeRequest("/observability/snapshot", { limit: args.limit || 500 }, 30000);
                recordCapabilityEvidence("observability", {
                    ok: result?.ok === true && Number(result?.counts?.total || 0) > 0,
                    status: result?.status || "OBSERVABILITY_UNAVAILABLE",
                    counts: result?.counts || null,
                    averageLatencyMs: result?.averageLatencyMs ?? null,
                    checkedAt: new Date().toISOString()
                });
                return result;
            }
        }),
        register(runtime, {
            name: "page.create",
            description: "Genera una landing HTML local nueva, responsive, accesible y descargable; puede incrustar como hero o galeria los artefactos de imagen reales recibidos. No publica ni despliega.",
            output: "PAGE_CREATE_ARTIFACT",
            inputSchema: {
                brandName: "string", title: "string", description: "string", services: "array",
                heroImage: "string", sourceImages: "array<{output,role:hero|gallery,alt}>", gallery: "array", testimonials: "array", beforeAfter: "array",
                whatsapp: "string", whatsappRequested: "boolean", contactEmail: "string", mapUrl: "string", output: "string",
                caseId: "string", objectiveId: "string"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: [],
            execute: async (args = {}, context = {}) => {
                const result = await bridgeRequest("/page/create", {
                    ...args,
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || "",
                    approved: context.approved === true,
                    approvedBy: context.approvedBy || ""
                }, 60000);
                if (result?.ok === true && result?.status === "PAGE_ARTIFACT_CREATED_VERIFIED") {
                    recordCapabilityEvidence("page_creation", {
                        ok: true,
                        status: result.status,
                        output: result.output,
                        bytes: result.bytes,
                        checks: result.checks,
                        checkedAt: new Date().toISOString()
                    });
                }
                return result;
            }
        }),
        register(runtime, {
            name: "reel.create",
            description: "Crea un estudio de reel 9:16 local nuevo, configurable, descargable y previsualizable, capaz de exportar WebM y verificar SHA-256 en el navegador. No publica.",
            output: "REEL_STUDIO_ARTIFACT",
            inputSchema: {
                brandName: "string", title: "string", cta: "string", durationSeconds: "number",
                scenes: "array", logoOutput: "string", audioOutput: "string", output: "string",
                caseId: "string", objectiveId: "string"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: [],
            execute: async (args = {}, context = {}) => {
                const result = await bridgeRequest("/reel/create", {
                    ...args,
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || ""
                }, 120000);
                if (result?.ok === true && result?.status === "REEL_STUDIO_CREATED_VERIFIED") {
                    recordCapabilityEvidence("reel_studio", {
                        ok: true,
                        status: result.status,
                        output: result.output,
                        bytes: result.bytes,
                        durationSeconds: result.durationSeconds,
                        checks: result.checks,
                        videoExportStatus: result.videoExportStatus,
                        checkedAt: new Date().toISOString()
                    });
                }
                return result;
            }
        }),
        register(runtime, {
            name: "document.create",
            description: "Crea un documento local nuevo y descargable en HTML, Markdown, CSV, JSON, DOCX, XLSX, PPTX o PDF dentro de .jarvis-artifacts; XLSX admite varias hojas y formulas. No edita archivos existentes.",
            output: "DOCUMENT_CREATE_RESULT",
            inputSchema: {
                format: "html|md|txt|csv|json|docx|xlsx|pptx|pdf",
                output: "string",
                title: "string",
                content: "string",
                rows: "array",
                sheets: "array<{name,rows}>",
                requireFormulas: "boolean",
                requireDocumentValidation: "boolean",
                documentContract: "object",
                documentValidation: "object",
                slides: "array",
                caseId: "string",
                objectiveId: "string"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: ["format"],
            execute: async (args = {}, context = {}) =>
                await bridgeRequest("/document", {
                    format: args.format || "html",
                    output:
                        args.output ||
                        undefined,
                    title: args.title,
                    content: args.content,
                    rows: args.rows,
                    sheets: args.sheets,
                    requireFormulas:
                        args.requireFormulas ===
                        true,
                    requireDocumentValidation:
                        args
                            .requireDocumentValidation ===
                        true,
                    documentContract:
                        args.documentContract ||
                        {},
                    documentValidation:
                        args.documentValidation ||
                        {},
                    slides: args.slides,
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || ""
                })
        }),
        register(runtime, {
            name: "document.pdf",
            description: "Convierte una URL o documento HTML servido a PDF mediante Chrome/Edge real.",
            output: "DOCUMENT_PDF_RESULT",
            inputSchema: { url: "string", output: "string" },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) =>
                await bridgeRequest("/browser", {
                    action: "pdf",
                    url: args.url,
                    output: args.output || ".jarvis-artifacts/documents/document.pdf",
                    timeoutMs: args.timeoutMs || 45000
                }, (args.timeoutMs || 45000) + 5000)
        }),
        register(runtime, {
            name: "document.pdf.edit",
            description: "Localiza y edita campos de un PDF existente, recalcula descuento antes de IVA y compara paginas renderizadas para bloquear cambios fuera de las regiones aprobadas.",
            output: "DOCUMENT_PDF_EDIT_RESULT",
            inputSchema: {
                sourceOutput: "string",
                output: "string",
                changes: "array<{page,x,y|yFromTop,width,height,text,fontSize,color,backgroundColor}>",
                quote: "{subtotal,discountPercent,taxPercent,currency,fields|fieldAnchors:{discount,taxableSubtotal,tax,total}}"
            },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}, context = {}) => {
                const result = await bridgeRequest("/document/pdf/edit", {
                    sourceOutput: args.sourceOutput,
                    output: args.output,
                    changes: args.changes,
                    quote: args.quote,
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || "",
                    approved: context.approved === true,
                    approvedBy: context.approvedBy || ""
                }, 90000);
                recordCapabilityEvidence("pdf_editing", {
                    ok: result?.ok === true && result?.visualVerification?.renderedComparisonPassed === true,
                    status: result?.status || "PDF_EDIT_FAILED",
                    output: result?.output || null,
                    sourceSha256: result?.sourceSha256 || null,
                    outputSha256: result?.outputSha256 || null,
                    originalPreserved: result?.originalPreserved === true,
                    overflowPassed: result?.visualVerification?.overflowPassed === true,
                    renderedComparisonPassed: result?.visualVerification?.renderedComparisonPassed === true,
                    checkedAt: new Date().toISOString()
                });
                return result;
            }
        }),
        register(runtime, {
            name: "document.xlsx.edit",
            description: "Edita celdas o formulas concretas de un XLSX existente, conserva hojas y estilos no solicitados y mantiene intacto el original.",
            output: "DOCUMENT_XLSX_EDIT_RESULT",
            inputSchema: {
                sourceOutput: "string",
                output: "string",
                changes: "array<{sheet|sheetIndex,cell,value|formula,result,numberFormat}>"
            },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}, context = {}) => {
                const result = await bridgeRequest("/document/xlsx/edit", {
                    sourceOutput: args.sourceOutput,
                    output: args.output,
                    changes: args.changes,
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || ""
                }, 90000);
                recordCapabilityEvidence("structured_document_editing", {
                    ok: result?.ok === true && result?.originalPreserved === true && result?.outputSha256 !== result?.sourceSha256,
                    status: result?.status || "XLSX_EDIT_FAILED",
                    format: "xlsx",
                    output: result?.output || null,
                    sourceSha256: result?.sourceSha256 || null,
                    outputSha256: result?.outputSha256 || null,
                    originalPreserved: result?.originalPreserved === true,
                    changeCount: result?.changes?.length || 0,
                    checkedAt: new Date().toISOString()
                });
                return result;
            }
        }),
        register(runtime, {
            name: "document.docx.edit",
            description: "Reemplaza texto exacto en un DOCX existente, preserva el paquete OOXML y exige el numero exacto de coincidencias.",
            output: "DOCUMENT_DOCX_EDIT_RESULT",
            inputSchema: {
                sourceOutput: "string",
                output: "string",
                replacements: "array<{search,replace,expectedMatches}>"
            },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}, context = {}) => {
                const result = await bridgeRequest("/document/docx/edit", {
                    sourceOutput: args.sourceOutput,
                    output: args.output,
                    replacements: args.replacements,
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || ""
                }, 90000);
                recordCapabilityEvidence("structured_document_editing", {
                    ok: result?.ok === true && result?.originalPreserved === true && result?.outputSha256 !== result?.sourceSha256,
                    status: result?.status || "DOCX_EDIT_FAILED",
                    format: "docx",
                    output: result?.output || null,
                    sourceSha256: result?.sourceSha256 || null,
                    outputSha256: result?.outputSha256 || null,
                    originalPreserved: result?.originalPreserved === true,
                    changeCount: result?.replacements?.length || 0,
                    checkedAt: new Date().toISOString()
                });
                return result;
            }
        }),
        register(runtime, {
            name: "document.pptx.edit",
            description: "Reemplaza texto exacto en diapositivas PPTX sin reconstruir la presentacion y conserva intacto el original.",
            output: "DOCUMENT_PPTX_EDIT_RESULT",
            inputSchema: {
                sourceOutput: "string",
                output: "string",
                replacements: "array<{search,replace,expectedMatches}>"
            },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}, context = {}) => {
                const result = await bridgeRequest("/document/pptx/edit", {
                    sourceOutput: args.sourceOutput,
                    output: args.output,
                    replacements: args.replacements,
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || ""
                }, 90000);
                recordCapabilityEvidence("structured_document_editing", {
                    ok: result?.ok === true && result?.originalPreserved === true && result?.outputSha256 !== result?.sourceSha256,
                    status: result?.status || "PPTX_EDIT_FAILED",
                    format: "pptx",
                    output: result?.output || null,
                    sourceSha256: result?.sourceSha256 || null,
                    outputSha256: result?.outputSha256 || null,
                    originalPreserved: result?.originalPreserved === true,
                    changeCount: result?.replacements?.length || 0,
                    checkedAt: new Date().toISOString()
                });
                return result;
            }
        }),
        register(runtime, {
            name: "image.generate",
            description: "Genera una imagen local nueva y descargable dentro de .jarvis-artifacts; no publica ni modifica una imagen existente.",
            output: "IMAGE_GENERATION_RESULT",
            inputSchema: { prompt: "string", aspectRatio: "string", imageSize: "string", output: "string", caseId: "string", objectiveId: "string" },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            execute: async (args = {}, context = {}) => {
                const result = await callAdminFunction("jarvisImageGenerate", {
                    prompt: args.prompt || context.rawInput || "",
                    aspectRatio: args.aspectRatio || "1:1",
                    imageSize: args.imageSize || "1K"
                });
                let artifact = null;
                if (result?.ok === true && result?.imageBase64) {
                    const safeOutput = normalizeImageArtifactOutput(
                        args.output,
                        result.mimeType
                    );
                    artifact = await bridgeRequest("/image", {
                        imageBase64: result.imageBase64,
                        mimeType: result.mimeType,
                        output: safeOutput,
                        origin: "image.generate",
                        provider: result.provider || "google",
                        model: result.model,
                        objectiveId: args.objectiveId || context.objectiveId || "",
                        caseId: args.caseId || context.caseId || ""
                    }, 30000);
                }
                const finalResult = {
                    ...result,
                    persisted: artifact?.ok === true,
                    output: artifact?.output || null,
                    bytes: artifact?.bytes || null,
                    persistenceStatus: artifact?.status || null,
                    persistenceError: artifact?.ok === false ? artifact.error : null
                };
                globalThis.__JARVIS_IMAGE_GENERATION_HEALTH__ = recordCapabilityEvidence("image_generation", {
                    ok: finalResult.ok === true && finalResult.persisted === true,
                    status: finalResult.persisted ? finalResult.status : "IMAGE_ARTIFACT_REQUIRED",
                    model: result?.model || null,
                    output: finalResult.output,
                    error: result?.error || finalResult.persistenceError || null,
                    cloudCode: result?.cloudCode || null,
                    checkedAt: new Date().toISOString()
                });
                return finalResult;
            }
        }),
        register(runtime, {
            name: "image.edit",
            description: "Edita una imagen persistida con transformaciones explícitas, conserva trazabilidad del original y guarda un output descargable nuevo.",
            output: "IMAGE_EDIT_RESULT",
            inputSchema: {
                sourceOutput: "string", prompt: "string", transformations: "array",
                aspectRatio: "string", imageSize: "string", preserveLogos: "boolean",
                preserveApprovedText: "boolean", output: "string", caseId: "string", objectiveId: "string"
            },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}, context = {}) => {
                if (!args.sourceOutput) throw new Error("IMAGE_SOURCE_OUTPUT_REQUIRED");
                const source = await bridgeRequest("/artifact/read", { output: args.sourceOutput }, 30000);
                if (source?.ok !== true || !String(source.mimeType || "").startsWith("image/") || !source.dataBase64) {
                    throw new Error("IMAGE_SOURCE_ARTIFACT_INVALID");
                }
                const result = await callAdminFunction("jarvisImageGenerate", {
                    prompt: args.prompt || context.rawInput || "",
                    transformations: Array.isArray(args.transformations) ? args.transformations : [],
                    aspectRatio: args.aspectRatio || "1:1",
                    imageSize: args.imageSize || "1K",
                    sourceImageBase64: source.dataBase64,
                    sourceMimeType: source.mimeType,
                    sourceOutput: source.output,
                    preserveLogos: args.preserveLogos !== false,
                    preserveApprovedText: args.preserveApprovedText !== false,
                    objectiveId: args.objectiveId || context.objectiveId || ""
                });
                let artifact = null;
                if (result?.ok === true && result?.status === "IMAGE_EDITED" && result?.imageBase64) {
                    artifact = await bridgeRequest("/image", {
                        imageBase64: result.imageBase64,
                        mimeType: result.mimeType,
                        output: normalizeImageArtifactOutput(args.output, result.mimeType),
                        origin: "image.edit",
                        provider: result.provider || "google",
                        model: result.model,
                        objectiveId: result.objectiveId || context.objectiveId || "",
                        caseId: args.caseId || context.caseId || "",
                        originalFile: source.output,
                        transformations: result.transformations || []
                    }, 30000);
                }
                const finalResult = {
                    ...result,
                    persisted: artifact?.ok === true,
                    output: artifact?.output || null,
                    outputBytes: artifact?.bytes || null,
                    originalPreserved: true,
                    sourceOutput: source.output,
                    sourceBytes: source.bytes
                };
                recordCapabilityEvidence("image_editing", {
                    ok: finalResult.ok === true && finalResult.persisted === true && finalResult.sourceSha256,
                    status: finalResult.persisted ? finalResult.status : "IMAGE_EDIT_ARTIFACT_REQUIRED",
                    provider: finalResult.provider || null,
                    model: finalResult.model || null,
                    sourceOutput: finalResult.sourceOutput,
                    sourceSha256: finalResult.sourceSha256 || null,
                    output: finalResult.output,
                    transformations: finalResult.transformations || [],
                    objectiveId: finalResult.objectiveId || null,
                    originalPreserved: true,
                    checkedAt: new Date().toISOString()
                });
                return finalResult;
            }
        }),
        register(runtime, {
            name: "image.adapt",
            description: "Adapta una imagen real ya recibida a hero, tarjeta, reel y miniaturas mediante canvas local; conserva el original y no genera contenido ficticio.",
            output: "IMAGE_ADAPTATION_RESULT",
            inputSchema: { sourceOutput: "string", variants: "array<{id,width,height,mimeType,quality}>", outputPrefix: "string", caseId: "string", objectiveId: "string" },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}, context = {}) => {
                const source = await bridgeRequest("/artifact/read", { output: args.sourceOutput }, 30000);
                if (source?.ok !== true || !String(source.mimeType || "").startsWith("image/") || !source.dataBase64) throw new Error("IMAGE_SOURCE_ARTIFACT_INVALID");
                const adapted = await adaptImageSource({ sourceBase64: source.dataBase64, sourceMimeType: source.mimeType, variants: args.variants });
                const prefix = String(args.outputPrefix || `.jarvis-artifacts/images/adapted-${Date.now()}`).trim();
                const outputs = [];
                for (const variant of adapted.outputs) {
                    const extension = variant.mimeType === "image/png" ? ".png" : variant.mimeType === "image/jpeg" ? ".jpg" : ".webp";
                    const output = normalizeImageArtifactOutput(`${prefix}-${variant.id}${extension}`, variant.mimeType);
                    if (!output) throw new Error("IMAGE_ADAPTATION_OUTPUT_INVALID");
                    const persisted = await bridgeRequest("/image", {
                        imageBase64: variant.dataBase64,
                        mimeType: variant.mimeType,
                        output,
                        origin: "image.adapt",
                        provider: "browser_canvas",
                        objectiveId: args.objectiveId || context.objectiveId || "",
                        caseId: args.caseId || context.caseId || "",
                        originalFile: source.output,
                        approved: context.approved === true,
                        approvedBy: context.approvedBy || "",
                        transformations: [{ type: "cover_crop_resize", id: variant.id, width: variant.width, height: variant.height, crop: variant.crop }]
                    }, 30000);
                    if (persisted?.ok !== true) throw new Error(persisted?.error || "IMAGE_ADAPTATION_PERSIST_FAILED");
                    outputs.push({ id: variant.id, width: variant.width, height: variant.height, mimeType: variant.mimeType, bytes: persisted.bytes, output: persisted.output, artifact: persisted.artifact });
                }
                const result = { ok: true, status: "IMAGE_VARIANTS_ADAPTED_VERIFIED", provider: "browser_canvas", sourceOutput: source.output, originalPreserved: true, generatedContentUsed: false, outputs };
                recordCapabilityEvidence("image_adaptation", { ...result, checkedAt: new Date().toISOString() });
                return result;
            }
        }),
        register(runtime, {
            name: "artifact.createJson",
            description: "Persiste campañas, propuestas, reportes, previews de patch, diffs o resultados de pruebas como JSON versionado.",
            output: "JSON_ARTIFACT_CREATE_RESULT",
            inputSchema: { type: "string", slug: "string", data: "object", caseId: "string", objectiveId: "string", originalFile: "string", output: "string" },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}, context = {}) => await bridgeRequest("/artifact/json/create", {
                ...args,
                caseId: args.caseId || context.caseId || "",
                objectiveId: args.objectiveId || context.objectiveId || ""
            }, 30000)
        }),
        register(runtime, {
            name: "artifact.list",
            description: "Consulta el ledger versionado de artefactos por tipo, expediente u objetivo.",
            output: "ARTIFACT_LEDGER_RESULT",
            inputSchema: { type: "string", caseId: "string", objectiveId: "string", limit: "number" },
            mutates: false,
            execute: async (args = {}) => await bridgeRequest("/artifact/list", args, 30000)
        }),
        register(runtime, {
            name: "artifact.read",
            description: "Lee bytes y metadatos versionados de un artefacto local concreto.",
            output: "ARTIFACT_READ_RESULT",
            inputSchema: { output: "string" },
            mutates: false,
            execute: async (args = {}) => await bridgeRequest("/artifact/read", { output: args.output }, 30000)
        }),
        register(runtime, {
            name: "agent.delegate",
            description: "Delega y ejecuta en paralelo hasta cuatro herramientas read-only de Jarvis.",
            output: "AGENT_DELEGATION_RESULT",
            inputSchema: { tasks: "array" },
            execute: async (args = {}, context = {}) => {
                const tasks = Array.isArray(args.tasks) ? args.tasks.slice(0, 4) : [];
                const allowed = tasks.filter(task => {
                    const definition = runtime.get?.(task?.tool);
                    return definition && definition.mutates !== true && task.tool !== "agent.delegate";
                });

                if (allowed.length === 0) {
                    return {
                        ok: false,
                        status: "DELEGATION_TASKS_REQUIRED",
                        error: "DELEGATION_TASKS_REQUIRED"
                    };
                }

                const startedAt = Date.now();
                const results = await Promise.all(
                    allowed.map(task => runtime.execute(
                        task.tool,
                        task.args || {},
                        { ...context, delegated: true }
                    ))
                );

                return {
                    ok: results.every(result => result?.ok === true),
                    status: "DELEGATION_COMPLETE",
                    parallel: true,
                    taskCount: allowed.length,
                    durationMs: Date.now() - startedAt,
                    results
                };
            }
        }),
        register(runtime, {
            name: "connector.list",
            description: "Enumera conectores instalados y su estado real sin inventar disponibilidad.",
            output: "CONNECTOR_LIST",
            execute: async () => {
                const adapters = globalThis?.JarvisConnectors || {};
                const configuredConnectors = Object.entries(adapters).map(([id, adapter]) => ({
                    id,
                    connected: adapter?.connected === true,
                    capabilities: Array.isArray(adapter?.capabilities) ? adapter.capabilities : []
                }));

                const localResult = await bridgeRequest(
                    "/connectors",
                    { timeoutMs: 10000 },
                    15000
                );
                const localConnectors = Array.isArray(localResult?.connectors)
                    ? localResult.connectors
                    : [];
                const connectors = [...localConnectors, ...configuredConnectors]
                    .filter((item, index, all) =>
                        all.findIndex(candidate => candidate.id === item.id) === index
                    );
                const connectedCount = connectors.filter(item => item.connected).length;

                globalThis.__JARVIS_CONNECTOR_HEALTH__ = recordCapabilityEvidence("connectors", {
                    ok: localResult?.ok === true,
                    status: localResult?.status || "LOCAL_BRIDGE_REQUIRED",
                    connectedCount,
                    checkedAt: new Date().toISOString()
                });

                return {
                    ok: true,
                    status: connectedCount > 0 ? "CONNECTED" : "NO_CONNECTORS_CONFIGURED",
                    connectors,
                    connectedCount,
                    verified: localResult?.ok === true
                };
            }
        })
    ];

    return {
        ok: registrations.every(item => item?.ok !== false),
        version: VERSION,
        registrations
    };
}
