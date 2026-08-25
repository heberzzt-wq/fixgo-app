"use strict";

/**
 * Entrada final de Functions.
 * Mantiene el nombre histórico `stripewebhook` para que clientes ya publicados
 * lleguen al mismo API autoritativo de secure-entry.js mediante un export distinto.
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { GoogleGenAI } = require("@google/genai");
const secureExports = require("./secure-entry.js");

const stripeWebhookProxy = functions.https.onRequest((req, res) => {
    return secureExports.api(req, res);
});

const JARVIS_VEO_MODEL = "veo-3.1-generate-001";
const JARVIS_VIDEO_BUCKET = "fixgo-44e4d.firebasestorage.app";
const JARVIS_VIDEO_TEMP_PREFIX = "jarvis-video-temp";
const JARVIS_VIDEO_LOCATION = "global";

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

    console.error(JSON.stringify({
        level: "ERROR",
        message: "JARVIS_VIDEO_PROVIDER_ERROR",
        stage,
        provider: "vertex-adc",
        model: JARVIS_VEO_MODEL,
        providerCode,
        providerMessage
    }));

    return new functions.https.HttpsError(
        "internal",
        `${stage}_FAILED`,
        {
            stage,
            provider: "vertex-adc",
            model: JARVIS_VEO_MODEL,
            providerCode,
            providerMessage
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
        await file.setMetadata({
            contentType: "video/mp4",
            cacheControl: "private,max-age=0,no-store",
            metadata: {
                source: "jarvisVideoGenerate",
                provider: "vertex-adc",
                model: JARVIS_VEO_MODEL,
                sha256,
                ownerUid: actor.uid
            }
        });
        const [downloadUrl] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 15 * 60 * 1000
        });
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

        await file.save(bytes, {
            resumable: false,
            contentType: "video/mp4",
            metadata: {
                cacheControl: "private,max-age=0,no-store",
                metadata: {
                    source: "jarvisVideoGenerate",
                    provider: "vertex-adc",
                    model: JARVIS_VEO_MODEL,
                    sha256,
                    ownerUid: actor.uid
                }
            }
        });

        const [downloadUrl] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 15 * 60 * 1000
        });

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
                            durationSeconds: 8,
                            outputGcsUri
                        }
                        : {
                            numberOfVideos: 1,
                            resolution: "720p",
                            aspectRatio,
                            durationSeconds: 8,
                            outputGcsUri
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
                    provider: "vertex-adc",
                    model: JARVIS_VEO_MODEL
                }));
                return {
                    ok: true,
                    status: "VIDEO_GENERATION_STARTED",
                    done: false,
                    operationName,
                    provider: "vertex-adc",
                    model: JARVIS_VEO_MODEL,
                    aspectRatio,
                    extension: Boolean(previousVideo)
                };
            }

            if (action === "poll") {
                stage = "VIDEO_GENERATION_POLL";
                const operationName = normalizeOperationName(data?.operationName);
                const operation = await ai.operations.getVideosOperation({
                    operation: { name: operationName }
                });
                if (!operation?.done) {
                    return {
                        ok: true,
                        status: "VIDEO_GENERATION_PENDING",
                        done: false,
                        operationName,
                        provider: "vertex-adc",
                        model: JARVIS_VEO_MODEL
                    };
                }
                if (operation?.error) {
                    throw new Error(
                        cleanText(
                            operation.error?.message || operation.error,
                            1000
                        ) || "VIDEO_GENERATION_OPERATION_FAILED"
                    );
                }
                const generated = operation?.response?.generatedVideos?.[0];
                const video = generated?.video;
                if (!video) {
                    throw new Error("VIDEO_GENERATION_RESULT_MISSING");
                }

                if (data?.finalize !== true) {
                    return {
                        ok: true,
                        status: "VIDEO_SEGMENT_READY_FOR_EXTENSION",
                        done: true,
                        operationName,
                        provider: "vertex-adc",
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
                    provider: "vertex-adc",
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