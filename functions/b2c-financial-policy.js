"use strict";

/**
 * Política financiera B2C pura y reutilizable por endpoints/webhooks.
 * No accede a Firestore ni Stripe: solo valida datos ya leídos por el backend.
 */

const B2C_FINANCIAL_POLICY_VERSION = "1.0.0";
const INITIAL_AUTHORIZATION_AMOUNTS = Object.freeze([350, 550]);

function safeText(value, maxLength = 180) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function finiteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function money(value, code = "AMOUNT_INVALID") {
    const parsed = finiteNumber(value);
    if (parsed === null || parsed <= 0) {
        const error = new Error(code);
        error.code = code;
        throw error;
    }
    return Math.round(parsed * 100) / 100;
}

function sameMoney(left, right) {
    return Math.abs(Number(left) - Number(right)) <= 0.01;
}

function reviewClosed(ticketData, key) {
    const status = safeText(
        ticketData?.revision_administrativa?.[key]?.status,
        80
    ).toLowerCase();
    return status === "resolved" || status === "dismissed";
}

function financialBlockReasons(ticketData = {}) {
    const reasons = [];

    if (ticketData.b2c_financial_hold?.active === true) {
        reasons.push("financial_hold_active");
    }
    if (
        ticketData.llegada_revision_requerida === true &&
        !reviewClosed(ticketData, "arrival")
    ) {
        reasons.push("arrival_review_pending");
    }
    if (
        ticketData.ausencia_cliente_revision_requerida === true &&
        !reviewClosed(ticketData, "no_show")
    ) {
        reasons.push("no_show_review_pending");
    }
    if (
        ticketData.diagnostico_revision_requerida === true &&
        !reviewClosed(ticketData, "diagnostic")
    ) {
        reasons.push("diagnostic_review_pending");
    }
    if (
        ticketData.trabajo_revision_requerida === true &&
        !reviewClosed(ticketData, "work")
    ) {
        reasons.push("work_review_pending");
    }
    if (ticketData.llegada_resolucion_automatica_bloqueada === true) {
        reasons.push("automatic_resolution_blocked");
    }
    if (ticketData.llegada_cliente_respuesta === "ubicacion_disputada") {
        reasons.push("customer_arrival_dispute");
    }
    if (
        safeText(ticketData.ausencia_cliente_estado, 120)
            .includes("pendiente_revision")
    ) {
        reasons.push("customer_absence_pending_review");
    }

    return [...new Set(reasons)];
}

function assertNoFinancialBlock(ticketData) {
    const reasons = financialBlockReasons(ticketData);
    if (reasons.length === 0) return true;

    const error = new Error("FINANCIAL_HOLD_OR_REVIEW_PENDING");
    error.code = "FINANCIAL_HOLD_OR_REVIEW_PENDING";
    error.reasons = reasons;
    throw error;
}

function owningCustomer(ticketData = {}) {
    return safeText(
        ticketData.cliente_id || ticketData.customer_id,
        160
    );
}

function assignedTechnician(ticketData = {}) {
    return safeText(
        ticketData.tecnico_id ||
        ticketData.technician_id ||
        ticketData.pro_id,
        160
    );
}

function initialAuthorizationAmount(ticketData = {}) {
    const amount = money(
        ticketData.retencion_inicial ??
        ticketData.initial_authorization_amount,
        "INITIAL_AUTHORIZATION_AMOUNT_INVALID"
    );

    if (!INITIAL_AUTHORIZATION_AMOUNTS.some((allowed) => sameMoney(amount, allowed))) {
        const error = new Error("INITIAL_AUTHORIZATION_POLICY_MISMATCH");
        error.code = "INITIAL_AUTHORIZATION_POLICY_MISMATCH";
        error.allowed = INITIAL_AUTHORIZATION_AMOUNTS;
        error.received = amount;
        throw error;
    }

    return amount;
}

function balanceDue(ticketData = {}) {
    const total = money(ticketData.costo_final, "SERVICE_TOTAL_INVALID");
    const credited = Math.max(
        0,
        finiteNumber(ticketData.monto_pagado) ??
        finiteNumber(ticketData.retencion_inicial) ??
        0
    );
    const due = Math.round(Math.max(0, total - credited) * 100) / 100;

    if (due <= 0) {
        const error = new Error("NO_BALANCE_DUE");
        error.code = "NO_BALANCE_DUE";
        throw error;
    }

    return due;
}

function assertCustomerCheckout({
    ticketData,
    actorUid,
    paymentType,
    requestedAmount
}) {
    const safeActorUid = safeText(actorUid, 160);
    if (!safeActorUid || owningCustomer(ticketData) !== safeActorUid) {
        const error = new Error("CUSTOMER_SERVICE_MISMATCH");
        error.code = "CUSTOMER_SERVICE_MISMATCH";
        throw error;
    }

    const type = safeText(paymentType, 80);
    const state = safeText(ticketData.estado, 80);
    let authoritativeAmount;

    if (type === "garantia_inicial") {
        if (!["iniciado_stripe", "cotizando"].includes(state)) {
            const error = new Error("INVALID_INITIAL_PAYMENT_STATE");
            error.code = "INVALID_INITIAL_PAYMENT_STATE";
            throw error;
        }
        authoritativeAmount = initialAuthorizationAmount(ticketData);
    } else if (type === "liquidacion_saldo") {
        assertNoFinancialBlock(ticketData);
        if (!["cotizando", "procesando_saldo"].includes(state)) {
            const error = new Error("INVALID_BALANCE_PAYMENT_STATE");
            error.code = "INVALID_BALANCE_PAYMENT_STATE";
            throw error;
        }
        authoritativeAmount = balanceDue(ticketData);
    } else {
        const error = new Error("PAYMENT_TYPE_NOT_ALLOWED");
        error.code = "PAYMENT_TYPE_NOT_ALLOWED";
        throw error;
    }

    const submitted = money(requestedAmount, "REQUESTED_AMOUNT_INVALID");
    if (!sameMoney(authoritativeAmount, submitted)) {
        const error = new Error("PAYMENT_AMOUNT_MISMATCH");
        error.code = "PAYMENT_AMOUNT_MISMATCH";
        error.authoritativeAmount = authoritativeAmount;
        error.requestedAmount = submitted;
        throw error;
    }

    return {
        allowed: true,
        paymentType: type,
        authoritativeAmount,
        policyVersion: B2C_FINANCIAL_POLICY_VERSION
    };
}

function assertWebhookTransition({
    ticketData,
    paymentType,
    paidAmount
}) {
    const type = safeText(paymentType, 80);
    const state = safeText(ticketData.estado, 80);
    const paid = money(paidAmount, "PAID_AMOUNT_INVALID");

    if (type === "garantia_inicial") {
        const expected = initialAuthorizationAmount(ticketData);
        if (!sameMoney(expected, paid)) {
            const error = new Error("WEBHOOK_INITIAL_AMOUNT_MISMATCH");
            error.code = "WEBHOOK_INITIAL_AMOUNT_MISMATCH";
            throw error;
        }
        if (!["iniciado_stripe", "cotizando"].includes(state)) {
            const error = new Error("WEBHOOK_INITIAL_STATE_INVALID");
            error.code = "WEBHOOK_INITIAL_STATE_INVALID";
            throw error;
        }
        return {
            allowed: true,
            nextState: "pendiente",
            authoritativeAmount: expected,
            policyVersion: B2C_FINANCIAL_POLICY_VERSION
        };
    }

    if (type === "liquidacion_saldo") {
        assertNoFinancialBlock(ticketData);
        const expected = balanceDue(ticketData);
        if (!sameMoney(expected, paid)) {
            const error = new Error("WEBHOOK_BALANCE_AMOUNT_MISMATCH");
            error.code = "WEBHOOK_BALANCE_AMOUNT_MISMATCH";
            throw error;
        }
        if (!["procesando_saldo", "cotizando"].includes(state)) {
            const error = new Error("WEBHOOK_BALANCE_STATE_INVALID");
            error.code = "WEBHOOK_BALANCE_STATE_INVALID";
            throw error;
        }
        return {
            allowed: true,
            nextState: "trabajando",
            authoritativeAmount: expected,
            policyVersion: B2C_FINANCIAL_POLICY_VERSION
        };
    }

    const error = new Error("WEBHOOK_PAYMENT_TYPE_NOT_ALLOWED");
    error.code = "WEBHOOK_PAYMENT_TYPE_NOT_ALLOWED";
    throw error;
}

module.exports = {
    B2C_FINANCIAL_POLICY_VERSION,
    INITIAL_AUTHORIZATION_AMOUNTS,
    safeText,
    finiteNumber,
    sameMoney,
    reviewClosed,
    financialBlockReasons,
    assertNoFinancialBlock,
    owningCustomer,
    assignedTechnician,
    initialAuthorizationAmount,
    balanceDue,
    assertCustomerCheckout,
    assertWebhookTransition
};
