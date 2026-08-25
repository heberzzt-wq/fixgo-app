import {
    recordCapabilityEvidence
} from "./jarvis.capability.evidence.js";
import {
    buildPageArtifactHtml,
    describePageArtifact
} from "../../jarvis-page-artifact.js?v=v94-page-evidence-failclosed-v123-20260810";
import {
    adaptImageSource,
    buildIdentityReferenceSheet,
    overlayBrandLogo
} from "./jarvis.image.adapter.js?v=jarvis-official-brand-logo-v12-20260819";

const VERSION = "7.28.0-v142-progressive-local-video";
const VIDEO_REFERENCE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
]);
const VIDEO_REFERENCE_MAX_COUNT = 3;
const VIDEO_REFERENCE_MAX_BYTES = 7 * 1024 * 1024;
const VIDEO_REFERENCE_BATCH_MAX_BYTES = 9 * 1024 * 1024;

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


async function sha256Base64(
    value = ""
) {
    const normalized =
        String(
            value ||
            ""
        )
            .replaceAll(
                "\r",
                ""
            )
            .replaceAll(
                "\n",
                ""
            )
            .trim();

    if (!normalized) {
        throw new Error(
            "IMAGE_BASE64_HASH_INPUT_REQUIRED"
        );
    }

    let binary;

    try {
        binary =
            atob(
                normalized
            );
    }
    catch {
        throw new Error(
            "IMAGE_BASE64_HASH_INPUT_INVALID"
        );
    }

    const bytes =
        new Uint8Array(
            binary.length
        );

    for (
        let index = 0;
        index < binary.length;
        index += 1
    ) {
        bytes[index] =
            binary.charCodeAt(
                index
            );
    }

    const digest =
        await globalThis
            .crypto
            .subtle
            .digest(
                "SHA-256",
                bytes
            );

    return Array
        .from(
            new Uint8Array(
                digest
            ),
            byte =>
                byte
                    .toString(
                        16
                    )
                    .padStart(
                        2,
                        "0"
                    )
        )
        .join(
            ""
        );
}

async function readVerifiedVideoReferences(referenceOutputs = []) {
    const outputs = (Array.isArray(referenceOutputs) ? referenceOutputs : [])
        .map(value => String(value || "").trim())
        .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);
    if (outputs.length > VIDEO_REFERENCE_MAX_COUNT) {
        return {
            ok: false,
            status: "VIDEO_REFERENCE_IMAGE_LIMIT_EXCEEDED",
            error: "VIDEO_REFERENCE_IMAGE_LIMIT_EXCEEDED",
            message: `Veo 3.1 admite como maximo ${VIDEO_REFERENCE_MAX_COUNT} referencias visuales de tipo asset.`
        };
    }

    const references = [];
    let totalBytes = 0;
    for (const output of outputs) {
        let artifact;
        try {
            artifact = await bridgeRequest("/artifact/read", { output }, 30000);
        }
        catch(error) {
            return {
                ok: false,
                status: "VIDEO_REFERENCE_IMAGE_ARTIFACT_INVALID",
                error: error?.message || "VIDEO_REFERENCE_IMAGE_ARTIFACT_INVALID",
                referenceOutput: output
            };
        }
        if (artifact?.ok !== true || !artifact?.dataBase64) {
            return {
                ok: false,
                status: "VIDEO_REFERENCE_IMAGE_ARTIFACT_INVALID",
                error: "VIDEO_REFERENCE_IMAGE_ARTIFACT_INVALID",
                referenceOutput: output
            };
        }
        const mimeType = String(artifact.mimeType || "").trim().toLowerCase();
        if (!VIDEO_REFERENCE_MIME_TYPES.has(mimeType)) {
            return {
                ok: false,
                status: "VIDEO_REFERENCE_IMAGE_FORMAT_UNSUPPORTED",
                error: "VIDEO_REFERENCE_IMAGE_FORMAT_UNSUPPORTED",
                referenceOutput: output,
                mimeType: mimeType || null
            };
        }
        const dataBase64 = String(artifact.dataBase64 || "")
            .replaceAll("\r", "")
            .replaceAll("\n", "")
            .trim();
        let bytes;
        try {
            bytes = atob(dataBase64).length;
        }
        catch {
            return {
                ok: false,
                status: "VIDEO_REFERENCE_IMAGE_BASE64_INVALID",
                error: "VIDEO_REFERENCE_IMAGE_BASE64_INVALID",
                referenceOutput: output
            };
        }
        if (bytes < 1 || bytes > VIDEO_REFERENCE_MAX_BYTES) {
            return {
                ok: false,
                status: "VIDEO_REFERENCE_IMAGE_TOO_LARGE",
                error: "VIDEO_REFERENCE_IMAGE_TOO_LARGE",
                referenceOutput: output,
                bytes,
                maximumBytes: VIDEO_REFERENCE_MAX_BYTES
            };
        }
        totalBytes += bytes;
        if (totalBytes > VIDEO_REFERENCE_BATCH_MAX_BYTES) {
            return {
                ok: false,
                status: "VIDEO_REFERENCE_IMAGE_BATCH_TOO_LARGE",
                error: "VIDEO_REFERENCE_IMAGE_BATCH_TOO_LARGE",
                bytes: totalBytes,
                maximumBytes: VIDEO_REFERENCE_BATCH_MAX_BYTES
            };
        }
        const sha256 = await sha256Base64(dataBase64);
        const declaredSha256 = String(artifact.sha256 || "").trim().toLowerCase();
        if (declaredSha256 && declaredSha256 !== sha256) {
            return {
                ok: false,
                status: "VIDEO_REFERENCE_IMAGE_HASH_MISMATCH",
                error: "VIDEO_REFERENCE_IMAGE_HASH_MISMATCH",
                referenceOutput: output,
                expectedSha256: declaredSha256,
                receivedSha256: sha256
            };
        }
        references.push({
            sourceOutput: artifact.output || output,
            imageBytes: dataBase64,
            mimeType,
            bytes,
            sha256
        });
    }
    return {
        ok: true,
        status: outputs.length > 0
            ? "VIDEO_REFERENCE_IMAGES_VERIFIED"
            : "VIDEO_REFERENCE_IMAGES_NOT_REQUESTED",
        references,
        totalBytes
    };
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

async function sha256Text(value = "") {
    if (
        !globalThis?.crypto?.subtle ||
        typeof TextEncoder !== "function"
    ) {
        throw new Error("BROWSER_PAGE_SHA256_UNAVAILABLE");
    }
    const bytes = new TextEncoder().encode(String(value || ""));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function browserPageFilename(args = {}) {
    const requested = String(args.output || "").trim().replaceAll("\\", "/");
    const brand = String(args.brandName || "pagina").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const source = requested.split("/").filter(Boolean).pop() || `${brand}-adjunto.html`;
    const safe = source.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "adjunto-pagina.html";
    return safe.toLowerCase().endsWith(".html") ? safe : `${safe}.html`;
}

async function createBrowserVerifiedPageArtifact(args = {}) {
    if (
        typeof globalThis?.document?.createElement !== "function" ||
        !globalThis?.document?.body ||
        typeof globalThis?.Blob !== "function" ||
        typeof globalThis?.URL?.createObjectURL !== "function" ||
        !globalThis?.crypto?.subtle ||
        typeof TextEncoder !== "function"
    ) {
        return {
            ok: false,
            success: false,
            status: "BROWSER_PAGE_FALLBACK_UNAVAILABLE",
            error: "BROWSER_PAGE_FALLBACK_UNAVAILABLE"
        };
    }

    let html;
    let verification;
    try {
        html = buildPageArtifactHtml(args);
        verification = describePageArtifact(args, html);
    }
    catch(error) {
        return {
            ok: false,
            success: false,
            status: "BROWSER_PAGE_BUILD_FAILED",
            error: error?.message || String(error)
        };
    }

    const checks = verification?.checks || {};
    if (
        verification?.ok !== true ||
        Object.keys(checks).length < 1 ||
        !Object.values(checks).every(Boolean)
    ) {
        return {
            ok: false,
            success: false,
            status: "BROWSER_PAGE_VERIFY_FAILED",
            error: "BROWSER_PAGE_VERIFY_FAILED",
            checks
        };
    }

    const encoded = new TextEncoder().encode(html);
    const blob = new globalThis.Blob([html], { type: "text/html;charset=utf-8" });
    if (
        blob.size !== encoded.byteLength ||
        blob.size !== Number(verification.bytes || 0)
    ) {
        return {
            ok: false,
            success: false,
            status: "BROWSER_PAGE_BYTE_COUNT_MISMATCH",
            error: "BROWSER_PAGE_BYTE_COUNT_MISMATCH"
        };
    }

    const sha256 = await sha256Text(html);
    const downloadUrl = globalThis.URL.createObjectURL(blob);
    const output = browserPageFilename(args);
    const registry = Array.isArray(globalThis.__JARVIS_BROWSER_PAGE_ARTIFACTS__)
        ? globalThis.__JARVIS_BROWSER_PAGE_ARTIFACTS__
        : [];
    registry.push({ output, downloadUrl, sha256, bytes: blob.size, createdAt: Date.now() });
    while (registry.length > 10) {
        const expired = registry.shift();
        try { globalThis.URL.revokeObjectURL(expired?.downloadUrl); } catch {}
    }
    globalThis.__JARVIS_BROWSER_PAGE_ARTIFACTS__ = registry;

    let downloadTriggered = false;
    try {
        const anchor = globalThis.document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = output;
        anchor.rel = "noopener";
        anchor.style.display = "none";
        globalThis.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        downloadTriggered = true;
    }
    catch(error) {
        console.warn("[BROWSER_PAGE_DOWNLOAD_TRIGGER_FAILED]", error);
    }

    return {
        ok: true,
        success: true,
        status: "PAGE_ARTIFACT_CREATED_BROWSER_VERIFIED",
        output,
        requestedOutput: String(args.output || "").trim() || null,
        mimeType: "text/html",
        bytes: blob.size,
        sha256,
        checks,
        brandName: verification.brandName || String(args.brandName || ""),
        title: verification.title || String(args.title || ""),
        downloadUrl,
        previewUrl: downloadUrl,
        downloadTriggered,
        browserDownloadPrepared: true,
        artifactMode: "browser_verified_download",
        physicallyWritten: false,
        published: false
    };
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
        const structuredDetails =
            errorDetails && typeof errorDetails === "object"
                ? errorDetails
                : null;
        const retryable = typeof structuredDetails?.retryable === "boolean"
            ? structuredDetails.retryable
            : response.status >= 500;
        return {
            ok: false,
            status: String(structuredDetails?.status || `CLOUD_FUNCTION_HTTP_${response.status}`),
            error: errorMessage,
            cloudCode: payload?.error?.status || payload?.error?.code || null,
            errorDetails: structuredDetails,
            stage: structuredDetails?.stage || null,
            providerCode: structuredDetails?.providerCode || null,
            providerMessage: structuredDetails?.providerMessage || null,
            operationName: structuredDetails?.operationName || null,
            raiMediaFilteredCount: structuredDetails?.raiMediaFilteredCount,
            raiMediaFilteredReasons: Array.isArray(structuredDetails?.raiMediaFilteredReasons)
                ? structuredDetails.raiMediaFilteredReasons
                : [],
            fullRestartAllowed: structuredDetails?.fullRestartAllowed !== false,
            retryable
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
                brandName: "string", title: "string", description: "string", services: "array", evidenceMode: "verified|insufficient",
                requiredSections: "array", contentSections: "array",
                heroImage: "string", sourceImages: "array<{output,role:hero|gallery,alt}>", gallery: "array", testimonials: "array", beforeAfter: "array",
                whatsapp: "string", whatsappRequested: "boolean", contactEmail: "string", mapUrl: "string", output: "string",
                caseId: "string", objectiveId: "string"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: [],
            execute: async (args = {}, context = {}) => {
                let result = await bridgeRequest("/page/create", {
                    ...args,
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || "",
                    approved: context.approved === true,
                    approvedBy: context.approvedBy || ""
                }, 60000);

                const staleBridgeVersion =
                    result?.status === "LOCAL_BRIDGE_VERSION_MISMATCH" ||
                    result?.error === "LOCAL_BRIDGE_VERSION_MISMATCH";

                if (result?.ok !== true && staleBridgeVersion) {
                    const browserResult = await createBrowserVerifiedPageArtifact(args);
                    if (browserResult?.ok === true) {
                        result = {
                            ...browserResult,
                            bridgeFallback: {
                                status: "LOCAL_BRIDGE_VERSION_MISMATCH",
                                bridgeVersion: result?.bridgeVersion || result?.bridgeIdentity?.bridgeVersion || null,
                                requiredBridgeVersion: result?.requiredBridgeVersion || result?.bridgeIdentity?.requiredBridgeVersion || null
                            }
                        };
                    }
                }

                if (
                    result?.ok === true &&
                    [
                        "PAGE_ARTIFACT_CREATED_VERIFIED",
                        "PAGE_ARTIFACT_CREATED_BROWSER_VERIFIED"
                    ].includes(result?.status)
                ) {
                    recordCapabilityEvidence("page_creation", {
                        ok: true,
                        status: result.status,
                        output: result.output,
                        bytes: result.bytes,
                        sha256: result.sha256,
                        checks: result.checks,
                        artifactMode: result.artifactMode || "local_bridge_verified",
                        physicallyWritten: result.physicallyWritten !== false,
                        checkedAt: new Date().toISOString()
                    });
                }
                return result;
            }
        }),
        register(runtime, {
            name: "speech.synthesize",
            description: "Sintetiza narración local en un WAV físico verificado por SHA-256 para usarlo como audio de producción. No publica.",
            output: "SPEECH_AUDIO_ARTIFACT",
            inputSchema: {
                text: "string", output: "string", voice: "string", language: "string",
                rate: "number", volume: "number", caseId: "string", objectiveId: "string"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: [],
            execute: async (args = {}, context = {}) => {
                const result = await bridgeRequest("/speech/synthesize", {
                    ...args,
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || ""
                }, 90000);
                if (result?.ok === true && result?.status === "SPEECH_AUDIO_CREATED_VERIFIED") {
                    recordCapabilityEvidence("speech_synthesis", {
                        ok: true,
                        status: result.status,
                        output: result.output,
                        bytes: result.bytes,
                        sha256: result.sha256,
                        mimeType: result.mimeType,
                        durationSeconds: result.durationSeconds,
                        provider: result.provider,
                        checkedAt: new Date().toISOString()
                    });
                }
                return result;
            }
        }),
        register(runtime, {
            name: "reel.create",
            description: "Crea un reel 9:16 local, genera su estudio editable y entrega obligatoriamente un MP4 H.264/AAC profesional verificado. Chrome puede producir MP4 o WebM provisional; el bridge conserva sólo un MP4 conforme o lo normaliza localmente con FFmpeg. Mezcla audioOutput explícito o el WAV verificado producido por speech.synthesize en la misma misión. No publica ni usa APIs externas de edición.",
            output: "REEL_VIDEO_ARTIFACT",
            inputSchema: {
                brandName: "string", title: "string", cta: "string", durationSeconds: "number",
                scenes: "array", logoOutput: "string", audioOutput: "string", output: "string", videoOutput: "string", studioOutput: "string",
                caseId: "string", objectiveId: "string"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: [],
            execute: async (args = {}, context = {}) => {
                let logoOutput = String(args.logoOutput || "").trim();
                if (!logoOutput && Array.isArray(context?.completedTasks)) {
                    for (const task of [...context.completedTasks].reverse()) {
                        if (String(task?.name || "") !== "web.media.collect") continue;
                        const candidates = [
                            task?.observation?.mediaAssets,
                            task?.observation?.assets,
                            task?.observation?.evidence?.mediaAssets
                        ].filter(Array.isArray).flat();
                        const logo = candidates.find(asset =>
                            asset?.mediaRole === "brand_logo" &&
                            String(asset?.mimeType || "").startsWith("image/") &&
                            String(asset?.output || "").startsWith(".jarvis-artifacts/")
                        );
                        if (logo?.output) {
                            logoOutput = String(logo.output);
                            break;
                        }
                    }
                }
                const result = await bridgeRequest("/reel/create", {
                    ...args,
                    ...(logoOutput ? { logoOutput } : {}),
                    caseId: args.caseId || context.caseId || "",
                    objectiveId: args.objectiveId || context.objectiveId || ""
                }, Math.max(
                    120000,
                    (Number(args.durationSeconds) || 30) * 1000 + 60000
                ));
                if (result?.ok === true && result?.status === "REEL_VIDEO_CREATED_VERIFIED") {
                    recordCapabilityEvidence("reel_video", {
                        ok: true,
                        status: result.status,
                        output: result.videoOutput || result.output,
                        studioOutput: result.studioOutput,
                        bytes: result.bytes,
                        sha256: result.sha256,
                        mimeType: result.mimeType,
                        durationSeconds: result.durationSeconds,
                        width: result.width,
                        height: result.height,
                        fps: result.fps,
                        videoCodec: result.videoCodec,
                        pixelFormat: result.pixelFormat,
                        audioCodec: result.audioCodec,
                        audioSampleRate: result.audioSampleRate,
                        faststart: result.faststart,
                        masteringMode: result.masteringMode,
                        masteringProvider: result.masteringProvider,
                        provisionalContainer: result.provisionalContainer,
                        audioMixMode: result.audioMixMode,
                        audioTracksAdded: result.audioTracksAdded,
                        audioGraphAvailable: result.audioGraphAvailable,
                        checks: result.checks,
                        videoExportStatus: result.videoExportStatus,
                        externalApiUsed: result.externalApiUsed,
                        externalEstimatedCostUsd: result.externalEstimatedCostUsd,
                        checkedAt: new Date().toISOString()
                    });
                }
                return result;
            }
        }),
        register(runtime, {
            name: "document.create",
            description: "Crea un documento local nuevo y descargable en HTML, Markdown, CSV, JSON, DOCX, XLSX, PPTX o PDF dentro de .jarvis-artifacts; DOCX exige un document.compose completo y validado, y XLSX admite varias hojas y formulas. No edita archivos existentes.",
            output: "DOCUMENT_CREATE_RESULT",
            inputSchema: {
                format: "html|md|txt|csv|json|docx|xlsx|pptx|pdf",
                output: "string",
                title: "string",
                contentSource: "string",
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
            execute: async (args = {}, context = {}) => {
                const contentSource =
                    String(args.contentSource || "")
                        .trim();
                const hasDocumentContent =
                    typeof args.content === "string" &&
                    args.content.trim().length > 0;

                if (
                    contentSource === "marketing.plan" &&
                    !hasDocumentContent
                ) {
                    return {
                        ok: false,
                        executionOk: false,
                        objectiveSatisfied: false,
                        blocked: true,
                        retryable: false,
                        status: "MARKETING_DOCUMENT_SOURCE_UNAVAILABLE",
                        error: "MARKETING_PLAN_CONTENT_REQUIRED",
                        contentSource,
                        format: String(args.format || "").toLowerCase()
                    };
                }

                return await bridgeRequest("/document", {
                    format: args.format || "html",
                    output:
                        args.output ||
                        undefined,
                    title: args.title,
                    contentSource,
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
                });
            }
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
                quote: "{subtotal,discountPercent,taxPercent,currency,fields|fieldAnchors:{discount,taxableSubtotal,tax,total}}",
                safePlacement: "boolean"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: [
                "sourceOutput",
                "output"
            ],
            execute: async (args = {}, context = {}) => {
                const result = await bridgeRequest("/document/pdf/edit", {
                    sourceOutput: args.sourceOutput,
                    output: args.output,
                    changes: args.changes,
                    quote: args.quote,
                    safePlacement:
                        args.safePlacement !==
                        false,
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
                    safePlacement:
                        result?.safePlacement ===
                        true,
                    placementAdjustments:
                        Number(
                            result?.placementAdjustments ||
                            0
                        ),
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
            requiresApproval: false,
            userArtifact: true,
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
            name: "series.create",
            description: "Crea una Biblia de Serie durable dentro de Artifact Studio. El primer numero de episodio no se infiere y debe declararse al preparar el episodio.",
            output: "SERIES_CANON_RESULT",
            inputSchema: { seriesId: "string", title: "string", storyArc: "string", status: "string" },
            mutates: true,
            requiresApproval: false,
            execute: async (args = {}) => await bridgeRequest("/series/create", args)
        }),
        register(runtime, {
            name: "series.character.upsert",
            description: "Registra un personaje mediante asignacion explicita del usuario y referencias fisicas versionadas. No identifica rostros ni infiere personas.",
            output: "SERIES_CHARACTER_RESULT",
            inputSchema: {
                seriesId: "string", characterId: "string", displayName: "string",
                assignmentConfirmed: "boolean", referenceAssets: "array<{sourceOutput,mimeType,bytes,sha256,approvedForVeo}>",
                role: "string", visualDescription: "string", wardrobeState: "object|string",
                voiceProfile: "object", relationships: "object", knownFacts: "array",
                secretsNotKnown: "array", recurringProps: "array", active: "boolean"
            },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) => await bridgeRequest("/series/character/upsert", args)
        }),
        register(runtime, {
            name: "series.episode.prepare",
            description: "Prepara un episodio estructurado contra el canon persistido y bloquea contradicciones antes de generar video.",
            output: "SERIES_EPISODE_READY_RESULT",
            inputSchema: {
                seriesId: "string", episodeId: "string", episodeNumber: "number", title: "string",
                script: "string", castIds: "array", storyBeats: "array<{initialState,exactAction,dialogueIntent,dialogue,requiredBeat,finalState,revelations}>",
                continuityStart: "object"
            },
            mutates: true,
            requiresApproval: false,
            execute: async (args = {}) => await bridgeRequest("/series/episode/prepare", args)
        }),
        register(runtime, {
            name: "series.episode.accept",
            description: "Acepta humanamente un MP4 ya generado y solo entonces avanza el numero y el canon del episodio.",
            output: "SERIES_EPISODE_ACCEPT_RESULT",
            inputSchema: {
                seriesId: "string", episodeId: "string", humanAccepted: "boolean",
                continuityEnd: "object", cliffhanger: "string", canonFacts: "array"
            },
            mutates: true,
            requiresApproval: true,
            execute: async (args = {}) => await bridgeRequest("/series/episode/accept", args)
        }),
        register(runtime, {
            name: "series.resume",
            description: "Recupera desde Artifact Studio el ultimo episodio aceptado, continuidad, reparto activo y siguiente numero derivable.",
            output: "SERIES_RESUME_CONTEXT",
            inputSchema: { seriesId: "string" },
            mutates: false,
            execute: async (args = {}) => await bridgeRequest("/series/resume", args)
        }),
        register(runtime, {
            name: "video.generate",
            description: "Genera video NUEVO real desde un guion o escenas semanticas mediante el motor fisico seleccionado por la politica de infraestructura. El proveedor certificado actual se conserva y el motor local solo se usa en modos explicitos. referenceOutputs acepta hasta tres artefactos de imagen locales verificados como referencias persistentes de identidad o assets. Si recibe seriesId+episodeId, carga guion, beats y reparto desde el canon durable; no identifica rostros ni acepta reemplazos silenciosos de referencias.",
            output: "VIDEO_GENERATION_RESULT",
            inputSchema: {
                script: "string",
                prompt: "string",
                scenes: "array<{prompt|visual|description:string}>",
                referenceOutputs: "array",
                aspectRatio: "9:16|16:9",
                output: "string",
                caseId: "string",
                objectiveId: "string",
                seriesId: "string",
                episodeId: "string"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: ["output"],
            execute: async (args = {}, context = {}) => {
                const waitForVideoPoll = typeof context?.waitForVideoPoll === "function"
                    ? context.waitForVideoPoll
                    : delayMs => new Promise(resolve => setTimeout(resolve, delayMs));
                const seriesId = String(args.seriesId || "").trim();
                const episodeId = String(args.episodeId || "").trim();
                const seriesRequested = Boolean(seriesId || episodeId);
                if (seriesRequested && (!seriesId || !episodeId)) {
                    return {
                        ok: false, executionOk: false, objectiveSatisfied: false, blocked: true,
                        requiresInput: true, retryable: false,
                        status: "SERIES_CONTEXT_IDS_REQUIRED", error: "SERIES_CONTEXT_IDS_REQUIRED"
                    };
                }
                if (seriesRequested && Array.isArray(args.referenceOutputs) && args.referenceOutputs.length > 0) {
                    return {
                        ok: false, executionOk: false, objectiveSatisfied: false, blocked: true,
                        requiresInput: true, retryable: false,
                        status: "SERIES_REFERENCE_OVERRIDE_FORBIDDEN",
                        error: "SERIES_REFERENCE_OVERRIDE_FORBIDDEN"
                    };
                }
                let seriesContext = null;
                if (seriesRequested) {
                    seriesContext = await bridgeRequest("/series/episode/generation-context", {
                        seriesId,
                        episodeId
                    });
                    if (seriesContext?.ok !== true) {
                        return {
                            ...seriesContext,
                            ok: false, executionOk: false, objectiveSatisfied: false, blocked: true,
                            requiresInput: true, retryable: false,
                            status: seriesContext?.status || "SERIES_EPISODE_GENERATION_CONTEXT_FAILED"
                        };
                    }
                }
                const effectiveReferenceOutputs = seriesRequested
                    ? seriesContext.referenceOutputs
                    : args.referenceOutputs;
                const referenceResult = await readVerifiedVideoReferences(effectiveReferenceOutputs);
                if (referenceResult.ok !== true) {
                    return {
                        ...referenceResult,
                        ok: false,
                        executionOk: false,
                        objectiveSatisfied: false,
                        blocked: true,
                        requiresInput: true,
                        retryable: false
                    };
                }
                const referenceImages = referenceResult.references;
                const script = String(seriesRequested
                    ? seriesContext.script
                    : (args.script || args.prompt || context.rawInput || "")).trim();
                const rawScenes = seriesRequested
                    ? (Array.isArray(seriesContext.storyBeats) ? seriesContext.storyBeats : [])
                    : (Array.isArray(args.scenes) ? args.scenes : []);
                if (seriesRequested && rawScenes.length > 4) {
                    return {
                        ok: false, executionOk: false, objectiveSatisfied: false, blocked: true,
                        requiresInput: true, retryable: false,
                        status: `SERIES_VIDEO_SEGMENT_LIMIT_EXCEEDED:${rawScenes.length}:4`,
                        error: "SERIES_VIDEO_SEGMENT_LIMIT_EXCEEDED"
                    };
                }
                const scenePrompts = rawScenes
                    .map(scene => typeof scene === "string"
                        ? scene.trim()
                        : String(
                            scene?.prompt || scene?.visual || scene?.description ||
                            [scene?.exactAction, scene?.dialogueIntent, scene?.dialogue, scene?.requiredBeat]
                                .filter(Boolean)
                                .join(" ")
                        ).trim())
                    .filter(Boolean)
                    .slice(0, 4);
                const prompts = (scenePrompts.length > 0 ? scenePrompts : [script]).filter(Boolean);
                if (prompts.length < 1) {
                    return { ok: false, executionOk: false, objectiveSatisfied: false, status: "VIDEO_SCRIPT_REQUIRED", error: "VIDEO_SCRIPT_REQUIRED" };
                }
                const aspectRatio = args.aspectRatio === "16:9" ? "16:9" : "9:16";
                const requestedOutput = String(args.output || "").trim().replaceAll("\\", "/");
                const output =
                    requestedOutput.startsWith(".jarvis-artifacts/videos/") &&
                    requestedOutput.toLowerCase().endsWith(".mp4") &&
                    !requestedOutput.includes("../")
                        ? requestedOutput
                        : `.jarvis-artifacts/videos/mini-drama-${Date.now()}.mp4`;
                let engineDecision;
                try {
                    engineDecision = await bridgeRequest("/video/engine/resolve", {
                        capability: "video.generate",
                        sceneCount: prompts.length,
                        seriesId: seriesId || null,
                        episodeId: episodeId || null
                    }, 30000);
                }
                catch {
                    engineDecision = null;
                }
                if (!engineDecision || !engineDecision.policy) {
                    engineDecision = {
                        ok: true,
                        status: "VIDEO_ENGINE_CURRENT_STABLE_COMPATIBILITY",
                        policy: "CURRENT_STABLE",
                        engineRequested: "CURRENT_STABLE",
                        engineUsed: "external",
                        fallbackUsed: false,
                        fallbackReason: null,
                        externalApiUsed: false,
                        externalEstimatedCostUsd: 0
                    };
                }
                if (engineDecision.ok !== true || !engineDecision.engineUsed) {
                    return {
                        ...engineDecision,
                        ok: false,
                        executionOk: false,
                        objectiveSatisfied: false,
                        blocked: true,
                        retryable: false,
                        externalApiUsed: false,
                        externalEstimatedCostUsd: 0
                    };
                }

                if (engineDecision.engineUsed === "local") {
                    const localAttempt = await (async () => {
                    let started;
                    try {
                        started = await bridgeRequest("/video/local/start", {
                            script,
                            prompts,
                            aspectRatio,
                            output,
                            referenceOutputs: referenceImages.map(reference => reference.sourceOutput),
                            seriesId: seriesId || null,
                            episodeId: episodeId || null
                        }, 60000);
                    }
                    catch(error) {
                        started = {
                            ok: false,
                            status: "LOCAL_VIDEO_BRIDGE_START_FAILED",
                            error: error?.message || "LOCAL_VIDEO_BRIDGE_START_FAILED",
                            retryable: true
                        };
                    }
                    if (started?.ok !== true || !started?.operationName) {
                        return {
                            ...started,
                            ok: false,
                            executionOk: false,
                            objectiveSatisfied: false,
                            blocked: true,
                            retryable: started?.retryable === true,
                            engineRequested: engineDecision.engineRequested,
                            engineUsed: "local",
                            fallbackUsed: false,
                            fallbackReason: null,
                            externalApiUsed: false,
                            externalEstimatedCostUsd: 0,
                            status: started?.status || "LOCAL_VIDEO_GENERATION_START_FAILED"
                        };
                    }
                    let localResult = null;
                    for (let attempt = 0; attempt < 120; attempt += 1) {
                        await waitForVideoPoll(5000);
                        let polled;
                        try {
                            polled = await bridgeRequest("/video/local/poll", {
                                operationName: started.operationName
                            }, 30000);
                        }
                        catch(error) {
                            polled = {
                                ok: false,
                                status: "LOCAL_VIDEO_BRIDGE_POLL_FAILED",
                                error: error?.message || "LOCAL_VIDEO_BRIDGE_POLL_FAILED",
                                retryable: true,
                                operationName: started.operationName
                            };
                        }
                        if (polled?.ok !== true) {
                            return {
                                ...polled,
                                ok: false,
                                executionOk: false,
                                objectiveSatisfied: false,
                                blocked: true,
                                retryable: polled?.retryable === true,
                                engineRequested: engineDecision.engineRequested,
                                engineUsed: "local",
                                fallbackUsed: false,
                                fallbackReason: null,
                                externalApiUsed: false,
                                externalEstimatedCostUsd: 0,
                                operationName: polled?.operationName || started.operationName
                            };
                        }
                        if (polled.done !== true) continue;
                        localResult = polled;
                        break;
                    }
                    if (!localResult) {
                        return {
                            ok: false,
                            executionOk: false,
                            objectiveSatisfied: false,
                            blocked: true,
                            retryable: true,
                            status: "LOCAL_VIDEO_GENERATION_TIMEOUT",
                            error: "LOCAL_VIDEO_GENERATION_TIMEOUT",
                            operationName: started.operationName,
                            engineRequested: engineDecision.engineRequested,
                            engineUsed: "local",
                            fallbackUsed: false,
                            fallbackReason: null,
                            externalApiUsed: false,
                            externalEstimatedCostUsd: 0
                        };
                    }
                    const physicalArtifactVerified =
                        localResult?.ok === true &&
                        localResult?.physicallyWritten === true &&
                        Number(localResult?.bytes || 0) >= 100000 &&
                        /^[a-f0-9]{64}$/i.test(String(localResult?.sha256 || "")) &&
                        String(localResult?.output || "").replaceAll("\\", "/") === output;
                    if (!physicalArtifactVerified) {
                        return {
                            ...localResult,
                            ok: false,
                            executionOk: false,
                            objectiveSatisfied: false,
                            blocked: true,
                            retryable: false,
                            status: "LOCAL_VIDEO_PHYSICAL_VERIFICATION_FAILED",
                            error: "LOCAL_VIDEO_PHYSICAL_VERIFICATION_FAILED",
                            engineRequested: engineDecision.engineRequested,
                            engineUsed: "local",
                            fallbackUsed: false,
                            fallbackReason: null,
                            externalApiUsed: false,
                            externalEstimatedCostUsd: 0,
                            verifiedArtifactDelivery: false
                        };
                    }
                    let recordedSeriesResult = null;
                    if (seriesRequested) {
                        recordedSeriesResult = await bridgeRequest("/series/episode/generated", {
                            seriesId,
                            episodeId,
                            physicalArtifact: output,
                            artifactSha256: localResult.sha256
                        });
                        if (recordedSeriesResult?.ok !== true) {
                            return {
                                ...localResult,
                                ok: false,
                                executionOk: false,
                                objectiveSatisfied: false,
                                blocked: true,
                                requiresInput: true,
                                retryable: false,
                                status: recordedSeriesResult?.status || "SERIES_EPISODE_GENERATED_RECORD_FAILED",
                                error: recordedSeriesResult?.error || "SERIES_EPISODE_GENERATED_RECORD_FAILED",
                                engineRequested: engineDecision.engineRequested,
                                engineUsed: "local",
                                externalApiUsed: false,
                                externalEstimatedCostUsd: 0,
                                verifiedArtifactDelivery: true
                            };
                        }
                    }
                    const finalLocalResult = {
                        ...localResult,
                        ok: true,
                        executionOk: true,
                        objectiveSatisfied: true,
                        status: "VIDEO_GENERATED_VERIFIED",
                        sceneCount: prompts.length,
                        sourceMode: referenceImages.length > 0
                            ? "identity_reference_to_video"
                            : "script_to_video",
                        referenceImageCount: referenceImages.length,
                        referenceOutputs: referenceImages.map(reference => reference.sourceOutput),
                        identityReferencesVerified: referenceImages.length > 0,
                        identityContinuityMode: referenceImages.length > 0
                            ? "local_asset_references"
                            : "not_requested",
                        physicalArtifactVerified: true,
                        verifiedArtifactDelivery: true,
                        engineRequested: engineDecision.engineRequested,
                        engineUsed: "local",
                        fallbackUsed: false,
                        fallbackReason: null,
                        externalApiUsed: false,
                        externalEstimatedCostUsd: 0,
                        ...(seriesRequested
                            ? {
                                seriesId,
                                episodeId,
                                seriesCanonRevision: recordedSeriesResult?.canonRevision ??
                                    seriesContext.canonRevision ?? null
                            }
                            : {})
                    };
                    recordCapabilityEvidence("video_generation", {
                        ok: true,
                        status: finalLocalResult.status,
                        output: finalLocalResult.output,
                        bytes: finalLocalResult.bytes,
                        sha256: finalLocalResult.sha256,
                        model: finalLocalResult.model,
                        engineUsed: "local",
                        externalApiUsed: false,
                        externalEstimatedCostUsd: 0,
                        checkedAt: new Date().toISOString()
                    });
                    return finalLocalResult;
                    })();
                    if (localAttempt.ok === true) return localAttempt;
                    const recoverableFallback =
                        engineDecision.policy === "LOCAL_PREFERRED" &&
                        engineDecision.externalFallbackEnabled === true &&
                        localAttempt.retryable === true;
                    if (!recoverableFallback) return localAttempt;
                    engineDecision = {
                        ...engineDecision,
                        status: "VIDEO_ENGINE_EXTERNAL_FALLBACK",
                        engineUsed: "external",
                        fallbackUsed: true,
                        fallbackReason: localAttempt.status || localAttempt.error ||
                            "LOCAL_VIDEO_RECOVERABLE_FAILURE"
                    };
                }

                let previousVideo = null;
                let finalCloud = null;
                let externalEstimatedCostUsd = 0;
                for (let index = 0; index < prompts.length; index += 1) {
                    const segmentPrompt = [
                        index === 0 ? script : "",
                        prompts[index],
                        index === 0
                            ? "Crea el inicio del mini drama como video cinematografico real con personas, accion, dialogo o audio coherente cuando el guion lo indique."
                            : "Continua exactamente el video anterior manteniendo personajes, vestuario, locacion, accion y continuidad narrativa."
                    ].filter(Boolean).join(" ").slice(0, 10000);
                    let externalAuthorization = null;
                    try {
                        externalAuthorization = await bridgeRequest("/video/engine/authorize-external", {
                            operationKey: seriesRequested
                                ? `${seriesId}:${episodeId}`
                                : `video.generate:${output}`,
                            segmentIndex: index,
                            sceneCount: prompts.length,
                            reasonForExternalUse: engineDecision.fallbackUsed === true
                                ? engineDecision.fallbackReason
                                : "CURRENT_STABLE"
                        }, 30000);
                    }
                    catch {
                        externalAuthorization = null;
                    }
                    if (
                        externalAuthorization?.ok !== true &&
                        engineDecision.policy !== "CURRENT_STABLE"
                    ) {
                        return {
                            ...(externalAuthorization || {}),
                            ok: false,
                            executionOk: false,
                            objectiveSatisfied: false,
                            blocked: true,
                            retryable: false,
                            status: externalAuthorization?.status || "EXTERNAL_VIDEO_AUTHORIZATION_REQUIRED",
                            error: externalAuthorization?.error || "EXTERNAL_VIDEO_AUTHORIZATION_REQUIRED",
                            engineRequested: engineDecision.engineRequested,
                            engineUsed: "external",
                            fallbackUsed: engineDecision.fallbackUsed === true,
                            fallbackReason: engineDecision.fallbackReason || null,
                            externalApiUsed: false,
                            externalEstimatedCostUsd: 0
                        };
                    }
                    externalEstimatedCostUsd += Number(
                        externalAuthorization?.externalEstimatedCostUsd || 0
                    );
                    const started = await callAdminFunction("jarvisVideoGenerate", {
                        action: "start",
                        prompt: segmentPrompt,
                        previousVideo,
                        aspectRatio,
                        ...(index === 0 && referenceImages.length > 0
                            ? {
                                referenceImages: referenceImages.map(reference => ({
                                    imageBytes: reference.imageBytes,
                                    mimeType: reference.mimeType,
                                    bytes: reference.bytes,
                                    sha256: reference.sha256
                                }))
                            }
                            : {})
                    });
                    if (started?.ok !== true || !started?.operationName) {
                        return { ...started, ok: false, executionOk: false, objectiveSatisfied: false, status: started?.status || "VIDEO_GENERATION_START_FAILED" };
                    }
                    let segment = null;
                    let lastPollFailure = null;
                    let transientPollFailures = 0;
                    for (let attempt = 0; attempt < 36; attempt += 1) {
                        await waitForVideoPoll(10000);
                        const polled = await callAdminFunction("jarvisVideoGenerate", {
                            action: "poll", operationName: started.operationName, finalize: index === prompts.length - 1
                        });
                        if (polled?.ok !== true) {
                            lastPollFailure = polled;
                            const transientPollFailure =
                                polled?.retryable === true ||
                                String(polled?.status || "").startsWith("CLOUD_FUNCTION_HTTP_5");
                            if (transientPollFailure) {
                                transientPollFailures += 1;
                                continue;
                            }
                            return {
                                ...polled,
                                ok: false,
                                executionOk: false,
                                objectiveSatisfied: false,
                                blocked: true,
                                retryable: false,
                                fullRestartAllowed: false,
                                operationName: polled?.operationName || started.operationName,
                                status: polled?.status || "VIDEO_GENERATION_POLL_FAILED"
                            };
                        }
                        lastPollFailure = null;
                        if (polled?.done !== true) continue;
                        segment = polled;
                        break;
                    }
                    if (!segment && lastPollFailure) {
                        return {
                            ...lastPollFailure,
                            ok: false,
                            executionOk: false,
                            objectiveSatisfied: false,
                            blocked: true,
                            retryable: false,
                            fullRestartAllowed: false,
                            stage: "VIDEO_GENERATION_POLL",
                            providerCode: lastPollFailure?.providerCode || "POLL_TRANSPORT_TIMEOUT",
                            providerMessage: lastPollFailure?.providerMessage ||
                                `Polling did not recover after ${transientPollFailures} transient failures.`,
                            operationName: started.operationName,
                            status: "VIDEO_GENERATION_POLL_TRANSPORT_TIMEOUT",
                            error: "VIDEO_GENERATION_POLL_TRANSPORT_TIMEOUT"
                        };
                    }
                    if (!segment) {
                        return {
                            ok: false,
                            executionOk: false,
                            objectiveSatisfied: false,
                            blocked: true,
                            retryable: false,
                            fullRestartAllowed: false,
                            status: "VIDEO_GENERATION_TIMEOUT",
                            error: "VIDEO_GENERATION_TIMEOUT",
                            stage: "VIDEO_GENERATION_POLL",
                            providerCode: "DEADLINE_EXCEEDED",
                            providerMessage: "The video operation remained pending until the polling deadline.",
                            operationName: started.operationName
                        };
                    }
                    if (index < prompts.length - 1) {
                        if (!segment?.video?.uri) {
                            return { ok: false, executionOk: false, objectiveSatisfied: false, status: "VIDEO_EXTENSION_REFERENCE_MISSING", error: "VIDEO_EXTENSION_REFERENCE_MISSING" };
                        }
                        previousVideo = segment.video;
                    } else {
                        finalCloud = segment;
                    }
                }
                if (!finalCloud?.downloadUrl || !finalCloud?.sha256) {
                    return { ok: false, executionOk: false, objectiveSatisfied: false, status: "VIDEO_GENERATION_FINAL_OUTPUT_MISSING", error: "VIDEO_GENERATION_FINAL_OUTPUT_MISSING" };
                }
                const artifact = await bridgeRequest("/video/import", {
                    url: finalCloud.downloadUrl,
                    expectedSha256: finalCloud.sha256,
                    output,
                    provider: finalCloud.provider || "google-veo",
                    model: finalCloud.model
                }, 240000);
                const physicalArtifactVerified =
                    artifact?.ok === true &&
                    artifact?.physicallyWritten === true &&
                    Number(artifact?.bytes || 0) >= 100000 &&
                    /^[a-f0-9]{64}$/i.test(String(artifact?.sha256 || "")) &&
                    String(artifact?.output || "").replaceAll("\\", "/") === output;
                if (!physicalArtifactVerified) {
                    return {
                        ...artifact,
                        ok: false,
                        executionOk: false,
                        objectiveSatisfied: false,
                        blocked: true,
                        retryable: false,
                        fullRestartAllowed: false,
                        status: "VIDEO_IMPORT_PHYSICAL_VERIFICATION_FAILED",
                        error: "VIDEO_IMPORT_PHYSICAL_VERIFICATION_FAILED",
                        stage: "VIDEO_IMPORT_PHYSICAL_VERIFICATION",
                        providerCode: "PHYSICAL_MP4_NOT_VERIFIED",
                        providerMessage: "The local import did not prove a physical MP4 with bytes and SHA-256.",
                        operationName: finalCloud.operationName || null
                    };
                }
                let recordedSeriesResult = null;
                if (seriesRequested) {
                    recordedSeriesResult = await bridgeRequest("/series/episode/generated", {
                        seriesId,
                        episodeId,
                        physicalArtifact: output,
                        artifactSha256: artifact.sha256
                    });
                    if (recordedSeriesResult?.ok !== true) {
                        return {
                            ...artifact,
                            ok: false,
                            executionOk: false,
                            objectiveSatisfied: false,
                            blocked: true,
                            requiresInput: true,
                            retryable: false,
                            fullRestartAllowed: false,
                            status: recordedSeriesResult?.status || "SERIES_EPISODE_GENERATED_RECORD_FAILED",
                            error: recordedSeriesResult?.error || "SERIES_EPISODE_GENERATED_RECORD_FAILED",
                            seriesId,
                            episodeId,
                            physicalArtifactVerified: true
                        };
                    }
                }
                if (finalCloud?.storageObject) {
                    try { await callAdminFunction("jarvisVideoGenerate", { action: "cleanup", storageObject: finalCloud.storageObject }); } catch {}
                }
                const durationSeconds = 8 + Math.max(0, prompts.length - 1) * 7;
                const finalResult = {
                    ...artifact,
                    ok: physicalArtifactVerified,
                    executionOk: physicalArtifactVerified,
                    objectiveSatisfied: physicalArtifactVerified,
                    status: physicalArtifactVerified ? "VIDEO_GENERATED_VERIFIED" : (artifact?.status || "VIDEO_IMPORT_FAILED"),
                    provider: finalCloud.provider || "google-veo",
                    model: finalCloud.model,
                    durationSeconds,
                    sceneCount: prompts.length,
                    sourceMode: referenceImages.length > 0
                        ? "identity_reference_to_video"
                        : "script_to_video",
                    referenceImageCount: referenceImages.length,
                    referenceOutputs: referenceImages.map(reference => reference.sourceOutput),
                    identityReferencesVerified: referenceImages.length > 0,
                    identityContinuityMode: referenceImages.length > 0
                        ? (prompts.length > 1
                            ? "initial_asset_references_then_previous_video"
                            : "asset_references")
                        : "not_requested",
                    physicallyWritten: artifact?.physicallyWritten === true,
                    physicalArtifactVerified,
                    verifiedArtifactDelivery: physicalArtifactVerified,
                    engineRequested: engineDecision.engineRequested,
                    engineUsed: "external",
                    fallbackUsed: engineDecision.fallbackUsed === true,
                    fallbackReason: engineDecision.fallbackReason || null,
                    externalApiUsed: true,
                    externalEstimatedCostUsd,
                    reasonForExternalUse: engineDecision.fallbackUsed === true
                        ? "LOCAL_FALLBACK"
                        : "CURRENT_STABLE",
                    ...(seriesRequested
                        ? {
                            seriesId,
                            episodeId,
                            seriesCanonRevision: recordedSeriesResult?.canonRevision ??
                                seriesContext.canonRevision ??
                                null
                        }
                        : {})
                };
                recordCapabilityEvidence("video_generation", {
                    ok: finalResult.ok === true && finalResult.physicallyWritten === true,
                    status: finalResult.status,
                    output: finalResult.output || null,
                    bytes: finalResult.bytes || null,
                    sha256: finalResult.sha256 || null,
                    model: finalResult.model || null,
                    referenceImageCount: finalResult.referenceImageCount,
                    identityReferencesVerified: finalResult.identityReferencesVerified,
                    identityContinuityMode: finalResult.identityContinuityMode,
                    engineUsed: finalResult.engineUsed,
                    fallbackUsed: finalResult.fallbackUsed,
                    fallbackReason: finalResult.fallbackReason,
                    externalApiUsed: finalResult.externalApiUsed,
                    externalEstimatedCostUsd: finalResult.externalEstimatedCostUsd,
                    checkedAt: new Date().toISOString()
                });
                return finalResult;
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
            missionDedupeBy: [
                "output"
            ],
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
                    mimeType: result?.mimeType || artifact?.mimeType || null,
                    sha256:
                        result?.ok === true && result?.imageBase64
                            ? await sha256Base64(result.imageBase64)
                            : null,
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
            description: "Edita una imagen persistida usando evidencia visual real. Para piezas de marca puede recibir brandLogoOutput como identidad visual inmutable: el proveedor no dibuja el logotipo y el navegador superpone después los pixeles del archivo oficial.",
            output: "IMAGE_EDIT_RESULT",
            inputSchema: {
                sourceOutput: "string",
                referenceOutputs: "array",
                brandLogoOutput: "string",
                marketingRequirementId: "string",
                variantId: "string",
                identityMode: "string",
                ageMode: "string",
                prompt: "string",
                transformations: "array",
                aspectRatio: "string",
                imageSize: "string",
                preserveLogos: "boolean",
                preserveApprovedText: "boolean",
                logoPosition: "string",
                output: "string",
                caseId: "string",
                objectiveId: "string"
            },
            mutates: true,
            requiresApproval: false,
            userArtifact: true,
            missionDedupeBy: ["sourceOutput", "variantId"],
            execute: async (args = {}, context = {}) => {
                if (!args.sourceOutput) throw new Error("IMAGE_SOURCE_OUTPUT_REQUIRED");

                const requestedOutputs = [
                    args.sourceOutput,
                    ...(Array.isArray(args.referenceOutputs) ? args.referenceOutputs : [])
                ]
                    .map(value => String(value || "").trim())
                    .filter((output, index, values) => Boolean(output) && values.indexOf(output) === index)
                    .slice(0, 4);

                const referenceSources = [];
                for (const output of requestedOutputs) {
                    const sourceArtifact = await bridgeRequest("/artifact/read", { output }, 30000);
                    const valid =
                        sourceArtifact?.ok === true &&
                        String(sourceArtifact.mimeType || "").startsWith("image/") &&
                        Boolean(sourceArtifact.dataBase64);
                    if (!valid) {
                        if (output === String(args.sourceOutput)) throw new Error("IMAGE_SOURCE_ARTIFACT_INVALID");
                        continue;
                    }
                    referenceSources.push({ ...sourceArtifact, output: sourceArtifact.output || output });
                }
                if (referenceSources.length === 0) throw new Error("IMAGE_SOURCE_ARTIFACT_INVALID");

                const sourceArtifact = referenceSources[0];
                const referenceSha256s = [];
                for (const reference of referenceSources) {
                    referenceSha256s.push(reference.sha256 || await sha256Base64(reference.dataBase64));
                }
                const primarySourceSha256 = referenceSha256s[0];
                const identityMode = String(args.identityMode || "person").trim().toLowerCase();
                const personIdentityMode = !["brand-scene", "product", "scene", "marketing"].includes(identityMode);

                const identityReference =
                    personIdentityMode && referenceSources.length > 1
                        ? await buildIdentityReferenceSheet({
                            primarySourceOutput: sourceArtifact.output,
                            references: referenceSources.map(reference => ({
                                sourceOutput: reference.output,
                                dataBase64: reference.dataBase64,
                                mimeType: reference.mimeType
                            }))
                        })
                        : {
                            ok: true,
                            status: "IDENTITY_REFERENCE_SINGLE_READY",
                            composite: false,
                            referenceCount: 1,
                            primarySourceOutput: sourceArtifact.output,
                            referenceOutputs: [sourceArtifact.output],
                            mimeType: sourceArtifact.mimeType,
                            bytes: sourceArtifact.bytes,
                            dataBase64: sourceArtifact.dataBase64
                        };

                const identityReferenceSha256 = await sha256Base64(identityReference.dataBase64);

                let brandLogo = null;
                if (String(args.brandLogoOutput || "").trim()) {
                    const logoOutput = String(args.brandLogoOutput).trim();
                    const logoArtifact = await bridgeRequest("/artifact/read", { output: logoOutput }, 30000);
                    const validLogo =
                        logoArtifact?.ok === true &&
                        String(logoArtifact.mimeType || "").startsWith("image/") &&
                        Boolean(logoArtifact.dataBase64);
                    if (!validLogo) throw new Error("BRAND_LOGO_ARTIFACT_INVALID");
                    brandLogo = {
                        ...logoArtifact,
                        output: logoArtifact.output || logoOutput,
                        sha256: logoArtifact.sha256 || await sha256Base64(logoArtifact.dataBase64)
                    };
                }

                const requestedTransformations = (Array.isArray(args.transformations) ? args.transformations : [])
                    .map(item => String(item || "").trim())
                    .filter(Boolean);
                const personGuards = [
                    "Conservar exactamente la identidad y geometria facial de la persona principal: frente, linea del cabello, ojos, separacion ocular, nariz, boca, mandibula, orejas, tono de piel y proporciones.",
                    "No sustituir, mezclar ni reinterpretar el rostro como una persona generica. La persona objetivo es el adulto que aparece de forma recurrente en las referencias; ignorar a cualquier otra persona.",
                    ...(String(args.ageMode || "preserve").trim().toLowerCase() === "allow-change" ? [] : [
                        "Preservar la edad aparente exacta de la referencia principal. No envejecer ni rejuvenecer; no agregar arrugas, surcos, bolsas, flacidez, textura endurecida, canas ni entradas adicionales.",
                        "Preservar exactamente el estado de barba, bigote, afeitado y color del cabello de la referencia principal. No agregar barba, barba canosa, bigote ni cabello gris que no esten presentes."
                    ])
                ];
                const brandSceneGuards = [
                    "Usar la fotografia fuente real como evidencia visual principal. No sustituir el producto, negocio, instalaciones u objetos visibles por versiones inventadas.",
                    "No generar, redibujar, reinterpretar ni decorar logotipos, emblemas, isotipos, sellos, iniciales de marca ni textos de identidad dentro de la escena.",
                    brandLogo
                        ? "Dejar una zona visual limpia para el emblema oficial. El logotipo se aplicara despues de la generacion desde el archivo oficial y no debe aparecer generado dentro de la imagen."
                        : "No inventar logotipos ni marcas que no existan en la fotografia fuente."
                ];
                const transformations = [
                    ...new Set([
                        ...requestedTransformations,
                        ...(personIdentityMode ? personGuards : brandSceneGuards)
                    ])
                ].slice(0, 20);

                const groundedPrompt = [
                    String(args.prompt || context.rawInput || "").trim(),
                    personIdentityMode
                        ? (identityReference.composite === true
                            ? "La imagen fuente es una hoja de referencias de la misma identidad. El panel grande contiene la referencia principal. No combines el rostro con otras personas."
                            : "Usa la imagen fuente como referencia visual obligatoria y preserva su identidad.")
                        : "La fotografia fuente es material real verificado y debe seguir siendo el contenido visual principal.",
                    brandLogo
                        ? "PROHIBIDO generar cualquier logo, emblema, palabra de marca, sello o variante decorativa. El unico logotipo permitido sera compuesto despues desde el archivo oficial; deja espacio limpio para ese overlay."
                        : "",
                    personIdentityMode && String(args.ageMode || "preserve").trim().toLowerCase() !== "allow-change"
                        ? "Mantener la apariencia actual de la referencia principal sin agregar signos de mayor edad."
                        : ""
                ].filter(Boolean).join(" ").slice(0, 3400);

                const result = await callAdminFunction("jarvisImageGenerate", {
                    prompt: groundedPrompt,
                    transformations,
                    aspectRatio: args.aspectRatio || "1:1",
                    imageSize: args.imageSize || "1K",
                    sourceImageBase64: identityReference.dataBase64,
                    sourceMimeType: identityReference.mimeType,
                    sourceOutput: sourceArtifact.output,
                    preserveLogos: personIdentityMode ? args.preserveLogos !== false : false,
                    preserveApprovedText: args.preserveApprovedText === true,
                    objectiveId: args.objectiveId || context.objectiveId || ""
                });

                if (result?.ok !== true || result?.status !== "IMAGE_EDITED" || !result?.imageBase64) return result;
                const referenceGrounded = result.sourceSha256 === identityReferenceSha256;
                if (!referenceGrounded) {
                    return {
                        ...result,
                        ok: false,
                        status: "IMAGE_REFERENCE_GROUNDING_UNVERIFIED",
                        objectiveSatisfied: false,
                        blocked: true,
                        retryable: false,
                        sourceOutput: sourceArtifact.output,
                        sourceSha256: primarySourceSha256,
                        identityReferenceSha256,
                        providerSourceSha256: result.sourceSha256 || null,
                        referenceGrounded: false,
                        originalPreserved: true
                    };
                }

                let finalImageBase64 = result.imageBase64;
                let finalMimeType = result.mimeType;
                let brandLogoOverlay = null;
                if (brandLogo) {
                    brandLogoOverlay = await overlayBrandLogo({
                        imageBase64: finalImageBase64,
                        imageMimeType: finalMimeType,
                        logoBase64: brandLogo.dataBase64,
                        logoMimeType: brandLogo.mimeType,
                        position: args.logoPosition || "top-right"
                    });
                    if (brandLogoOverlay?.ok !== true) throw new Error("BRAND_LOGO_OVERLAY_FAILED");
                    finalImageBase64 = brandLogoOverlay.imageBase64;
                    finalMimeType = brandLogoOverlay.mimeType;
                }

                const outputSha256 = await sha256Base64(finalImageBase64);
                if (referenceSha256s.includes(outputSha256)) {
                    return {
                        ...result,
                        ok: false,
                        status: "IMAGE_EDIT_OUTPUT_IDENTICAL_TO_REFERENCE",
                        objectiveSatisfied: false,
                        blocked: true,
                        retryable: false,
                        sourceOutput: sourceArtifact.output,
                        sourceSha256: primarySourceSha256,
                        outputSha256,
                        referenceGrounded: true,
                        originalPreserved: true
                    };
                }

                const artifact = await bridgeRequest("/image", {
                    imageBase64: finalImageBase64,
                    mimeType: finalMimeType,
                    output: normalizeImageArtifactOutput(args.output, finalMimeType),
                    origin: "image.edit",
                    provider: result.provider || "google",
                    model: result.model,
                    objectiveId: result.objectiveId || context.objectiveId || "",
                    caseId: args.caseId || context.caseId || "",
                    originalFile: sourceArtifact.output,
                    transformations
                }, 30000);

                const finalResult = {
                    ...result,
                    mimeType: finalMimeType,
                    sourceOutput: sourceArtifact.output,
                    sourceSha256: primarySourceSha256,
                    outputSha256,
                    identityReferenceSha256,
                    providerSourceSha256: result.sourceSha256,
                    referenceOutputs: identityReference.referenceOutputs,
                    referenceSha256s,
                    referenceCount: identityReference.referenceCount,
                    identityReferenceComposite: identityReference.composite === true,
                    identityMode,
                    marketingRequirementId: String(args.marketingRequirementId || "") || null,
                    variantId: String(args.variantId || "PRIMARY"),
                    brandLogoOutput: brandLogo?.output || null,
                    brandLogoSha256: brandLogo?.sha256 || null,
                    brandLogoOverlayVerified: Boolean(brandLogo && brandLogoOverlay?.logoOverlayApplied === true),
                    generatedLogoAllowed: false,
                    logoPlacement: brandLogoOverlay?.placement || null,
                    persisted: artifact?.ok === true,
                    output: artifact?.output || null,
                    outputBytes: artifact?.bytes || null,
                    originalPreserved: true,
                    referenceGrounded: true,
                    apparentAgePreservedRequested: personIdentityMode && String(args.ageMode || "preserve").trim().toLowerCase() !== "allow-change"
                };

                recordCapabilityEvidence("image_editing", {
                    ok: finalResult.ok === true && finalResult.persisted === true && finalResult.referenceGrounded === true && Boolean(finalResult.outputSha256),
                    status: finalResult.persisted ? finalResult.status : "IMAGE_EDIT_ARTIFACT_REQUIRED",
                    provider: finalResult.provider || null,
                    model: finalResult.model || null,
                    sourceOutput: finalResult.sourceOutput,
                    sourceSha256: finalResult.sourceSha256,
                    output: finalResult.output,
                    outputSha256: finalResult.outputSha256,
                    referenceOutputs: finalResult.referenceOutputs,
                    referenceSha256s: finalResult.referenceSha256s,
                    referenceCount: finalResult.referenceCount,
                    identityReferenceComposite: finalResult.identityReferenceComposite,
                    identityMode: finalResult.identityMode,
                    marketingRequirementId: finalResult.marketingRequirementId,
                    variantId: finalResult.variantId,
                    brandLogoOutput: finalResult.brandLogoOutput,
                    brandLogoSha256: finalResult.brandLogoSha256,
                    brandLogoOverlayVerified: finalResult.brandLogoOverlayVerified,
                    generatedLogoAllowed: false,
                    transformations: finalResult.transformations || transformations,
                    objectiveId: finalResult.objectiveId || null,
                    originalPreserved: true,
                    referenceGrounded: true,
                    apparentAgePreservedRequested: finalResult.apparentAgePreservedRequested,
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
            description: "Delega y ejecuta en paralelo hasta cuatro herramientas read-only solamente cuando el usuario lo solicita de forma explícita.",
            output: "AGENT_DELEGATION_RESULT",
            inputSchema: {
                type:
                    "object",
                required: [
                    "tasks",
                    "delegationDirective"
                ],
                properties: {
                    tasks: {
                        type:
                            "array",
                        minItems:
                            1,
                        maxItems:
                            4,
                        items: {
                            type:
                                "object",
                            required: [
                                "tool"
                            ],
                            properties: {
                                tool: {
                                    type:
                                        "string"
                                },
                                args: {
                                    type:
                                        "object",
                                    additionalProperties:
                                        true
                                }
                            },
                            additionalProperties:
                                false
                        }
                    },
                    delegationDirective: {
                        type:
                            "string",
                        description:
                            "Cita literal de la instrucción original donde el usuario pide delegar, usar agentes o ejecutar en paralelo."
                    }
                },
                additionalProperties:
                    false
            },
            execute: async (args = {}, context = {}) => {
                const delegationDirective =
                    String(
                        args
                            .delegationDirective ||
                        ""
                    ).trim();
                const originalInstruction =
                    String(
                        context
                            .rawInput ||
                        context
                            .originalInstruction ||
                        ""
                    );
                if (
                    !delegationDirective ||
                    !originalInstruction.includes(
                        delegationDirective
                    )
                ) {
                    return {
                        ok: false,
                        status:
                            "DELEGATION_EXPLICIT_DIRECTIVE_REQUIRED",
                        error:
                            "DELEGATION_EXPLICIT_DIRECTIVE_REQUIRED"
                    };
                }
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
                    delegationDirective,
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
