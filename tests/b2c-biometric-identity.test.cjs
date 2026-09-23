const test = require("node:test");
const assert = require("node:assert/strict");
const {
    THRESHOLDS,
    assessIdentityAnalyses,
    bestRegistryMatch,
    captureDigest,
    evaluateIdentityAttemptState,
    normalizeRecaptureEvidence,
    applyRecaptureEvidenceToProfile,
    recaptureProfilePatch
} = require("../functions/b2c-biometric-identity");

const embedding = value => Array.from({ length: 128 }, () => value);
const face = ({
    embeddingValue = 1,
    faceScore = 0.95,
    real = 0.95,
    live = 0.95,
    yaw = 0
} = {}) => ({
    faceCount: 1,
    faces: [{
        faceScore,
        real,
        live,
        yaw,
        pitch: 0,
        roll: 0,
        embedding: embedding(embeddingValue)
    }]
});

const similarity = (a, b) => {
    const delta = Math.abs(Number(a?.[0] || 0) - Number(b?.[0] || 0));
    return Math.max(0, 1 - delta);
};

function validAnalyses() {
    return {
        ine_front: face({ embeddingValue: 0.95 }),
        selfie_front: face({ embeddingValue: 1, yaw: 0 }),
        selfie_left: face({ embeddingValue: 0.98, yaw: -0.30 }),
        selfie_right: face({ embeddingValue: 0.97, yaw: 0.30 })
    };
}

test("biometric assessment verifies one live person matching INE with opposite head turns", () => {
    const result = assessIdentityAnalyses({
        analyses: validAnalyses(),
        hashes: {
            selfie_front: "a".repeat(64),
            selfie_left: "b".repeat(64),
            selfie_right: "c".repeat(64)
        },
        similarity
    });
    assert.equal(result.status, "verified");
    assert.deepEqual(result.reasons, []);
    assert.ok(result.metrics.selfie_ine_similarity >= THRESHOLDS.idDocumentMatch);
    assert.ok(result.metrics.selfie_front_live >= THRESHOLDS.liveness);
    assert.ok(result.metrics.selfie_front_real >= THRESHOLDS.antispoof);
});

test("low liveness, spoof signal, reused frame or selfie/INE mismatch fail closed to review", () => {
    const lowLive = validAnalyses();
    lowLive.selfie_front.faces[0].live = 0.2;
    const r1 = assessIdentityAnalyses({
        analyses: lowLive,
        hashes: { selfie_front: "a", selfie_left: "b", selfie_right: "c" },
        similarity
    });
    assert.equal(r1.status, "review_required");
    assert.ok(r1.reasons.includes("FACE_LIVENESS_LOW:selfie_front"));

    const spoof = validAnalyses();
    spoof.selfie_left.faces[0].real = 0.1;
    const r2 = assessIdentityAnalyses({
        analyses: spoof,
        hashes: { selfie_front: "a", selfie_left: "b", selfie_right: "c" },
        similarity
    });
    assert.equal(r2.status, "review_required");
    assert.ok(r2.reasons.includes("FACE_ANTISPOOF_LOW:selfie_left"));

    const mismatch = validAnalyses();
    mismatch.ine_front.faces[0].embedding = embedding(0.1);
    const r3 = assessIdentityAnalyses({
        analyses: mismatch,
        hashes: { selfie_front: "same", selfie_left: "same", selfie_right: "different" },
        similarity
    });
    assert.equal(r3.status, "review_required");
    assert.ok(r3.reasons.includes("SELFIE_INE_FACE_MISMATCH"));
    assert.ok(r3.reasons.includes("LIVENESS_DUPLICATE_FRAME"));
});

test("head-turn proof requires distinct opposing poses from same person", () => {
    const analyses = validAnalyses();
    analyses.selfie_left.faces[0].yaw = 0.03;
    analyses.selfie_right.faces[0].yaw = 0.04;
    const result = assessIdentityAnalyses({
        analyses,
        hashes: { selfie_front: "a", selfie_left: "b", selfie_right: "c" },
        similarity
    });
    assert.equal(result.status, "review_required");
    assert.ok(result.reasons.includes("LIVENESS_HEAD_TURN_TOO_SMALL"));
    assert.ok(result.reasons.includes("LIVENESS_HEAD_TURNS_NOT_OPPOSITE"));
});

test("1:N registry returns strongest eligible other identity and ignores same uid", () => {
    const docs = [
        { id: "self", data: () => ({ status: "active", embedding: embedding(1) }) },
        { id: "other-low", data: () => ({ status: "active", embedding: embedding(0.7) }) },
        { id: "other-high", data: () => ({ status: "pending_admin_review", embedding: embedding(0.95) }) },
        { id: "inactive", data: () => ({ status: "rejected", embedding: embedding(1) }) }
    ];
    const match = bestRegistryMatch(docs, embedding(1), similarity, "self");
    assert.equal(match.uid, "other-high");
    assert.equal(match.similarity, 0.95);
    assert.ok(match.similarity >= THRESHOLDS.duplicateSuspected);
});

test("capture digest is deterministic but changes with identity bytes", () => {
    const first = captureDigest({ selfie_front: Buffer.from("face-a"), ine_front: Buffer.from("ine-a") });
    const reordered = captureDigest({ ine_front: Buffer.from("ine-a"), selfie_front: Buffer.from("face-a") });
    const changed = captureDigest({ selfie_front: Buffer.from("face-b"), ine_front: Buffer.from("ine-a") });
    assert.equal(first, reordered);
    assert.notEqual(first, changed);
    assert.match(first, /^[a-f0-9]{64}$/);
});


test("biometric rate limit separates stale revalidation from fresh recapture", () => {
    const now = 1_000_000;
    const digestA = "a".repeat(64);
    const digestB = "b".repeat(64);

    const legacySaturated = {
        window_started_ms: now - 10_000,
        last_attempt_ms: now - 20_000,
        attempts: 5
    };
    const migratedFresh = evaluateIdentityAttemptState(legacySaturated, {
        nowMs: now,
        digest: digestB
    });
    assert.equal(migratedFresh.allowed, true);
    assert.equal(migratedFresh.sameCapture, false);
    assert.equal(migratedFresh.patch.fresh_capture_attempts, 1);
    assert.equal(migratedFresh.patch.same_capture_attempts, 1);

    const sameTwice = {
        window_started_ms: now - 50_000,
        last_attempt_ms: now - 20_000,
        last_capture_digest: digestA,
        fresh_capture_attempts: 1,
        same_capture_attempts: 2,
        attempts: 2
    };
    const staleBlocked = evaluateIdentityAttemptState(sameTwice, {
        nowMs: now,
        digest: digestA
    });
    assert.equal(staleBlocked.allowed, false);
    assert.equal(staleBlocked.reason, "same_capture_limit");

    const newCapture = evaluateIdentityAttemptState(sameTwice, {
        nowMs: now,
        digest: digestB
    });
    assert.equal(newCapture.allowed, true);
    assert.equal(newCapture.patch.fresh_capture_attempts, 2);
    assert.equal(newCapture.patch.same_capture_attempts, 1);
});

test("biometric fresh recapture limit remains bounded per hour", () => {
    const now = 2_000_000;
    const state = {
        window_started_ms: now - 30_000,
        last_attempt_ms: now - 20_000,
        last_capture_digest: "a".repeat(64),
        fresh_capture_attempts: 5,
        same_capture_attempts: 1,
        attempts: 9
    };
    const result = evaluateIdentityAttemptState(state, {
        nowMs: now,
        digest: "b".repeat(64)
    });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "fresh_capture_limit");
    assert.ok(result.retryAfterMs > 0);
});


test("release gate lets fresh recapture continue while stale evidence remains bounded", () => {
    const now = 3_000_000;
    const oldDigest = "c".repeat(64);
    const newDigest = "d".repeat(64);
    const saturatedLegacy = {
        window_started_ms: now - 10_000,
        last_attempt_ms: now - 20_000,
        attempts: 5,
        last_capture_digest: oldDigest,
        fresh_capture_attempts: 1,
        same_capture_attempts: 2
    };
    assert.equal(
        evaluateIdentityAttemptState(saturatedLegacy, { nowMs: now, digest: oldDigest }).reason,
        "same_capture_limit"
    );
    assert.equal(
        evaluateIdentityAttemptState(saturatedLegacy, { nowMs: now, digest: newDigest }).allowed,
        true
    );
});


test("immutable biometric recapture paths are owner-confined and map to canonical profile fields", () => {
    const uid = "owner-1";
    const bucketName = "fixgo-44e4d.firebasestorage.app";
    const leftPath = `expedientes/${uid}/recaptures/selfie_liveness_left/capture-12345678-left.jpg`;
    const normalized = normalizeRecaptureEvidence({
        selfie_left: {
            storage_path: leftPath,
            url: `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(leftPath)}?alt=media&token=test-token`
        }
    }, { uid, bucketName });

    assert.equal(normalized.selfie_left.storage_path, leftPath);
    const profile = applyRecaptureEvidenceToProfile({
        foto_perfil: "front",
        documentos: { selfie_liveness_left: "old-left", selfie_liveness_right: "old-right" }
    }, normalized);
    assert.equal(profile.documentos.selfie_liveness_left.storage_path, leftPath);
    assert.equal(profile.documentos.selfie_liveness_right, "old-right");

    const patch = recaptureProfilePatch(normalized);
    assert.match(patch["documentos.selfie_liveness_left"], /firebasestorage\.googleapis\.com/);

    assert.throws(
        () => normalizeRecaptureEvidence({
            selfie_left: {
                storage_path: "expedientes/other/recaptures/selfie_liveness_left/capture-12345678-left.jpg",
                url: "https://example.com/not-valid"
            }
        }, { uid, bucketName }),
        /IDENTITY_STORAGE_OWNER_MISMATCH|IDENTITY_STORAGE_REFERENCE_INVALID|IDENTITY_RECAPTURE/
    );
    assert.throws(
        () => normalizeRecaptureEvidence({
            selfie_left: {
                storage_path: `expedientes/${uid}/selfie_liveness_left/current.jpg`,
                url: "https://example.com/not-valid"
            }
        }, { uid, bucketName }),
        /IDENTITY_RECAPTURE/
    );
});
