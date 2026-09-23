"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const BIOMETRIC_ENGINE_VERSION = "human-local-v1";
const IDENTITY_CAPTURE_VERSION = "b2c-bank-identity-v1";
const REGISTRY_LIMIT = 5000;
// v2 resets counters inherited from the retired multi-pose debugging flow without deleting audit history.
const IDENTITY_ATTEMPT_POLICY_VERSION = "b2c-identity-attempt-policy-v2";
const IDENTITY_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;
const IDENTITY_ATTEMPT_COOLDOWN_MS = 15 * 1000;
const IDENTITY_FRESH_CAPTURE_LIMIT = 5;
const IDENTITY_SAME_CAPTURE_LIMIT = 2;
const THRESHOLDS = Object.freeze({
    faceConfidence: 0.60,
    antispoof: 0.60,
    liveness: 0.60,
    sameCapturePerson: 0.55,
    idDocumentMatch: 0.50,
    duplicateReview: 0.58,
    duplicateSuspected: 0.72,
    frontYawMaxDeg: 25,
    sideYawMinDeg: 10
});

let runtimePromise = null;

function safeText(value, max = 180) {
    return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

function roundScore(value) {
    return Number.isFinite(Number(value)) ? Math.round(Number(value) * 10000) / 10000 : 0;
}

function radiansToDegrees(value) {
    return Number.isFinite(Number(value)) ? Number(value) * 180 / Math.PI : 0;
}

function captureDigest(buffers) {
    const hash = crypto.createHash("sha256");
    for (const [kind, buffer] of Object.entries(buffers).sort(([a], [b]) => a.localeCompare(b))) {
        hash.update(kind);
        hash.update("\0");
        hash.update(buffer);
        hash.update("\0");
    }
    return hash.digest("hex");
}

function evaluateIdentityAttemptState(state = {}, { nowMs = Date.now(), digest } = {}) {
    if (!/^[a-f0-9]{64}$/.test(String(digest || ""))) {
        throw new Error("IDENTITY_CAPTURE_DIGEST_REQUIRED");
    }

    const samePolicy =
        String(state.policy_version || "") === IDENTITY_ATTEMPT_POLICY_VERSION;
    const windowStartedMs = samePolicy ? Number(state.window_started_ms || 0) : 0;
    const lastAttemptMs = samePolicy ? Number(state.last_attempt_ms || 0) : 0;
    const withinWindow =
        samePolicy &&
        windowStartedMs > 0 &&
        nowMs - windowStartedMs < IDENTITY_ATTEMPT_WINDOW_MS;

    const legacyAttempts = withinWindow ? Number(state.attempts || 0) : 0;
    const freshCaptureAttempts = withinWindow ? Number(state.fresh_capture_attempts || 0) : 0;
    const sameCapture =
        withinWindow &&
        String(state.last_capture_digest || "") === String(digest);
    const sameCaptureAttempts =
        sameCapture
            ? Number(state.same_capture_attempts || 0)
            : 0;

    if (
        lastAttemptMs > 0 &&
        nowMs - lastAttemptMs < IDENTITY_ATTEMPT_COOLDOWN_MS
    ) {
        return {
            allowed: false,
            reason: "cooldown",
            retryAfterMs: IDENTITY_ATTEMPT_COOLDOWN_MS - (nowMs - lastAttemptMs)
        };
    }

    if (sameCapture && sameCaptureAttempts >= IDENTITY_SAME_CAPTURE_LIMIT) {
        return {
            allowed: false,
            reason: "same_capture_limit",
            retryAfterMs: 0
        };
    }

    if (!sameCapture && freshCaptureAttempts >= IDENTITY_FRESH_CAPTURE_LIMIT) {
        return {
            allowed: false,
            reason: "fresh_capture_limit",
            retryAfterMs: Math.max(
                0,
                IDENTITY_ATTEMPT_WINDOW_MS - (nowMs - windowStartedMs)
            )
        };
    }

    return {
        allowed: true,
        sameCapture,
        patch: {
            policy_version: IDENTITY_ATTEMPT_POLICY_VERSION,
            window_started_ms: withinWindow ? windowStartedMs : nowMs,
            attempts: legacyAttempts + 1,
            fresh_capture_attempts:
                sameCapture
                    ? freshCaptureAttempts
                    : freshCaptureAttempts + 1,
            same_capture_attempts:
                sameCapture
                    ? sameCaptureAttempts + 1
                    : 1,
            last_attempt_ms: nowMs,
            last_capture_digest: digest
        }
    };
}

function referenceStoragePath(reference, bucketName, uid, kind) {
    let storagePath = typeof reference === "object" ? reference?.storage_path : null;
    const url = typeof reference === "string" ? reference : reference?.url;
    if (url) {
        let parsed;
        try { parsed = new URL(url); } catch { throw new Error(`IDENTITY_STORAGE_REFERENCE_INVALID:${kind}`); }
        const marker = `/v0/b/${bucketName}/o/`;
        if (parsed.protocol !== "https:" ||
            parsed.hostname !== "firebasestorage.googleapis.com" ||
            !parsed.pathname.startsWith(marker)) {
            throw new Error(`IDENTITY_STORAGE_REFERENCE_INVALID:${kind}`);
        }
        let urlPath;
        try { urlPath = decodeURIComponent(parsed.pathname.slice(marker.length)); }
        catch { throw new Error(`IDENTITY_STORAGE_REFERENCE_INVALID:${kind}`); }
        if (storagePath && storagePath !== urlPath) throw new Error(`IDENTITY_STORAGE_REFERENCE_CONFLICT:${kind}`);
        storagePath = urlPath;
    }
    if (typeof storagePath !== "string" ||
        !storagePath.startsWith(`expedientes/${uid}/`) ||
        storagePath.includes("..") ||
        storagePath.endsWith("/")) {
        throw new Error(`IDENTITY_STORAGE_OWNER_MISMATCH:${kind}`);
    }
    return storagePath;
}

// Immutable recapture references are create-only Storage objects; the callable adopts them server-side.
// Legacy current.* paths remain fail-closed and are never accepted as recapture evidence.
const RECAPTURE_EVIDENCE_MAP = Object.freeze({
    ine_front: { storageKind: "ine", profileField: "documentos.ine" },
    ine_back: { storageKind: "ine_reverso", profileField: "documentos.ine_reverso" },
    selfie_front: { storageKind: "foto_perfil", profileField: "foto_perfil" },
    selfie_left: { storageKind: "selfie_liveness_left", profileField: "documentos.selfie_liveness_left" },
    selfie_right: { storageKind: "selfie_liveness_right", profileField: "documentos.selfie_liveness_right" }
});

function normalizeRecaptureEvidence(value, { uid, bucketName } = {}) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const entries = Object.entries(raw);
    if (entries.length > Object.keys(RECAPTURE_EVIDENCE_MAP).length) {
        throw new Error("IDENTITY_RECAPTURE_TOO_MANY_REFERENCES");
    }

    const normalized = {};
    for (const [kind, reference] of entries) {
        const config = RECAPTURE_EVIDENCE_MAP[kind];
        if (!config) throw new Error(`IDENTITY_RECAPTURE_KIND_INVALID:${kind}`);
        if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
            throw new Error(`IDENTITY_RECAPTURE_REFERENCE_INVALID:${kind}`);
        }

        const storagePath = referenceStoragePath(reference, bucketName, uid, kind);
        const requiredPrefix = `expedientes/${uid}/recaptures/${config.storageKind}/`;
        const fileName = storagePath.slice(requiredPrefix.length);
        if (
            !storagePath.startsWith(requiredPrefix) ||
            !/^capture-[A-Za-z0-9_-]{8,180}\.jpg$/.test(fileName)
        ) {
            throw new Error(`IDENTITY_RECAPTURE_PATH_INVALID:${kind}`);
        }

        const url = safeText(reference.url, 2200);
        if (!url) throw new Error(`IDENTITY_RECAPTURE_URL_REQUIRED:${kind}`);

        normalized[kind] = {
            storage_path: storagePath,
            url,
            storage_kind: config.storageKind,
            profile_field: config.profileField
        };
    }
    return normalized;
}

function applyRecaptureEvidenceToProfile(profile = {}, recapture = {}) {
    const next = {
        ...profile,
        documentos: {
            ...(profile.documentos || {})
        }
    };

    for (const [kind, reference] of Object.entries(recapture)) {
        if (kind === "selfie_front") next.foto_perfil = reference;
        if (kind === "ine_front") next.documentos.ine = reference;
        if (kind === "ine_back") next.documentos.ine_reverso = reference;
        if (kind === "selfie_left") next.documentos.selfie_liveness_left = reference;
        if (kind === "selfie_right") next.documentos.selfie_liveness_right = reference;
    }
    return next;
}

function recaptureProfilePatch(recapture = {}) {
    const patch = {};
    for (const [kind, reference] of Object.entries(recapture)) {
        const url = reference.url;
        if (kind === "selfie_front") patch.foto_perfil = url;
        if (kind === "ine_front") patch["documentos.ine"] = url;
        if (kind === "ine_back") patch["documentos.ine_reverso"] = url;
        if (kind === "selfie_left") patch["documentos.selfie_liveness_left"] = url;
        if (kind === "selfie_right") patch["documentos.selfie_liveness_right"] = url;
    }
    return patch;
}

const CUSTOMER_IDENTITY_EVIDENCE_KINDS = Object.freeze([
    "selfie_front",
    "ine_front",
    "ine_back"
]);

const TECHNICIAN_IDENTITY_EVIDENCE_KINDS = Object.freeze([
    "selfie_front",
    "ine_front",
    "ine_back"
]);

function identityEvidenceKindsForRole(role) {
    return role === "cliente"
        ? [...CUSTOMER_IDENTITY_EVIDENCE_KINDS]
        : [...TECHNICIAN_IDENTITY_EVIDENCE_KINDS];
}

async function verifyIdentityStorage({ bucket, uid, profile, role = "tecnico" }) {
    const allReferences = {
        selfie_front: profile.foto_perfil,
        ine_front: profile.documentos?.ine,
        ine_back: profile.documentos?.ine_reverso,
        selfie_left: profile.documentos?.selfie_liveness_left,
        selfie_right: profile.documentos?.selfie_liveness_right
    };
    const references = Object.fromEntries(
        identityEvidenceKindsForRole(role).map(kind => [kind, allReferences[kind]])
    );
    const verified = {};
    for (const [kind, reference] of Object.entries(references)) {
        const storagePath = referenceStoragePath(reference, bucket.name, uid, kind);
        let metadata;
        try { [metadata] = await bucket.file(storagePath).getMetadata(); }
        catch { throw new Error(`IDENTITY_STORAGE_OBJECT_UNAVAILABLE:${kind}`); }
        if (!metadata?.generation ||
            metadata.contentType !== "image/jpeg" ||
            !(Number(metadata.size) >= 16 * 1024 && Number(metadata.size) <= 10 * 1024 * 1024)) {
            throw new Error(`IDENTITY_STORAGE_OBJECT_INVALID:${kind}`);
        }
        verified[kind] = {
            storage_path: storagePath,
            generation: String(metadata.generation),
            content_type: metadata.contentType,
            size: Number(metadata.size),
            md5_hash: metadata.md5Hash || null
        };
    }
    return verified;
}

async function downloadIdentityBuffers(bucket, verified) {
    const result = {};
    for (const [kind, evidence] of Object.entries(verified)) {
        const [buffer] = await bucket.file(evidence.storage_path).download();
        if (!Buffer.isBuffer(buffer) || buffer.length < 16 * 1024) {
            throw new Error(`IDENTITY_DOWNLOAD_INVALID:${kind}`);
        }
        result[kind] = buffer;
    }
    return result;
}

async function createHumanBiometricRuntime() {
    if (!runtimePromise) {
        runtimePromise = (async () => {
            const fs = require("node:fs");
            const { fileURLToPath } = require("node:url");
            const tf = require("@tensorflow/tfjs-core");
            require("@tensorflow/tfjs-converter");
            require("@tensorflow/tfjs-backend-cpu");
            require("@tensorflow/tfjs-backend-wasm");
            const jpeg = require("jpeg-js");
            const humanMainEntry = require.resolve("@vladmandic/human");
            const humanDist = path.dirname(humanMainEntry);
            const humanWasmEntry = path.join(humanDist, "human.node-wasm.js");
            const HumanModule = require(humanWasmEntry);
            const Human = HumanModule.default || HumanModule.Human || HumanModule;
            const humanRoot = path.resolve(humanDist, "..");
            const modelBasePath = `file://${path.join(humanRoot, "models").replace(/\\/g, "/")}/`;

            const nativeFetch = globalThis.fetch;
            globalThis.fetch = async (resource, init) => {
                const url = typeof resource === "string" ? resource : resource?.url;
                if (url?.startsWith("file://")) {
                    const filePath = fileURLToPath(url);
                    const data = await fs.promises.readFile(filePath);
                    const contentType = filePath.endsWith(".json") ? "application/json" : "application/octet-stream";
                    return new Response(data, { status: 200, headers: { "content-type": contentType } });
                }
                return nativeFetch(resource, init);
            };

            await tf.setBackend("cpu");
            await tf.ready();
            HumanModule.env?.updateBackend?.();

            const human = new Human({
                backend: "cpu",
                modelBasePath,
                cacheSensitivity: 0,
                debug: false,
                async: false,
                softwareKernels: true,
                filter: { enabled: false },
                gesture: { enabled: false },
                face: {
                    enabled: true,
                    detector: {
                        enabled: true,
                        rotation: true,
                        maxDetected: 2,
                        minConfidence: 0.35,
                        return: false
                    },
                    mesh: { enabled: true },
                    iris: { enabled: false },
                    description: { enabled: true, minConfidence: 0.10 },
                    emotion: { enabled: false },
                    antispoof: { enabled: true },
                    liveness: { enabled: true }
                },
                body: { enabled: false },
                hand: { enabled: false },
                object: { enabled: false },
                segmentation: { enabled: false }
            });
            await human.load();

            const analyze = async buffer => {
                const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
                if (!decoded?.width || !decoded?.height || !decoded?.data) {
                    throw new Error("IDENTITY_JPEG_DECODE_FAILED");
                }
                const rgb = new Uint8Array(decoded.width * decoded.height * 3);
                for (let src = 0, dst = 0; src < decoded.data.length; src += 4) {
                    rgb[dst++] = decoded.data[src];
                    rgb[dst++] = decoded.data[src + 1];
                    rgb[dst++] = decoded.data[src + 2];
                }
                const tensor = tf.tensor3d(rgb, [decoded.height, decoded.width, 3], "int32");
                try {
                    const result = await human.detect(tensor);
                    const faces = Array.isArray(result?.face) ? result.face : [];
                    return {
                        faceCount: faces.length,
                        faces: faces.map(face => ({
                            faceScore: Number(face.faceScore || face.boxScore || 0),
                            real: Number(face.real || 0),
                            live: Number(face.live || 0),
                            yaw: Number(face.rotation?.angle?.yaw || 0),
                            pitch: Number(face.rotation?.angle?.pitch || 0),
                            roll: Number(face.rotation?.angle?.roll || 0),
                            embedding: Array.isArray(face.embedding) ? face.embedding.map(Number) : []
                        }))
                    };
                } finally {
                    tensor.dispose();
                }
            };

            return {
                analyze,
                similarity: (left, right) => human.match.similarity(left, right, {
                    order: 2,
                    multiplier: 25,
                    min: 0.2,
                    max: 0.8
                })
            };
        })().catch(error => {
            runtimePromise = null;
            throw error;
        });
    }
    return runtimePromise;
}

function primaryFace(analysis, kind, { requireLive = false } = {}) {
    if (!analysis || analysis.faceCount !== 1 || !analysis.faces?.[0]) {
        return { ok: false, reasons: [`FACE_COUNT_INVALID:${kind}`] };
    }
    const face = analysis.faces[0];
    const reasons = [];
    if (face.faceScore < THRESHOLDS.faceConfidence) reasons.push(`FACE_CONFIDENCE_LOW:${kind}`);
    if (!Array.isArray(face.embedding) || face.embedding.length < 128) reasons.push(`FACE_EMBEDDING_MISSING:${kind}`);
    if (requireLive && face.real < THRESHOLDS.antispoof) reasons.push(`FACE_ANTISPOOF_LOW:${kind}`);
    if (requireLive && face.live < THRESHOLDS.liveness) reasons.push(`FACE_LIVENESS_LOW:${kind}`);
    return { ok: reasons.length === 0, reasons, face };
}

function biometricQualityMetrics(quality = {}) {
    const front = quality.selfie_front || {};
    const left = quality.selfie_left || {};
    const right = quality.selfie_right || {};
    return {
        selfie_front_real: roundScore(front.real),
        selfie_front_live: roundScore(front.live),
        selfie_left_real: roundScore(left.real),
        selfie_left_live: roundScore(left.live),
        selfie_right_real: roundScore(right.real),
        selfie_right_live: roundScore(right.live),
        yaw_front_deg: roundScore(radiansToDegrees(front.yaw)),
        yaw_left_deg: roundScore(radiansToDegrees(left.yaw)),
        yaw_right_deg: roundScore(radiansToDegrees(right.yaw))
    };
}

function assessCustomerIdentityAnalyses({ analyses, similarity }) {
    const reasons = [];
    const quality = {};

    for (const kind of ["ine_front", "selfie_front"]) {
        const checked = primaryFace(analyses[kind], kind, { requireLive: false });
        quality[kind] = checked.face || null;
        reasons.push(...checked.reasons);
    }

    const qualityMetrics = biometricQualityMetrics(quality);
    if (reasons.length) {
        return { status: "review_required", reasons, quality, metrics: qualityMetrics };
    }

    const front = quality.selfie_front;
    const ine = quality.ine_front;
    const idMatch = similarity(front.embedding, ine.embedding);
    if (idMatch < THRESHOLDS.idDocumentMatch) reasons.push("SELFIE_INE_FACE_MISMATCH");

    const yawFront = radiansToDegrees(front.yaw);
    if (Math.abs(yawFront) > THRESHOLDS.frontYawMaxDeg) reasons.push("SELFIE_FRONT_NOT_CENTERED");

    return {
        status: reasons.length ? "review_required" : "verified",
        reasons,
        embedding: front.embedding,
        metrics: {
            selfie_ine_similarity: roundScore(idMatch),
            ...qualityMetrics
        }
    };
}

function assessIdentityAnalyses({ analyses, hashes, similarity }) {
    const reasons = [];
    const quality = {};
    // Human real/live are evaluated on the centered frontal frame.
    // Side frames are active liveness challenges: same person, opposite yaw and distinct bytes.
    for (const [kind, requireLive] of [
        ["ine_front", false],
        ["selfie_front", true],
        ["selfie_left", false],
        ["selfie_right", false]
    ]) {
        const checked = primaryFace(analyses[kind], kind, { requireLive });
        quality[kind] = checked.face || null;
        reasons.push(...checked.reasons);
    }
    const qualityMetrics = biometricQualityMetrics(quality);
    if (reasons.length) {
        return { status: "review_required", reasons, quality, metrics: qualityMetrics };
    }

    const front = quality.selfie_front;
    const left = quality.selfie_left;
    const right = quality.selfie_right;
    const ine = quality.ine_front;

    const sameLeft = similarity(front.embedding, left.embedding);
    const sameRight = similarity(front.embedding, right.embedding);
    const idMatch = similarity(front.embedding, ine.embedding);

    if (sameLeft < THRESHOLDS.sameCapturePerson) reasons.push("LIVENESS_LEFT_IDENTITY_MISMATCH");
    if (sameRight < THRESHOLDS.sameCapturePerson) reasons.push("LIVENESS_RIGHT_IDENTITY_MISMATCH");
    if (idMatch < THRESHOLDS.idDocumentMatch) reasons.push("SELFIE_INE_FACE_MISMATCH");

    const yawFront = radiansToDegrees(front.yaw);
    const yawLeft = radiansToDegrees(left.yaw);
    const yawRight = radiansToDegrees(right.yaw);
    if (Math.abs(yawFront) > THRESHOLDS.frontYawMaxDeg) reasons.push("SELFIE_FRONT_NOT_CENTERED");
    if (Math.abs(yawLeft) < THRESHOLDS.sideYawMinDeg || Math.abs(yawRight) < THRESHOLDS.sideYawMinDeg) {
        reasons.push("LIVENESS_HEAD_TURN_TOO_SMALL");
    }
    if (Math.sign(yawLeft) === Math.sign(yawRight) || Math.sign(yawLeft) === 0 || Math.sign(yawRight) === 0) {
        reasons.push("LIVENESS_HEAD_TURNS_NOT_OPPOSITE");
    }

    const selfieHashes = [hashes.selfie_front, hashes.selfie_left, hashes.selfie_right];
    if (new Set(selfieHashes).size !== selfieHashes.length) reasons.push("LIVENESS_DUPLICATE_FRAME");

    return {
        status: reasons.length ? "review_required" : "verified",
        reasons,
        embedding: front.embedding,
        metrics: {
            selfie_ine_similarity: roundScore(idMatch),
            liveness_left_similarity: roundScore(sameLeft),
            liveness_right_similarity: roundScore(sameRight),
            ...qualityMetrics
        }
    };
}

function bestRegistryMatch(registryDocs, embedding, similarity, uid) {
    let best = null;
    for (const snapshot of registryDocs) {
        if (snapshot.id === uid) continue;
        const data = snapshot.data ? snapshot.data() : snapshot;
        if (!["active", "pending_admin_review"].includes(data?.status)) continue;
        if (!Array.isArray(data?.embedding) || data.embedding.length !== embedding.length) continue;
        const score = similarity(embedding, data.embedding);
        if (!best || score > best.similarity) {
            best = { uid: snapshot.id || data.uid, similarity: score };
        }
    }
    return best;
}

function createVerifyB2cIdentityHandler({
    admin,
    db,
    functions,
    bucket,
    runtimeFactory = createHumanBiometricRuntime,
    now = () => admin.firestore.FieldValue.serverTimestamp()
}) {
    if (!admin || !db || !functions) throw new Error("B2C_BIOMETRIC_DEPENDENCIES_REQUIRED");
    return async (data, context) => {
        const uid = context?.auth?.uid;
        if (!uid) throw new functions.https.HttpsError("unauthenticated", "Se requiere sesión para verificar identidad.");
        const profileRef = db.collection("users").doc(uid);
        const profileSnapshot = await profileRef.get();
        if (!profileSnapshot.exists) throw new functions.https.HttpsError("failed-precondition", "Perfil B2C no disponible.");
        const profile = profileSnapshot.data() || {};
        const role = safeText(profile.rol || profile.role, 40).toLowerCase();
        if (profile.tipo_cuenta !== "B2C" || !["cliente", "tecnico"].includes(role)) {
            throw new functions.https.HttpsError("failed-precondition", "La biometría sólo aplica a altas B2C.");
        }
        if (profile.kyc?.identity_required !== true) {
            return { ok: true, status: "not_required", identityVersion: IDENTITY_CAPTURE_VERSION };
        }
        if (profile.kyc?.identity_machine_verified === true && profile.kyc?.identity_machine_status === "verified") {
            return { ok: true, status: "verified", replay: true, identityVersion: IDENTITY_CAPTURE_VERSION };
        }

        const storageBucket = bucket || admin.storage().bucket("fixgo-44e4d.firebasestorage.app");
        let recaptureEvidence = {};
        let verificationProfile = profile;
        try {
            recaptureEvidence = normalizeRecaptureEvidence(data?.recaptureEvidence, {
                uid,
                bucketName: storageBucket.name
            });
            const allowedKinds = new Set(identityEvidenceKindsForRole(role));
            recaptureEvidence = Object.fromEntries(
                Object.entries(recaptureEvidence).filter(([kind]) => allowedKinds.has(kind))
            );
            verificationProfile = applyRecaptureEvidenceToProfile(profile, recaptureEvidence);
        } catch (error) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "La evidencia de recaptura no es válida.",
                { reason: safeText(error.message, 160) }
            );
        }

        let verified;
        let buffers;
        try {
            verified = await verifyIdentityStorage({
                bucket: storageBucket,
                uid,
                profile: verificationProfile,
                role
            });
            buffers = await downloadIdentityBuffers(storageBucket, verified);
        } catch (error) {
            await profileRef.set({
                disponible: false,
                "kyc.identity_machine_verified": false,
                "kyc.identity_machine_status": "review_required",
                "kyc.identity_machine_reasons": [safeText(error.message, 160)],
                "kyc.identity_machine_checked_at": now()
            }, { merge: true });
            return { ok: true, status: "review_required", reasons: [safeText(error.message, 160)] };
        }

        const digest = captureDigest(buffers);
        const attemptsRef = db.collection("b2c_identity_attempts").doc(uid);
        const attemptNowMs = Date.now();
        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(attemptsRef);
            const state = snapshot.exists ? snapshot.data() || {} : {};
            const decision = evaluateIdentityAttemptState(state, {
                nowMs: attemptNowMs,
                digest
            });

            if (!decision.allowed) {
                if (decision.reason === "cooldown") {
                    throw new functions.https.HttpsError(
                        "resource-exhausted",
                        "Espera unos segundos antes de repetir la verificación.",
                        {
                            reason: decision.reason,
                            retryAfterMs: decision.retryAfterMs
                        }
                    );
                }
                if (decision.reason === "same_capture_limit") {
                    throw new functions.https.HttpsError(
                        "resource-exhausted",
                        "Estas mismas evidencias ya se verificaron varias veces. Recaptura las tomas indicadas.",
                        {
                            reason: decision.reason,
                            retryAfterMs: 0
                        }
                    );
                }
                throw new functions.https.HttpsError(
                    "resource-exhausted",
                    "Límite temporal de recapturas alcanzado. Intenta más tarde.",
                    {
                        reason: decision.reason,
                        retryAfterMs: decision.retryAfterMs
                    }
                );
            }

            transaction.set(attemptsRef, {
                uid,
                ...decision.patch,
                updated_at: now()
            }, { merge: true });
        });

        let runtime;
        let assessment;
        try {
            runtime = await runtimeFactory();
            const analyses = {};
            for (const kind of ["ine_front", "selfie_front"]) {
                analyses[kind] = await runtime.analyze(buffers[kind]);
            }
            assessment = assessCustomerIdentityAnalyses({
                analyses,
                similarity: runtime.similarity
            });
        } catch (error) {
            console.error("[B2C_BIOMETRIC_ENGINE_FAILED]", { uid, code: safeText(error.code || error.message, 160) });
            assessment = { status: "review_required", reasons: ["BIOMETRIC_ENGINE_UNAVAILABLE"], metrics: {} };
        }

        const registryRef = db.collection("b2c_identity_registry").doc(uid);
        const auditRef = db.collection("b2c_identity_audit").doc();
        const result = await db.runTransaction(async transaction => {
            const [freshProfileSnapshot, registrySnapshot] = await Promise.all([
                transaction.get(profileRef),
                transaction.get(db.collection("b2c_identity_registry").limit(REGISTRY_LIMIT + 1))
            ]);
            if (!freshProfileSnapshot.exists) throw new functions.https.HttpsError("failed-precondition", "Perfil desapareció durante verificación.");
            if (registrySnapshot.size > REGISTRY_LIMIT) {
                transaction.set(auditRef, {
                    uid,
                    role,
                    status: "review_required",
                    reasons: ["IDENTITY_REGISTRY_CAPACITY_REVIEW_REQUIRED"],
                    engine_version: BIOMETRIC_ENGINE_VERSION,
                    created_at: now()
                });
                transaction.set(profileRef, {
                    disponible: false,
                    "kyc.identity_machine_verified": false,
                    "kyc.identity_machine_status": "review_required",
                    "kyc.identity_machine_reasons": ["IDENTITY_REGISTRY_CAPACITY_REVIEW_REQUIRED"],
                    "kyc.identity_machine_checked_at": now()
                }, { merge: true });
                return { status: "review_required", reasons: ["IDENTITY_REGISTRY_CAPACITY_REVIEW_REQUIRED"] };
            }

            let status = assessment.status;
            const reasons = [...(assessment.reasons || [])];
            let duplicate = null;
            if (status === "verified") {
                duplicate = bestRegistryMatch(registrySnapshot.docs, assessment.embedding, runtime.similarity, uid);
                if (duplicate?.similarity >= THRESHOLDS.duplicateSuspected) {
                    status = "duplicate_suspected";
                    reasons.push("IDENTITY_DUPLICATE_SUSPECTED");
                } else if (duplicate?.similarity >= THRESHOLDS.duplicateReview) {
                    status = "review_required";
                    reasons.push("IDENTITY_SIMILARITY_REVIEW_REQUIRED");
                }
            }

            const timestamp = now();
            const promotedRecapturePatch =
                status === "verified"
                    ? recaptureProfilePatch(recaptureEvidence)
                    : {};
            const publicPatch = {
                disponible: false,
                ...promotedRecapturePatch,
                "kyc.identity_machine_status": status,
                "kyc.identity_machine_verified": status === "verified",
                "kyc.identity_machine_reasons": reasons,
                "kyc.identity_machine_metrics": assessment.metrics || {},
                "kyc.identity_machine_checked_at": timestamp,
                "kyc.identity_capture_digest": digest,
                "kyc.identity_capture_status": Object.keys(recaptureEvidence).length > 0
                    ? (
                        status === "verified"
                            ? "recaptured_verified"
                            : status === "duplicate_suspected"
                                ? "recaptured_duplicate_review"
                                : "recaptured_review_required"
                    )
                    : profile.kyc?.identity_capture_status || "captured_pending_verification",
                "kyc.identity_capture_completed_at": Object.keys(recaptureEvidence).length > 0
                    ? timestamp
                    : profile.kyc?.identity_capture_completed_at || timestamp,
                "kyc.identity_engine_version": BIOMETRIC_ENGINE_VERSION
            };

            if (status === "verified") {
                transaction.set(registryRef, {
                    uid,
                    role,
                    status: role === "cliente" ? "active" : "pending_admin_review",
                    embedding: assessment.embedding,
                    capture_digest: digest,
                    engine_version: BIOMETRIC_ENGINE_VERSION,
                    identity_version: IDENTITY_CAPTURE_VERSION,
                    created_at: timestamp,
                    updated_at: timestamp
                }, { merge: true });
                if (role === "cliente") {
                    publicPatch.estado = "activo";
                    publicPatch.status = "activo";
                    publicPatch["kyc.estado"] = "activo";
                    publicPatch["kyc.identity_verified"] = true;
                    publicPatch["kyc.identity_verified_at"] = timestamp;
                    publicPatch["kyc.identity_verification_method"] = `${BIOMETRIC_ENGINE_VERSION}:automatic`;
                }
            } else {
                publicPatch.estado = role === "cliente" ? "identidad_revision" : "rechazado";
                publicPatch.status = publicPatch.estado;
                publicPatch["kyc.estado"] = publicPatch.estado;
                publicPatch["kyc.identity_verified"] = false;
                publicPatch["kyc.identity_duplicate_suspected"] = status === "duplicate_suspected";
            }

            transaction.set(profileRef, publicPatch, { merge: true });
            transaction.set(auditRef, {
                uid,
                role,
                status,
                reasons,
                metrics: assessment.metrics || {},
                capture_digest: digest,
                recapture_paths: Object.fromEntries(
                    Object.entries(recaptureEvidence).map(([kind, reference]) => [kind, reference.storage_path])
                ),
                duplicate_similarity: duplicate ? roundScore(duplicate.similarity) : null,
                duplicate_candidate_hash: duplicate ? crypto.createHash("sha256").update(String(duplicate.uid)).digest("hex") : null,
                engine_version: BIOMETRIC_ENGINE_VERSION,
                identity_version: IDENTITY_CAPTURE_VERSION,
                created_at: timestamp
            });

            return { status, reasons, metrics: assessment.metrics || {} };
        });

        return {
            ok: true,
            status: result.status,
            reasons: result.reasons,
            metrics: result.metrics,
            identityVersion: IDENTITY_CAPTURE_VERSION,
            engineVersion: BIOMETRIC_ENGINE_VERSION
        };
    };
}

module.exports = {
    BIOMETRIC_ENGINE_VERSION,
    IDENTITY_CAPTURE_VERSION,
    IDENTITY_ATTEMPT_POLICY_VERSION,
    REGISTRY_LIMIT,
    THRESHOLDS,
    CUSTOMER_IDENTITY_EVIDENCE_KINDS,
    TECHNICIAN_IDENTITY_EVIDENCE_KINDS,
    identityEvidenceKindsForRole,
    assessCustomerIdentityAnalyses,
    assessIdentityAnalyses,
    bestRegistryMatch,
    captureDigest,
    evaluateIdentityAttemptState,
    normalizeRecaptureEvidence,
    applyRecaptureEvidenceToProfile,
    recaptureProfilePatch,
    createHumanBiometricRuntime,
    createVerifyB2cIdentityHandler,
    verifyIdentityStorage
};
