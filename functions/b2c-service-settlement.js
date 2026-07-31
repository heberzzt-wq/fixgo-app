"use strict";

const B2C_SERVICE_SETTLEMENT_VERSION = "1.0.1";
const ALLOWED_PAYMENT_METHODS = new Set(["stripe", "efectivo", "b2b"]);

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

function positiveMoney(value, code) {
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

function bindingValid(binding = {}, serviceId, technicianId) {
    return Boolean(
        safeText(binding.service_id, 160) === safeText(serviceId, 160) &&
        safeText(binding.technician_id, 160) === safeText(technicianId, 160) &&
        binding.before?.sha256 &&
        binding.before?.storage_path &&
        binding.before?.download_url &&
        binding.after?.sha256 &&
        binding.after?.storage_path &&
        binding.after?.download_url &&
        binding.signature?.present === true &&
        binding.signature?.sha256 &&
        binding.signature?.storage_path &&
        binding.signature?.download_url &&
        binding.signature?.base64_persisted === false
    );
}

function calculateSettlement(serviceData = {}) {
    const total = positiveMoney(
        serviceData.costo_final,
        "SERVICE_TOTAL_INVALID"
    );
    const method = safeText(serviceData.metodo_pago, 40).toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(method)) {
        const error = new Error("PAYMENT_METHOD_NOT_ALLOWED");
        error.code = "PAYMENT_METHOD_NOT_ALLOWED";
        throw error;
    }

    const clientType = safeText(
        serviceData.clientType || serviceData.client_type,
        60
    ) || "ON_DEMAND";

    let commissionRate = 0.32;
    let technicianAmount;

    if (clientType === "B2B_UXMAL" || method === "b2b") {
        const fixed = finiteNumber(serviceData.monto_tecnico_fijo);
        technicianAmount = fixed !== null
            ? Math.round(fixed * 100) / 100
            : Math.round(total * 0.85 * 100) / 100;

        if (technicianAmount < 0 || technicianAmount > total) {
            const error = new Error("B2B_TECHNICIAN_AMOUNT_INVALID");
            error.code = "B2B_TECHNICIAN_AMOUNT_INVALID";
            throw error;
        }

        commissionRate = Math.round(
            ((total - technicianAmount) / total) * 1000000
        ) / 1000000;
    } else {
        const configured = finiteNumber(
            serviceData.tasa_comision_aplicada ?? serviceData.comision_asignada
        );
        if (configured !== null) commissionRate = configured;
        if (commissionRate < 0 || commissionRate > 1) {
            const error = new Error("COMMISSION_RATE_INVALID");
            error.code = "COMMISSION_RATE_INVALID";
            throw error;
        }

        const commission = Math.round(total * commissionRate * 100) / 100;
        technicianAmount = method === "efectivo"
            ? -commission
            : Math.round((total - commission) * 100) / 100;
    }

    return {
        total,
        method,
        clientType,
        commissionRate,
        technicianAmount,
        platformAmount: Math.round(total * commissionRate * 100) / 100
    };
}

function assertPaymentCoverage(serviceData, settlement) {
    if (settlement.method !== "stripe") return true;

    const paid = Math.max(0, finiteNumber(serviceData.monto_pagado) || 0);
    if (paid + 0.01 < settlement.total) {
        const error = new Error("STRIPE_PAYMENT_INCOMPLETE");
        error.code = "STRIPE_PAYMENT_INCOMPLETE";
        error.paid = paid;
        error.required = settlement.total;
        throw error;
    }

    return true;
}

function existingLedgerValid(ledger = {}, {
    serviceId,
    technicianId,
    settlement,
    bindingPath,
    ledgerId
}) {
    return Boolean(
        safeText(ledger.servicio_id, 160) === safeText(serviceId, 160) &&
        safeText(ledger.tecnico_id, 160) === safeText(technicianId, 160) &&
        safeText(ledger.idempotency_key, 200) === safeText(ledgerId, 200) &&
        safeText(ledger.evidence_binding_path, 500) ===
            safeText(bindingPath, 500) &&
        sameMoney(ledger.monto_total, settlement.total) &&
        sameMoney(ledger.pago_tecnico, settlement.technicianAmount) &&
        sameMoney(ledger.comision_gestia, settlement.platformAmount)
    );
}

function createB2CServiceSettlementEngine({
    admin,
    db,
    financialPolicy,
    reportMetric = async () => {}
}) {
    if (!admin || !db || !financialPolicy) {
        throw new Error("SETTLEMENT_DEPENDENCY_MISSING");
    }

    const {
        assertNoFinancialBlock,
        assignedTechnician
    } = financialPolicy;

    return async function settleCompletedService({ serviceId }) {
        const safeServiceId = safeText(serviceId, 160);
        if (!safeServiceId) throw new Error("SERVICE_ID_MISSING");

        const serviceRef = db.collection("services").doc(safeServiceId);
        const bindingRef = serviceRef
            .collection("work_evidence_bindings")
            .doc("current");
        const ledgerRef = db
            .collection("transacciones")
            .doc(`txn_split_${safeServiceId}`);

        try {
            const result = await db.runTransaction(async (transaction) => {
                const [serviceSnapshot, bindingSnapshot, ledgerSnapshot] =
                    await Promise.all([
                        transaction.get(serviceRef),
                        transaction.get(bindingRef),
                        transaction.get(ledgerRef)
                    ]);

                if (!serviceSnapshot.exists) {
                    throw new Error("SERVICE_NOT_FOUND");
                }

                const serviceData = serviceSnapshot.data();

                if (serviceData.liquidado === true) {
                    return {
                        status: "already_settled",
                        ledgerId: serviceData.ledger_transaction_id || ledgerRef.id
                    };
                }

                if (serviceData.estado !== "finalizado") {
                    return { status: "ignored_not_finalized" };
                }

                if (
                    serviceData.cierre_operativo_completado !== true ||
                    serviceData.cierre_financiero_pendiente_backend !== true ||
                    serviceData.cierre_legacy_financiero_ejecutado !== false ||
                    safeText(serviceData.work_evidence_binding_path, 500) !== bindingRef.path
                ) {
                    const error = new Error("UNTRUSTED_SERVICE_CLOSE");
                    error.code = "UNTRUSTED_SERVICE_CLOSE";
                    throw error;
                }

                assertNoFinancialBlock(serviceData);

                const technicianId = assignedTechnician(serviceData);
                if (!technicianId) {
                    throw new Error("TECHNICIAN_ASSIGNMENT_MISSING");
                }

                const binding = bindingSnapshot.exists
                    ? bindingSnapshot.data()
                    : null;
                if (!bindingValid(binding, safeServiceId, technicianId)) {
                    throw new Error("FINAL_EVIDENCE_BINDING_INVALID");
                }

                const settlement = calculateSettlement(serviceData);
                assertPaymentCoverage(serviceData, settlement);

                if (ledgerSnapshot.exists) {
                    if (!existingLedgerValid(ledgerSnapshot.data(), {
                        serviceId: safeServiceId,
                        technicianId,
                        settlement,
                        bindingPath: bindingRef.path,
                        ledgerId: ledgerRef.id
                    })) {
                        const error = new Error("EXISTING_LEDGER_MISMATCH");
                        error.code = "EXISTING_LEDGER_MISMATCH";
                        throw error;
                    }

                    transaction.update(serviceRef, {
                        liquidado: true,
                        cierre_financiero_pendiente_backend: false,
                        ledger_transaction_id: ledgerRef.id,
                        fecha_liquidacion: admin.firestore.FieldValue.serverTimestamp(),
                        settlement_reconciled: true,
                        liquidacion_bloqueada: false,
                        liquidacion_bloqueo_codigo: null,
                        settlement_version: B2C_SERVICE_SETTLEMENT_VERSION
                    });

                    return {
                        status: "reconciled_existing_ledger",
                        ledgerId: ledgerRef.id,
                        settlement
                    };
                }

                let customerRef = null;
                let customerBalance = null;

                if (settlement.method === "b2b") {
                    const customerId = safeText(
                        serviceData.cliente_id || serviceData.customer_id,
                        160
                    );
                    if (!customerId) throw new Error("B2B_CUSTOMER_MISSING");

                    customerRef = db.collection("users").doc(customerId);
                    const customerSnapshot = await transaction.get(customerRef);
                    if (!customerSnapshot.exists) {
                        throw new Error("B2B_CUSTOMER_NOT_FOUND");
                    }

                    customerBalance = finiteNumber(
                        customerSnapshot.data().saldo_virtual
                    );
                    if (customerBalance === null) {
                        throw new Error("B2B_BALANCE_INVALID");
                    }
                    if (customerBalance + 0.01 < settlement.total) {
                        throw new Error("B2B_BALANCE_INSUFFICIENT");
                    }
                }

                transaction.set(ledgerRef, {
                    payout_id: ledgerRef.id,
                    servicio_id: safeServiceId,
                    tecnico_id: technicianId,
                    cliente_id: serviceData.cliente_id || null,
                    monto_total: settlement.total,
                    pago_tecnico: settlement.technicianAmount,
                    ganancia_tecnico: settlement.technicianAmount,
                    ganancia_gestia: settlement.platformAmount,
                    comision_gestia: settlement.platformAmount,
                    tasa_comision: settlement.commissionRate,
                    metodo_pago: settlement.method,
                    client_type: settlement.clientType,
                    fecha: admin.firestore.FieldValue.serverTimestamp(),
                    tipo: settlement.method === "efectivo"
                        ? "comision_efectivo_pendiente_cobro"
                        : "cierre_servicio_split",
                    estado: "auditado",
                    evidence_binding_path: bindingRef.path,
                    idempotency_key: ledgerRef.id,
                    tax_treatment: "pending_accounting_validation",
                    version_core: B2C_SERVICE_SETTLEMENT_VERSION
                });

                if (customerRef) {
                    transaction.update(customerRef, {
                        saldo_virtual: Math.round(
                            (customerBalance - settlement.total) * 100
                        ) / 100,
                        ultimo_cargo_b2b_service_id: safeServiceId,
                        saldo_virtual_actualizado_at:
                            admin.firestore.FieldValue.serverTimestamp()
                    });
                }

                transaction.update(serviceRef, {
                    liquidado: true,
                    cierre_financiero_pendiente_backend: false,
                    ledger_transaction_id: ledgerRef.id,
                    fecha_liquidacion: admin.firestore.FieldValue.serverTimestamp(),
                    comision_aplicada_tecnico: settlement.technicianAmount,
                    comision_aplicada_plataforma: settlement.platformAmount,
                    settlement_method: settlement.method,
                    liquidacion_bloqueada: false,
                    liquidacion_bloqueo_codigo: null,
                    settlement_version: B2C_SERVICE_SETTLEMENT_VERSION
                });

                return {
                    status: "settled",
                    ledgerId: ledgerRef.id,
                    settlement
                };
            });

            if (result.status === "settled") {
                await reportMetric("service_liquidation_success");
                if (result.settlement.platformAmount > 0) {
                    await reportMetric(
                        "gestia_revenue_collected",
                        result.settlement.platformAmount
                    );
                }
            }

            return result;
        } catch (error) {
            await reportMetric("service_liquidation_blocked");

            const serviceSnapshot = await serviceRef.get();
            if (serviceSnapshot.exists) {
                const current = serviceSnapshot.data();
                const blockCode = safeText(error.code || error.message, 160);
                if (
                    current.liquidacion_bloqueada !== true ||
                    current.liquidacion_bloqueo_codigo !== blockCode
                ) {
                    await serviceRef.set({
                        liquidacion_bloqueada: true,
                        liquidacion_bloqueo_codigo: blockCode,
                        liquidacion_bloqueada_at:
                            admin.firestore.FieldValue.serverTimestamp(),
                        settlement_version: B2C_SERVICE_SETTLEMENT_VERSION
                    }, { merge: true });
                }
            }

            throw error;
        }
    };
}

module.exports = {
    B2C_SERVICE_SETTLEMENT_VERSION,
    ALLOWED_PAYMENT_METHODS,
    safeText,
    finiteNumber,
    sameMoney,
    bindingValid,
    calculateSettlement,
    assertPaymentCoverage,
    existingLedgerValid,
    createB2CServiceSettlementEngine
};
