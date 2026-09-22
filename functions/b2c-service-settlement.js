"use strict";

const crypto = require("node:crypto");
const platformContract = require("./b2c-platform-contract");

const B2C_SERVICE_SETTLEMENT_VERSION = "1.0.1";
const ALLOWED_PAYMENT_METHODS = new Set(Object.values(platformContract.PAYMENT_METHODS));

function safeText(value, maxLength = 180) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function finiteNumber(value) {
    if (value === null || value === undefined || typeof value === "boolean" || (typeof value === "string" && !value.trim())) return null;
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
    return finiteNumber(left) !== null && finiteNumber(right) !== null && Math.round(Number(left) * 100) === Math.round(Number(right) * 100);
}

function bindingValid(binding = {}, serviceId, technicianId) {
    if (!binding || typeof binding !== "object") return false;
    const id = value => typeof value === "string" && value.length > 0 && !value.includes("/");
    if (!id(serviceId) || !id(technicianId)) return false;
    const valid = (item, prefix) => item && /^[a-f0-9]{64}$/.test(item.sha256) &&
        typeof item.storage_path === "string" && item.storage_path.startsWith(prefix) &&
        item.storage_path.slice(prefix.length).length > 0 && !item.storage_path.slice(prefix.length).includes("/");
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
        binding.signature?.base64_persisted === false &&
        valid(binding.before, `b2c_evidence/${serviceId}/${technicianId}/work_before/`) &&
        valid(binding.after, `b2c_evidence/${serviceId}/${technicianId}/work_after/`) &&
        valid(binding.signature, `servicios/${serviceId}/customer_signature_`) &&
        binding.signature.storage_path.endsWith(".png")
    );
}

// URLs and client digests are claims. Verify bytes in the authoritative bucket.
function createStoredEvidenceVerifier({ bucket }) {
    return async function verifyStoredEvidence(binding, serviceId, technicianId) {
        if (!bindingValid(binding, serviceId, technicianId)) throw new Error("FINAL_EVIDENCE_BINDING_INVALID");
        const verified = {};
        const files = [["before", "work_before", 2 * 1024 * 1024], ["after", "work_after", 2 * 1024 * 1024], ["signature", "customer_signature", 512 * 1024]];
        for (const [kind, event] of [["before2", "work_before"], ["after2", "work_after"]]) {
            if (binding[kind]) {
                const item = binding[kind];
                const prefix = `b2c_evidence/${serviceId}/${technicianId}/${event}/`;
                if (!/^[a-f0-9]{64}$/.test(item.sha256) || typeof item.storage_path !== 'string' ||
                    !item.storage_path.startsWith(prefix) || !item.storage_path.slice(prefix.length) || item.storage_path.slice(prefix.length).includes('/')) throw new Error('FINAL_EVIDENCE_BINDING_INVALID');
                files.push([kind, event, 2 * 1024 * 1024]);
            }
        }
        for (const [kind, eventType, maxSize] of files) {
            const item = binding[kind];
            let metadata;
            try { [metadata] = await bucket.file(item.storage_path).getMetadata(); }
            catch { throw new Error("FINAL_EVIDENCE_OBJECT_MISSING"); }
            const custom = metadata.metadata || {};
            if (!Number.isInteger(Number(metadata.size)) || Number(metadata.size) <= 0 || Number(metadata.size) > maxSize ||
                !/^image\/(jpeg|png|webp)$/.test(metadata.contentType || "") ||
                (kind === "signature" && metadata.contentType !== "image/png") ||
                custom.serviceId !== serviceId || custom.actorUid !== technicianId || custom.actorRole !== "tecnico" || custom.eventType !== eventType ||
                (kind === "signature" && custom.base64Persisted !== "false")) throw new Error("FINAL_EVIDENCE_METADATA_INVALID");
            const [bytes] = await bucket.file(item.storage_path, { generation: metadata.generation }).download();
            if (bytes.length !== Number(metadata.size) || crypto.createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error("FINAL_EVIDENCE_HASH_MISMATCH");
            verified[kind] = { storage_path: item.storage_path, generation: String(metadata.generation), sha256: item.sha256, size: bytes.length };
            const token = String(custom.firebaseStorageDownloadTokens || '').split(',')[0];
            if (token) verified[kind].download_url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(item.storage_path)}?alt=media&token=${encodeURIComponent(token)}`;
        }
        return verified;
    };
}

function createB2cOperationalClosureHandler({ admin, db, financialPolicy,
    verifyEvidence = createStoredEvidenceVerifier({ bucket: admin.storage().bucket('fixgo-44e4d.firebasestorage.app') }) }) {
    return async function completeB2cService(data = {}, context = {}) {
        const actorId = safeText(context.auth?.uid, 160);
        const serviceId = safeText(data.serviceId, 160);
        if (!actorId) throw new Error('AUTH_REQUIRED');
        if (!serviceId || serviceId.includes('/')) throw new Error('SERVICE_ID_INVALID');
        const serviceRef = db.collection('services').doc(serviceId);
        const bindingRef = serviceRef.collection('work_evidence_bindings').doc('current');
        const technicianRef = db.collection('users').doc(actorId);
        return db.runTransaction(async tx => {
            const [serviceSnapshot, bindingSnapshot, technicianSnapshot] = await Promise.all([
                tx.get(serviceRef), tx.get(bindingRef), tx.get(technicianRef)
            ]);
            if (!serviceSnapshot.exists) throw new Error('SERVICE_NOT_FOUND');
            const service = serviceSnapshot.data();
            if (service.tecnico_id !== actorId || !service.cliente_id) throw new Error('TECHNICIAN_SERVICE_MISMATCH');
            const profile = technicianSnapshot.exists ? technicianSnapshot.data() : {};
            if (platformContract.isB2BAccountProfile(profile) || !platformContract.technicianEligibility(profile, { requireAvailable: false }).ok) throw new Error('TECHNICIAN_NOT_ELIGIBLE');
            if (!['trabajando', 'finalizado'].includes(service.estado)) throw new Error('SERVICE_CLOSE_STATE_INVALID');
            const binding = bindingSnapshot.exists ? bindingSnapshot.data() : null;
            if (!binding || (binding.customer_id && binding.customer_id !== service.cliente_id)) throw new Error('FINAL_EVIDENCE_BINDING_INVALID');
            financialPolicy.assertNoFinancialBlock(service);
            const verified = await verifyEvidence(binding, serviceId, actorId);
            for (const item of Object.values(verified)) if (!item.download_url) throw new Error('FINAL_EVIDENCE_DOWNLOAD_TOKEN_MISSING');
            if (service.estado === 'finalizado') {
                if (service.cierre_operativo_completado !== true || service.work_evidence_binding_path !== bindingRef.path) throw new Error('UNTRUSTED_SERVICE_CLOSE');
                return { ok: true, success: true, serviceId, status: 'already_completed', state: 'finalizado' };
            }
            const total = positiveMoney(service.costo_final, 'SERVICE_TOTAL_INVALID');
            const subtotal = Math.round(total / 1.16 * 100) / 100;
            const timestamp = admin.firestore.FieldValue.serverTimestamp();
            tx.update(serviceRef, {
                estado: 'finalizado', finalizado_at: timestamp, actualizado_at: timestamp,
                cierre_operativo_completado: true, cierre_financiero_pendiente_backend: true,
                cierre_legacy_financiero_ejecutado: false, work_evidence_binding_path: bindingRef.path,
                evidencia: { antes1: verified.before.download_url, antes2: verified.before2?.download_url || null,
                    despues1: verified.after.download_url, despues2: verified.after2?.download_url || null,
                    firma_cliente: verified.signature.download_url },
                evidencia_verificada: verified,
                folio_fiscal: service.folio_fiscal || `FG-${serviceId.slice(0, 12).toUpperCase()}`,
                desglose: { subtotal: subtotal.toFixed(2), iva: (Math.round((total - subtotal) * 100) / 100).toFixed(2), total }
            });
            return { ok: true, success: true, serviceId, status: 'completed', state: 'finalizado' };
        });
    };
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
    if (Math.round(paid * 100) < Math.round(settlement.total * 100)) {
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
    verifyEvidence = createStoredEvidenceVerifier({ bucket: admin.storage().bucket("fixgo-44e4d.firebasestorage.app") }),
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
                    const ledger = ledgerSnapshot.exists ? ledgerSnapshot.data() : null;
                    if (!ledger || ledger.servicio_id !== safeServiceId ||
                        ledger.tecnico_id !== assignedTechnician(serviceData) ||
                        ledger.idempotency_key !== ledgerRef.id || serviceData.ledger_transaction_id !== ledgerRef.id) {
                        throw new Error("SETTLED_LEDGER_INCONSISTENT");
                    }
                    return {
                        status: "already_settled",
                        ledgerId: serviceData.ledger_transaction_id || ledgerRef.id
                    };
                }

                if (serviceData.estado !== platformContract.SERVICE_STATES.COMPLETED) {
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

                const technicianRef = db.collection("users").doc(technicianId);
                const technicianSnapshot = await transaction.get(technicianRef);
                if (!technicianSnapshot.exists) {
                    throw new Error("TECHNICIAN_PROFILE_NOT_FOUND");
                }
                const technicianProfile = technicianSnapshot.data() || {};

                const binding = bindingSnapshot.exists
                    ? bindingSnapshot.data()
                    : null;
                if (!bindingValid(binding, safeServiceId, technicianId)) {
                    throw new Error("FINAL_EVIDENCE_BINDING_INVALID");
                }

                const verifiedEvidence = await verifyEvidence(binding, safeServiceId, technicianId);
                const settlementInput = {
                    ...serviceData,
                    comision_asignada:
                        serviceData.comision_asignada ??
                        technicianProfile.comision_asignada
                };
                const settlement = calculateSettlement(settlementInput);
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
                    verified_evidence: verifiedEvidence,
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

                transaction.update(technicianRef, {
                    reputacion: admin.firestore.FieldValue.increment(0.1),
                    servicios_completados: admin.firestore.FieldValue.increment(1),
                    ultimo_servicio: safeServiceId,
                    fecha_ultima_ganancia:
                        admin.firestore.FieldValue.serverTimestamp()
                });

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

            // A successful concurrent retry wins over an older failed attempt.
            // Read and mark atomically so the failure cannot restore a stale block.
            await db.runTransaction(async transaction => {
                const serviceSnapshot = await transaction.get(serviceRef);
                if (!serviceSnapshot.exists) return;
                const current = serviceSnapshot.data();
                if (current.liquidado === true || current.cierre_financiero_pendiente_backend !== true) return;
                const blockCode = safeText(error.code || error.message, 160);
                if (
                    current.liquidacion_bloqueada !== true ||
                    current.liquidacion_bloqueo_codigo !== blockCode
                ) {
                    transaction.update(serviceRef, {
                        liquidacion_bloqueada: true,
                        liquidacion_bloqueo_codigo: blockCode,
                        liquidacion_bloqueada_at:
                            admin.firestore.FieldValue.serverTimestamp(),
                        settlement_version: B2C_SERVICE_SETTLEMENT_VERSION
                    });
                }
            });

            throw error;
        }
    };
}

/** Explicit administrative retry; never clears holds or accepts client financial values. */
function createB2CServiceReconciliationHandler({ db, admin, settleCompletedService, authorize }) {
    if (!db || !admin || typeof settleCompletedService !== "function" || typeof authorize !== "function") {
        throw new Error("RECONCILIATION_DEPENDENCY_MISSING");
    }
    return async function reconcileService(data = {}, context = {}) {
        await authorize(context);
        const actorId = safeText(context.auth?.uid, 160);
        if (!actorId) throw new Error("RECONCILIATION_ACTOR_REQUIRED");
        const serviceId = safeText(data.serviceId, 160);
        const reason = safeText(data.reason, 500);
        if (!serviceId || serviceId.includes("/") || !reason) {
            throw new Error("RECONCILIATION_INPUT_INVALID");
        }
        const serviceRef = db.collection("services").doc(serviceId);
        const snapshot = await serviceRef.get();
        if (!snapshot.exists) throw new Error("SERVICE_NOT_FOUND");
        const auditRef = serviceRef.collection("settlement_reconciliation_attempts").doc();
        // Audit must persist before any retry can create financial effects.
        await auditRef.set({ actor_id: actorId, reason, status: "requested",
            requested_at: admin.firestore.FieldValue.serverTimestamp() });
        try {
            const result = await settleCompletedService({ serviceId });
            await auditRef.set({ status: result.status, ledger_id: result.ledgerId || null,
                completed_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            return { serviceId, status: result.status, ledgerId: result.ledgerId || null };
        } catch (error) {
            await auditRef.set({ status: "blocked", code: safeText(error.code || error.message, 160),
                completed_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
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
    createStoredEvidenceVerifier,
    createB2cOperationalClosureHandler,
    calculateSettlement,
    assertPaymentCoverage,
    existingLedgerValid,
    createB2CServiceSettlementEngine,
    createB2CServiceReconciliationHandler
};
