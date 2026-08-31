"use strict";

const platformContract = require("./b2c-platform-contract");

function clean(value, maxLength = 500) {
    return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeQuote(input = {}) {
    const diagnostic = clean(input.diagnostic, 4000);
    if (diagnostic.length < 10) throw new Error("DIAGNOSTIC_TOO_SHORT");
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) {
        throw new Error("QUOTE_ITEMS_INVALID");
    }
    const items = input.items.map((item, index) => {
        const quantity = Number(item?.cantidad);
        const unitPrice = Number(item?.precio);
        const description = clean(item?.descripcion, 300);
        const unit = clean(item?.unidad, 40) || "pz";
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000) {
            throw new Error(`QUOTE_QUANTITY_INVALID_${index}`);
        }
        if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 1000000) {
            throw new Error(`QUOTE_PRICE_INVALID_${index}`);
        }
        if (description.length < 2) throw new Error(`QUOTE_DESCRIPTION_INVALID_${index}`);
        return {
            cantidad: Math.round(quantity * 1000) / 1000,
            unidad: unit,
            descripcion: description,
            precio: Math.round(unitPrice * 100) / 100
        };
    });
    const total = Math.round(items.reduce((sum, item) => sum + item.cantidad * item.precio, 0) * 100) / 100;
    if (!Number.isFinite(total) || total <= 0 || total > 5000000) throw new Error("QUOTE_TOTAL_INVALID");
    const factor = Number(input.factor);
    return {
        diagnostic,
        items,
        total,
        factor: Number.isFinite(factor) && factor > 0 && factor <= 10
            ? Math.round(factor * 10000) / 10000
            : 1
    };
}

function callableError(functions, code, message) {
    return new functions.https.HttpsError(code, message);
}

function createSubmitB2cQuoteHandler({ admin, db, functions }) {
    if (!admin || !db || !functions) throw new Error("B2C_QUOTE_DEPENDENCIES_REQUIRED");
    return async (data, context) => {
        const technicianId = context?.auth?.uid;
        if (!technicianId) throw callableError(functions, "unauthenticated", "Se requiere sesión técnica.");
        const serviceId = clean(data?.serviceId, 160);
        if (!serviceId) throw callableError(functions, "invalid-argument", "serviceId es obligatorio.");
        let quote;
        try {
            quote = normalizeQuote(data);
        } catch (error) {
            throw callableError(functions, "invalid-argument", error.message);
        }

        return db.runTransaction(async transaction => {
            const serviceRef = db.collection("services").doc(serviceId);
            const snapshot = await transaction.get(serviceRef);
            if (!snapshot.exists) throw callableError(functions, "not-found", "No existe el servicio.");
            const service = snapshot.data() || {};
            if (service.tecnico_id !== technicianId) {
                throw callableError(functions, "permission-denied", "El servicio pertenece a otro técnico.");
            }
            if (service.estado !== platformContract.SERVICE_STATES.ON_SITE) {
                throw callableError(functions, "failed-precondition", "El servicio no está listo para cotizar.");
            }
            if (service.diagnostico_cotizacion_desbloqueada !== true || !service.diagnostico_inicial_evidencia) {
                throw callableError(functions, "failed-precondition", "Falta la evidencia diagnóstica sellada.");
            }
            const timestamp = admin.firestore.FieldValue.serverTimestamp();
            transaction.update(serviceRef, {
                estado: platformContract.SERVICE_STATES.QUOTING,
                diagnostico: quote.diagnostic,
                detalles_cotizacion: quote.items,
                costo_final: quote.total,
                cotizado_at: timestamp,
                factor_aplicado: quote.factor,
                "auditoria.quote_authority": "submitB2cQuote",
                "auditoria.quoted_by": technicianId,
                "auditoria.quoted_at": timestamp
            });
            return { ok: true, serviceId, estado: "cotizando", total: quote.total };
        });
    };
}

function createRespondB2cQuoteHandler({ admin, db, functions }) {
    if (!admin || !db || !functions) throw new Error("B2C_QUOTE_RESPONSE_DEPENDENCIES_REQUIRED");
    return async (data, context) => {
        const customerId = context?.auth?.uid;
        if (!customerId) throw callableError(functions, "unauthenticated", "Se requiere sesión de cliente.");
        const serviceId = clean(data?.serviceId, 160);
        const accepted = data?.accepted === true;
        if (!serviceId) throw callableError(functions, "invalid-argument", "serviceId es obligatorio.");

        return db.runTransaction(async transaction => {
            const serviceRef = db.collection("services").doc(serviceId);
            const snapshot = await transaction.get(serviceRef);
            if (!snapshot.exists) throw callableError(functions, "not-found", "No existe el servicio.");
            const service = snapshot.data() || {};
            if (service.cliente_id !== customerId) {
                throw callableError(functions, "permission-denied", "El servicio pertenece a otro cliente.");
            }
            if (service.estado !== platformContract.SERVICE_STATES.QUOTING) {
                throw callableError(functions, "failed-precondition", "La cotización ya no está pendiente.");
            }
            const timestamp = admin.firestore.FieldValue.serverTimestamp();
            if (!accepted) {
                transaction.update(serviceRef, {
                    estado: "cancelado",
                    costo_final: 550,
                    cancelado_razon: "Cliente rechazó cotización",
                    cancelado_at: timestamp,
                    "auditoria.quote_decision_authority": "respondB2cQuote",
                    "auditoria.quote_decision_by": customerId,
                    "auditoria.quote_decision_at": timestamp
                });
                return { ok: true, serviceId, estado: "cancelado" };
            }

            const total = Number(service.costo_final || 0);
            const credited = Math.max(0, Number(service.monto_pagado ?? service.retencion_inicial ?? 0));
            const due = Math.round(Math.max(0, total - credited) * 100) / 100;
            const requiresPayment = service.metodo_pago === platformContract.PAYMENT_METHODS.STRIPE && due > 0.009;
            const nextState = requiresPayment
                ? platformContract.SERVICE_STATES.PROCESSING_BALANCE
                : platformContract.SERVICE_STATES.WORKING;
            transaction.update(serviceRef, {
                estado: nextState,
                cotizacion_aceptada_at: timestamp,
                cotizacion_aceptada_por: customerId,
                "auditoria.quote_decision_authority": "respondB2cQuote"
            });
            return { ok: true, serviceId, estado: nextState, requiresPayment, balanceDue: due };
        });
    };
}

module.exports = {
    createRespondB2cQuoteHandler,
    createSubmitB2cQuoteHandler,
    normalizeQuote
};
