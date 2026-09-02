"use strict";

/**
 * ======================================================================================
 * GESTIAPREMIUM SECURE FUNCTIONS ENTRY 2026
 * ======================================================================================
 * Conserva los exports legacy y sustituye exclusivamente:
 * - api: checkout y webhook Stripe autoritativos; el resto delega al API legacy.
 * - onServiceCompleted: liquidación backend ligada a evidencia e incidencias.
 * ======================================================================================
 */

require("dotenv").config();

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");

if (!admin.apps.length) {
    admin.initializeApp({ projectId: "fixgo-44e4d" });
}

const db = admin.firestore();
const legacyExports = require("./index.js");
const financialPolicy = require("./b2c-financial-policy");
const platformContract = require("./b2c-platform-contract");
const {
    B2C_SERVICE_SETTLEMENT_VERSION,
    createB2CServiceSettlementEngine
} = require("./b2c-service-settlement");

const SECURE_FUNCTIONS_ENTRY_VERSION = "1.0.0";
const PROJECT_ID = "fixgo-44e4d";
const ALLOWED_ORIGINS = new Set([
    "https://fixgo-app-sf2l.vercel.app",
    "https://fixgo-44e4d.web.app",
    "https://fixgo-44e4d.firebaseapp.com",
    "http://localhost:5000",
    "http://127.0.0.1:5000"
]);

function safeText(value, maxLength = 240) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function getStripe() {
    const secret = safeText(process.env.STRIPE_SECRET_KEY, 300);
    if (!secret) {
        const error = new Error("STRIPE_SECRET_KEY_MISSING");
        error.code = "STRIPE_SECRET_KEY_MISSING";
        throw error;
    }
    return new Stripe(secret);
}

function allowedClientBase(req) {
    const origin = safeText(req.headers.origin, 300);
    if (ALLOWED_ORIGINS.has(origin)) return origin;
    return "https://fixgo-app-sf2l.vercel.app";
}

function applyCors(req, res, next) {
    const origin = safeText(req.headers.origin, 300);
    if (ALLOWED_ORIGINS.has(origin)) {
        res.set("Access-Control-Allow-Origin", origin);
        res.set("Vary", "Origin");
    }
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, X-Requested-With"
    );
    res.set("Access-Control-Max-Age", "3600");

    if (req.method === "OPTIONS") {
        return res.status(204).send("");
    }

    return next();
}

async function authenticateRequest(req) {
    const authHeader = safeText(
        req.headers.authorization || req.headers.Authorization,
        4000
    );
    if (!authHeader.startsWith("Bearer ")) {
        const error = new Error("AUTH_REQUIRED");
        error.code = "AUTH_REQUIRED";
        error.httpStatus = 401;
        throw error;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const decoded = await admin.auth().verifyIdToken(token, true);
    const userSnapshot = await db.collection("users").doc(decoded.uid).get();
    const userData = userSnapshot.exists ? userSnapshot.data() : {};

    return {
        uid: decoded.uid,
        email: safeText(decoded.email, 240).toLowerCase(),
        tenantId: safeText(
            decoded.tenantId ||
            userData.tenantId ||
            userData.condominioId,
            160
        ),
        userData
    };
}

function checkoutIdempotencyKey({ serviceId, paymentType, amount }) {
    return [
        "checkout",
        safeText(serviceId, 120),
        safeText(paymentType, 60),
        Math.round(Number(amount) * 100),
        SECURE_FUNCTIONS_ENTRY_VERSION
    ].join("_");
}

async function createAuthoritativeCheckout(req, res) {
    const traceId = `secure_checkout_${Date.now()}`;

    try {
        const actor = await authenticateRequest(req);
        const serviceId = safeText(req.body?.serviceId, 160);
        const paymentType = safeText(req.body?.tipo_pago, 80);
        const requestedAmount = req.body?.monto;

        if (!serviceId) {
            return res.status(400).json({
                error: "SERVICE_ID_REQUIRED",
                traceId
            });
        }

        const serviceRef = db.collection("services").doc(serviceId);
        const [serviceSnapshot, paymentConfigSnapshot] = await Promise.all([
            serviceRef.get(),
            db.collection("configuracion").doc("pagos").get()
        ]);
        if (!serviceSnapshot.exists) {
            return res.status(404).json({
                error: "SERVICE_NOT_FOUND",
                traceId
            });
        }

        const serviceData = serviceSnapshot.data();
        const paymentAuthorization = platformContract.assertPaymentMethodAllowed(
            platformContract.PAYMENT_METHODS.STRIPE,
            paymentConfigSnapshot.exists ? paymentConfigSnapshot.data() || {} : {},
            actor.userData
        );
        if (!paymentAuthorization.ok) {
            const error = new Error(paymentAuthorization.reason);
            error.code = paymentAuthorization.reason;
            error.httpStatus = 403;
            throw error;
        }
        const validation = financialPolicy.assertCustomerCheckout({
            ticketData: serviceData,
            actorUid: actor.uid,
            paymentType,
            requestedAmount
        });

        const serviceTenant = safeText(
            serviceData.tenantId ||
            serviceData.tenant_id ||
            serviceData.condominioId,
            160
        );
        if (
            actor.tenantId &&
            serviceTenant &&
            actor.tenantId !== serviceTenant
        ) {
            const error = new Error("TENANT_MISMATCH");
            error.code = "TENANT_MISMATCH";
            error.httpStatus = 403;
            throw error;
        }

        const baseUrl = allowedClientBase(req);
        const stripe = getStripe();
        const description = safeText(
            req.body?.descripcion || serviceData.descripcion,
            180
        ) || "Servicio GestiaPremium";
        const clientType = safeText(
            serviceData.clientType || serviceData.client_type,
            60
        ) || "ON_DEMAND";
        const idempotencyKey = checkoutIdempotencyKey({
            serviceId,
            paymentType,
            amount: validation.authoritativeAmount
        });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: [{
                price_data: {
                    currency: "mxn",
                    product_data: {
                        name: description,
                        description: `Folio: ${serviceId}`
                    },
                    unit_amount: Math.round(
                        validation.authoritativeAmount * 100
                    )
                },
                quantity: 1
            }],
            mode: "payment",
            success_url:
                `${baseUrl}/cliente.html?pago=exito&serviceId=${encodeURIComponent(serviceId)}`,
            cancel_url:
                `${baseUrl}/cliente.html?pago=cancelado&serviceId=${encodeURIComponent(serviceId)}`,
            metadata: {
                serviceId,
                tipo_pago: paymentType,
                clientType,
                tenantId: serviceTenant || actor.tenantId || "default",
                customerUid: actor.uid,
                authoritativeAmount:
                    validation.authoritativeAmount.toFixed(2),
                policyVersion: validation.policyVersion,
                secureEntryVersion: SECURE_FUNCTIONS_ENTRY_VERSION,
                traceId
            }
        }, {
            idempotencyKey
        });

        if (paymentType === "liquidacion_saldo" && serviceData.estado === "cotizando") {
            await db.runTransaction(async transaction => {
                const currentSnapshot = await transaction.get(serviceRef);
                if (!currentSnapshot.exists) throw new Error("SERVICE_NOT_FOUND");
                if (currentSnapshot.data().estado === "cotizando") {
                    transaction.update(serviceRef, {
                        estado: "procesando_saldo",
                        checkout_saldo_session_id: session.id,
                        checkout_saldo_iniciado_at: admin.firestore.FieldValue.serverTimestamp(),
                        "auditoria.balance_checkout_authority": "secure-entry"
                    });
                }
            });
        }

        await db.collection("payment_checkout_audit").doc(idempotencyKey).set({
            service_id: serviceId,
            customer_uid: actor.uid,
            payment_type: paymentType,
            authoritative_amount: validation.authoritativeAmount,
            stripe_session_id: session.id,
            stripe_session_url_created: Boolean(session.url),
            trace_id: traceId,
            policy_version: validation.policyVersion,
            secure_entry_version: SECURE_FUNCTIONS_ENTRY_VERSION,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            updated_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return res.status(200).json({
            id: session.id,
            url: session.url,
            traceId,
            authoritativeAmount: validation.authoritativeAmount
        });
    } catch (error) {
        const status = Number(error.httpStatus) || (
            [
                "AUTH_REQUIRED",
                "CUSTOMER_SERVICE_MISMATCH"
            ].includes(error.code)
                ? 401
                : ["TENANT_MISMATCH"].includes(error.code)
                    ? 403
                    : 400
        );

        console.error("[SECURE_CHECKOUT_REJECTED]", {
            traceId,
            code: error.code || error.message,
            message: error.message
        });

        return res.status(status).json({
            error: safeText(error.code || error.message, 180),
            traceId
        });
    }
}

async function processAuthoritativeWebhook(req, res) {
    const traceId = `secure_webhook_${Date.now()}`;
    let event;

    try {
        const webhookSecret = safeText(
            process.env.STRIPE_WEBHOOK_SECRET,
            300
        );
        if (!webhookSecret) {
            throw new Error("STRIPE_WEBHOOK_SECRET_MISSING");
        }

        const signature = req.headers["stripe-signature"];
        if (!signature) throw new Error("STRIPE_SIGNATURE_MISSING");

        const stripe = getStripe();
        const rawBody = req.rawBody || req.body;
        event = stripe.webhooks.constructEvent(
            rawBody,
            signature,
            webhookSecret
        );
    } catch (error) {
        console.error("[SECURE_WEBHOOK_SIGNATURE_REJECTED]", {
            traceId,
            error: error.message
        });
        return res.status(400).send("Invalid Stripe webhook");
    }

    const eventRef = db.collection("stripe_events").doc(event.id);

    try {
        const result = await db.runTransaction(async (transaction) => {
            const eventSnapshot = await transaction.get(eventRef);
            if (eventSnapshot.exists) {
                return { status: "already_processed" };
            }

            if (event.type !== "checkout.session.completed") {
                transaction.set(eventRef, {
                    event_id: event.id,
                    event_type: event.type,
                    processed: true,
                    financial_effect: false,
                    trace_id: traceId,
                    secure_entry_version: SECURE_FUNCTIONS_ENTRY_VERSION,
                    processed_at:
                        admin.firestore.FieldValue.serverTimestamp()
                });
                return { status: "ignored_event_type" };
            }

            const session = event.data.object;
            const metadata = session.metadata || {};
            const serviceId = safeText(metadata.serviceId, 160);
            const paymentType = safeText(metadata.tipo_pago, 80);
            const paidAmount = Number(session.amount_total || 0) / 100;

            if (!serviceId) throw new Error("WEBHOOK_SERVICE_ID_MISSING");

            const serviceRef = db.collection("services").doc(serviceId);
            const serviceSnapshot = await transaction.get(serviceRef);
            if (!serviceSnapshot.exists) throw new Error("SERVICE_NOT_FOUND");

            const serviceData = serviceSnapshot.data();
            const metadataCustomerUid = safeText(metadata.customerUid, 160);
            if (
                metadataCustomerUid &&
                financialPolicy.owningCustomer(serviceData) !== metadataCustomerUid
            ) {
                throw new Error("WEBHOOK_CUSTOMER_MISMATCH");
            }

            const serviceTenant = safeText(
                serviceData.tenantId ||
                serviceData.tenant_id ||
                serviceData.condominioId,
                160
            );
            const metadataTenant = safeText(metadata.tenantId, 160);
            if (
                serviceTenant &&
                metadataTenant &&
                serviceTenant !== metadataTenant
            ) {
                throw new Error("WEBHOOK_TENANT_MISMATCH");
            }

            const transition = financialPolicy.assertWebhookTransition({
                ticketData: serviceData,
                paymentType,
                paidAmount
            });

            const transactionRef = db
                .collection("transacciones")
                .doc(`stripe_${event.id}`);

            transaction.update(serviceRef, {
                estado: transition.nextState,
                metodo_pago: "stripe",
                ultimo_pago_id: session.id,
                ultimo_payment_intent_id:
                    safeText(session.payment_intent, 180) || null,
                fecha_pago: admin.firestore.FieldValue.serverTimestamp(),
                monto_pagado:
                    admin.firestore.FieldValue.increment(
                        transition.authoritativeAmount
                    ),
                "auditoria.ultimo_trace_pago": traceId,
                "auditoria.politica_financiera":
                    transition.policyVersion,
                "auditoria.secure_entry_version":
                    SECURE_FUNCTIONS_ENTRY_VERSION
            });

            transaction.set(transactionRef, {
                servicio_id: serviceId,
                cliente_id: financialPolicy.owningCustomer(serviceData),
                tenant_id: serviceTenant || metadataTenant || null,
                monto_total: transition.authoritativeAmount,
                tipo_pago: paymentType,
                metodo: "stripe",
                stripe_session_id: session.id,
                stripe_payment_intent_id:
                    safeText(session.payment_intent, 180) || null,
                stripe_event_id: event.id,
                fecha: admin.firestore.FieldValue.serverTimestamp(),
                estado: "completado",
                trace_id: traceId,
                idempotency_key: transactionRef.id,
                policy_version: transition.policyVersion,
                secure_entry_version: SECURE_FUNCTIONS_ENTRY_VERSION
            });

            transaction.set(eventRef, {
                event_id: event.id,
                event_type: event.type,
                service_id: serviceId,
                processed: true,
                financial_effect: true,
                transaction_id: transactionRef.id,
                trace_id: traceId,
                secure_entry_version: SECURE_FUNCTIONS_ENTRY_VERSION,
                processed_at: admin.firestore.FieldValue.serverTimestamp()
            });

            return {
                status: "processed",
                serviceId,
                nextState: transition.nextState
            };
        });

        return res.status(200).json({
            received: true,
            status: result.status,
            traceId
        });
    } catch (error) {
        console.error("[SECURE_WEBHOOK_BLOCKED]", {
            traceId,
            eventId: event?.id || null,
            code: error.code || error.message,
            message: error.message
        });

        await db.collection("failed_events").doc(event?.id || traceId).set({
            event_id: event?.id || null,
            event_type: event?.type || null,
            error_code: safeText(error.code || error.message, 180),
            retry_required: true,
            trace_id: traceId,
            secure_entry_version: SECURE_FUNCTIONS_ENTRY_VERSION,
            created_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return res.status(500).json({
            received: false,
            retry: true,
            traceId
        });
    }
}

const secureApi = express();
secureApi.disable("x-powered-by");

secureApi.post(
    ["/", "/webhook", "/stripe-webhook"],
    express.raw({ type: "application/json" }),
    processAuthoritativeWebhook
);

secureApi.use(cors({ origin: false }));
secureApi.use(applyCors);
secureApi.use(express.json({ limit: "1mb" }));
secureApi.post("/create-checkout-session", createAuthoritativeCheckout);

secureApi.use((req, res) => {
    if (typeof legacyExports.api !== "function") {
        return res.status(503).json({
            error: "LEGACY_API_UNAVAILABLE",
            secureEntryVersion: SECURE_FUNCTIONS_ENTRY_VERSION
        });
    }
    return legacyExports.api(req, res);
});

const settleCompletedService = createB2CServiceSettlementEngine({
    admin,
    db,
    financialPolicy,
    reportMetric: async (metricName, value = 1) => {
        try {
            const day = new Date().toISOString().slice(0, 10);
            await db.collection("gestia_system_health").doc(day).set({
                [metricName]: admin.firestore.FieldValue.increment(value),
                last_heartbeat: admin.firestore.FieldValue.serverTimestamp(),
                settlement_version: B2C_SERVICE_SETTLEMENT_VERSION
            }, { merge: true });
        } catch (error) {
            console.warn("[SETTLEMENT_METRIC_WARNING]", error.message);
        }
    }
});

const secureOnServiceCompleted = functions.firestore
    .document("services/{serviceId}")
    .onUpdate(async (change, context) => {
        const after = change.after.data();

        if (
            after.estado !== "finalizado" ||
            after.liquidado === true ||
            after.cierre_financiero_pendiente_backend !== true
        ) {
            return null;
        }

        try {
            await settleCompletedService({
                serviceId: context.params.serviceId
            });
        } catch (error) {
            console.error("[SECURE_SERVICE_SETTLEMENT_BLOCKED]", {
                serviceId: context.params.serviceId,
                code: error.code || error.message,
                message: error.message
            });
        }

        return null;
    });

module.exports = {
    ...legacyExports,
    api: functions.https.onRequest(secureApi),
    onServiceCompleted: secureOnServiceCompleted
};
