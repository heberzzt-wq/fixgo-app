
"use strict";

/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 — REPO WRITE IDEMPOTENCY V1
 * ======================================================================================
 *
 * Responsabilidad:
 * - Crear una identidad determinista para cada escritura.
 * - Evitar que una misma llave procese payloads diferentes.
 * - Bloquear ejecuciones concurrentes.
 * - Conservar el resultado exitoso para responder reintentos.
 * - Permitir recuperar intentos fallidos o leases vencidos.
 *
 * No ejecuta llamadas a GitHub.
 * ======================================================================================
 */

const IDEMPOTENCY_COLLECTION =
    "repo_write_idempotency";

const PROCESSING_LEASE_MS =
    150000;

const MAX_IDEMPOTENCY_KEY_LENGTH =
    240;

function normalizeString(
    value
) {

    return typeof value === "string"
        ? value.trim()
        : "";
}

function serializeError(
    error
) {

    return {
        message:
            error?.message ||
            "UNKNOWN_REPO_WRITE_ERROR",

        code:
            error?.code ||
            null,

        status:
            error?.status ||
            null
    };
}

module.exports = ({
    admin,
    db,
    crypto
}) => {

    if (
        !admin ||
        !db ||
        !crypto
    ) {

        throw new Error(
            "REPO_WRITE_IDEMPOTENCY_DEPENDENCIES_REQUIRED"
        );
    }

    const FieldValue =
        admin.firestore.FieldValue;

    function sha256(
        value
    ) {

        return crypto
            .createHash(
                "sha256"
            )
            .update(
                String(value),
                "utf8"
            )
            .digest(
                "hex"
            );
    }

    function buildRepoWriteIdentity({
        uid,
        idempotencyKey,
        path,
        content
    }) {

        const normalizedUid =
            normalizeString(
                uid
            );

        const normalizedKey =
            normalizeString(
                idempotencyKey
            );

        const normalizedPath =
            normalizeString(
                path
            );

        if (!normalizedUid) {

            return {
                ok:
                    false,

                httpStatus:
                    401,

                status:
                    "unauthenticated",

                reason:
                    "REPO_WRITE_UID_REQUIRED"
            };
        }

        if (!normalizedKey) {

            return {
                ok:
                    false,

                httpStatus:
                    400,

                status:
                    "invalid_request",

                reason:
                    "IDEMPOTENCY_KEY_REQUIRED"
            };
        }

        if (
            normalizedKey.length >
            MAX_IDEMPOTENCY_KEY_LENGTH
        ) {

            return {
                ok:
                    false,

                httpStatus:
                    400,

                status:
                    "invalid_request",

                reason:
                    "IDEMPOTENCY_KEY_TOO_LONG"
            };
        }

        if (!normalizedPath) {

            return {
                ok:
                    false,

                httpStatus:
                    400,

                status:
                    "invalid_request",

                reason:
                    "PATH_REQUIRED"
            };
        }

        if (
            typeof content !==
            "string"
        ) {

            return {
                ok:
                    false,

                httpStatus:
                    400,

                status:
                    "invalid_request",

                reason:
                    "CONTENT_REQUIRED"
            };
        }

        const contentHash =
            sha256(
                content
            );

        const fingerprint =
            sha256(
                [
                    normalizedUid,
                    normalizedPath,
                    contentHash
                ].join(
                    "\n"
                )
            );

        const documentId =
            sha256(
                [
                    normalizedUid,
                    normalizedKey
                ].join(
                    "\n"
                )
            );

        return {
            ok:
                true,

            uid:
                normalizedUid,

            idempotencyKey:
                normalizedKey,

            path:
                normalizedPath,

            contentHash,

            fingerprint,

            documentId
        };
    }

    async function claimRepoWrite({
        uid,
        role,
        tenantId,
        idempotencyKey,
        path,
        content
    }) {

        const identity =
            buildRepoWriteIdentity({
                uid,
                idempotencyKey,
                path,
                content
            });

        if (
            identity.ok !==
            true
        ) {

            return identity;
        }

        const documentReference =
            db
                .collection(
                    IDEMPOTENCY_COLLECTION
                )
                .doc(
                    identity.documentId
                );

        const leaseOwner =
            crypto.randomUUID();

        const now =
            Date.now();

        return db.runTransaction(
            async transaction => {

                const snapshot =
                    await transaction.get(
                        documentReference
                    );

                const existing =
                    snapshot.exists
                        ? snapshot.data()
                        : null;

                if (
                    existing &&
                    existing.fingerprint !==
                        identity.fingerprint
                ) {

                    return {
                        ok:
                            false,

                        httpStatus:
                            409,

                        status:
                            "conflict",

                        reason:
                            "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",

                        identity,

                        existingStatus:
                            existing.status ||
                            null
                    };
                }

                if (
                    existing?.status ===
                    "completed"
                ) {

                    return {
                        ok:
                            true,

                        replayed:
                            true,

                        identity,

                        documentReference,

                        result:
                            existing.result ||
                            null,

                        existing
                    };
                }

                const leaseExpiresAt =
                    Number(
                        existing
                            ?.lease_expires_at_ms ||
                        0
                    );

                if (
                    existing?.status ===
                        "processing" &&
                    leaseExpiresAt >
                        now
                ) {

                    return {
                        ok:
                            false,

                        httpStatus:
                            409,

                        status:
                            "processing",

                        reason:
                            "REPO_WRITE_ALREADY_PROCESSING",

                        retryAfterMs:
                            leaseExpiresAt -
                            now,

                        identity,

                        documentReference,

                        existing
                    };
                }

                const attempts =
                    Number(
                        existing?.attempts ||
                        0
                    ) + 1;

                const writeData = {
                    idempotency_key:
                        identity.idempotencyKey,

                    fingerprint:
                        identity.fingerprint,

                    content_hash:
                        identity.contentHash,

                    path:
                        identity.path,

                    uid:
                        identity.uid,

                    role:
                        normalizeString(
                            role
                        ) || null,

                    tenant_id:
                        normalizeString(
                            tenantId
                        ) || null,

                    status:
                        "processing",

                    lease_owner:
                        leaseOwner,

                    lease_expires_at_ms:
                        now +
                        PROCESSING_LEASE_MS,

                    attempts,

                    updated_at:
                        FieldValue.serverTimestamp()
                };

                if (!snapshot.exists) {

                    writeData.created_at =
                        FieldValue.serverTimestamp();
                }

                transaction.set(
                    documentReference,
                    writeData,
                    {
                        merge:
                            true
                    }
                );

                return {
                    ok:
                        true,

                    replayed:
                        false,

                    identity,

                    documentReference,

                    leaseOwner,

                    attempts
                };
            }
        );
    }

    async function completeRepoWrite({
        claim,
        result,
        recoveredByContent = false
    }) {

        if (
            !claim?.identity ||
            !claim?.documentReference
        ) {

            throw new Error(
                "VALID_REPO_WRITE_CLAIM_REQUIRED"
            );
        }

        const safeResult = {
            success:
                result?.success ===
                true,

            repo:
                result?.repo ||
                null,

            path:
                result?.path ||
                claim.identity.path,

            commit:
                result?.commit ||
                null,

            fileSha:
                result?.fileSha ||
                null,

            created:
                result?.created ===
                true,

            updated:
                result?.updated ===
                true,

            noChange:
                result?.noChange ===
                true,

            recoveredByContent:
                recoveredByContent ===
                true
        };

        await claim.documentReference.set(
            {
                status:
                    "completed",

                result:
                    safeResult,

                completed_at:
                    FieldValue.serverTimestamp(),

                updated_at:
                    FieldValue.serverTimestamp(),

                lease_owner:
                    FieldValue.delete(),

                lease_expires_at_ms:
                    FieldValue.delete(),

                last_error:
                    FieldValue.delete()
            },
            {
                merge:
                    true
            }
        );

        return safeResult;
    }

    async function failRepoWrite({
        claim,
        error
    }) {

        if (
            !claim?.identity ||
            !claim?.documentReference
        ) {

            return {
                ok:
                    false,

                reason:
                    "VALID_REPO_WRITE_CLAIM_REQUIRED"
            };
        }

        const safeError =
            serializeError(
                error
            );

        await claim.documentReference.set(
            {
                status:
                    "failed",

                last_error:
                    safeError,

                failed_at:
                    FieldValue.serverTimestamp(),

                updated_at:
                    FieldValue.serverTimestamp(),

                lease_owner:
                    FieldValue.delete(),

                lease_expires_at_ms:
                    FieldValue.delete()
            },
            {
                merge:
                    true
            }
        );

        return {
            ok:
                true,

            error:
                safeError
        };
    }

    return {
        buildRepoWriteIdentity,
        claimRepoWrite,
        completeRepoWrite,
        failRepoWrite,

        config: {
            collection:
                IDEMPOTENCY_COLLECTION,

            leaseMs:
                PROCESSING_LEASE_MS
        }
    };
};
