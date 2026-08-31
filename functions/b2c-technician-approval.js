"use strict";

const ALLOWED_REVIEW_STATES = new Set([
    "documentos_subidos",
    "pendiente_revision",
    "pendiente"
]);

function hasDocument(value) {
    return typeof value === "string"
        ? value.trim().length > 0
        : Boolean(value && typeof value === "object" && (value.url || value.storage_path));
}

function validateTechnicianKyc(profile = {}) {
    const vehicleType = String(profile.vehiculo?.tipo || "").trim().toLowerCase();
    const pedestrian = vehicleType === "peaton" || vehicleType === "peatón";
    const missing = [];
    if (!hasDocument(profile.foto_perfil)) missing.push("foto_perfil");
    if (!hasDocument(profile.documentos?.ine)) missing.push("ine");
    if (!hasDocument(profile.documentos?.csf)) missing.push("csf");
    if (!String(profile.datos_bancarios?.banco || "").trim()) missing.push("banco");
    if (!/^\d{18}$/.test(String(profile.datos_bancarios?.clabe || ""))) missing.push("clabe");
    if (!vehicleType) missing.push("vehiculo_tipo");
    if (!pedestrian && !String(profile.vehiculo?.placas || "").trim()) missing.push("placas");
    if (!pedestrian && !hasDocument(profile.documentos?.licencia)) missing.push("licencia");
    return { complete: missing.length === 0, missing, pedestrian };
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
            const profile = snapshot.data() || {};
            if (profile.rol !== "tecnico") {
                throw new functions.https.HttpsError("failed-precondition", "El perfil no corresponde a un técnico B2C.");
            }
            const state = String(profile.kyc?.estado || profile.estado || profile.status || "");
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
                estado: "activo",
                status: "activo",
                disponible: false,
                verificado: true,
                "kyc.estado": "activo",
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
