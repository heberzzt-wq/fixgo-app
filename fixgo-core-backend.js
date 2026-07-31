/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - CORE FINANCIERO & SEGURIDAD (BACKEND ENGINE)
 * ======================================================================================
 * Este módulo es backend-only. Nunca debe incluir secretos en el repositorio ni confiar
 * en montos, estados o autorizaciones enviados por el navegador.
 * ======================================================================================
 */

import { db, admin } from "./firebase-admin-config.js";
import Stripe from "stripe";

export const FIXGO_CORE_BACKEND_VERSION = "6.0.0";

function textoSeguro(value, maxLength = 180) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function obtenerStripe() {
    const secretKey = textoSeguro(process.env.STRIPE_SECRET_KEY, 300);
    if (!secretKey) {
        throw new Error("STRIPE_SECRET_KEY_MISSING");
    }
    return new Stripe(secretKey);
}

function revisionCerrada(data, key) {
    const status = textoSeguro(
        data?.revision_administrativa?.[key]?.status,
        80
    ).toLowerCase();
    return status === "resolved" || status === "dismissed";
}

function razonesBloqueoFinanciero(data = {}) {
    const reasons = [];

    if (data.b2c_financial_hold?.active === true) {
        reasons.push("financial_hold_active");
    }
    if (
        data.llegada_revision_requerida === true &&
        !revisionCerrada(data, "arrival")
    ) {
        reasons.push("arrival_review_pending");
    }
    if (
        data.ausencia_cliente_revision_requerida === true &&
        !revisionCerrada(data, "no_show")
    ) {
        reasons.push("no_show_review_pending");
    }
    if (
        data.diagnostico_revision_requerida === true &&
        !revisionCerrada(data, "diagnostic")
    ) {
        reasons.push("diagnostic_review_pending");
    }
    if (
        data.trabajo_revision_requerida === true &&
        !revisionCerrada(data, "work")
    ) {
        reasons.push("work_review_pending");
    }
    if (data.llegada_resolucion_automatica_bloqueada === true) {
        reasons.push("automatic_resolution_blocked");
    }

    return reasons;
}

function numeroPositivo(value, fieldName) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${fieldName}_INVALID`);
    }
    return parsed;
}

/**
 * Cierre financiero backend idempotente.
 * No debe exponerse directamente al navegador sin autenticación y autorización previas.
 */
export async function procesarCierreServicio(serviceId, tecnicoId) {
    const safeServiceId = textoSeguro(serviceId, 160);
    const safeTechnicianId = textoSeguro(tecnicoId, 160);

    if (!safeServiceId || !safeTechnicianId) {
        throw new Error("FINANCIAL_CONTEXT_MISSING");
    }

    const servicioRef = db.collection("services").doc(safeServiceId);
    const transaccionRef = db
        .collection("transacciones")
        .doc(`settlement_${safeServiceId}`);

    return db.runTransaction(async (transaction) => {
        const [serviceSnapshot, existingSettlement] = await Promise.all([
            transaction.get(servicioRef),
            transaction.get(transaccionRef)
        ]);

        if (!serviceSnapshot.exists) {
            throw new Error("SERVICE_NOT_FOUND");
        }

        if (existingSettlement.exists) {
            return {
                success: true,
                idempotent: true,
                neto: Number(existingSettlement.data().pago_tecnico || 0)
            };
        }

        const data = serviceSnapshot.data();
        const assignedTechnician = textoSeguro(
            data.tecnico_id || data.technician_id || data.pro_id,
            160
        );

        if (!assignedTechnician || assignedTechnician !== safeTechnicianId) {
            throw new Error("TECHNICIAN_SERVICE_MISMATCH");
        }

        if (data.estado !== "trabajando") {
            throw new Error("INVALID_FINANCIAL_SERVICE_STATE");
        }

        const blockingReasons = razonesBloqueoFinanciero(data);
        if (blockingReasons.length > 0) {
            const error = new Error("FINANCIAL_HOLD_OR_REVIEW_PENDING");
            error.reasons = blockingReasons;
            throw error;
        }

        const costoTotal = numeroPositivo(data.costo_final, "SERVICE_TOTAL");
        const commissionRate = Number.isFinite(Number(data.tasa_comision_aplicada))
            ? Number(data.tasa_comision_aplicada)
            : 0.32;

        if (commissionRate < 0 || commissionRate > 1) {
            throw new Error("COMMISSION_RATE_INVALID");
        }

        const comisionFixGo = costoTotal * commissionRate;
        const retencionIVA = costoTotal * 0.08;
        const retencionISR = costoTotal * 0.10;
        const pagoNetoTecnico =
            costoTotal - (comisionFixGo + retencionIVA + retencionISR);

        if (pagoNetoTecnico < 0) {
            throw new Error("NEGATIVE_TECHNICIAN_SETTLEMENT");
        }

        transaction.update(servicioRef, {
            estado: "finalizado",
            finalizado_at: admin.firestore.FieldValue.serverTimestamp(),
            financial_settlement_id: transaccionRef.id,
            financial_settlement_version: FIXGO_CORE_BACKEND_VERSION,
            financial_settlement_idempotent: true,
            desglose_real: {
                comision_fixgo: comisionFixGo,
                retencion_iva: retencionIVA,
                retencion_isr: retencionISR,
                pago_neto: pagoNetoTecnico,
                tasa_comision: commissionRate
            }
        });

        transaction.set(transaccionRef, {
            servicio_id: safeServiceId,
            tecnico_id: safeTechnicianId,
            monto_total: costoTotal,
            comision_fixgo: comisionFixGo,
            retencion_iva: retencionIVA,
            retencion_isr: retencionISR,
            pago_tecnico: pagoNetoTecnico,
            fecha: admin.firestore.FieldValue.serverTimestamp(),
            tipo: "ingreso_servicio",
            verificado: true,
            idempotency_key: `settlement_${safeServiceId}`,
            engine_version: FIXGO_CORE_BACKEND_VERSION
        });

        return {
            success: true,
            idempotent: false,
            neto: pagoNetoTecnico
        };
    });
}

/**
 * Retiro deliberadamente cerrado hasta implementar saldo autoritativo e idempotencia.
 */
export async function ejecutarRetiroSeguro() {
    throw new Error("WITHDRAWAL_ENGINE_NOT_IMPLEMENTED_FAIL_CLOSED");
}

/**
 * Verificación estricta de firma Stripe. Este módulo no mueve fondos por sí solo.
 */
export async function procesarWebhookStripe(req, res) {
    try {
        const webhookSecret = textoSeguro(
            process.env.STRIPE_WEBHOOK_SECRET,
            300
        );
        if (!webhookSecret) {
            throw new Error("STRIPE_WEBHOOK_SECRET_MISSING");
        }

        const signature = req.headers?.["stripe-signature"];
        if (!signature) {
            return res.status(400).send("Missing Stripe signature");
        }

        const stripe = obtenerStripe();
        const rawBody = req.rawBody || req.body;
        const event = stripe.webhooks.constructEvent(
            rawBody,
            signature,
            webhookSecret
        );

        await db.collection("stripe_webhook_audit").doc(event.id).set({
            event_id: event.id,
            event_type: event.type,
            livemode: event.livemode === true,
            verified_signature: true,
            processed_financially: false,
            engine_version: FIXGO_CORE_BACKEND_VERSION,
            received_at: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: false });

        return res.status(200).json({
            received: true,
            verified: true,
            processed_financially: false
        });
    } catch (error) {
        console.error("[STRIPE_WEBHOOK_REJECTED]", error);
        return res.status(400).send("Invalid Stripe webhook");
    }
}
