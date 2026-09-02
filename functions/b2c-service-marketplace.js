"use strict";

const crypto = require("node:crypto");
const platformContract = require("./b2c-platform-contract");

const ACTIVE_SERVICE_STATES = new Set([
    platformContract.SERVICE_STATES.ASSIGNED,
    platformContract.SERVICE_STATES.EN_ROUTE,
    platformContract.SERVICE_STATES.ON_SITE,
    platformContract.SERVICE_STATES.QUOTING,
    platformContract.SERVICE_STATES.PROCESSING_BALANCE,
    platformContract.SERVICE_STATES.WORKING
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

function recipientFingerprint(technicianId) {
    return crypto.createHash("sha256").update(clean(technicianId, 256)).digest("hex").slice(0, 16);
}

function buildMarketplaceListing(serviceId, service = {}, timestamp = null) {
    return platformContract.buildMarketplaceListing(serviceId, service, timestamp);
}

function isOperationalTechnician(profile = {}) {
    return platformContract.technicianEligibility(profile, { requireAvailable: true }).ok;
}

function isCompatible(profile = {}, service = {}) {
    return platformContract.isSkillCompatible(profile, service);
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
    const normalized = platformContract.normalizeTechnicianProfile(profile);
    const type = normalized.vehiculo.tipo || "peaton";
    return {
        type,
        plates: clean(normalized.vehiculo.placas, 80) || null
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

            const profile = platformContract.normalizeTechnicianProfile(profileSnapshot.data() || {});
            const service = serviceSnapshot.data() || {};
            const listing = listingSnapshot.data() || {};
            if (service.estado !== platformContract.SERVICE_STATES.PENDING || service.tecnico_id || listing.estado !== "disponible") {
                throw new functions.https.HttpsError("already-exists", "Otro técnico ya tomó la solicitud.");
            }
            if (Array.isArray(service.rejected_by) && service.rejected_by.includes(technicianId)) {
                throw new functions.https.HttpsError("permission-denied", "La solicitud ya fue liberada por este técnico.");
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
                estado: platformContract.SERVICE_STATES.ASSIGNED,
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

function paymentAuthoritySignature(value = {}) {
    return [
        clean(value.method, 40),
        value.global_enabled === true,
        value.individual_authorized === true,
        value.effective === true,
        clean(value.contract_version, 100)
    ].join("|");
}

function createCancelB2cServiceHandler({ admin, db, functions }) {
    if (!admin || !db || !functions) throw new Error("B2C_CANCEL_DEPENDENCIES_REQUIRED");
    return async (data, context) => {
        const actorId = context?.auth?.uid;
        if (!actorId) {
            throw new functions.https.HttpsError("unauthenticated", "Se requiere una sesión autenticada.");
        }
        const serviceId = clean(data?.serviceId);
        const reason = clean(data?.reason, 500);
        if (!serviceId || reason.length < 5) {
            throw new functions.https.HttpsError("invalid-argument", "serviceId y motivo auditable son obligatorios.");
        }
        const serviceRef = db.collection("services").doc(serviceId);

        return db.runTransaction(async transaction => {
            const serviceSnapshot = await transaction.get(serviceRef);
            if (!serviceSnapshot.exists) {
                throw new functions.https.HttpsError("not-found", "Servicio no encontrado.");
            }

            const service = serviceSnapshot.data() || {};
            if (service.tipo === "mantenimiento") {
                throw new functions.https.HttpsError("failed-precondition", "La cancelación B2B usa su autoridad contractual propia.");
            }

            const serviceState = clean(service.estado, 60);
            const isCustomer = clean(service.cliente_id, 160) === actorId;
            const isTechnician = clean(service.tecnico_id, 160) === actorId;

            if (isCustomer) {
                const customerCancelableStates = new Set([
                    platformContract.SERVICE_STATES.PENDING,
                    platformContract.SERVICE_STATES.STRIPE_STARTED
                ]);
                if (service.tecnico_id || !customerCancelableStates.has(serviceState)) {
                    throw new functions.https.HttpsError("failed-precondition", "La solicitud ya no puede cancelarse antes de asignación.");
                }
                const stripePaymentConfirmed = service.metodo_pago === "stripe" && Boolean(
                    service.fecha_pago ||
                    service.ultimo_pago_id ||
                    Number(service.monto_pagado || 0) > 0
                );
                if (stripePaymentConfirmed) {
                    throw new functions.https.HttpsError("failed-precondition", "El servicio ya tiene un pago Stripe confirmado y requiere el flujo financiero de cancelación/reembolso.");
                }

                const timestamp = admin.firestore.FieldValue.serverTimestamp();
                transaction.update(serviceRef, {
                    estado: "cancelado",
                    cancelado_razon: reason,
                    cancelado_por_cliente_at: timestamp,
                    cancelado_por_cliente_motivo: reason,
                    "auditoria.cancel_authority": "cancelB2cService",
                    "auditoria.cancel_actor": "cliente",
                    "auditoria.cancelled_by": actorId,
                    "auditoria.cancelled_at": timestamp
                });
                return { ok: true, serviceId, estado: "cancelado", actor: "cliente" };
            }

            if (!isTechnician || !ACTIVE_SERVICE_STATES.has(serviceState)) {
                throw new functions.https.HttpsError("permission-denied", "La cuenta autenticada no puede cancelar o liberar este servicio.");
            }

            const profileRef = db.collection("users").doc(actorId);
            const lockRef = db.collection("technician_active_services").doc(actorId);
            const penaltyRef = db.collection("transacciones").doc(`cancel_${serviceId}_${actorId}`);
            const [profileSnapshot, lockSnapshot, penaltySnapshot] = await Promise.all([
                transaction.get(profileRef),
                transaction.get(lockRef),
                transaction.get(penaltyRef)
            ]);
            if (!profileSnapshot.exists) {
                throw new functions.https.HttpsError("not-found", "Técnico no encontrado.");
            }
            const profile = profileSnapshot.data() || {};
            if (penaltySnapshot.exists) {
                throw new functions.https.HttpsError("already-exists", "La liberación ya fue procesada.");
            }
            const timestamp = admin.firestore.FieldValue.serverTimestamp();
            const rejected = [...new Set([...(Array.isArray(service.rejected_by) ? service.rejected_by : []), actorId])];
            transaction.update(serviceRef, {
                estado: platformContract.SERVICE_STATES.PENDING,
                tecnico_id: null,
                tecnico_nombre: null,
                tecnico_telefono: null,
                tecnico_vehiculo: null,
                tecnico_placas: null,
                asignado_at: null,
                rejected_by: rejected,
                marketplace_revision: Math.max(0, Number(service.marketplace_revision) || 0) + 1,
                liberado_por_tecnico_at: timestamp,
                liberado_por_tecnico_motivo: reason,
                "auditoria.cancel_authority": "cancelB2cService",
                "auditoria.cancel_actor": "tecnico"
            });
            transaction.update(profileRef, {
                reputacion: Math.max(0, (Number(profile.reputacion) || 5) - 0.3)
            });
            transaction.set(penaltyRef, {
                tecnico_id: actorId,
                pago_tecnico: -150,
                monto_total: 0,
                tipo: "penalizacion",
                descripcion: `Liberación de servicio ${serviceId.slice(0, 8)}: ${reason}`,
                servicio_id: serviceId,
                fecha: timestamp,
                authority: "cancelB2cService"
            });
            if (lockSnapshot.exists && lockSnapshot.data()?.service_id === serviceId) {
                transaction.delete(lockRef);
            }
            return { ok: true, serviceId, estado: platformContract.SERVICE_STATES.PENDING, actor: "tecnico" };
        });
    };
}

async function syncMarketplaceService({ admin, db, serviceId }) {
    if (!admin || !db || !serviceId) throw new Error("B2C_MARKETPLACE_SYNC_DEPENDENCIES_REQUIRED");
    const serviceRef = db.collection("services").doc(serviceId);
    const listingRef = db.collection("service_marketplace").doc(serviceId);
    const paymentConfigRef = db.collection("configuracion").doc("pagos");
    const catalogConfigRef = db.collection("configuracion").doc("catalogo_global");

    return db.runTransaction(async transaction => {
        const serviceSnapshot = await transaction.get(serviceRef);
        if (!serviceSnapshot.exists) {
            transaction.delete(listingRef);
            return { published: false, reason: "SERVICE_NOT_FOUND" };
        }

        const service = serviceSnapshot.data() || {};
        const customerRef = db.collection("users").doc(clean(service.cliente_id, 160) || "_missing_customer");
        const [paymentConfigSnapshot, catalogConfigSnapshot, customerSnapshot, listingSnapshot] = await Promise.all([
            transaction.get(paymentConfigRef),
            transaction.get(catalogConfigRef),
            transaction.get(customerRef),
            transaction.get(listingRef)
        ]);
        const paymentConfig = paymentConfigSnapshot.exists ? paymentConfigSnapshot.data() || {} : {};
        const catalogConfig = catalogConfigSnapshot.exists ? catalogConfigSnapshot.data() || {} : {};
        const customer = customerSnapshot.exists ? customerSnapshot.data() || {} : {};
        const payment = platformContract.assertPaymentMethodAllowed(service.metodo_pago, paymentConfig, customer);
        const method = platformContract.normalizeToken(service.metodo_pago);
        const globalEnabled = method === platformContract.PAYMENT_METHODS.STRIPE
            ? payment.permissions?.global?.stripe === true
            : payment.permissions?.global?.efectivo === true;
        const individualAuthorized = method === platformContract.PAYMENT_METHODS.STRIPE
            ? payment.permissions?.individual?.stripe_autorizado === true
            : payment.permissions?.individual?.efectivo_autorizado === true;
        const authority = {
            method,
            global_enabled: globalEnabled,
            individual_authorized: individualAuthorized,
            effective: payment.ok === true,
            contract_version: platformContract.CONTRACT_VERSION
        };
        const evaluatedService = { ...service, payment_authority: authority };
        const categoryEnabled = platformContract.isServiceCategoryEnabled(service, catalogConfig);
        const shouldPublish = categoryEnabled && platformContract.shouldPublishMarketplace(evaluatedService);
        const currentSignature = paymentAuthoritySignature(service.payment_authority);
        const nextSignature = paymentAuthoritySignature(authority);
        if (currentSignature !== nextSignature) {
            transaction.update(serviceRef, {
                payment_authority: {
                    ...authority,
                    checked_at: admin.firestore.FieldValue.serverTimestamp()
                }
            });
        }

        if (!shouldPublish) {
            if (listingSnapshot.exists) transaction.delete(listingRef);
            return {
                published: false,
                reason: categoryEnabled
                    ? (payment.ok ? "SERVICE_NOT_ELIGIBLE" : payment.reason)
                    : "SERVICE_CATEGORY_DISABLED"
            };
        }

        const listing = buildMarketplaceListing(
            serviceId,
            evaluatedService,
            listingSnapshot.data()?.created_at || admin.firestore.FieldValue.serverTimestamp()
        );
        transaction.set(listingRef, listing);
        if (!listingSnapshot.exists) {
            const eventId = platformContract.marketplaceEventId(serviceId, service.marketplace_revision);
            transaction.set(db.collection("platform_events").doc(eventId), {
                event_type: platformContract.EVENT_MARKETPLACE_SERVICE_AVAILABLE,
                message_id: eventId,
                service_id: serviceId,
                categoria_id: listing.categoria_id,
                estado: "pending_delivery",
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                contract_version: platformContract.CONTRACT_VERSION
            }, { merge: false });
        }
        return { published: true, reason: null };
    });
}

function createSyncB2cMarketplaceHandler({ admin, db }) {
    if (!admin || !db) throw new Error("B2C_MARKETPLACE_SYNC_DEPENDENCIES_REQUIRED");
    return async (_change, context) => {
        await syncMarketplaceService({ admin, db, serviceId: context.params.serviceId });
        return null;
    };
}

function createRequestB2cWithdrawalHandler({ admin, db, functions, now = () => Date.now() }) {
    if (!admin || !db || !functions) throw new Error("B2C_WITHDRAWAL_DEPENDENCIES_REQUIRED");
    return async (data, context) => {
        const technicianId = context?.auth?.uid;
        if (!technicianId) {
            throw new functions.https.HttpsError("unauthenticated", "Se requiere una sesión técnica.");
        }
        const requestedAmount = Number(data?.amount);
        if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
            throw new functions.https.HttpsError("invalid-argument", "El monto solicitado no es válido.");
        }

        const profileRef = db.collection("users").doc(technicianId);
        const ledgerQuery = db.collection("transacciones").where("tecnico_id", "==", technicianId);
        const withdrawalsQuery = db.collection("retiros").where("tecnico_id", "==", technicianId);
        const withdrawalRef = db.collection("retiros").doc();

        return db.runTransaction(async transaction => {
            const [profileSnapshot, ledgerSnapshot, withdrawalsSnapshot] = await Promise.all([
                transaction.get(profileRef),
                transaction.get(ledgerQuery),
                transaction.get(withdrawalsQuery)
            ]);
            const profile = profileSnapshot.exists ? profileSnapshot.data() || {} : {};
            if (!profileSnapshot.exists || !platformContract.technicianEligibility(profile, { requireAvailable: false }).ok) {
                throw new functions.https.HttpsError("failed-precondition", "La cuenta técnica no está habilitada para retiros.");
            }
            const withdrawals = withdrawalsSnapshot.docs.map(snapshot => snapshot.data() || {});
            if (withdrawals.some(withdrawal => clean(withdrawal.estado, 40) === "pendiente")) {
                throw new functions.https.HttpsError("already-exists", "Ya existe un retiro pendiente.");
            }
            const available = calculateAvailableBalance(
                ledgerSnapshot.docs.map(snapshot => snapshot.data() || {}),
                withdrawals,
                now()
            );
            const amount = Math.round(requestedAmount * 100) / 100;
            if (amount > Math.round(available * 100) / 100) {
                throw new functions.https.HttpsError("failed-precondition", "El monto supera el saldo disponible.");
            }
            transaction.set(withdrawalRef, {
                tecnico_id: technicianId,
                tecnico_nombre: clean(profile.nombre, 160) || "Técnico",
                monto: amount,
                estado: "pendiente",
                fecha_solicitud: admin.firestore.FieldValue.serverTimestamp(),
                authority: "solicitarRetiro",
                contract_version: platformContract.CONTRACT_VERSION
            });
            return { ok: true, withdrawalId: withdrawalRef.id, amount };
        });
    };
}

function createResyncMarketplaceConfigHandler({ admin, db }) {
    if (!admin || !db) throw new Error("B2C_MARKETPLACE_CONFIG_DEPENDENCIES_REQUIRED");
    return async (change, context = {}) => {
        const configId = clean(context.params?.configId, 80);
        if (configId !== "pagos" && configId !== "catalogo_global") return null;
        const before = change.before.data() || {};
        const after = change.after.data() || {};
        if (configId === "pagos" &&
            before.stripe_activo === after.stripe_activo &&
            before.efectivo_activo === after.efectivo_activo) return null;
        if (configId === "catalogo_global" && JSON.stringify(before) === JSON.stringify(after)) return null;
        const pending = await db.collection("services").where("estado", "==", "pendiente").get();
        for (const snapshot of pending.docs) {
            await syncMarketplaceService({ admin, db, serviceId: snapshot.id });
        }
        return null;
    };
}

function createResyncCustomerPaymentsHandler({ admin, db }) {
    if (!admin || !db) throw new Error("B2C_MARKETPLACE_CUSTOMER_DEPENDENCIES_REQUIRED");
    return async (change, context) => {
        const before = change.before.data() || {};
        const after = change.after.data() || {};
        if (JSON.stringify(before.pagos || {}) === JSON.stringify(after.pagos || {}) &&
            before.efectivo_autorizado === after.efectivo_autorizado) return null;
        const services = await db.collection("services").where("cliente_id", "==", context.params.userId).get();
        for (const snapshot of services.docs) {
            if (snapshot.data()?.estado === "pendiente") {
                await syncMarketplaceService({ admin, db, serviceId: snapshot.id });
            }
        }
        return null;
    };
}

function createMarketplaceNotificationHandler({ admin, db }) {
    if (!admin || !db) throw new Error("B2C_MARKETPLACE_NOTIFICATION_DEPENDENCIES_REQUIRED");
    return async snapshot => {
        const event = snapshot.data() || {};
        if (event.event_type !== platformContract.EVENT_MARKETPLACE_SERVICE_AVAILABLE) return null;
        const [listingSnapshot, serviceSnapshot] = await Promise.all([
            db.collection("service_marketplace").doc(event.service_id).get(),
            db.collection("services").doc(event.service_id).get()
        ]);
        if (!listingSnapshot.exists || !serviceSnapshot.exists) {
            await snapshot.ref.set({ estado: "cancelled_before_delivery" }, { merge: true });
            return null;
        }
        const listing = listingSnapshot.data() || {};
        const rejectedTechnicians = new Set(serviceSnapshot.data()?.rejected_by || []);
        const technicianSnapshot = await db.collection("users")
            .where("rol", "==", "tecnico")
            .where("disponible", "==", true)
            .get();
        const recipientsByToken = new Map();
        for (const item of technicianSnapshot.docs) {
            const profile = item.data() || {};
            const token = clean(profile.fcmToken, 4096);
            if (rejectedTechnicians.has(item.id) || !token || !isOperationalTechnician(profile) || !isCompatible(profile, listing)) continue;
            if (!recipientsByToken.has(token)) {
                recipientsByToken.set(token, {
                    token,
                    fingerprint: recipientFingerprint(item.id)
                });
            }
        }
        const recipients = [...recipientsByToken.values()].slice(0, 500);
        const tokens = recipients.map(recipient => recipient.token);
        if (recipients.length === 0) {
            await snapshot.ref.set({
                estado: "no_matching_recipients",
                recipient_count: 0,
                recipient_fingerprints: [],
                delivered_recipient_fingerprints: [],
                delivered_count: 0,
                processed_at: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return null;
        }
        const messageId = clean(event.message_id, 180);
        const notificationTitle = "Nueva solicitud disponible";
        const notificationBody = "Hay un servicio compatible con tu perfil operativo.";
        const technicianUrl = "https://fixgo-44e4d.web.app/tecnico.html";
        const response = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: {
                title: notificationTitle,
                body: notificationBody
            },
            data: {
                eventType: platformContract.EVENT_MARKETPLACE_SERVICE_AVAILABLE,
                serviceId: clean(event.service_id, 160),
                messageId,
                title: notificationTitle,
                body: notificationBody,
                alertProfile: "long_loud_vibration",
                url: "/tecnico.html"
            },
            android: {
                priority: "high",
                notification: { sound: "default", channelId: "gestia_requests" }
            },
            apns: {
                headers: { "apns-priority": "10" },
                payload: { aps: { sound: "default", badge: 1, contentAvailable: true } }
            },
            webpush: {
                headers: { Urgency: "high", TTL: "300" },
                notification: {
                    title: notificationTitle,
                    body: notificationBody,
                    icon: "https://fixgo-44e4d.web.app/icono-192.png",
                    badge: "https://fixgo-44e4d.web.app/icono-192.png",
                    vibrate: [700, 180, 700, 180, 700, 180, 1200],
                    requireInteraction: true,
                    silent: false,
                    renotify: true,
                    tag: messageId,
                    data: {
                        url: "/tecnico.html",
                        messageId,
                        serviceId: clean(event.service_id, 160),
                        eventType: platformContract.EVENT_MARKETPLACE_SERVICE_AVAILABLE
                    }
                },
                fcmOptions: { link: technicianUrl }
            }
        });
        await snapshot.ref.set({
            estado: "delivered",
            recipient_count: recipients.length,
            recipient_fingerprints: recipients.map(recipient => recipient.fingerprint),
            delivered_recipient_fingerprints: recipients
                .filter((_recipient, index) => response.responses?.[index]?.success === true)
                .map(recipient => recipient.fingerprint),
            delivered_count: response.successCount,
            failed_count: response.failureCount,
            processed_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return null;
    };
}

module.exports = {
    ACTIVE_SERVICE_STATES,
    buildMarketplaceListing,
    calculateAvailableBalance,
    createCancelB2cServiceHandler,
    createClaimB2cServiceHandler,
    createMarketplaceNotificationHandler,
    createRequestB2cWithdrawalHandler,
    createResyncCustomerPaymentsHandler,
    createResyncMarketplaceConfigHandler,
    createReleaseTechnicianLockHandler,
    createSyncB2cMarketplaceHandler,
    isCompatible,
    isOperationalTechnician,
    recipientFingerprint,
    syncMarketplaceService,
    vehicleData
};