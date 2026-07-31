/**
 * ======================================================================================
 * FIXGO 2026 - BRIDGE DE SEGURIDAD FINANCIERA
 * ======================================================================================
 * Archivo: fixgo-bridge.js
 * Rol: Compatibilidad web con validaciones fail-closed antes de operaciones económicas.
 *
 * IMPORTANTE:
 * - El navegador nunca es autoridad final de montos o liquidaciones.
 * - Todos los montos se recalculan desde el documento del servicio.
 * - Cualquier incidencia, disputa o financial_hold bloquea la operación.
 * - El backend debe repetir estas validaciones antes de hablar con Stripe.
 * ======================================================================================
 */

import {
    auth,
    db,
    doc,
    getDoc,
    serverTimestamp,
    collection
} from "./firebase.js";

import {
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const FIXGO_FINANCIAL_BRIDGE_VERSION = "6.0.0";

const CHECKOUT_ENDPOINT =
    "https://stripewebhook-72a7uqnggq-uc.a.run.app/create-checkout-session";

function textoSeguro(value, maxLength = 240) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function numeroFinito(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function numeroPositivo(value, code = "AMOUNT_INVALID") {
    const parsed = numeroFinito(value);
    if (parsed === null || parsed <= 0) {
        const error = new Error(code);
        error.code = code;
        throw error;
    }
    return Math.round(parsed * 100) / 100;
}

function importesIguales(left, right) {
    return Math.abs(Number(left) - Number(right)) <= 0.01;
}

function revisionCerrada(serviceData, key) {
    const status = textoSeguro(
        serviceData?.revision_administrativa?.[key]?.status,
        80
    ).toLowerCase();
    return status === "resolved" || status === "dismissed";
}

function razonesBloqueoFinanciero(serviceData = {}) {
    const reasons = [];

    if (serviceData.b2c_financial_hold?.active === true) {
        reasons.push("financial_hold_active");
    }
    if (
        serviceData.llegada_revision_requerida === true &&
        !revisionCerrada(serviceData, "arrival")
    ) {
        reasons.push("arrival_review_pending");
    }
    if (
        serviceData.ausencia_cliente_revision_requerida === true &&
        !revisionCerrada(serviceData, "no_show")
    ) {
        reasons.push("no_show_review_pending");
    }
    if (
        serviceData.diagnostico_revision_requerida === true &&
        !revisionCerrada(serviceData, "diagnostic")
    ) {
        reasons.push("diagnostic_review_pending");
    }
    if (
        serviceData.trabajo_revision_requerida === true &&
        !revisionCerrada(serviceData, "work")
    ) {
        reasons.push("work_review_pending");
    }
    if (serviceData.llegada_resolucion_automatica_bloqueada === true) {
        reasons.push("automatic_resolution_blocked");
    }
    if (serviceData.llegada_cliente_respuesta === "ubicacion_disputada") {
        reasons.push("customer_arrival_dispute");
    }

    return [...new Set(reasons)];
}

function exigirSinBloqueoFinanciero(serviceData) {
    const reasons = razonesBloqueoFinanciero(serviceData);
    if (reasons.length === 0) return;

    const error = new Error("FINANCIAL_HOLD_OR_REVIEW_PENDING");
    error.code = "FINANCIAL_HOLD_OR_REVIEW_PENDING";
    error.reasons = reasons;
    throw error;
}

function tecnicoAsignado(serviceData = {}) {
    return textoSeguro(
        serviceData.tecnico_id ||
        serviceData.technician_id ||
        serviceData.pro_id,
        160
    );
}

function clientePropietario(serviceData = {}) {
    return textoSeguro(
        serviceData.cliente_id || serviceData.customer_id,
        160
    );
}

async function obtenerServicio(serviceId) {
    const safeServiceId = textoSeguro(serviceId, 160);
    if (!safeServiceId) throw new Error("SERVICE_ID_MISSING");

    const snapshot = await getDoc(doc(db, "services", safeServiceId));
    if (!snapshot.exists()) throw new Error("SERVICE_NOT_FOUND");

    return {
        serviceId: safeServiceId,
        data: snapshot.data()
    };
}

async function tokenAutenticado() {
    const user = auth.currentUser;
    if (!user) throw new Error("AUTH_REQUIRED");
    return user.getIdToken(false);
}

async function crearCheckoutSeguro(payload) {
    const token = await tokenAutenticado();
    const response = await fetch(CHECKOUT_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });

    let body = null;
    try {
        body = await response.json();
    } catch (_) {
        body = null;
    }

    if (!response.ok) {
        const error = new Error(
            textoSeguro(body?.error || body?.message, 240) ||
            `CHECKOUT_HTTP_${response.status}`
        );
        error.code = "CHECKOUT_REQUEST_REJECTED";
        error.httpStatus = response.status;
        throw error;
    }

    const url = textoSeguro(body?.url, 2048);
    if (!url) throw new Error("CHECKOUT_URL_MISSING");

    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
        throw new Error("CHECKOUT_URL_NOT_HTTPS");
    }

    return parsed.href;
}

function evidenciaURLValida(value) {
    const raw = textoSeguro(value, 2048);
    if (!raw || raw.startsWith("data:")) return false;
    try {
        return new URL(raw).protocol === "https:";
    } catch (_) {
        return false;
    }
}

/**
 * Compatibilidad de cierre financiero. El cierre principal del técnico sigue protegido
 * por b2c-financial-execution-guard.js; esta función también valida de forma independiente.
 */
export async function finalizarServicioBlindado(
    serviceId,
    tecnicoId,
    evidenciaAntesUrl,
    evidenciaDespuesUrl
) {
    const safeServiceId = textoSeguro(serviceId, 160);
    const safeTechnicianId = textoSeguro(tecnicoId, 160);

    if (!safeServiceId || !safeTechnicianId) {
        throw new Error("FINANCIAL_CONTEXT_MISSING");
    }
    if (
        !evidenciaURLValida(evidenciaAntesUrl) ||
        !evidenciaURLValida(evidenciaDespuesUrl)
    ) {
        throw new Error("HTTPS_EVIDENCE_REQUIRED");
    }

    const serviceRef = doc(db, "services", safeServiceId);
    const technicianRef = doc(db, "users", safeTechnicianId);
    const bindingRef = doc(
        db,
        "services",
        safeServiceId,
        "work_evidence_bindings",
        "current"
    );
    const settlementRef = doc(
        db,
        "transacciones",
        `settlement_${safeServiceId}`
    );
    const invoiceRef = doc(
        db,
        "ordenes_facturacion",
        `settlement_${safeServiceId}`
    );

    return runTransaction(db, async (transaction) => {
        const [serviceSnapshot, technicianSnapshot, bindingSnapshot, settlementSnapshot] =
            await Promise.all([
                transaction.get(serviceRef),
                transaction.get(technicianRef),
                transaction.get(bindingRef),
                transaction.get(settlementRef)
            ]);

        if (!serviceSnapshot.exists()) throw new Error("SERVICE_NOT_FOUND");

        if (settlementSnapshot.exists()) {
            return {
                success: true,
                idempotent: true,
                neto: Number(settlementSnapshot.data().pago_tecnico || 0)
            };
        }

        const serviceData = serviceSnapshot.data();
        if (tecnicoAsignado(serviceData) !== safeTechnicianId) {
            throw new Error("TECHNICIAN_SERVICE_MISMATCH");
        }
        if (serviceData.estado !== "trabajando") {
            throw new Error("INVALID_FINANCIAL_SERVICE_STATE");
        }

        exigirSinBloqueoFinanciero(serviceData);

        const binding = bindingSnapshot.exists() ? bindingSnapshot.data() : null;
        if (
            !binding ||
            textoSeguro(binding.service_id, 160) !== safeServiceId ||
            textoSeguro(binding.technician_id, 160) !== safeTechnicianId ||
            !binding.before?.sha256 ||
            !binding.after?.sha256 ||
            binding.signature?.present !== true ||
            binding.signature?.base64_persisted !== false
        ) {
            throw new Error("FINAL_EVIDENCE_BINDING_INVALID");
        }

        const costoTotal = numeroPositivo(
            serviceData.costo_final,
            "SERVICE_TOTAL_INVALID"
        );

        let commissionRate = 0.32;
        let technicianLevel = "BRONCE";
        if (technicianSnapshot.exists()) {
            const technicianData = technicianSnapshot.data();
            const candidateRate = numeroFinito(technicianData.comision_asignada);
            if (candidateRate !== null) commissionRate = candidateRate;
            technicianLevel = textoSeguro(technicianData.nivel, 40) || "BRONCE";
        }

        if (commissionRate < 0 || commissionRate > 1) {
            throw new Error("COMMISSION_RATE_INVALID");
        }

        const commission = costoTotal * commissionRate;
        const vatWithholding = costoTotal * 0.08;
        const incomeTaxWithholding = costoTotal * 0.10;
        const technicianNet =
            costoTotal - commission - vatWithholding - incomeTaxWithholding;

        if (technicianNet < 0) {
            throw new Error("NEGATIVE_TECHNICIAN_SETTLEMENT");
        }

        transaction.update(serviceRef, {
            estado: "finalizado",
            finalizado_at: serverTimestamp(),
            financial_settlement_id: settlementRef.id,
            financial_settlement_version: FIXGO_FINANCIAL_BRIDGE_VERSION,
            evidencia: {
                antes: evidenciaAntesUrl,
                despues: evidenciaDespuesUrl,
                binding_document: bindingRef.path
            },
            desglose_fiscal: {
                subtotal: Number((costoTotal / 1.16).toFixed(2)),
                iva_cliente: Number(
                    (costoTotal - costoTotal / 1.16).toFixed(2)
                ),
                total: costoTotal,
                tasa_comision_aplicada: commissionRate
            }
        });

        transaction.set(settlementRef, {
            servicio_id: safeServiceId,
            tecnico_id: safeTechnicianId,
            monto_total: costoTotal,
            comision_fixgo: commission,
            retencion_iva: vatWithholding,
            retencion_isr: incomeTaxWithholding,
            pago_tecnico: technicianNet,
            fecha: serverTimestamp(),
            tipo: "ingreso_servicio",
            metodo: "BRIDGE_IDEMPOTENT_V6",
            idempotency_key: settlementRef.id,
            technician_level: technicianLevel,
            engine_version: FIXGO_FINANCIAL_BRIDGE_VERSION
        });

        transaction.set(invoiceRef, {
            servicio_id: safeServiceId,
            tecnico_id: safeTechnicianId,
            fecha_orden: serverTimestamp(),
            idempotency_key: invoiceRef.id,
            factura_cliente: {
                monto: costoTotal,
                receptor: serviceData.datos_facturacion || {
                    rfc: "XAXX010101000",
                    razon_social: "PUBLICO GENERAL",
                    cp: "77500",
                    regimen: "616"
                },
                estado: "pendiente_timbrado",
                requerida_por_cliente: serviceData.factura_requerida === true
            },
            factura_comision: {
                monto: commission,
                receptor_tecnico_id: safeTechnicianId,
                estado: "pendiente_timbrado",
                tasa_aplicada: commissionRate
            },
            engine_version: FIXGO_FINANCIAL_BRIDGE_VERSION
        });

        return {
            success: true,
            idempotent: false,
            neto: technicianNet
        };
    });
}

/**
 * Retiro idempotente: usa técnico y monto almacenados, no confía en el argumento del UI.
 */
export async function ejecutarRetiroSeguro(retiroId, tecnicoId, montoSolicitado) {
    const safeWithdrawalId = textoSeguro(retiroId, 160);
    const safeTechnicianId = textoSeguro(tecnicoId, 160);
    if (!safeWithdrawalId || !safeTechnicianId) {
        throw new Error("WITHDRAWAL_CONTEXT_MISSING");
    }

    const withdrawalRef = doc(db, "retiros", safeWithdrawalId);
    const ledgerRef = doc(
        db,
        "transacciones",
        `withdrawal_${safeWithdrawalId}`
    );

    return runTransaction(db, async (transaction) => {
        const [withdrawalSnapshot, ledgerSnapshot] = await Promise.all([
            transaction.get(withdrawalRef),
            transaction.get(ledgerRef)
        ]);

        if (!withdrawalSnapshot.exists()) {
            throw new Error("WITHDRAWAL_NOT_FOUND");
        }

        if (ledgerSnapshot.exists()) {
            return { success: true, idempotent: true };
        }

        const withdrawalData = withdrawalSnapshot.data();
        if (withdrawalData.estado !== "pendiente") {
            throw new Error("WITHDRAWAL_ALREADY_PROCESSED");
        }

        const storedTechnicianId = textoSeguro(
            withdrawalData.tecnico_id || withdrawalData.technician_id,
            160
        );
        if (storedTechnicianId !== safeTechnicianId) {
            throw new Error("WITHDRAWAL_TECHNICIAN_MISMATCH");
        }

        const storedAmount = numeroPositivo(
            withdrawalData.monto,
            "WITHDRAWAL_AMOUNT_INVALID"
        );
        if (
            numeroFinito(montoSolicitado) !== null &&
            !importesIguales(storedAmount, montoSolicitado)
        ) {
            throw new Error("WITHDRAWAL_AMOUNT_MISMATCH");
        }

        transaction.update(withdrawalRef, {
            estado: "aprobado",
            fecha_aprobacion: serverTimestamp(),
            metodo_liquidacion: "SPEI_MANUAL_VERIFICADO",
            audit_log: "APROBADO_VIA_BRIDGE_V6",
            ledger_transaction_id: ledgerRef.id
        });

        transaction.set(ledgerRef, {
            servicio_id: `RET-${safeWithdrawalId.slice(0, 5).toUpperCase()}`,
            retiro_id: safeWithdrawalId,
            tecnico_id: safeTechnicianId,
            monto_total: 0,
            comision_fixgo: 0,
            retencion_iva: 0,
            retencion_isr: 0,
            pago_tecnico: -Math.abs(storedAmount),
            fecha: serverTimestamp(),
            tipo: "retiro_fondos",
            nota: "Liquidación enviada vía SPEI",
            idempotency_key: ledgerRef.id,
            engine_version: FIXGO_FINANCIAL_BRIDGE_VERSION
        });

        return { success: true, idempotent: false };
    });
}

/**
 * Pago inicial. El monto debe existir en el servicio y solo admite las políticas vigentes.
 */
export async function procesarPagoStripe(serviceId, payloadTicket = {}) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("AUTH_REQUIRED");

        const { serviceId: safeServiceId, data } = await obtenerServicio(serviceId);
        if (clientePropietario(data) !== user.uid) {
            throw new Error("CUSTOMER_SERVICE_MISMATCH");
        }
        if (![
            "iniciado_stripe",
            "cotizando"
        ].includes(textoSeguro(data.estado, 80))) {
            throw new Error("INVALID_INITIAL_PAYMENT_STATE");
        }

        const amount = numeroPositivo(
            data.retencion_inicial ?? payloadTicket.retencion_inicial,
            "INITIAL_AUTHORIZATION_AMOUNT_INVALID"
        );
        if (![350, 550].some((allowed) => importesIguales(amount, allowed))) {
            throw new Error("INITIAL_AUTHORIZATION_POLICY_MISMATCH");
        }

        const checkoutUrl = await crearCheckoutSeguro({
            serviceId: safeServiceId,
            descripcion: textoSeguro(
                payloadTicket.descripcion || data.descripcion,
                180
            ) || "Servicio GestiaPremium",
            monto: amount,
            tipo_pago: "garantia_inicial",
            clientType: textoSeguro(data.client_type, 40) || "ON_DEMAND",
            financialBridgeVersion: FIXGO_FINANCIAL_BRIDGE_VERSION
        });

        window.location.assign(checkoutUrl);
    } catch (error) {
        console.error("[INITIAL_STRIPE_CHECKOUT_BLOCKED]", error);
        alert(
            "No fue posible iniciar el pago seguro. El folio, el monto o la sesión no superaron la validación."
        );
        throw error;
    }
}

/**
 * Saldo final. Se recalcula desde costo_final - monto_pagado/retención.
 */
export async function procesarPagoSaldoStripe(serviceId, saldoInformado = null) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error("AUTH_REQUIRED");

        const { serviceId: safeServiceId, data } = await obtenerServicio(serviceId);
        if (clientePropietario(data) !== user.uid) {
            throw new Error("CUSTOMER_SERVICE_MISMATCH");
        }

        exigirSinBloqueoFinanciero(data);

        if (![
            "cotizando",
            "procesando_saldo"
        ].includes(textoSeguro(data.estado, 80))) {
            throw new Error("INVALID_BALANCE_PAYMENT_STATE");
        }

        const total = numeroPositivo(
            data.costo_final,
            "SERVICE_TOTAL_INVALID"
        );
        const credited = Math.max(
            0,
            numeroFinito(data.monto_pagado) ??
            numeroFinito(data.retencion_inicial) ??
            0
        );
        const due = Math.round(Math.max(0, total - credited) * 100) / 100;

        if (due <= 0) throw new Error("NO_BALANCE_DUE");
        if (
            numeroFinito(saldoInformado) !== null &&
            !importesIguales(due, saldoInformado)
        ) {
            throw new Error("CLIENT_BALANCE_AMOUNT_MISMATCH");
        }

        const checkoutUrl = await crearCheckoutSeguro({
            serviceId: safeServiceId,
            descripcion: "Liquidación de saldo - Servicio GestiaPremium",
            monto: due,
            tipo_pago: "liquidacion_saldo",
            clientType: textoSeguro(data.client_type, 40) || "ON_DEMAND",
            financialBridgeVersion: FIXGO_FINANCIAL_BRIDGE_VERSION
        });

        window.location.assign(checkoutUrl);
    } catch (error) {
        console.error("[BALANCE_STRIPE_CHECKOUT_BLOCKED]", error);
        alert(
            "El pago de saldo quedó bloqueado. Se conservará el estado del servicio para revisión y no se enviará un monto no validado a Stripe."
        );
        throw error;
    }
}

if (typeof window !== "undefined") {
    window.procesarPagoStripe = procesarPagoStripe;
    window.procesarPagoSaldoStripe = procesarPagoSaldoStripe;
}
