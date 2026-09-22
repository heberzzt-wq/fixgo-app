"use strict";

const platformContract = require("./b2c-platform-contract");

const ALLOWED_REVIEW_STATES = new Set([
    platformContract.TECHNICIAN_STATES.DOCUMENTS_UPLOADED,
    platformContract.TECHNICIAN_STATES.PENDING_REVIEW,
    "pendiente"
]);

function validateTechnicianKyc(profile = {}) {
    const result = platformContract.technicianKycRequirements(profile);
    return {
        complete: result.complete,
        missing: result.missing,
        pedestrian: result.pedestrian,
        profile: result.profile
    };
}

function isAuthorizedAdmin(context, actorProfile = {}) {
    const email = String(context?.auth?.token?.email || "").toLowerCase();
    return context?.auth?.token?.admin === true ||
        email === "hebertoh-m@hotmail.com" ||
        ["admin", "ceo"].includes(String(actorProfile.rol || actorProfile.role || "").toLowerCase());
}

async function verifyTechnicianStorage({ bucket, technicianId, profile, functions }) {
    const invalid = message => { throw new functions.https.HttpsError('failed-precondition', message); };
    const references = { foto_perfil: profile.foto_perfil, ine: profile.documentos.ine, csf: profile.documentos.csf };
    if (profile.vehiculo.tipo !== 'peaton') references.licencia = profile.documentos.licencia;
    const verified = {};
    for (const [kind, reference] of Object.entries(references)) {
        let path = typeof reference === 'object' ? reference?.storage_path : null;
        const url = typeof reference === 'string' ? reference : reference?.url;
        if (url) {
            let parsed;
            try { parsed = new URL(url); } catch { invalid(`KYC_STORAGE_REFERENCE_INVALID:${kind}`); }
            const marker = `/v0/b/${bucket.name}/o/`;
            if (parsed.protocol !== 'https:' || parsed.hostname !== 'firebasestorage.googleapis.com' || !parsed.pathname.startsWith(marker)) invalid(`KYC_STORAGE_REFERENCE_INVALID:${kind}`);
            let urlPath;
            try { urlPath = decodeURIComponent(parsed.pathname.slice(marker.length)); } catch { invalid(`KYC_STORAGE_REFERENCE_INVALID:${kind}`); }
            if (path && path !== urlPath) invalid(`KYC_STORAGE_REFERENCE_CONFLICT:${kind}`);
            path = urlPath;
        }
        if (typeof path !== 'string' || !path.startsWith(`expedientes/${technicianId}/`) || path.includes('..') || path.endsWith('/')) invalid(`KYC_STORAGE_OWNER_MISMATCH:${kind}`);
        let metadata;
        try { [metadata] = await bucket.file(path).getMetadata(); } catch { invalid(`KYC_STORAGE_OBJECT_UNAVAILABLE:${kind}`); }
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', ...(kind === 'foto_perfil' ? [] : ['application/pdf'])];
        if (!metadata?.generation || !allowed.includes(metadata.contentType) || !(Number(metadata.size) > 0 && Number(metadata.size) <= 10 * 1024 * 1024)) invalid(`KYC_STORAGE_OBJECT_INVALID:${kind}`);
        const prior = profile.kyc?.evidencias?.[kind];
        if (prior && (prior.storage_path !== path || String(prior.generation) !== String(metadata.generation))) invalid(`KYC_STORAGE_GENERATION_CHANGED:${kind}`);
        verified[kind] = { storage_path: path, generation: String(metadata.generation), metageneration: String(metadata.metageneration || ''),
            size: Number(metadata.size), content_type: metadata.contentType, md5_hash: metadata.md5Hash || null };
    }
    return verified;
}

function createApproveTechnicianHandler({ admin, db, functions, bucket }) {
    if (!admin || !db || !functions) throw new Error("B2C_APPROVAL_DEPENDENCIES_REQUIRED");

    return async (data, context) => {
        if (!context?.auth?.uid) {
            throw new functions.https.HttpsError("unauthenticated", "Se requiere una sesión administrativa.");
        }
        const technicianId = String(data?.technicianId || "").trim();
        if (!technicianId) {
            throw new functions.https.HttpsError("invalid-argument", "technicianId es obligatorio.");
        }

        if (technicianId.includes('/') || technicianId === context.auth.uid) throw new functions.https.HttpsError('permission-denied', 'No se permite autoaprobación.');
        return db.runTransaction(async transaction => {
            const actorSnapshot = await transaction.get(db.collection('users').doc(context.auth.uid));
            if (!isAuthorizedAdmin(context, actorSnapshot.data() || {})) throw new functions.https.HttpsError('permission-denied', 'Sólo administración puede aprobar técnicos.');
            const technicianRef = db.collection("users").doc(technicianId);
            const snapshot = await transaction.get(technicianRef);
            if (!snapshot.exists) {
                throw new functions.https.HttpsError("not-found", "No existe el expediente técnico.");
            }
            const rawProfile = snapshot.data() || {};
            const profile = platformContract.normalizeTechnicianProfile(rawProfile);
            if (platformContract.isB2BAccountProfile(rawProfile) || platformContract.normalizeToken(rawProfile.rol || rawProfile.role) !== "tecnico") {
                throw new functions.https.HttpsError("failed-precondition", "El perfil no corresponde a un técnico B2C.");
            }
            const states = [rawProfile.estado, rawProfile.status, rawProfile.kyc?.estado].filter(Boolean).map(value => platformContract.normalizeTechnicianProfile({ estado: value }).estado);
            if (rawProfile.suspendido === true || new Set(states).size !== 1) throw new functions.https.HttpsError('failed-precondition', 'KYC_STATE_CONFLICT');
            const state = profile.estado;
            const alreadyApproved = state === 'activo' && rawProfile.kyc?.aprobado === true && rawProfile.kyc?.evidencias;
            if (!alreadyApproved && !ALLOWED_REVIEW_STATES.has(state)) {
                throw new functions.https.HttpsError("failed-precondition", "El expediente no está pendiente de revisión.");
            }
            const validation = validateTechnicianKyc(profile);
            if (!validation.complete) {
                throw new functions.https.HttpsError(
                    "failed-precondition",
                    `Expediente incompleto: ${validation.missing.join(", ")}`
                );
            }

            const evidencias = await verifyTechnicianStorage({ bucket: bucket || admin.storage().bucket('fixgo-44e4d.firebasestorage.app'), technicianId, profile, functions });
            if (alreadyApproved) return { ok: true, technicianId, estado: 'activo', alreadyApproved: true };
            const now = admin.firestore.FieldValue.serverTimestamp();
            transaction.update(technicianRef, {
                estado: platformContract.TECHNICIAN_STATES.ACTIVE,
                status: platformContract.TECHNICIAN_STATES.ACTIVE,
                disponible: false,
                skills: profile.skills,
                vehiculo: profile.vehiculo,
                documentos: profile.documentos,
                datos_bancarios: profile.datos_bancarios,
                verificado: true,
                "kyc.estado": platformContract.TECHNICIAN_STATES.ACTIVE,
                "kyc.aprobado": true,
                "kyc.aprobado_por": context.auth.uid,
                "kyc.aprobado_at": now,
                "kyc.faltantes": [],
                "kyc.evidencias": evidencias,
                aprobadoEn: now,
                actualizadoEn: now
            });
            return { ok: true, technicianId, estado: "activo" };
        });
    };
}

function createReturnTechnicianHandler({ admin, db, functions }) {
    return async (data, context) => {
        if (!context?.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'Inicia sesión.');
        const technicianId = String(data?.technicianId || '').trim();
        const reason = String(data?.reason || '').trim().slice(0, 500);
        const documents = [...new Set(Array.isArray(data?.documents) ? data.documents : [])];
        if (!technicianId || technicianId.includes('/') || reason.length < 8 || !documents.length || documents.some(kind => !['foto_perfil', 'ine', 'csf', 'licencia'].includes(kind))) {
            throw new functions.https.HttpsError('invalid-argument', 'Indica motivo y documentos a corregir.');
        }
        return db.runTransaction(async tx => {
            const actor = (await tx.get(db.collection('users').doc(context.auth.uid))).data() || {};
            if (technicianId === context.auth.uid || !isAuthorizedAdmin(context, actor)) throw new functions.https.HttpsError('permission-denied', 'Revisión administrativa requerida.');
            const target = db.collection('users').doc(technicianId);
            const snap = await tx.get(target);
            if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Expediente no encontrado.');
            const raw = snap.data();
            if (platformContract.isB2BAccountProfile(raw) || platformContract.normalizeToken(raw.rol || raw.role) !== 'tecnico' ||
                raw.suspendido === true || raw.estado !== raw.status || !['pendiente_revision', 'documentos_subidos', 'rechazado'].includes(raw.estado)) {
                throw new functions.https.HttpsError('failed-precondition', 'Sólo se devuelve un expediente en revisión.');
            }
            const evidencias = { ...(raw.kyc?.evidencias || {}) };
            for (const kind of documents) delete evidencias[kind];
            tx.update(target, { estado: 'rechazado', status: 'rechazado', disponible: false, verificado: false,
                'kyc.estado': 'rechazado', 'kyc.aprobado': false, 'kyc.faltantes': documents,
                'kyc.observaciones': reason, 'kyc.evidencias': evidencias,
                'kyc.revisado_por': context.auth.uid, 'kyc.revisado_at': admin.firestore.FieldValue.serverTimestamp() });
            return { ok: true, technicianId, estado: 'rechazado' };
        });
    };
}

module.exports = {
    createApproveTechnicianHandler,
    createReturnTechnicianHandler,
    isAuthorizedAdmin,
    validateTechnicianKyc,
    verifyTechnicianStorage
};
