/*
 * ======================================================================================
 * B2C FINANCIAL EXECUTION GUARD 2026
 * Archivo: b2c-financial-execution-guard.js
 * Rol: Impedir que el cierre legacy mueva dinero desde el navegador.
 *
 * PRINCIPIOS:
 * - Se instala antes de los puentes de firma y cronología.
 * - Hace una prevalidación antes de subir nuevos archivos.
 * - Revalida inmediatamente antes del cierre final.
 * - El cierre seguro actualiza solo estado y referencias de evidencia.
 * - Nunca ejecuta el onclick financiero legacy.
 * - Liquidaciones, saldos, comisiones y reputación quedan reservados al backend.
 * ======================================================================================
 */

import {
    auth,
    db,
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "./firebase.js";

import {
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const B2C_FINANCIAL_EXECUTION_GUARD_VERSION = "1.1.0";

const INSTALL_KEY = "__B2C_FINANCIAL_EXECUTION_GUARD__";
const BLOCKING_SERVICE_STATES = new Set([
    "cancelado",
    "cancelled",
    "rechazado",
    "reembolsado",
    "disputed",
    "en_revision"
]);

function textoSeguro(value, maxLength = 240) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function serviceIdDesdeModal(modal) {
    const fileName = textoSeguro(
        modal?.querySelector("#fileA1")?.files?.[0]?.name,
        260
    );
    const suffix = "_antes_cronologico.jpg";
    if (!fileName.endsWith(suffix)) return null;
    return fileName.slice(0, -suffix.length) || null;
}

function revisionCerrada(serviceData, key) {
    const status = textoSeguro(
        serviceData?.revision_administrativa?.[key]?.status,
        80
    ).toLowerCase();
    return status === "resolved" || status === "dismissed";
}

function razonesBloqueo(serviceData = {}) {
    const reasons = [];
    const state = textoSeguro(serviceData.estado, 80).toLowerCase();
    const hold = serviceData.b2c_financial_hold || null;

    if (hold?.active === true) {
        reasons.push(`financial_hold:${textoSeguro(hold.reason, 120) || "active"}`);
    }
    if (BLOCKING_SERVICE_STATES.has(state)) {
        reasons.push(`service_state:${state}`);
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
        reasons.push("arrival_automatic_resolution_blocked");
    }
    if (serviceData.llegada_cliente_respuesta === "ubicacion_disputada") {
        reasons.push("customer_arrival_dispute");
    }
    if (
        textoSeguro(serviceData.ausencia_cliente_estado, 120)
            .includes("pendiente_revision")
    ) {
        reasons.push("customer_absence_pending_review");
    }

    return [...new Set(reasons)];
}

function bindingValido(binding = {}) {
    return Boolean(
        binding.service_id &&
        binding.technician_id &&
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

function tecnicoAsignado(serviceData = {}) {
    return textoSeguro(
        serviceData.tecnico_id ||
        serviceData.technician_id ||
        serviceData.pro_id,
        160
    );
}

export async function evaluarEjecucionFinancieraB2C({
    serviceId,
    technicianId,
    requireFinalBinding = false
}) {
    const safeServiceId = textoSeguro(serviceId, 160);
    const safeTechnicianId = textoSeguro(technicianId, 160);

    if (!safeServiceId || !safeTechnicianId) {
        return {
            allowed: false,
            code: "FINANCIAL_CONTEXT_MISSING",
            reasons: ["missing_service_or_technician"]
        };
    }

    const serviceSnapshot = await getDoc(doc(db, "services", safeServiceId));
    if (!serviceSnapshot.exists()) {
        return {
            allowed: false,
            code: "SERVICE_NOT_FOUND",
            reasons: ["service_not_found"]
        };
    }

    const serviceData = serviceSnapshot.data();
    if (tecnicoAsignado(serviceData) !== safeTechnicianId) {
        return {
            allowed: false,
            code: "TECHNICIAN_SERVICE_MISMATCH",
            reasons: ["technician_service_mismatch"]
        };
    }

    if (serviceData.estado !== "trabajando") {
        return {
            allowed: false,
            code: "INVALID_FINANCIAL_SERVICE_STATE",
            reasons: [`expected_working_found:${textoSeguro(serviceData.estado, 80)}`]
        };
    }

    const reasons = razonesBloqueo(serviceData);
    if (reasons.length > 0) {
        return {
            allowed: false,
            code: "FINANCIAL_HOLD_OR_REVIEW_PENDING",
            reasons,
            serviceData
        };
    }

    if (requireFinalBinding) {
        const bindingSnapshot = await getDoc(
            doc(db, "services", safeServiceId, "work_evidence_bindings", "current")
        );
        const binding = bindingSnapshot.exists() ? bindingSnapshot.data() : null;

        if (!bindingValido(binding)) {
            return {
                allowed: false,
                code: "FINAL_EVIDENCE_BINDING_INVALID",
                reasons: ["final_evidence_binding_invalid"],
                serviceData
            };
        }

        if (
            textoSeguro(binding.service_id, 160) !== safeServiceId ||
            textoSeguro(binding.technician_id, 160) !== safeTechnicianId
        ) {
            return {
                allowed: false,
                code: "FINAL_EVIDENCE_BINDING_MISMATCH",
                reasons: ["final_evidence_binding_mismatch"],
                serviceData
            };
        }
    }

    return {
        allowed: true,
        code: "FINANCIAL_EXECUTION_ALLOWED",
        reasons: [],
        serviceData
    };
}

async function finalizarSoloOperacion({ serviceId, technicianId }) {
    const serviceRef = doc(db, "services", serviceId);
    const bindingRef = doc(
        db,
        "services",
        serviceId,
        "work_evidence_bindings",
        "current"
    );

    const result = await runTransaction(db, async (transaction) => {
        const [serviceSnapshot, bindingSnapshot] = await Promise.all([
            transaction.get(serviceRef),
            transaction.get(bindingRef)
        ]);

        if (!serviceSnapshot.exists()) throw new Error("SERVICE_NOT_FOUND");
        if (!bindingSnapshot.exists()) {
            throw new Error("FINAL_EVIDENCE_BINDING_INVALID");
        }

        const serviceData = serviceSnapshot.data();
        const binding = bindingSnapshot.data();

        if (serviceData.estado === "finalizado") {
            return { idempotent: true, binding };
        }
        if (serviceData.estado !== "trabajando") {
            throw new Error("INVALID_FINANCIAL_SERVICE_STATE");
        }
        if (tecnicoAsignado(serviceData) !== technicianId) {
            throw new Error("TECHNICIAN_SERVICE_MISMATCH");
        }

        const blockReasons = razonesBloqueo(serviceData);
        if (blockReasons.length > 0) {
            const error = new Error("FINANCIAL_HOLD_OR_REVIEW_PENDING");
            error.reasons = blockReasons;
            throw error;
        }

        if (
            !bindingValido(binding) ||
            textoSeguro(binding.service_id, 160) !== serviceId ||
            textoSeguro(binding.technician_id, 160) !== technicianId
        ) {
            throw new Error("FINAL_EVIDENCE_BINDING_INVALID");
        }

        transaction.update(serviceRef, {
            estado: "finalizado",
            finalizado_at: serverTimestamp(),
            liquidado: false,
            cierre_operativo_completado: true,
            cierre_financiero_pendiente_backend: true,
            cierre_legacy_financiero_ejecutado: false,
            cierre_seguro_version: B2C_FINANCIAL_EXECUTION_GUARD_VERSION,
            work_evidence_binding_path: bindingRef.path,
            evidencia: {
                antes1: binding.before.download_url,
                antes2: null,
                despues1: binding.after.download_url,
                despues2: null,
                firma_cliente: binding.signature.download_url,
                metadatos: {
                    almacenamiento: "Firebase Storage",
                    base64_persistido: false,
                    cierre_financiero: "backend_required",
                    binding_document: bindingRef.path
                }
            }
        });

        return { idempotent: false, binding };
    });

    await setDoc(
        doc(db, "rastreo", technicianId),
        {
            estado: "Disponible",
            service_id: null,
            cierre_operativo_at: serverTimestamp(),
            cierre_seguro_version: B2C_FINANCIAL_EXECUTION_GUARD_VERSION
        },
        { merge: true }
    );

    return result;
}

function mensajeBloqueo(result) {
    const details = Array.isArray(result?.reasons)
        ? result.reasons.join(", ")
        : "validación no disponible";

    return [
        "El cierre quedó bloqueado para proteger al cliente, al técnico y a Peninsula Tech.",
        "No se movió dinero ni se finalizó el servicio.",
        `Motivo técnico: ${details}.`,
        "La incidencia debe resolverse y autorizarse por el flujo administrativo correspondiente."
    ].join("\n\n");
}

function restaurarBoton(button, html) {
    button.dataset.b2cFinancialGateBusy = "false";
    button.disabled = false;
    button.innerHTML = html;
}

export function instalarGuardiaEjecucionFinancieraB2C() {
    if (globalThis[INSTALL_KEY]) return globalThis[INSTALL_KEY];

    const listener = (event) => {
        const button = event.target?.closest?.("#btnSubirEvidencia");
        const modal = button?.closest?.("#modalEvidencia");
        if (!button || !modal) return;

        const finalStage =
            button.dataset.b2cChronologyBypass === "true" &&
            button.dataset.b2cSignatureStorageReady === "true";

        if (
            button.dataset.b2cFinancialPrecheckPassed === "true" &&
            !finalStage
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (button.dataset.b2cFinancialGateBusy === "true") return;

        const serviceId = serviceIdDesdeModal(modal);
        const technicianId = textoSeguro(auth.currentUser?.uid, 160);
        const originalHtml = button.innerHTML;

        button.dataset.b2cFinancialGateBusy = "true";
        button.disabled = true;
        button.innerHTML = finalStage
            ? '<i class="fas fa-vault fa-spin"></i> CERRANDO SIN MOVER DINERO...'
            : '<i class="fas fa-shield-halved fa-spin"></i> VALIDANDO INCIDENCIAS...';

        evaluarEjecucionFinancieraB2C({
            serviceId,
            technicianId,
            requireFinalBinding: finalStage
        }).then(async (evaluation) => {
            if (!evaluation.allowed) {
                throw Object.assign(
                    new Error(evaluation.code),
                    { result: evaluation }
                );
            }

            if (!finalStage) {
                restaurarBoton(button, originalHtml);
                button.dataset.b2cFinancialPrecheckPassed = "true";
                button.click();
                return;
            }

            await finalizarSoloOperacion({ serviceId, technicianId });
            modal.remove();
            alert(
                "✅ Cierre operativo registrado con evidencias verificadas. La liquidación quedó reservada al backend y no se movió dinero desde este dispositivo."
            );
        }).catch((error) => {
            console.error("[B2C_FINANCIAL_EXECUTION_BLOCKED]", error);
            restaurarBoton(button, originalHtml);
            button.dataset.b2cFinancialPrecheckPassed = "false";
            alert(`🛑 ${mensajeBloqueo(error?.result)}`);
        });
    };

    document.addEventListener("click", listener, true);

    const installation = {
        version: B2C_FINANCIAL_EXECUTION_GUARD_VERSION,
        uninstall() {
            document.removeEventListener("click", listener, true);
            delete globalThis[INSTALL_KEY];
        }
    };

    globalThis[INSTALL_KEY] = installation;
    console.log(
        `[B2C_FINANCIAL_EXECUTION_GUARD_READY] v${B2C_FINANCIAL_EXECUTION_GUARD_VERSION}`
    );
    return installation;
}

instalarGuardiaEjecucionFinancieraB2C();
