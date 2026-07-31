/**
 * ======================================================================================
 * B2C EVIDENCE FIRESTORE REGISTRY 2026
 * Archivo: b2c-evidence-firestore.js
 * Rol: Persistencia transaccional de huellas y auditoría antifraude B2C.
 *
 * PRINCIPIOS:
 * - El SHA-256 se reserva globalmente en una transacción antes de subir el archivo.
 * - Un mismo folio puede reintentar la misma evidencia por fallas de red.
 * - Otro folio no puede apropiarse de una huella ya reservada o confirmada.
 * - El dHash es una señal preventiva; una coincidencia visual exige retoma o revisión.
 * - Toda decisión genera auditoría con hora de servidor.
 * - Este módulo no cambia estados del servicio ni ejecuta cobros.
 * ======================================================================================
 */

import {
    db,
    doc,
    collection,
    getDoc,
    getDocs,
    query,
    where,
    limit,
    serverTimestamp
} from "./firebase.js";

import {
    runTransaction,
    increment
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    DEFAULT_DEDUP_POLICY,
    crearIdRegistroHash,
    crearRegistroHuella,
    evaluarReutilizacion,
    crearEventoAuditoriaDuplicado
} from "./b2c-evidence-dedup.js";

export const B2C_EVIDENCE_FIRESTORE_VERSION = "1.0.1";

export const B2C_EVIDENCE_COLLECTIONS = Object.freeze({
    exactHashes: "b2c_evidence_hashes",
    perceptualFingerprints: "b2c_evidence_fingerprints",
    audit: "b2c_evidence_audit"
});

function textoSeguro(value, maxLength = 200) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function normalizarSha256(value) {
    const normalized = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-f0-9]/g, "");

    return normalized.length === 64
        ? normalized
        : null;
}

function normalizarLimite(value, fallback = 100, max = 200) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.min(parsed, max);
}

function esObjetoPlano(value) {
    if (!value || Object.prototype.toString.call(value) !== "[object Object]") {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function limpiarUndefined(value) {
    if (Array.isArray(value)) {
        return value
            .map(limpiarUndefined)
            .filter((item) => item !== undefined);
    }

    // Los FieldValue de Firestore (serverTimestamp, increment, etc.) son objetos
    // con prototipo propio. Deben conservarse intactos y no convertirse a objetos planos.
    if (esObjetoPlano(value)) {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, item]) => item !== undefined)
                .map(([key, item]) => [key, limpiarUndefined(item)])
        );
    }

    return value;
}

function referenciaHashExacto(sha256) {
    const normalized = normalizarSha256(sha256);

    if (!normalized) {
        throw new TypeError("SHA-256 inválido para consultar el registro antifraude.");
    }

    return doc(
        db,
        B2C_EVIDENCE_COLLECTIONS.exactHashes,
        crearIdRegistroHash(normalized)
    );
}

function referenciaAuditoriaNueva() {
    return doc(
        collection(
            db,
            B2C_EVIDENCE_COLLECTIONS.audit
        )
    );
}

function referenciaHuellaPerceptualNueva() {
    return doc(
        collection(
            db,
            B2C_EVIDENCE_COLLECTIONS.perceptualFingerprints
        )
    );
}

function datosDocumento(snapshot) {
    if (!snapshot?.exists?.()) return null;

    return {
        id: snapshot.id,
        ...snapshot.data()
    };
}

function construirAuditoria({
    result,
    fingerprint,
    serviceId,
    technicianId,
    evidenceId,
    eventType,
    phase = "pre_upload"
}) {
    const base = crearEventoAuditoriaDuplicado({
        result,
        currentServiceId: serviceId,
        currentTechnicianId: technicianId,
        evidenceId,
        eventType,
        fingerprint
    });

    return limpiarUndefined({
        ...base,
        phase: textoSeguro(phase, 80),
        registryVersion: B2C_EVIDENCE_FIRESTORE_VERSION,
        checkedAtServer: serverTimestamp()
    });
}

/**
 * Lee la reserva exacta, si existe.
 * Esta lectura es informativa; la decisión definitiva se repite dentro de la transacción.
 */
export async function leerRegistroHashExacto(fingerprintOrSha256) {
    const sha256 = typeof fingerprintOrSha256 === "string"
        ? fingerprintOrSha256
        : fingerprintOrSha256?.sha256;

    const snapshot = await getDoc(
        referenciaHashExacto(sha256)
    );

    return datosDocumento(snapshot);
}

/**
 * Recupera candidatos perceptuales del mismo técnico.
 * No ordena por fecha para evitar depender inicialmente de un índice compuesto.
 */
export async function listarCandidatosPerceptuales({
    technicianId,
    maxCandidates = DEFAULT_DEDUP_POLICY.maxCandidates
} = {}) {
    const safeTechnicianId = textoSeguro(technicianId, 128);

    if (!safeTechnicianId) {
        throw new TypeError("technicianId es obligatorio para buscar evidencias anteriores.");
    }

    const resolvedLimit = normalizarLimite(
        maxCandidates,
        DEFAULT_DEDUP_POLICY.maxCandidates,
        200
    );

    const candidatesQuery = query(
        collection(
            db,
            B2C_EVIDENCE_COLLECTIONS.perceptualFingerprints
        ),
        where("technicianId", "==", safeTechnicianId),
        limit(resolvedLimit)
    );

    const snapshot = await getDocs(candidatesQuery);

    return snapshot.docs
        .map((item) => ({
            id: item.id,
            ...item.data()
        }))
        .filter((item) => item.active !== false);
}

/**
 * Ejecuta la revisión previa contra el registro remoto.
 * La verificación exacta se repetirá dentro de reservarHuellaEvidenciaAtomica().
 */
export async function evaluarEvidenciaRegistrada({
    fingerprint,
    serviceId,
    technicianId,
    policy = {}
} = {}) {
    if (!fingerprint?.sha256) {
        throw new TypeError("fingerprint.sha256 es obligatorio.");
    }

    const [exactRecord, perceptualCandidates] = await Promise.all([
        leerRegistroHashExacto(fingerprint),
        fingerprint?.perceptual?.hex
            ? listarCandidatosPerceptuales({
                technicianId,
                maxCandidates: policy.maxCandidates
            })
            : Promise.resolve([])
    ]);

    return evaluarReutilizacion({
        fingerprint,
        currentServiceId: serviceId,
        currentTechnicianId: technicianId,
        exactRecord,
        perceptualCandidates,
        policy
    });
}

/**
 * Reserva atómicamente el SHA-256 antes de subir a Storage.
 * Retorna allowUpload=false cuando otro folio ya posee la misma huella.
 */
export async function reservarHuellaEvidenciaAtomica({
    fingerprint,
    serviceId,
    technicianId,
    customerId = null,
    evidenceId,
    eventType,
    storagePath = null,
    evaluation = null
} = {}) {
    const record = crearRegistroHuella({
        fingerprint,
        serviceId,
        technicianId,
        customerId,
        evidenceId,
        eventType,
        storagePath
    });

    const hashRef = referenciaHashExacto(record.sha256);
    const perceptualRef = referenciaHuellaPerceptualNueva();
    const auditRef = referenciaAuditoriaNueva();

    return runTransaction(db, async (transaction) => {
        const existingSnapshot = await transaction.get(hashRef);
        const existing = datosDocumento(existingSnapshot);

        if (existing) {
            const sameService = String(existing.serviceId) === String(record.serviceId);

            if (sameService) {
                const result = {
                    status: "same_service_retry",
                    allowUpload: true,
                    reason: "EXACT_HASH_ALREADY_REGISTERED_SAME_SERVICE",
                    exactMatch: existing
                };

                transaction.update(hashRef, limpiarUndefined({
                    retryCount: increment(1),
                    lastEvidenceId: record.evidenceId,
                    lastEventType: record.eventType,
                    lastSeenAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                }));

                transaction.set(
                    auditRef,
                    construirAuditoria({
                        result,
                        fingerprint,
                        serviceId,
                        technicianId,
                        evidenceId,
                        eventType,
                        phase: "atomic_reservation_retry"
                    })
                );

                return {
                    ...result,
                    registryId: existing.registryId || hashRef.id,
                    registryState: existing.state || "reserved"
                };
            }

            const result = {
                status: "blocked_exact_duplicate",
                allowUpload: false,
                reason: "EXACT_HASH_USED_BY_ANOTHER_SERVICE",
                exactMatch: existing
            };

            transaction.set(
                auditRef,
                construirAuditoria({
                    result,
                    fingerprint,
                    serviceId,
                    technicianId,
                    evidenceId,
                    eventType,
                    phase: "atomic_reservation_blocked"
                })
            );

            return {
                ...result,
                registryId: existing.registryId || hashRef.id,
                registryState: existing.state || "reserved"
            };
        }

        if (evaluation && evaluation.allowUpload !== true) {
            transaction.set(
                auditRef,
                construirAuditoria({
                    result: evaluation,
                    fingerprint,
                    serviceId,
                    technicianId,
                    evidenceId,
                    eventType,
                    phase: "perceptual_check_blocked"
                })
            );

            return {
                ...evaluation,
                registryId: null,
                registryState: null
            };
        }

        const clearResult = evaluation || {
            status: "clear",
            allowUpload: true,
            reason: "NO_DUPLICATE_DETECTED"
        };

        transaction.set(hashRef, limpiarUndefined({
            ...record,
            state: "reserved",
            retryCount: 0,
            reservedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            registryVersion: B2C_EVIDENCE_FIRESTORE_VERSION
        }));

        transaction.set(perceptualRef, limpiarUndefined({
            ...record,
            registryId: hashRef.id,
            state: "reserved",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            registryVersion: B2C_EVIDENCE_FIRESTORE_VERSION
        }));

        transaction.set(
            auditRef,
            construirAuditoria({
                result: clearResult,
                fingerprint,
                serviceId,
                technicianId,
                evidenceId,
                eventType,
                phase: "atomic_reservation_created"
            })
        );

        return {
            ...clearResult,
            allowUpload: true,
            registryId: hashRef.id,
            fingerprintDocumentId: perceptualRef.id,
            registryState: "reserved"
        };
    });
}

/**
 * Confirma que el archivo reservado sí terminó almacenado.
 * No cambia el estado del servicio; solo sella la evidencia antifraude.
 */
export async function confirmarHuellaEvidenciaAlmacenada({
    sha256,
    serviceId,
    evidenceId,
    storagePath,
    storageGeneration = null,
    storageSizeBytes = null,
    storageContentType = null
} = {}) {
    const hashRef = referenciaHashExacto(sha256);

    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(hashRef);

        if (!snapshot.exists()) {
            throw new Error("EVIDENCE_HASH_RESERVATION_NOT_FOUND");
        }

        const current = snapshot.data();

        if (String(current.serviceId) !== String(serviceId)) {
            throw new Error("EVIDENCE_HASH_OWNED_BY_ANOTHER_SERVICE");
        }

        if (String(current.evidenceId) !== String(evidenceId)) {
            throw new Error("EVIDENCE_ID_MISMATCH");
        }

        transaction.update(hashRef, limpiarUndefined({
            state: "active",
            storagePath: textoSeguro(storagePath, 500),
            storageGeneration: storageGeneration
                ? textoSeguro(storageGeneration, 120)
                : null,
            storageSizeBytes: Number.isFinite(Number(storageSizeBytes))
                ? Number(storageSizeBytes)
                : null,
            storageContentType: storageContentType
                ? textoSeguro(storageContentType, 100)
                : null,
            confirmedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }));

        const auditRef = referenciaAuditoriaNueva();

        transaction.set(auditRef, limpiarUndefined({
            type: "evidence_storage_confirmation",
            status: "active",
            reason: "EVIDENCE_FILE_CONFIRMED_IN_STORAGE",
            serviceId: textoSeguro(serviceId, 128),
            technicianId: textoSeguro(current.technicianId, 128),
            evidenceId: textoSeguro(evidenceId, 160),
            eventType: textoSeguro(current.eventType, 80),
            sha256: normalizarSha256(sha256),
            storagePath: textoSeguro(storagePath, 500),
            registryVersion: B2C_EVIDENCE_FIRESTORE_VERSION,
            confirmedAtServer: serverTimestamp()
        }));

        return {
            success: true,
            registryId: hashRef.id,
            state: "active"
        };
    });
}

/**
 * Conserva la huella aunque la subida falle, permitiendo reintento solo en el mismo folio.
 */
export async function marcarReservaEvidenciaFallida({
    sha256,
    serviceId,
    evidenceId,
    reason = "UPLOAD_FAILED"
} = {}) {
    const hashRef = referenciaHashExacto(sha256);

    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(hashRef);

        if (!snapshot.exists()) {
            return {
                success: false,
                reason: "RESERVATION_NOT_FOUND"
            };
        }

        const current = snapshot.data();

        if (String(current.serviceId) !== String(serviceId)) {
            throw new Error("EVIDENCE_HASH_OWNED_BY_ANOTHER_SERVICE");
        }

        transaction.update(hashRef, limpiarUndefined({
            state: "upload_failed",
            lastFailureReason: textoSeguro(reason, 160),
            lastFailureAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }));

        const auditRef = referenciaAuditoriaNueva();

        transaction.set(auditRef, limpiarUndefined({
            type: "evidence_storage_failure",
            status: "upload_failed",
            reason: textoSeguro(reason, 160),
            serviceId: textoSeguro(serviceId, 128),
            technicianId: textoSeguro(current.technicianId, 128),
            evidenceId: textoSeguro(evidenceId, 160),
            eventType: textoSeguro(current.eventType, 80),
            sha256: normalizarSha256(sha256),
            registryVersion: B2C_EVIDENCE_FIRESTORE_VERSION,
            failedAtServer: serverTimestamp()
        }));

        return {
            success: true,
            registryId: hashRef.id,
            state: "upload_failed"
        };
    });
}
