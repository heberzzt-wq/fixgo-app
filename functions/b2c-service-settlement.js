"use strict";

const B2C_SERVICE_SETTLEMENT_VERSION = "1.0.0";

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
        serviceData.costo_final ?? serviceData.monto_total,
        "SERVICE_TOTAL_INVALID"
    );
    const method = safeText(serviceData.metodo_pago, 40).toLowerCase();
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
        commissionRate = Math.max(0, Math.min(1, (total - technicianAmount) / total));
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

    const platformAmount = Math.round((total - Math.abs(
        method === "efectivo" ? technicianAmount : technicianAmount
    )) * 100) / 100;

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
                    transaction.update(serviceRef, {
                        liquidado: true,
                        cierre_financiero_pendiente_backend: false,
                        ledger_transaction_id: ledgerRef.id,
                        fecha_liquidacion: admin.firestore.FieldValue.serverTimestamp(),
                        settlement_reconciled: true,
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
                if (current.liquidacion_bloqueada !== true) {
                    await serviceRef.set({
                        liquidacion_bloqueada: true,
                        liquidacion_bloqueo_codigo:
                            safeText(error.code || error.message, 160),
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
    safeText,
    finiteNumber,
    bindingValid,
    calculateSettlement,
    assertPaymentCoverage,
    createB2CServiceSettlementEngine
};
