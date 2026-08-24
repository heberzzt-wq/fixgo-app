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

const JARVIS_VEO_MODEL = "veo-3.1-generate-preview";
const JARVIS_VIDEO_BUCKET = "fixgo-44e4d.firebasestorage.app";
const JARVIS_VIDEO_TEMP_PREFIX = "jarvis-video-temp";

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
    const apiKey = cleanText(process.env.GEMINI_KEY || process.env.GEMINI_API_KEY, 500);
    if (!apiKey) {
        throw new functions.https.HttpsError(
            "failed-precondition",
            "GEMINI_KEY_MISSING"
        );
    }
    return new GoogleGenAI({ apiKey });
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
    if (!uri || !uri.startsWith("http") || mimeType !== "video/mp4") {
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

async function finalizeJarvisVeoVideo({ ai, video, actor }) {
    if (!video || typeof video !== "object") {
        throw new Error("VIDEO_GENERATION_RESULT_MISSING");
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
        if (
            bytes.length < 100000 ||
            bytes.length > 90 * 1024 * 1024 ||
            bytes.subarray(4, 8).toString("ascii") !== "ftyp"
        ) {
            throw new Error("VIDEO_MP4_PHYSICAL_VALIDATION_FAILED");
        }

        const sha256 = crypto
            .createHash("sha256")
            .update(bytes)
            .digest("hex");
        const storageObject = [
            JARVIS_VIDEO_TEMP_PREFIX,
            actor.uid,
            `${Date.now()}-${sha256.slice(0, 16)}.mp4`
        ].join("/");
        const bucket = admin.storage().bucket(JARVIS_VIDEO_BUCKET);
        const file = bucket.file(storageObject);

        await file.save(bytes, {
            resumable: false,
            contentType: "video/mp4",
            metadata: {
                cacheControl: "private,max-age=0,no-store",
                metadata: {
                    source: "jarvisVideoGenerate",
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
        memory: "2GB",
        secrets: ["GEMINI_KEY"]
    })
    .https
    .onCall(async (data = {}, context) => {
        const actor = await assertJarvisVideoAdminContext(context);
        const action = cleanText(data?.action || "start", 40).toLowerCase();
        const ai = jarvisVideoAi();

        if (action === "cleanup") {
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
            const prompt = cleanText(data?.prompt || data?.script, 10000);
            if (prompt.length < 12) {
                throw new functions.https.HttpsError(
                    "invalid-argument",
                    "VIDEO_PROMPT_REQUIRED"
                );
            }
            const previousVideo = normalizePreviousVideo(data?.previousVideo);
            const aspectRatio = data?.aspectRatio === "16:9" ? "16:9" : "9:16";
            const request = {
                model: JARVIS_VEO_MODEL,
                prompt,
                ...(previousVideo ? { video: previousVideo } : {}),
                config: previousVideo
                    ? {
                        numberOfVideos: 1,
                        resolution: "720p"
                    }
                    : {
                        numberOfVideos: 1,
                        resolution: "720p",
                        aspectRatio,
                        durationSeconds: "8"
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
                model: JARVIS_VEO_MODEL
            }));
            return {
                ok: true,
                status: "VIDEO_GENERATION_STARTED",
                done: false,
                operationName,
                model: JARVIS_VEO_MODEL,
                aspectRatio,
                extension: Boolean(previousVideo)
            };
        }

        if (action === "poll") {
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
                    model: JARVIS_VEO_MODEL,
                    video: {
                        uri: cleanText(video?.uri || video?.videoUri, 2000),
                        mimeType: cleanText(video?.mimeType || "video/mp4", 80)
                    }
                };
            }

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
                model: JARVIS_VEO_MODEL
            }));
            return {
                ok: true,
                status: "VIDEO_GENERATED_CLOUD_VERIFIED",
                done: true,
                operationName,
                model: JARVIS_VEO_MODEL,
                provider: "google-veo",
                ...finalized,
                cleanupRequired: true
            };
        }

        throw new functions.https.HttpsError(
            "invalid-argument",
            "VIDEO_GENERATION_ACTION_INVALID"
        );
    });

module.exports = {
    ...secureExports,
    stripewebhook: stripeWebhookProxy,
    jarvisVideoGenerate
};