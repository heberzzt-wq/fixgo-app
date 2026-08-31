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

function createApproveTechnicianHandler({ admin, db, functions }) {
    if (!admin || !db || !functions) throw new Error("B2C_APPROVAL_DEPENDENCIES_REQUIRED");

    return async (data, context) => {
        if (!context?.auth?.uid) {
            throw new functions.https.HttpsError("unauthenticated", "Se requiere una sesión administrativa.");
        }
        const technicianId = String(data?.technicianId || "").trim();
        if (!technicianId) {
            throw new functions.https.HttpsError("invalid-argument", "technicianId es obligatorio.");
        }

        const actorSnapshot = await db.collection("users").doc(context.auth.uid).get();
        if (!isAuthorizedAdmin(context, actorSnapshot.data() || {})) {
            throw new functions.https.HttpsError("permission-denied", "Sólo administración puede aprobar técnicos.");
        }

        return db.runTransaction(async transaction => {
            const technicianRef = db.collection("users").doc(technicianId);
            const snapshot = await transaction.get(technicianRef);
            if (!snapshot.exists) {
                throw new functions.https.HttpsError("not-found", "No existe el expediente técnico.");
            }
            const rawProfile = snapshot.data() || {};
            const profile = platformContract.normalizeTechnicianProfile(rawProfile);
            if (profile.rol !== "tecnico") {
                throw new functions.https.HttpsError("failed-precondition", "El perfil no corresponde a un técnico B2C.");
            }
            const state = profile.estado;
            if (!ALLOWED_REVIEW_STATES.has(state)) {
                throw new functions.https.HttpsError("failed-precondition", "El expediente no está pendiente de revisión.");
            }
            const validation = validateTechnicianKyc(profile);
            if (!validation.complete) {
                throw new functions.https.HttpsError(
                    "failed-precondition",
                    `Expediente incompleto: ${validation.missing.join(", ")}`
                );
            }

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
                aprobadoEn: now,
                actualizadoEn: now
            });
            return { ok: true, technicianId, estado: "activo" };
        });
    };
}

module.exports = {
    createApproveTechnicianHandler,
    isAuthorizedAdmin,
    validateTechnicianKyc
};
