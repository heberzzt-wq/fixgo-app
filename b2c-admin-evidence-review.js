/*
 * ======================================================================================
 * B2C ADMINISTRATIVE EVIDENCE REVIEW DESK 2026
 * Archivo: b2c-admin-evidence-review.js
 * Rol: Centralizar la revisión humana de incidencias B2C sin ejecutar movimientos de dinero.
 *
 * PRINCIPIOS:
 * - Solo se instala para la autoridad administrativa maestra.
 * - Revisa llegada disputada/fallback, ausencia, diagnóstico y trabajo con fallback.
 * - Cada decisión crea un registro append-only en services/{id}/admin_reviews/{reviewId}.
 * - La decisión operativa activa un financial_hold que exige autorización financiera separada.
 * - Nunca cobra, libera, reembolsa, transfiere ni cambia saldos.
 * - Muestra crew_snapshot cuando exista para identificar a todas las personas autorizadas.
 * ======================================================================================
 */

import {
    db,
    collection,
    query,
    orderBy,
    onSnapshot,
    limit,
    doc,
    serverTimestamp
} from "./firebase.js";

import {
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const B2C_ADMIN_EVIDENCE_REVIEW_VERSION = "1.0.0";

const INSTALL_KEY = "__B2C_ADMIN_EVIDENCE_REVIEW_DESK__";
const MASTER_ADMIN_UID = "nNhwy3Mx4pTvc8TZVh1tyTMFwhC2";
const MASTER_ADMIN_EMAIL = "hebertoh-m@hotmail.com";
const REVIEW_LIMIT = 120;

const REVIEW_CONFIG = Object.freeze({
    arrival: Object.freeze({
        label: "Llegada",
        icon: "fa-location-dot",
        decisions: Object.freeze({
            arrival_confirmed: "Validar llegada del técnico",
            customer_dispute_upheld: "Dar razón a la disputa del cliente",
            more_evidence_required: "Solicitar evidencia adicional"
        })
    }),
    no_show: Object.freeze({
        label: "Ausencia / acceso",
        icon: "fa-door-closed",
        decisions: Object.freeze({
            no_show_validated: "Validar ausencia del cliente",
            denied_access_validated: "Validar negativa de acceso",
            incident_rejected: "Rechazar el reporte del técnico",
            more_evidence_required: "Solicitar evidencia adicional"
        })
    }),
    diagnostic: Object.freeze({
        label: "Diagnóstico",
        icon: "fa-stethoscope",
        decisions: Object.freeze({
            diagnostic_evidence_validated: "Validar evidencia diagnóstica",
            evidence_rejected: "Rechazar evidencia diagnóstica",
            more_evidence_required: "Solicitar evidencia adicional"
        })
    }),
    work: Object.freeze({
        label: "Antes / después",
        icon: "fa-camera-retro",
        decisions: Object.freeze({
            work_evidence_validated: "Validar cronología y evidencias",
            evidence_rejected: "Rechazar evidencia de trabajo",
            more_evidence_required: "Solicitar evidencia adicional"
        })
    })
});

function textoSeguro(value, maxLength = 240) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function escaparHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function idSeguro(value, fallback = "review") {
    return textoSeguro(value, 180)
        .replace(/[^a-zA-Z0-9_-]/g, "_") || fallback;
}

function numeroFinito(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function esAdminMaestro(user) {
    const uid = textoSeguro(user?.uid, 160);
    const email = textoSeguro(user?.email, 240).toLowerCase();
    return uid === MASTER_ADMIN_UID || email === MASTER_ADMIN_EMAIL;
}

function estadoRevision(serviceData, reviewKey) {
    return textoSeguro(
        serviceData?.revision_administrativa?.[reviewKey]?.status,
        80
    ).toLowerCase();
}

function revisionCerrada(serviceData, reviewKey) {
    return ["resolved", "dismissed"].includes(
        estadoRevision(serviceData, reviewKey)
    );
}

function urlHTTPS(value) {
    const raw = textoSeguro(value, 2048);
    if (!raw) return null;

    try {
        const parsed = new URL(raw);
        return parsed.protocol === "https:" ? parsed.href : null;
    } catch (_) {
        return null;
    }
}

function timestampAMilisegundos(value) {
    if (!value) return null;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (Number.isFinite(value.seconds)) {
        return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatearFecha(value) {
    const millis = timestampAMilisegundos(value);
    if (!millis) return "Sin hora servidor";
    return new Intl.DateTimeFormat("es-MX", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Cancun"
    }).format(new Date(millis));
}

function responsableDesdeServicio(serviceData = {}) {
    return {
        uid: textoSeguro(
            serviceData.tecnico_id ||
            serviceData.technician_id ||
            serviceData.pro_id,
            160
        ),
        nombre: textoSeguro(
            serviceData.tecnico_nombre ||
            serviceData.tecnico_nombre_fiscal ||
            "Responsable técnico",
            120
        ),
        foto: urlHTTPS(
            serviceData.tecnico_foto ||
            serviceData.tecnico_foto_perfil ||
            serviceData.tecnico_avatar
        ),
        rol: "responsable"
    };
}

function normalizarCrewSnapshot(serviceData = {}) {
    const source = serviceData.crew_snapshot || serviceData.cuadrilla_snapshot || null;
    const leaderSource = source?.leader || source?.responsable || null;
    const fallbackLeader = responsableDesdeServicio(serviceData);

    const leader = {
        uid: textoSeguro(leaderSource?.uid || fallbackLeader.uid, 160),
        nombre: textoSeguro(
            leaderSource?.name || leaderSource?.nombre || fallbackLeader.nombre,
            120
        ),
        foto: urlHTTPS(
            leaderSource?.photo_url || leaderSource?.foto_url || fallbackLeader.foto
        ),
        rol: textoSeguro(
            leaderSource?.role || leaderSource?.rol || "responsable",
            60
        ) || "responsable"
    };

    const rawMembers = Array.isArray(source?.members)
        ? source.members
        : Array.isArray(source?.integrantes)
            ? source.integrantes
            : [];

    const members = rawMembers.slice(0, 12).map((member, index) => ({
        uid: textoSeguro(member?.uid, 160),
        nombre: textoSeguro(
            member?.name || member?.nombre || `Integrante ${index + 1}`,
            120
        ),
        foto: urlHTTPS(member?.photo_url || member?.foto_url),
        rol: textoSeguro(
            member?.role || member?.rol || "integrante",
            60
        ) || "integrante",
        status: textoSeguro(member?.status || member?.estado || "authorized", 60)
    }));

    return {
        snapshotId: textoSeguro(source?.snapshot_id || source?.id, 180) || null,
        leader,
        members,
        declaredCount: 1 + members.length,
        source: source ? "crew_snapshot" : "single_technician_legacy"
    };
}

function evidenciaLink(label, rawUrl, extra = "") {
    const url = urlHTTPS(rawUrl);
    if (!url) return "";
    return `
        <a href="${escaparHTML(url)}" target="_blank" rel="noopener noreferrer"
           class="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-950/20 px-3 py-2 text-[10px] font-black text-blue-300 hover:bg-blue-900/30">
            <i class="fas fa-arrow-up-right-from-square"></i>
            ${escaparHTML(label)}
            ${extra ? `<span class="text-gray-500">${escaparHTML(extra)}</span>` : ""}
        </a>
    `;
}

function casoLlegada(serviceId, serviceData) {
    if (serviceData.llegada_revision_requerida !== true) return null;
    if (revisionCerrada(serviceData, "arrival")) return null;

    const disputed = serviceData.llegada_cliente_respuesta === "ubicacion_disputada";
    const arrivalEvidence = serviceData.evidencia_llegada || {};
    const dispute = serviceData.llegada_disputa_cliente || {};
    const disputeEvidence = dispute.evidencia || {};

    return {
        serviceId,
        reviewKey: "arrival",
        kind: disputed ? "arrival_dispute" : "arrival_fallback",
        title: disputed
            ? "El cliente disputa la llegada"
            : "Llegada registrada con GPS alternativo",
        severity: disputed ? "critical" : "warning",
        sourceAt: serviceData.llegada_cliente_respuesta_at || serviceData.en_sitio_at,
        summary: disputed
            ? "La versión del cliente contradice la llegada reportada por el técnico."
            : "La llegada se apoyó en fotografía porque el GPS no produjo validación fuerte.",
        evidenceLinks: [
            evidenciaLink("Foto del técnico", arrivalEvidence.download_url),
            evidenciaLink("Foto del cliente", disputeEvidence.download_url)
        ].filter(Boolean),
        facts: {
            customer_response: textoSeguro(serviceData.llegada_cliente_respuesta, 80),
            technician_gps_verified: arrivalEvidence.gps_verificado === true,
            technician_distance_m: numeroFinito(arrivalEvidence.distancia_destino_m),
            technician_accuracy_m: numeroFinito(arrivalEvidence.precision_m),
            customer_evidence_strength: textoSeguro(dispute.evidence_strength, 80),
            customer_media_status: textoSeguro(dispute.media_status, 80),
            dedup_backend_pending: dispute.dedup_backend_pending === true
        }
    };
}

function casoAusencia(serviceId, serviceData) {
    if (serviceData.ausencia_cliente_revision_requerida !== true) return null;
    if (revisionCerrada(serviceData, "no_show")) return null;

    const evidence = serviceData.ausencia_cliente_evidencia || {};
    const incidentType = textoSeguro(serviceData.ausencia_cliente_tipo, 100);

    return {
        serviceId,
        reviewKey: "no_show",
        kind: incidentType || "customer_no_show",
        title: incidentType === "customer_denied_access"
            ? "Técnico reporta negativa de acceso"
            : "Técnico reporta ausencia del cliente",
        severity: "critical",
        sourceAt: serviceData.ausencia_cliente_reportada_at,
        summary: "Existe una propuesta del 50%, pero todavía no se ha ejecutado ningún cargo ni movimiento de fondos.",
        evidenceLinks: [
            evidenciaLink("Evidencia de incidencia", evidence.download_url)
        ].filter(Boolean),
        facts: {
            incident_type: incidentType,
            proposed_charge_percent: numeroFinito(
                serviceData.ausencia_cliente_cobro_propuesto_porcentaje
            ),
            charge_executed: serviceData.ausencia_cliente_cobro_ejecutado === true,
            funds_moved: serviceData.ausencia_cliente_fondos_movidos === true,
            gps_verified: evidence.gps_verificado === true,
            distance_m: numeroFinito(evidence.distancia_destino_m),
            accuracy_m: numeroFinito(evidence.precision_m)
        }
    };
}

function casoDiagnostico(serviceId, serviceData) {
    if (serviceData.diagnostico_revision_requerida !== true) return null;
    if (revisionCerrada(serviceData, "diagnostic")) return null;

    const evidence = serviceData.diagnostico_inicial_evidencia || {};

    return {
        serviceId,
        reviewKey: "diagnostic",
        kind: "diagnostic_fallback",
        title: "Diagnóstico con ubicación alternativa",
        severity: "warning",
        sourceAt: serviceData.diagnostico_inicial_at,
        summary: "El diagnóstico fue capturado, pero la ubicación quedó marcada para revisión.",
        evidenceLinks: [
            evidenciaLink("Foto diagnóstica", evidence.download_url)
        ].filter(Boolean),
        facts: {
            gps_status: textoSeguro(evidence.gps_status, 80),
            gps_reason: textoSeguro(evidence.gps_reason, 160),
            fallback: evidence.fallback === true,
            distance_m: numeroFinito(evidence.distancia_destino_m),
            accuracy_m: numeroFinito(evidence.precision_m)
        }
    };
}

function casoTrabajo(serviceId, serviceData) {
    if (serviceData.trabajo_revision_requerida !== true) return null;
    if (revisionCerrada(serviceData, "work")) return null;

    const before = serviceData.trabajo_antes_evidencia || {};
    const after = serviceData.trabajo_despues_evidencia || {};

    return {
        serviceId,
        reviewKey: "work",
        kind: "work_evidence_fallback",
        title: "Evidencia de trabajo pendiente de validación",
        severity: "warning",
        sourceAt: serviceData.trabajo_antes_capturado_at || serviceData.updated_at,
        summary: "La cronología existe, pero al menos una captura utilizó ubicación alternativa o requiere revisión humana.",
        evidenceLinks: [
            evidenciaLink("Antes", before.download_url),
            evidenciaLink("Después", after.download_url)
        ].filter(Boolean),
        facts: {
            before_fallback: before.fallback === true,
            before_distance_m: numeroFinito(before.distancia_destino_m),
            before_accuracy_m: numeroFinito(before.precision_m),
            after_fallback: after.fallback === true,
            after_distance_m: numeroFinito(after.distancia_destino_m),
            after_accuracy_m: numeroFinito(after.precision_m),
            chronology: textoSeguro(
                after.chronology || before.chronology,
                120
            )
        }
    };
}

function extraerCasos(docSnap) {
    const serviceData = docSnap.data();
    const serviceId = docSnap.id;
    const crew = normalizarCrewSnapshot(serviceData);
    const base = {
        serviceData,
        crew,
        customerName: textoSeguro(
            serviceData.cliente_nombre || serviceData.customer_name || "Cliente",
            120
        ),
        technicianName: crew.leader.nombre,
        serviceState: textoSeguro(serviceData.estado, 80) || "sin_estado",
        serviceCategory: textoSeguro(
            serviceData.categoria || serviceData.tipo_servicio || serviceData.servicio,
            120
        ) || "Servicio B2C"
    };

    return [
        casoLlegada(serviceId, serviceData),
        casoAusencia(serviceId, serviceData),
        casoDiagnostico(serviceId, serviceData),
        casoTrabajo(serviceId, serviceData)
    ]
        .filter(Boolean)
        .map((caseData) => ({ ...base, ...caseData }));
}

function colorSeveridad(severity) {
    if (severity === "critical") {
        return "border-red-500/40 bg-red-950/10";
    }
    return "border-yellow-500/40 bg-yellow-950/10";
}

function renderCrew(crew) {
    const people = [crew.leader, ...crew.members];
    const cards = people.map((person, index) => {
        const role = textoSeguro(person.rol, 60) || (index === 0 ? "responsable" : "integrante");
        const initials = textoSeguro(person.nombre, 80)
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0]?.toUpperCase())
            .join("") || "TP";
        const photo = urlHTTPS(person.foto);

        return `
            <div class="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-800 bg-black/30 p-2">
                ${photo
                    ? `<img src="${escaparHTML(photo)}" class="h-9 w-9 rounded-full border border-zinc-700 object-cover" alt="Integrante">`
                    : `<div class="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-[10px] font-black text-white">${escaparHTML(initials)}</div>`
                }
                <div class="min-w-0">
                    <p class="truncate text-[10px] font-black text-white">${escaparHTML(person.nombre)}</p>
                    <p class="truncate text-[8px] font-bold uppercase tracking-widest text-gray-500">${escaparHTML(role)}</p>
                </div>
            </div>
        `;
    }).join("");

    const legacyWarning = crew.source === "single_technician_legacy"
        ? `<p class="mt-2 text-[9px] font-bold text-yellow-500"><i class="fas fa-triangle-exclamation"></i> Registro legacy: solo está identificado el responsable. La cuadrilla todavía no fue declarada.</p>`
        : `<p class="mt-2 text-[9px] font-bold text-emerald-400"><i class="fas fa-users-shield"></i> Cuadrilla declarada: ${crew.declaredCount} persona(s).</p>`;

    return `
        <div class="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <p class="mb-2 text-[9px] font-black uppercase tracking-widest text-gray-500">Personas autorizadas para ingresar</p>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">${cards}</div>
            ${legacyWarning}
        </div>
    `;
}

function renderFacts(facts = {}) {
    const rows = Object.entries(facts)
        .filter(([, value]) => value !== null && value !== "")
        .map(([key, value]) => {
            const display = typeof value === "boolean"
                ? (value ? "Sí" : "No")
                : String(value);
            return `
                <div class="flex justify-between gap-3 border-b border-zinc-800/70 py-1 last:border-0">
                    <span class="text-[9px] font-bold text-gray-600">${escaparHTML(key)}</span>
                    <span class="text-right text-[9px] font-black text-gray-300">${escaparHTML(display)}</span>
                </div>
            `;
        }).join("");

    return rows
        ? `<details class="mt-3 rounded-lg border border-zinc-800 bg-black/20 p-3">
               <summary class="cursor-pointer text-[9px] font-black uppercase tracking-widest text-gray-500">Datos técnicos</summary>
               <div class="mt-2">${rows}</div>
           </details>`
        : "";
}

function renderDecisionOptions(reviewKey) {
    const config = REVIEW_CONFIG[reviewKey];
    return Object.entries(config.decisions)
        .map(([value, label]) => `<option value="${escaparHTML(value)}">${escaparHTML(label)}</option>`)
        .join("");
}

function renderCase(caseData) {
    const config = REVIEW_CONFIG[caseData.reviewKey];
    const cardId = `b2cAdminReview_${idSeguro(caseData.serviceId)}_${caseData.reviewKey}`;

    return `
        <article id="${cardId}"
            data-service-id="${escaparHTML(caseData.serviceId)}"
            data-review-key="${escaparHTML(caseData.reviewKey)}"
            data-case-kind="${escaparHTML(caseData.kind)}"
            class="rounded-2xl border p-4 ${colorSeveridad(caseData.severity)}">

            <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div class="min-w-0">
                    <p class="text-[9px] font-black uppercase tracking-widest text-gray-500">
                        <i class="fas ${config.icon}"></i> ${escaparHTML(config.label)} · ${escaparHTML(caseData.serviceId)}
                    </p>
                    <h4 class="mt-1 text-sm font-black text-white">${escaparHTML(caseData.title)}</h4>
                    <p class="mt-1 text-[10px] leading-relaxed text-gray-400">${escaparHTML(caseData.summary)}</p>
                </div>
                <div class="shrink-0 text-right">
                    <span class="rounded-full border border-zinc-700 bg-black/50 px-2 py-1 text-[8px] font-black uppercase text-gray-300">${escaparHTML(caseData.serviceState)}</span>
                    <p class="mt-2 text-[8px] text-gray-600">${escaparHTML(formatearFecha(caseData.sourceAt))}</p>
                </div>
            </div>

            <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div class="rounded-lg border border-zinc-800 bg-black/30 p-2">
                    <p class="text-[8px] font-bold uppercase text-gray-600">Cliente</p>
                    <p class="truncate text-[10px] font-black text-white">${escaparHTML(caseData.customerName)}</p>
                </div>
                <div class="rounded-lg border border-zinc-800 bg-black/30 p-2">
                    <p class="text-[8px] font-bold uppercase text-gray-600">Responsable</p>
                    <p class="truncate text-[10px] font-black text-white">${escaparHTML(caseData.technicianName)}</p>
                </div>
                <div class="rounded-lg border border-zinc-800 bg-black/30 p-2">
                    <p class="text-[8px] font-bold uppercase text-gray-600">Servicio</p>
                    <p class="truncate text-[10px] font-black text-white">${escaparHTML(caseData.serviceCategory)}</p>
                </div>
            </div>

            ${renderCrew(caseData.crew)}

            <div class="mt-3 flex flex-wrap gap-2">
                ${caseData.evidenceLinks.join("") || '<span class="text-[9px] font-bold text-yellow-500">Sin URL de evidencia disponible</span>'}
            </div>

            ${renderFacts(caseData.facts)}

            <div class="mt-4 rounded-xl border border-purple-500/30 bg-purple-950/10 p-3">
                <p class="text-[9px] font-black uppercase tracking-widest text-purple-300">
                    Resolución operativa · no mueve dinero
                </p>
                <select data-role="decision" class="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs font-bold text-white">
                    <option value="">Selecciona una determinación...</option>
                    ${renderDecisionOptions(caseData.reviewKey)}
                </select>
                <textarea data-role="notes" maxlength="1000" rows="3"
                    placeholder="Explica qué evidencia revisaste y por qué tomas esta decisión..."
                    class="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white placeholder:text-gray-700"></textarea>
                <div data-role="error" class="mt-2 hidden rounded-lg border border-red-500/40 bg-red-950/30 p-2 text-[10px] font-bold text-red-300"></div>
                <button type="button" data-action="resolve"
                    class="mt-3 w-full rounded-lg bg-purple-600 py-3 text-xs font-black text-white hover:bg-purple-500 disabled:opacity-40">
                    <i class="fas fa-file-signature"></i> REGISTRAR DECISIÓN Y MANTENER HOLD FINANCIERO
                </button>
            </div>
        </article>
    `;
}

function determinarAccionFinanciera(reviewKey, decision) {
    const map = {
        arrival: {
            arrival_confirmed: "no_financial_change",
            customer_dispute_upheld: "full_release_requires_financial_authorization",
            more_evidence_required: "keep_full_hold"
        },
        no_show: {
            no_show_validated: "charge_50_release_50_requires_financial_authorization",
            denied_access_validated: "charge_50_release_50_requires_financial_authorization",
            incident_rejected: "no_charge_requires_hold_release_authorization",
            more_evidence_required: "keep_full_hold"
        },
        diagnostic: {
            diagnostic_evidence_validated: "no_financial_change",
            evidence_rejected: "manual_service_resolution_required",
            more_evidence_required: "keep_full_hold"
        },
        work: {
            work_evidence_validated: "settlement_eligible_requires_financial_authorization",
            evidence_rejected: "manual_service_resolution_required",
            more_evidence_required: "keep_full_hold"
        }
    };

    return map[reviewKey]?.[decision] || "manual_financial_review_required";
}

function casoSiguePendiente(serviceData, reviewKey) {
    if (revisionCerrada(serviceData, reviewKey)) return false;
    if (reviewKey === "arrival") return serviceData.llegada_revision_requerida === true;
    if (reviewKey === "no_show") return serviceData.ausencia_cliente_revision_requerida === true;
    if (reviewKey === "diagnostic") return serviceData.diagnostico_revision_requerida === true;
    if (reviewKey === "work") return serviceData.trabajo_revision_requerida === true;
    return false;
}

async function registrarDecision({
    serviceId,
    reviewKey,
    caseKind,
    decision,
    notes,
    reviewer
}) {
    const config = REVIEW_CONFIG[reviewKey];
    if (!config || !Object.prototype.hasOwnProperty.call(config.decisions, decision)) {
        throw new Error("INVALID_REVIEW_DECISION");
    }

    const safeNotes = textoSeguro(notes, 1000);
    if (safeNotes.length < 12) {
        throw new Error("REVIEW_NOTES_TOO_SHORT");
    }

    const serviceRef = doc(db, "services", serviceId);
    const reviewRef = doc(collection(db, "services", serviceId, "admin_reviews"));
    const proposedFinancialAction = determinarAccionFinanciera(reviewKey, decision);
    const pendingMoreEvidence = decision === "more_evidence_required";

    await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(serviceRef);
        if (!snapshot.exists()) throw new Error("SERVICE_NOT_FOUND");

        const current = snapshot.data();
        if (!casoSiguePendiente(current, reviewKey)) {
            throw new Error("REVIEW_CASE_ALREADY_RESOLVED");
        }

        const crew = normalizarCrewSnapshot(current);
        const sourceFlags = {
            llegada_revision_requerida: current.llegada_revision_requerida === true,
            llegada_cliente_respuesta: textoSeguro(current.llegada_cliente_respuesta, 80),
            ausencia_cliente_revision_requerida: current.ausencia_cliente_revision_requerida === true,
            ausencia_cliente_tipo: textoSeguro(current.ausencia_cliente_tipo, 100),
            diagnostico_revision_requerida: current.diagnostico_revision_requerida === true,
            trabajo_revision_requerida: current.trabajo_revision_requerida === true
        };

        transaction.set(reviewRef, {
            review_id: reviewRef.id,
            service_id: serviceId,
            review_key: reviewKey,
            case_kind: caseKind,
            status: pendingMoreEvidence ? "pending_more_evidence" : "resolved_operationally",
            decision,
            decision_label: config.decisions[decision],
            notes: safeNotes,
            reviewer_uid: reviewer.uid,
            reviewer_email: reviewer.email,
            reviewer_role: "master_admin",
            source_flags: sourceFlags,
            crew_snapshot: crew,
            proposed_financial_action: proposedFinancialAction,
            funds_moved: false,
            automatic_financial_action: false,
            requires_separate_financial_authorization: true,
            module_version: B2C_ADMIN_EVIDENCE_REVIEW_VERSION,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
        });

        transaction.update(serviceRef, {
            [`revision_administrativa.${reviewKey}`]: {
                review_id: reviewRef.id,
                status: pendingMoreEvidence ? "pending_more_evidence" : "resolved",
                decision,
                decision_label: config.decisions[decision],
                notes: safeNotes,
                case_kind: caseKind,
                reviewer_uid: reviewer.uid,
                reviewer_email: reviewer.email,
                reviewed_at: serverTimestamp(),
                proposed_financial_action: proposedFinancialAction,
                funds_moved: false,
                automatic_financial_action: false,
                requires_separate_financial_authorization: true,
                version: B2C_ADMIN_EVIDENCE_REVIEW_VERSION
            },
            revision_administrativa_actualizada_at: serverTimestamp(),
            b2c_financial_hold: {
                active: true,
                reason: pendingMoreEvidence
                    ? "additional_evidence_required"
                    : "operational_review_complete_financial_execution_pending",
                review_key: reviewKey,
                review_id: reviewRef.id,
                proposed_financial_action: proposedFinancialAction,
                funds_moved: false,
                released: false,
                requires_separate_financial_authorization: true,
                updated_at: serverTimestamp(),
                version: B2C_ADMIN_EVIDENCE_REVIEW_VERSION
            }
        });
    });

    return {
        reviewId: reviewRef.id,
        proposedFinancialAction
    };
}

function crearContenedor() {
    const existing = document.getElementById("b2cAdminEvidenceReviewDesk");
    if (existing) return existing;

    const anchor = document.getElementById("listaTransacciones") ||
        document.getElementById("listaTecnicos") ||
        document.querySelector("main");

    if (!anchor) return null;

    const section = document.createElement("section");
    section.id = "b2cAdminEvidenceReviewDesk";
    section.className = "mb-6 rounded-3xl border border-purple-500/30 bg-zinc-950 p-4 shadow-2xl";
    section.innerHTML = `
        <div class="flex flex-col justify-between gap-3 border-b border-zinc-800 pb-4 sm:flex-row sm:items-center">
            <div>
                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400">Control humano B2C</p>
                <h3 class="mt-1 text-lg font-black text-white">Revisión de evidencias e incidencias</h3>
                <p class="mt-1 text-[10px] text-gray-500">Toda decisión mantiene un hold financiero. Los movimientos de dinero se autorizan en otro flujo.</p>
            </div>
            <div class="rounded-2xl border border-purple-500/30 bg-purple-950/20 px-4 py-3 text-center">
                <p data-role="count" class="text-2xl font-black text-purple-300">0</p>
                <p class="text-[8px] font-black uppercase tracking-widest text-gray-500">Pendientes</p>
            </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2" data-role="filters">
            <button type="button" data-filter="all" class="rounded-full bg-purple-600 px-3 py-2 text-[9px] font-black text-white">TODOS</button>
            <button type="button" data-filter="arrival" class="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-[9px] font-black text-gray-400">LLEGADA</button>
            <button type="button" data-filter="no_show" class="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-[9px] font-black text-gray-400">AUSENCIA</button>
            <button type="button" data-filter="diagnostic" class="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-[9px] font-black text-gray-400">DIAGNÓSTICO</button>
            <button type="button" data-filter="work" class="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-[9px] font-black text-gray-400">TRABAJO</button>
        </div>

        <div data-role="status" class="mt-4 rounded-xl border border-zinc-800 bg-black/30 p-3 text-xs text-gray-500">
            <i class="fas fa-spinner fa-spin"></i> Cargando casos pendientes...
        </div>
        <div data-role="list" class="mt-4 space-y-3"></div>
    `;

    const insertionTarget = anchor.closest("section") || anchor.parentElement || anchor;
    insertionTarget.parentElement?.insertBefore(section, insertionTarget);
    return section;
}

function aplicarFiltro(section, filter) {
    section.dataset.activeFilter = filter;
    section.querySelectorAll("[data-filter]").forEach((button) => {
        const active = button.dataset.filter === filter;
        button.className = active
            ? "rounded-full bg-purple-600 px-3 py-2 text-[9px] font-black text-white"
            : "rounded-full border border-zinc-700 bg-zinc-900 px-3 py-2 text-[9px] font-black text-gray-400";
    });

    section.querySelectorAll("article[data-review-key]").forEach((card) => {
        card.classList.toggle(
            "hidden",
            filter !== "all" && card.dataset.reviewKey !== filter
        );
    });
}

function instalarEventos(section, user) {
    section.querySelector('[data-role="filters"]')?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-filter]");
        if (!button) return;
        aplicarFiltro(section, button.dataset.filter || "all");
    });

    section.querySelector('[data-role="list"]')?.addEventListener("click", async (event) => {
        const button = event.target.closest('[data-action="resolve"]');
        if (!button) return;

        const card = button.closest("article[data-service-id]");
        const decisionElement = card?.querySelector('[data-role="decision"]');
        const notesElement = card?.querySelector('[data-role="notes"]');
        const errorElement = card?.querySelector('[data-role="error"]');

        const serviceId = textoSeguro(card?.dataset.serviceId, 180);
        const reviewKey = textoSeguro(card?.dataset.reviewKey, 80);
        const caseKind = textoSeguro(card?.dataset.caseKind, 100);
        const decision = textoSeguro(decisionElement?.value, 120);
        const notes = textoSeguro(notesElement?.value, 1000);

        errorElement?.classList.add("hidden");

        if (!decision) {
            errorElement.textContent = "Selecciona una determinación operativa.";
            errorElement.classList.remove("hidden");
            return;
        }

        if (notes.length < 12) {
            errorElement.textContent = "Documenta la revisión con al menos 12 caracteres.";
            errorElement.classList.remove("hidden");
            return;
        }

        const decisionLabel = REVIEW_CONFIG[reviewKey]?.decisions?.[decision] || decision;
        const confirmed = confirm(
            `Folio: ${serviceId}\n\nDecisión: ${decisionLabel}\n\n` +
            "Esto NO moverá dinero. Mantendrá un hold financiero hasta una autorización separada.\n\n¿Registrar la decisión?"
        );
        if (!confirmed) return;

        button.disabled = true;
        const originalHtml = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REGISTRANDO AUDITORÍA...';

        try {
            const result = await registrarDecision({
                serviceId,
                reviewKey,
                caseKind,
                decision,
                notes,
                reviewer: {
                    uid: textoSeguro(user.uid, 160),
                    email: textoSeguro(user.email, 240).toLowerCase()
                }
            });

            alert(
                `✅ Decisión operativa registrada.\n\nReview: ${result.reviewId}\n` +
                `Acción financiera propuesta: ${result.proposedFinancialAction}\n\n` +
                "No se movieron fondos. El hold permanece activo."
            );
        } catch (error) {
            console.error("[B2C_ADMIN_REVIEW_DECISION_ERROR]", error);
            const messages = {
                INVALID_REVIEW_DECISION: "La determinación seleccionada no está permitida.",
                REVIEW_NOTES_TOO_SHORT: "La explicación es demasiado corta.",
                SERVICE_NOT_FOUND: "El servicio ya no existe.",
                REVIEW_CASE_ALREADY_RESOLVED: "El caso ya fue resuelto desde otra sesión."
            };
            errorElement.textContent = messages[error?.message] ||
                "No fue posible registrar la decisión. No se modificaron fondos.";
            errorElement.classList.remove("hidden");
            button.disabled = false;
            button.innerHTML = originalHtml;
        }
    });
}

function renderizarCasos(section, cases) {
    const list = section.querySelector('[data-role="list"]');
    const status = section.querySelector('[data-role="status"]');
    const count = section.querySelector('[data-role="count"]');

    if (count) count.textContent = String(cases.length);
    if (!list || !status) return;

    if (cases.length === 0) {
        list.innerHTML = "";
        status.className = "mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs font-bold text-emerald-300";
        status.innerHTML = '<i class="fas fa-shield-check"></i> No hay incidencias B2C pendientes de revisión humana.';
        return;
    }

    status.className = "mt-4 rounded-xl border border-yellow-500/30 bg-yellow-950/20 p-3 text-xs font-bold text-yellow-300";
    status.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${cases.length} caso(s) requieren revisión antes de cualquier decisión financiera.`;
    list.innerHTML = cases.map(renderCase).join("");
    aplicarFiltro(section, section.dataset.activeFilter || "all");
}

function iniciarSuscripcion(section) {
    let fallbackActive = false;
    let unsubscribe = null;

    const consume = (snapshot) => {
        const cases = snapshot.docs
            .flatMap(extraerCasos)
            .sort((a, b) => (
                (timestampAMilisegundos(b.sourceAt) || 0) -
                (timestampAMilisegundos(a.sourceAt) || 0)
            ));
        renderizarCasos(section, cases);
    };

    const subscribe = (ordered = true) => {
        unsubscribe?.();
        const sourceQuery = ordered
            ? query(
                collection(db, "services"),
                orderBy("created_at", "desc"),
                limit(REVIEW_LIMIT)
            )
            : query(collection(db, "services"), limit(REVIEW_LIMIT));

        unsubscribe = onSnapshot(sourceQuery, consume, (error) => {
            console.warn("[B2C_ADMIN_REVIEW_QUERY_WARNING]", error);
            if (ordered && !fallbackActive) {
                fallbackActive = true;
                subscribe(false);
                return;
            }

            const status = section.querySelector('[data-role="status"]');
            if (status) {
                status.className = "mt-4 rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-xs font-bold text-red-300";
                status.textContent = "No fue posible cargar la bandeja de revisión. Verifica conexión y reglas de Firestore.";
            }
        });
    };

    subscribe(true);
    return () => unsubscribe?.();
}

export function instalarRevisionAdministrativaB2C(user = null) {
    if (globalThis[INSTALL_KEY]) return globalThis[INSTALL_KEY];

    if (!esAdminMaestro(user)) {
        console.warn("[B2C_ADMIN_REVIEW_NOT_INSTALLED] Usuario sin autoridad maestra.");
        return false;
    }

    const section = crearContenedor();
    if (!section) {
        console.warn("[B2C_ADMIN_REVIEW_NOT_INSTALLED] No se encontró ancla del panel admin.");
        return false;
    }

    instalarEventos(section, user);
    const unsubscribe = iniciarSuscripcion(section);

    const installation = {
        installed: true,
        version: B2C_ADMIN_EVIDENCE_REVIEW_VERSION,
        section,
        unsubscribe
    };

    globalThis[INSTALL_KEY] = installation;
    console.log(`[B2C_ADMIN_EVIDENCE_REVIEW_READY] v${B2C_ADMIN_EVIDENCE_REVIEW_VERSION}`);
    return installation;
}
