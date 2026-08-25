"use strict";

/**
 * Entrada final de Functions.
 * Mantiene el nombre histórico `stripewebhook` para que clientes ya publicados
 * lleguen al mismo API autoritativo de secure-entry.js mediante un export distinto.
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { getDownloadURL } = require("firebase-admin/storage");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { GoogleGenAI, GenerateVideosOperation } = require("@google/genai");
const secureExports = require("./secure-entry.js");
const {
    classifyCompletedVideoOperation
} = require("./jarvis-video-operation-contract.js");

const stripeWebhookProxy = functions.https.onRequest((req, res) => {
    return secureExports.api(req, res);
});

const JARVIS_VEO_MODEL = "veo-3.1-generate-001";
const JARVIS_VEO_MIGRATION = Object.freeze({
    retiredModel: "veo-3.1-generate-preview",
    currentModel: JARVIS_VEO_MODEL,
    provider: "vertex-adc"
});
const JARVIS_VIDEO_BUCKET = "fixgo-44e4d.firebasestorage.app";
const JARVIS_VIDEO_TEMP_PREFIX = "jarvis-video-temp";
const JARVIS_VIDEO_LOCATION = "global";
const JARVIS_VIDEO_REFERENCE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp"
]);
const JARVIS_VIDEO_REFERENCE_MAX_COUNT = 3;
const JARVIS_VIDEO_REFERENCE_MAX_BYTES = 7 * 1024 * 1024;
const JARVIS_VIDEO_REFERENCE_BATCH_MAX_BYTES = 9 * 1024 * 1024;

function cleanText(value = "", maxLength = 8000) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

async function assertJarvisVideoAdminContext(context) {
    if (!context.auth?.uid) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Se requiere sesion para generar video con Jarvis."
        );
    }

    const email = cleanText(context.auth.token?.email, 240).toLowerCase();
    const profile = await admin
        .firestore()
        .collection("users")
        .doc(context.auth.uid)
        .get();
    const role = cleanText(
        profile.data()?.rol || profile.data()?.role,
        80
    ).toLowerCase();

    if (email !== "hebertoh-m@hotmail.com" && role !== "admin") {
        throw new functions.https.HttpsError(
            "permission-denied",
            "Solo administracion puede generar video con Jarvis."
        );
    }

    return {
        uid: context.auth.uid,
        email,
        role
    };
}

function jarvisVideoAi() {
    return new GoogleGenAI({
        vertexai: true,
        project:
            cleanText(
                process.env.GCLOUD_PROJECT ||
                process.env.GOOGLE_CLOUD_PROJECT ||
                "fixgo-44e4d",
                200
            ) || "fixgo-44e4d",
        location: JARVIS_VIDEO_LOCATION,
        apiVersion: "v1"
    });
}

function jarvisVideoProviderError(stage, error) {
    if (error instanceof functions.https.HttpsError) {
        return error;
    }

    const providerCode = cleanText(
        error?.code ||
        error?.status ||
        error?.name,
        160
    ) || "UNKNOWN";
    const providerMessage = cleanText(
        error?.message ||
        error,
        900
    ) || "VIDEO_PROVIDER_ERROR";
    const clientMessage = cleanText(
        `${stage}_FAILED | ${providerCode} | ${providerMessage}`,
        1100
    );
    const numericCode = Number(error?.code || error?.status || 0);
    const retryable = stage === "VIDEO_GENERATION_POLL" && (
        [4, 8, 10, 13, 14, 408, 409, 425, 429, 500, 502, 503, 504].includes(numericCode) ||
        [
            "ABORT_ERR",
            "DEADLINE_EXCEEDED",
            "ECONNRESET",
            "ETIMEDOUT",
            "FETCH_ERROR",
            "INTERNAL",
            "NETWORK_ERROR",
            "RESOURCE_EXHAUSTED",
            "SERVICE_UNAVAILABLE",
            "UNAVAILABLE"
        ].includes(providerCode.toUpperCase())
    );
    const status = retryable
        ? "VIDEO_GENERATION_POLL_TRANSPORT_FAILED"
        : `${stage}_FAILED`;
    const operationName = cleanText(error?.operationName, 800) || undefined;

    console.error(JSON.stringify({
        level: "ERROR",
        message: "JARVIS_VIDEO_PROVIDER_ERROR",
        stage,
        provider: JARVIS_VEO_MIGRATION.provider,
        model: JARVIS_VEO_MODEL,
        retiredModel: JARVIS_VEO_MIGRATION.retiredModel,
        providerCode,
        providerMessage,
        retryable,
        ...(operationName ? { operationName } : {})
    }));

    return new functions.https.HttpsError(
        "internal",
        clientMessage,
        {
            status,
            stage,
            provider: JARVIS_VEO_MIGRATION.provider,
            model: JARVIS_VEO_MODEL,
            providerCode,
            providerMessage,
            retryable,
            fullRestartAllowed: operationName ? false : retryable,
            ...(operationName ? { operationName } : {})
        }
    );
}

function normalizeOperationName(value = "") {
    const name = cleanText(value, 800);
    if (
        name.length < 10 ||
        !/^[A-Za-z0-9._/:=-]+$/.test(name)
    ) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "VIDEO_OPERATION_NAME_INVALID"
        );
    }
    return name;
}

function rehydrateVideoOperation(operationName) {
    const operation = new GenerateVideosOperation();
    operation.name = normalizeOperationName(operationName);
    if (typeof operation._fromAPIResponse !== "function") {
        throw new Error("VIDEO_OPERATION_REHYDRATION_INVALID");
    }
    return operation;
}

async function pollJarvisVideoOperation(ai, operationName) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const operationReference = rehydrateVideoOperation(operationName);
            return await ai.operations.get({
                operation: operationReference
            });
        }
        catch(error) {
            lastError = error;
            console.warn(JSON.stringify({
                level: "WARN",
                message: "JARVIS_VIDEO_POLL_RETRY",
                operationName: normalizeOperationName(operationName),
                attempt: attempt + 1,
                providerCode: cleanText(error?.code || error?.status || error?.name, 160) || "UNKNOWN",
                providerMessage: cleanText(error?.message || error, 500) || "VIDEO_POLL_ERROR"
            }));
            if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 750 * (attempt + 1)));
            }
        }
    }
    const exhausted = lastError || new Error("VIDEO_GENERATION_POLL_TRANSPORT_FAILED");
    exhausted.operationName = normalizeOperationName(operationName);
    throw exhausted;
}

function throwVideoOperationResult(result, operationName) {
    throw new functions.https.HttpsError(
        "failed-precondition",
        result.status,
        {
            status: result.status,
            stage: "VIDEO_GENERATION_RESULT",
            provider: JARVIS_VEO_MIGRATION.provider,
            model: JARVIS_VEO_MODEL,
            providerCode: result.providerCode,
            providerMessage: result.providerMessage,
            retryable: result.retryable === true,
            fullRestartAllowed: false,
            operationName,
            ...(Number.isFinite(result.raiMediaFilteredCount)
                ? { raiMediaFilteredCount: result.raiMediaFilteredCount }
                : {}),
            ...(Array.isArray(result.raiMediaFilteredReasons)
                ? { raiMediaFilteredReasons: result.raiMediaFilteredReasons }
                : {})
        }
    );
}

function normalizePreviousVideo(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const uri = cleanText(value.uri || value.videoUri, 2000);
    const mimeType = cleanText(value.mimeType || "video/mp4", 80).toLowerCase();
    if (
        !uri ||
        !(uri.startsWith("gs://") || uri.startsWith("https://")) ||
        mimeType !== "video/mp4"
    ) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "VIDEO_EXTENSION_SOURCE_INVALID"
        );
    }
    return {
        uri,
        mimeType
    };
}

function normalizeVideoReferenceImages(value) {
    if (value == null) return [];
    if (!Array.isArray(value)) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "VIDEO_REFERENCE_IMAGES_INVALID"
        );
    }
    if (value.length > JARVIS_VIDEO_REFERENCE_MAX_COUNT) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "VIDEO_REFERENCE_IMAGE_LIMIT_EXCEEDED"
        );
    }

    let totalBytes = 0;
    return value.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "VIDEO_REFERENCE_IMAGE_INVALID"
            );
        }
        const mimeType = cleanText(item.mimeType, 80).toLowerCase();
        if (!JARVIS_VIDEO_REFERENCE_MIME_TYPES.has(mimeType)) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "VIDEO_REFERENCE_IMAGE_FORMAT_UNSUPPORTED"
            );
        }
        const imageBytes = String(item.imageBytes || item.dataBase64 || "")
            .replace(/\s+/g, "")
            .trim();
        if (
            !imageBytes ||
            imageBytes.length % 4 !== 0 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(imageBytes)
        ) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "VIDEO_REFERENCE_IMAGE_BASE64_INVALID"
            );
        }
        const bytes = Buffer.from(imageBytes, "base64");
        if (bytes.length < 1 || bytes.toString("base64") !== imageBytes) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "VIDEO_REFERENCE_IMAGE_BASE64_INVALID"
            );
        }
        if (bytes.length > JARVIS_VIDEO_REFERENCE_MAX_BYTES) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "VIDEO_REFERENCE_IMAGE_TOO_LARGE"
            );
        }
        totalBytes += bytes.length;
        if (totalBytes > JARVIS_VIDEO_REFERENCE_BATCH_MAX_BYTES) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "VIDEO_REFERENCE_IMAGE_BATCH_TOO_LARGE"
            );
        }
        const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
        const declaredSha256 = cleanText(item.sha256, 80).toLowerCase();
        if (declaredSha256 && declaredSha256 !== sha256) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "VIDEO_REFERENCE_IMAGE_HASH_MISMATCH"
            );
        }
        return {
            image: {
                imageBytes,
                mimeType
            },
            referenceType: "ASSET",
            index,
            sha256
        };
    });
}

function ownedJarvisStorageObject(uri = "", actor = {}) {
    const source = cleanText(uri, 2400);
    if (!source.startsWith("gs://")) return null;
    const withoutScheme = source.slice("gs://".length);
    const slash = withoutScheme.indexOf("/");
    if (slash < 1) {
        throw new Error("VIDEO_GCS_URI_INVALID");
    }
    const bucket = withoutScheme.slice(0, slash);
    const storageObject = withoutScheme.slice(slash + 1);
    const allowedPrefix = `${JARVIS_VIDEO_TEMP_PREFIX}/${actor.uid}/`;
    if (
        bucket !== JARVIS_VIDEO_BUCKET ||
        !storageObject.startsWith(allowedPrefix) ||
        storageObject.includes("..")
    ) {
        throw new Error("VIDEO_GCS_URI_NOT_OWNED");
    }
    return storageObject;
}

function verifyJarvisVideoBytes(bytes) {
    if (
        !Buffer.isBuffer(bytes) ||
        bytes.length < 100000 ||
        bytes.length > 90 * 1024 * 1024 ||
        bytes.subarray(4, 8).toString("ascii") !== "ftyp"
    ) {
        throw new Error("VIDEO_MP4_PHYSICAL_VALIDATION_FAILED");
    }
    return crypto
        .createHash("sha256")
        .update(bytes)
        .digest("hex");
}

async function finalizeJarvisVeoVideo({ ai, video, actor }) {
    if (!video || typeof video !== "object") {
        throw new Error("VIDEO_GENERATION_RESULT_MISSING");
    }

    const videoUri = cleanText(video?.uri || video?.videoUri, 2400);
    const ownedStorageObject = ownedJarvisStorageObject(videoUri, actor);
    const bucket = admin.storage().bucket(JARVIS_VIDEO_BUCKET);

    if (ownedStorageObject) {
        const file = bucket.file(ownedStorageObject);
        const [bytes] = await file.download();
        const sha256 = verifyJarvisVideoBytes(bytes);
        const downloadToken = crypto.randomUUID();
        await file.setMetadata({
            contentType: "video/mp4",
            cacheControl: "private,max-age=0,no-store",
            metadata: {
                source: "jarvisVideoGenerate",
                provider: JARVIS_VEO_MIGRATION.provider,
                model: JARVIS_VEO_MODEL,
                sha256,
                ownerUid: actor.uid,
                firebaseStorageDownloadTokens: downloadToken
            }
        });
        const downloadUrl = await getDownloadURL(file);
        return {
            downloadUrl,
            storageObject: ownedStorageObject,
            bytes: bytes.length,
            sha256,
            mimeType: "video/mp4"
        };
    }

    const tempPath = path.join(
        os.tmpdir(),
        `jarvis-veo-${crypto.randomUUID()}.mp4`
    );

    try {
        await ai.files.download({
            file: video,
            downloadPath: tempPath
        });

        if (!fs.existsSync(tempPath)) {
            throw new Error("VIDEO_DOWNLOAD_MISSING");
        }

        const bytes = fs.readFileSync(tempPath);
        const sha256 = verifyJarvisVideoBytes(bytes);
        const storageObject = [
            JARVIS_VIDEO_TEMP_PREFIX,
            actor.uid,
            `${Date.now()}-${sha256.slice(0, 16)}.mp4`
        ].join("/");
        const file = bucket.file(storageObject);
        const downloadToken = crypto.randomUUID();

        await file.save(bytes, {
            resumable: false,
            contentType: "video/mp4",
            metadata: {
                cacheControl: "private,max-age=0,no-store",
                metadata: {
                    source: "jarvisVideoGenerate",
                    provider: JARVIS_VEO_MIGRATION.provider,
                    model: JARVIS_VEO_MODEL,
                    sha256,
                    ownerUid: actor.uid,
                    firebaseStorageDownloadTokens: downloadToken
                }
            }
        });

        const downloadUrl = await getDownloadURL(file);

        return {
            downloadUrl,
            storageObject,
            bytes: bytes.length,
            sha256,
            mimeType: "video/mp4"
        };
    }
    finally {
        try { fs.rmSync(tempPath, { force: true }); } catch {}
    }
}

const jarvisVideoGenerate = functions
    .runWith({
        timeoutSeconds: 120,
        memory: "2GB"
    })
    .https
    .onCall(async (data = {}, context) => {
        let stage = "VIDEO_GENERATION_BOOTSTRAP";
        try {
            const actor = await assertJarvisVideoAdminContext(context);
            const action = cleanText(data?.action || "start", 40).toLowerCase();
            const ai = jarvisVideoAi();

            if (action === "cleanup") {
                stage = "VIDEO_GENERATION_CLEANUP";
                const storageObject = cleanText(data?.storageObject, 1000);
                const allowedPrefix = `${JARVIS_VIDEO_TEMP_PREFIX}/${actor.uid}/`;
                if (!storageObject.startsWith(allowedPrefix) || storageObject.includes("..")) {
                    throw new functions.https.HttpsError(
                        "invalid-argument",
                        "VIDEO_TEMP_OBJECT_INVALID"
                    );
                }
                await admin
                    .storage()
                    .bucket(JARVIS_VIDEO_BUCKET)
                    .file(storageObject)
                    .delete({ ignoreNotFound: true });
                return {
                    ok: true,
                    status: "VIDEO_TEMP_CLEANED",
                    storageObject
                };
            }

            if (action === "start") {
                stage = "VIDEO_GENERATION_START";
                const prompt = cleanText(data?.prompt || data?.script, 10000);
                if (prompt.length < 12) {
                    throw new functions.https.HttpsError(
                        "invalid-argument",
                        "VIDEO_PROMPT_REQUIRED"
                    );
                }
                const previousVideo = normalizePreviousVideo(data?.previousVideo);
                const referenceImages = normalizeVideoReferenceImages(data?.referenceImages);
                if (previousVideo && referenceImages.length > 0) {
                    throw new functions.https.HttpsError(
                        "invalid-argument",
                        "VIDEO_REFERENCE_IMAGES_UNSUPPORTED_FOR_EXTENSION"
                    );
                }
                const aspectRatio = data?.aspectRatio === "16:9" ? "16:9" : "9:16";
                const outputPrefix = [
                    JARVIS_VIDEO_TEMP_PREFIX,
                    actor.uid,
                    crypto.randomUUID()
                ].join("/");
                const outputGcsUri =
                    `gs://${JARVIS_VIDEO_BUCKET}/${outputPrefix}/`;
                const request = {
                    model: JARVIS_VEO_MODEL,
                    prompt,
                    ...(previousVideo ? { video: previousVideo } : {}),
                    config: previousVideo
                        ? {
                            numberOfVideos: 1,
                            resolution: "720p",
                            durationSeconds: 7,
                            outputGcsUri
                        }
                        : {
                            numberOfVideos: 1,
                            resolution: "720p",
                            aspectRatio,
                            durationSeconds: 8,
                            outputGcsUri,
                            ...(referenceImages.length > 0
                                ? {
                                    referenceImages: referenceImages.map(reference => ({
                                        image: reference.image,
                                        referenceType: reference.referenceType
                                    }))
                                }
                                : {})
                        }
                };
                const operation = await ai.models.generateVideos(request);
                const operationName = normalizeOperationName(operation?.name);
                console.log(JSON.stringify({
                    level: "INFO",
                    message: "JARVIS_VIDEO_GENERATION_STARTED",
                    uid: actor.uid,
                    operationName,
                    extension: Boolean(previousVideo),
                    referenceImageCount: referenceImages.length,
                    provider: JARVIS_VEO_MIGRATION.provider,
                    model: JARVIS_VEO_MODEL
                }));
                return {
                    ok: true,
                    status: "VIDEO_GENERATION_STARTED",
                    done: false,
                    operationName,
                    provider: JARVIS_VEO_MIGRATION.provider,
                    model: JARVIS_VEO_MODEL,
                    aspectRatio,
                    extension: Boolean(previousVideo),
                    referenceImageCount: referenceImages.length,
                    identityContinuityMode: referenceImages.length > 0
                        ? "asset_references"
                        : previousVideo
                            ? "previous_video"
                            : "not_requested"
                };
            }

            if (action === "poll") {
                stage = "VIDEO_GENERATION_POLL";
                const operationName = normalizeOperationName(data?.operationName);
                const operation = await pollJarvisVideoOperation(ai, operationName);
                if (!operation?.done) {
                    return {
                        ok: true,
                        status: "VIDEO_GENERATION_PENDING",
                        done: false,
                        operationName,
                        provider: JARVIS_VEO_MIGRATION.provider,
                        model: JARVIS_VEO_MODEL
                    };
                }
                const classified = classifyCompletedVideoOperation(operation);
                if (classified.ok !== true) {
                    throwVideoOperationResult(classified, operationName);
                }
                const video = classified.video;

                if (data?.finalize !== true) {
                    return {
                        ok: true,
                        status: "VIDEO_SEGMENT_READY_FOR_EXTENSION",
                        done: true,
                        operationName,
                        provider: JARVIS_VEO_MIGRATION.provider,
                        model: JARVIS_VEO_MODEL,
                        video: {
                            uri: cleanText(video?.uri || video?.videoUri, 2000),
                            mimeType: cleanText(video?.mimeType || "video/mp4", 80)
                        }
                    };
                }

                stage = "VIDEO_GENERATION_FINALIZE";
                const finalized = await finalizeJarvisVeoVideo({
                    ai,
                    video,
                    actor
                });
                console.log(JSON.stringify({
                    level: "INFO",
                    message: "JARVIS_VIDEO_GENERATION_FINALIZED",
                    uid: actor.uid,
                    operationName,
                    bytes: finalized.bytes,
                    sha256: finalized.sha256,
                    provider: JARVIS_VEO_MIGRATION.provider,
                    model: JARVIS_VEO_MODEL
                }));
                return {
                    ok: true,
                    status: "VIDEO_GENERATED_CLOUD_VERIFIED",
                    done: true,
                    operationName,
                    model: JARVIS_VEO_MODEL,
                    provider: "google-veo-vertex",
                    ...finalized,
                    cleanupRequired: true
                };
            }

            throw new functions.https.HttpsError(
                "invalid-argument",
                "VIDEO_GENERATION_ACTION_INVALID"
            );
        }
        catch(error) {
            throw jarvisVideoProviderError(stage, error);
        }
    });

module.exports = {
    ...secureExports,
    stripewebhook: stripeWebhookProxy,
    jarvisVideoGenerate
};
