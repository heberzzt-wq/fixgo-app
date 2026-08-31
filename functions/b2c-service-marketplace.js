"use strict";

const ACTIVE_SERVICE_STATES = new Set([
    "asignado",
    "en_camino",
    "en_sitio",
    "cotizando",
    "procesando_saldo",
    "trabajando"
]);

const IMMEDIATE_BALANCE_TYPES = new Set([
    "retiro_fondos",
    "penalizacion",
    "abono_deuda",
    "abono_stripe"
]);

function clean(value, maxLength = 160) {
    return String(value ?? "").trim().slice(0, maxLength);
}

function buildMarketplaceListing(serviceId, service = {}, timestamp = null) {
    return {
        service_id: clean(serviceId),
        tipo: "b2c_discovery",
        estado: "disponible",
        categoria: clean(service.categoria, 100) || "general",
        categoria_id: clean(service.categoria_id, 160) || clean(service.categoria, 100) || "general",
        sub_servicio: clean(service.sub_servicio, 120) || "Servicio técnico",
        zona: clean(service.zona, 100) || "Cancún",
        urgencia: service.urgencia === true,
        es_privada: service.es_privada === true,
        metodo_pago: service.metodo_pago === "stripe" ? "stripe" : "efectivo",
        created_at: timestamp || service.created_at || null
    };
}

function isOperationalTechnician(profile = {}) {
    return profile.rol === "tecnico" &&
        profile.estado === "activo" &&
        profile.status === "activo" &&
        profile.kyc?.aprobado === true &&
        profile.suspendido !== true &&
        profile.disponible === true;
}

function isCompatible(profile = {}, service = {}) {
    const category = clean(service.categoria_id || service.categoria).toLowerCase();
    const skills = Array.isArray(profile.skills)
        ? profile.skills.map(value => clean(value).toLowerCase()).filter(Boolean)
        : [];
    return Boolean(category) && skills.some(skill =>
        category.includes(skill) || skill.includes(category)
    );
}

function timestampMillis(value) {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && Number.isFinite(value.seconds)) return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function calculateAvailableBalance(transactions = [], withdrawals = [], nowMs = Date.now()) {
    let available = 0;
    for (const transaction of transactions) {
        const amount = Number(transaction?.pago_tecnico || 0);
        if (!Number.isFinite(amount)) continue;
        const type = clean(transaction?.tipo, 80);
        const occurredAt = timestampMillis(transaction?.fecha);
        if (IMMEDIATE_BALANCE_TYPES.has(type) || (occurredAt != null && nowMs - occurredAt >= 24 * 60 * 60 * 1000)) {
            available += amount;
        }
    }
    for (const withdrawal of withdrawals) {
        if (withdrawal?.estado !== "pendiente") continue;
        const amount = Number(withdrawal?.monto || 0);
        if (Number.isFinite(amount)) available -= amount;
    }
    return available;
}

function vehicleData(profile = {}) {
    const type = clean(profile.vehiculo?.tipo || profile.vehiculo_tipo, 80).toLowerCase() || "peaton";
    return {
        type,
        plates: clean(profile.vehiculo?.placas || profile.placas, 80) || null
    };
}

function createClaimB2cServiceHandler({ admin, db, functions, now = () => Date.now() }) {
    if (!admin || !db || !functions) throw new Error("B2C_CLAIM_DEPENDENCIES_REQUIRED");

    return async (data, context) => {
        const technicianId = context?.auth?.uid;
        if (!technicianId) {
            throw new functions.https.HttpsError("unauthenticated", "Se requiere una sesión técnica.");
        }
        const serviceId = clean(data?.serviceId);
        if (!serviceId) {
            throw new functions.https.HttpsError("invalid-argument", "serviceId es obligatorio.");
        }

        return db.runTransaction(async transaction => {
            const profileRef = db.collection("users").doc(technicianId);
            const serviceRef = db.collection("services").doc(serviceId);
            const listingRef = db.collection("service_marketplace").doc(serviceId);
            const lockRef = db.collection("technician_active_services").doc(technicianId);
            const activeQuery = db.collection("services").where("tecnico_id", "==", technicianId);
            const ledgerQuery = db.collection("transacciones").where("tecnico_id", "==", technicianId);
            const withdrawalsQuery = db.collection("retiros").where("tecnico_id", "==", technicianId);

            const [profileSnapshot, serviceSnapshot, listingSnapshot, lockSnapshot, activeSnapshot, ledgerSnapshot, withdrawalsSnapshot] =
                await Promise.all([
                    transaction.get(profileRef),
                    transaction.get(serviceRef),
                    transaction.get(listingRef),
                    transaction.get(lockRef),
                    transaction.get(activeQuery),
                    transaction.get(ledgerQuery),
                    transaction.get(withdrawalsQuery)
                ]);

            if (!profileSnapshot.exists || !isOperationalTechnician(profileSnapshot.data() || {})) {
                throw new functions.https.HttpsError("failed-precondition", "La cuenta técnica no está habilitada para operar.");
            }
            if (!serviceSnapshot.exists || !listingSnapshot.exists) {
                throw new functions.https.HttpsError("not-found", "La solicitud ya no está disponible.");
            }

            const profile = profileSnapshot.data() || {};
            const service = serviceSnapshot.data() || {};
            const listing = listingSnapshot.data() || {};
            if (service.estado !== "pendiente" || service.tecnico_id || listing.estado !== "disponible") {
                throw new functions.https.HttpsError("already-exists", "Otro técnico ya tomó la solicitud.");
            }
            if (listing.service_id !== serviceId || service.tipo === "mantenimiento") {
                throw new functions.https.HttpsError("failed-precondition", "La proyección de bolsa no corresponde al servicio B2C.");
            }
            if (service.metodo_pago === "stripe" && !service.fecha_pago) {
                throw new functions.https.HttpsError("failed-precondition", "El pago inicial aún no fue confirmado por Stripe.");
            }
            if (!isCompatible(profile, service)) {
                throw new functions.https.HttpsError("permission-denied", "El servicio no es compatible con las especialidades del técnico.");
            }

            const vehicle = vehicleData(profile);
            if (service.es_privada === true && !vehicle.plates) {
                throw new functions.https.HttpsError("failed-precondition", "El servicio requiere placas para acceso a caseta.");
            }
            const hasActiveService = activeSnapshot.docs.some(snapshot =>
                snapshot.id !== serviceId && ACTIVE_SERVICE_STATES.has(snapshot.data()?.estado)
            );
            if (lockSnapshot.exists || hasActiveService) {
                throw new functions.https.HttpsError("failed-precondition", "El técnico ya tiene un servicio activo.");
            }

            const balance = calculateAvailableBalance(
                ledgerSnapshot.docs.map(snapshot => snapshot.data()),
                withdrawalsSnapshot.docs.map(snapshot => snapshot.data()),
                now()
            );
            if (balance <= -1000) {
                throw new functions.https.HttpsError("failed-precondition", "La cuenta tiene un bloqueo financiero operativo.");
            }

            const assignedAt = admin.firestore.FieldValue.serverTimestamp();
            transaction.update(serviceRef, {
                estado: "asignado",
                tecnico_id: technicianId,
                tecnico_nombre: clean(profile.nombre, 160) || "Técnico",
                tecnico_nombre_fiscal: clean(profile.nombre_fiscal || profile.nombre, 200) || "Técnico",
                tecnico_rfc: clean(profile.rfc, 20) || "XAXX010101000",
                tecnico_logo_factura: profile.logo_factura || null,
                tecnico_vehiculo: vehicle.type,
                tecnico_placas: vehicle.plates,
                tecnico_telefono: clean(profile.telefono, 40),
                asignado_at: assignedAt,
                "auditoria.claim_authority": "claimB2cService",
                "auditoria.claimed_by": technicianId,
                "auditoria.claimed_at": assignedAt
            });
            transaction.delete(listingRef);
            transaction.set(lockRef, {
                service_id: serviceId,
                technician_id: technicianId,
                estado: "activo",
                created_at: assignedAt
            });

            return { ok: true, serviceId, estado: "asignado" };
        });
    };
}

function createReleaseTechnicianLockHandler({ db }) {
    if (!db) throw new Error("B2C_RELEASE_DEPENDENCIES_REQUIRED");
    return async (change, context) => {
        const before = change.before.data() || {};
        const after = change.after.data() || {};
        const terminal = new Set(["finalizado", "cancelado", "liquidado", "archivado"]);
        if (!after.tecnico_id || !terminal.has(after.estado) || before.estado === after.estado) return null;
        const lockRef = db.collection("technician_active_services").doc(after.tecnico_id);
        return db.runTransaction(async transaction => {
            const lockSnapshot = await transaction.get(lockRef);
            if (lockSnapshot.exists && lockSnapshot.data()?.service_id === context.params.serviceId) {
                transaction.delete(lockRef);
            }
            return null;
        });
    };
}

function createPublishCashMarketplaceHandler({ admin, db }) {
    if (!admin || !db) throw new Error("B2C_PUBLISH_DEPENDENCIES_REQUIRED");
    return async snapshot => {
        const service = snapshot.data() || {};
        if (
            service.tipo === "mantenimiento" ||
            service.metodo_pago !== "efectivo" ||
            service.estado !== "pendiente"
        ) {
            return null;
        }
        const listing = buildMarketplaceListing(
            snapshot.id,
            service,
            admin.firestore.FieldValue.serverTimestamp()
        );
        await db.collection("service_marketplace").doc(snapshot.id).set(listing);
        return null;
    };
}

module.exports = {
    ACTIVE_SERVICE_STATES,
    buildMarketplaceListing,
    calculateAvailableBalance,
    createClaimB2cServiceHandler,
    createPublishCashMarketplaceHandler,
    createReleaseTechnicianLockHandler,
    isCompatible,
    isOperationalTechnician,
    vehicleData
};
