/*
 * ======================================================================================
 * B2C TECHNICIAN NO-SHOW CONTROL 2026
 * Archivo: b2c-technician-no-show.js
 * Rol: Evidencia reforzada de cliente ausente o negativa de acceso tras 5 minutos.
 *
 * ALCANCE:
 * - Observa servicios del técnico en estado en_sitio.
 * - Habilita el reporte solamente después del periodo visual de 5 minutos.
 * - Exige una segunda validación GPS y una fotografía nueva tomada dentro de la app.
 * - Registra una propuesta de cobro del 50% pendiente de revisión.
 * - NO ejecuta cargos, NO cancela el servicio y NO libera fondos.
 * ======================================================================================
 */

import {
    auth,
    db,
    doc,
    collection,
    query,
    where,
    onSnapshot,
    serverTimestamp
} from "./firebase.js";

import {
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    abrirCamaraEvidencia,
    detenerCamaraEvidencia
} from "./b2c-evidence-engine.js";

import {
    validarLlegadaParaEvidencia,
    capturarYSubirFotoB2C
} from "./b2c-evidence-orchestrator.js";

export const B2C_TECHNICIAN_NO_SHOW_VERSION = "1.0.0";
export const B2C_NO_SHOW_WAIT_MS = 5 * 60 * 1000;
export const B2C_NO_SHOW_PROPOSED_PERCENT = 50;

const GEO_POLICY = Object.freeze({
    geofenceRadiusM: 100,
    maxAccuracyM: 50,
    maxAcceptedAccuracyM: 150,
    minConsistentReadings: 2,
    consistencyRadiusM: 60,
    collectionTimeoutMs: 15000,
    readingFreshnessMs: 20000,
    maximumAgeMs: 0
});

const instalaciones = new Map();
const controles = new Map();

function textoSeguro(value, maxLength = 180) {
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
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function idSeguro(value) {
    return textoSeguro(value, 128)
        .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function numeroFinito(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function timestampAMilisegundos(value) {
    if (!value) return null;

    if (typeof value.toMillis === "function") {
        return value.toMillis();
    }

    if (Number.isFinite(value.seconds)) {
        return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatearContador(ms) {
    const safe = Math.max(0, Number(ms) || 0);
    const secondsTotal = Math.ceil(safe / 1000);
    const minutes = Math.floor(secondsTotal / 60);
    const seconds = secondsTotal % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function destinoServicio(serviceData) {
    const lat = numeroFinito(serviceData?.coords?.lat);
    const lng = numeroFinito(serviceData?.coords?.lng);

    return lat === null || lng === null
        ? null
        : { lat, lng };
}

function eliminarControl(serviceId) {
    const current = controles.get(serviceId);
    if (!current) return;

    if (current.intervalId) clearInterval(current.intervalId);
    current.element?.remove();
    controles.delete(serviceId);
}

function localizarBotonCotizador(serviceId) {
    return Array.from(document.querySelectorAll("button"))
        .find((button) => {
            const onclick = button.getAttribute("onclick") || "";
            return onclick.includes("abrirCotizadorGlobal") && onclick.includes(serviceId);
        }) || null;
}

function aplicarBloqueoCotizador(serviceId, blocked) {
    const button = localizarBotonCotizador(serviceId);
    if (!button) return;

    if (blocked) {
        button.disabled = true;
        button.dataset.b2cNoShowBlocked = "true";
        button.classList.add("opacity-40", "cursor-not-allowed");
        button.innerHTML = '<i class="fas fa-shield-halved"></i> INCIDENCIA EN REVISIÓN';
    }
}

function crearPanelControl({ serviceId, serviceData, technicianId }) {
    eliminarControl(serviceId);

    const suffix = idSeguro(serviceId);
    const arrivalAtMs = timestampAMilisegundos(serviceData.en_sitio_at);
    const deadlineMs = (arrivalAtMs || Date.now()) + B2C_NO_SHOW_WAIT_MS;
    const technicianResponse = serviceData.llegada_cliente_respuesta || "pendiente";
    const alreadyReported = Boolean(serviceData.ausencia_cliente_estado);

    if (alreadyReported) {
        aplicarBloqueoCotizador(serviceId, true);
        return null;
    }

    if (technicianResponse === "recibido") {
        return null;
    }

    const panel = document.createElement("section");
    panel.id = `b2cNoShowControl_${suffix}`;
    panel.className = "fixed bottom-4 right-4 z-[115] w-[calc(100%-2rem)] max-w-sm bg-zinc-950 border border-yellow-500/40 rounded-2xl shadow-2xl p-4";

    const customerName = escaparHTML(
        textoSeguro(serviceData.cliente_nombre || "Cliente", 80)
    );

    if (technicianResponse === "ubicacion_disputada") {
        panel.innerHTML = `
            <div class="flex gap-3 items-start">
                <i class="fas fa-triangle-exclamation text-red-400 mt-1"></i>
                <div>
                    <p class="text-white font-black text-sm">Llegada disputada por el cliente</p>
                    <p class="text-gray-400 text-xs mt-1 leading-relaxed">
                        No reportes ausencia. La ubicación ya está en revisión y no debe generarse una propuesta automática de cobro.
                    </p>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        controles.set(serviceId, { element: panel, intervalId: null });
        return panel;
    }

    panel.innerHTML = `
        <div class="flex items-start justify-between gap-3">
            <div>
                <p class="text-yellow-400 text-[10px] font-black uppercase tracking-widest">Control de espera</p>
                <p class="text-white font-black text-sm mt-1">Esperando respuesta de ${customerName}</p>
            </div>
            <i class="fas fa-hourglass-half text-yellow-400"></i>
        </div>

        <div class="mt-3 bg-black/60 border border-zinc-800 rounded-xl p-3 text-center">
            <p class="text-gray-500 text-[9px] uppercase font-bold">Tiempo restante</p>
            <p data-role="countdown" class="text-2xl text-white font-black font-mono mt-1">05:00</p>
        </div>

        <p data-role="note" class="text-gray-400 text-[10px] mt-3 leading-relaxed">
            Al terminar el plazo podrás documentar ausencia o negativa de acceso con una segunda ubicación y fotografía.
        </p>

        <div data-role="error" class="hidden mt-3 bg-red-950/50 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl"></div>

        <button type="button" data-action="report" class="w-full mt-4 bg-yellow-500 text-black font-black py-3 rounded-xl text-xs disabled:opacity-40 disabled:cursor-not-allowed" disabled>
            <i class="fas fa-camera"></i> REPORTAR AUSENCIA / SIN ACCESO
        </button>
    `;

    document.body.appendChild(panel);

    const countdown = panel.querySelector('[data-role="countdown"]');
    const note = panel.querySelector('[data-role="note"]');
    const reportButton = panel.querySelector('[data-action="report"]');
    let enabled = false;

    const update = () => {
        const remaining = deadlineMs - Date.now();
        countdown.textContent = formatearContador(remaining);

        if (remaining <= 0 && !enabled) {
            enabled = true;
            reportButton.disabled = false;
            countdown.classList.remove("text-white");
            countdown.classList.add("text-yellow-400");
            note.textContent = "El plazo visual terminó. El reporte todavía requerirá GPS, fotografía nueva y revisión antes de cualquier cargo.";
        }
    };

    update();
    const intervalId = setInterval(update, 1000);

    reportButton.addEventListener("click", async () => {
        reportButton.disabled = true;
        reportButton.innerHTML = '<i class="fas fa-satellite fa-spin"></i> REVALIDANDO UBICACIÓN...';

        try {
            await abrirFlujoEvidenciaAusencia({
                serviceId,
                serviceData,
                technicianId,
                panel,
                reportButton
            });
        } catch (error) {
            console.error("[B2C_NO_SHOW_FLOW_ERROR]", error);
            const errorElement = panel.querySelector('[data-role="error"]');
            errorElement.textContent = "No se pudo iniciar el reporte. La orden permanece sin cambios.";
            errorElement.classList.remove("hidden");
            reportButton.disabled = false;
            reportButton.innerHTML = '<i class="fas fa-camera"></i> REINTENTAR REPORTE';
        }
    });

    controles.set(serviceId, {
        element: panel,
        intervalId,
        deadlineMs
    });

    return panel;
}

async function validarPrecondiciones({ serviceId, technicianId }) {
    const serviceRef = doc(db, "services", serviceId);

    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(serviceRef);

        if (!snapshot.exists()) {
            throw new Error("SERVICE_NOT_FOUND");
        }

        const current = snapshot.data();

        if (String(current.tecnico_id || "") !== String(technicianId)) {
            throw new Error("TECHNICIAN_SERVICE_MISMATCH");
        }

        if (current.estado !== "en_sitio") {
            throw new Error(`INVALID_SERVICE_STATE_${current.estado || "unknown"}`);
        }

        if ((current.llegada_cliente_respuesta || "pendiente") !== "pendiente") {
            throw new Error("CUSTOMER_ALREADY_RESPONDED");
        }

        if (current.ausencia_cliente_estado) {
            throw new Error("NO_SHOW_ALREADY_REPORTED");
        }

        const arrivalMs = timestampAMilisegundos(current.en_sitio_at);
        if (!arrivalMs || Date.now() - arrivalMs < B2C_NO_SHOW_WAIT_MS) {
            throw new Error("WAIT_PERIOD_NOT_FINISHED");
        }

        return current;
    });
}

async function abrirFlujoEvidenciaAusencia({
    serviceId,
    serviceData,
    technicianId,
    panel,
    reportButton
}) {
    const current = await validarPrecondiciones({ serviceId, technicianId });
    const destination = destinoServicio(current || serviceData);

    const validation = await validarLlegadaParaEvidencia({
        destination,
        geoPolicy: GEO_POLICY,
        allowFallback: true
    });

    if (!validation.allowCapture) {
        reportButton.disabled = false;
        reportButton.innerHTML = '<i class="fas fa-camera"></i> REINTENTAR REPORTE';

        if (validation.status === "arrival_rejected") {
            throw new Error("TECHNICIAN_OUTSIDE_GEOFENCE");
        }

        throw new Error(validation.reason || "GPS_VALIDATION_FAILED");
    }

    abrirModalCapturaAusencia({
        serviceId,
        serviceData: current,
        technicianId,
        validation,
        panel,
        reportButton
    });
}

function cerrarModalCaptura(modal, videoElement) {
    try {
        detenerCamaraEvidencia(videoElement);
    } catch (error) {
        console.warn("[B2C_NO_SHOW_CAMERA_STOP_WARNING]", error);
    }

    modal?.remove();
}

async function registrarIncidenciaAusencia({
    serviceId,
    technicianId,
    incidentType,
    evidenceResult,
    validation
}) {
    const serviceRef = doc(db, "services", serviceId);

    await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(serviceRef);

        if (!snapshot.exists()) throw new Error("SERVICE_NOT_FOUND");

        const current = snapshot.data();

        if (String(current.tecnico_id || "") !== String(technicianId)) {
            throw new Error("TECHNICIAN_SERVICE_MISMATCH");
        }

        if (current.estado !== "en_sitio") {
            throw new Error(`INVALID_SERVICE_STATE_${current.estado || "unknown"}`);
        }

        if ((current.llegada_cliente_respuesta || "pendiente") !== "pendiente") {
            throw new Error("CUSTOMER_ALREADY_RESPONDED");
        }

        if (current.ausencia_cliente_estado) {
            throw new Error("NO_SHOW_ALREADY_REPORTED");
        }

        const arrivalMs = timestampAMilisegundos(current.en_sitio_at);
        if (!arrivalMs || Date.now() - arrivalMs < B2C_NO_SHOW_WAIT_MS) {
            throw new Error("WAIT_PERIOD_NOT_FINISHED");
        }

        const gps = validation.gps || null;
        const arrival = validation.arrival || null;
        const fallback = validation.fallback === true;

        transaction.update(serviceRef, {
            ausencia_cliente_estado: "evidencia_recibida_pendiente_revision",
            ausencia_cliente_tipo: incidentType,
            ausencia_cliente_reportada_at: serverTimestamp(),
            ausencia_cliente_version: B2C_TECHNICIAN_NO_SHOW_VERSION,
            ausencia_cliente_revision_requerida: true,
            ausencia_cliente_cobro_propuesto_porcentaje: B2C_NO_SHOW_PROPOSED_PERCENT,
            ausencia_cliente_cobro_ejecutado: false,
            ausencia_cliente_fondos_movidos: false,
            ausencia_cliente_bloqueo_cotizacion: true,
            ausencia_cliente_evidencia: {
                evidence_event_id: evidenceResult.eventDocumentId,
                evidence_id: evidenceResult.evidenceId,
                event_type: evidenceResult.eventType,
                download_url: evidenceResult.downloadUrl,
                storage_path: evidenceResult.storagePath,
                sha256: evidenceResult.fingerprint?.sha256 || null,
                perceptual_hash: evidenceResult.fingerprint?.perceptual?.hex || null,
                gps_verificado: !fallback,
                fallback_reason: fallback
                    ? textoSeguro(arrival?.reason || validation.reason, 160)
                    : null,
                tecnico_lat: numeroFinito(gps?.lat),
                tecnico_lng: numeroFinito(gps?.lng),
                precision_m: numeroFinito(gps?.accuracyM),
                distancia_destino_m: numeroFinito(arrival?.distanceM),
                capturada_at_cliente: evidenceResult.payload?.capturedAtClient || null,
                sellada_at_servidor: serverTimestamp()
            }
        });
    });
}

function abrirModalCapturaAusencia({
    serviceId,
    serviceData,
    technicianId,
    validation,
    panel,
    reportButton
}) {
    const suffix = idSeguro(serviceId);
    const modal = document.createElement("div");
    modal.id = `b2cNoShowModal_${suffix}`;
    modal.className = "fixed inset-0 bg-black/95 z-[140] flex items-center justify-center p-4 backdrop-blur-sm";

    modal.innerHTML = `
        <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-5 border border-yellow-500/40 shadow-2xl">
            <div class="flex justify-between items-center gap-3 mb-4">
                <div>
                    <p class="text-yellow-400 text-[10px] font-black uppercase tracking-widest">Evidencia reforzada</p>
                    <h3 class="text-white font-black text-lg mt-1">Documentar incidencia</h3>
                </div>
                <button type="button" data-action="close" class="text-gray-500 hover:text-white p-2">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="grid grid-cols-2 gap-2 mb-4">
                <label class="bg-black border border-zinc-700 rounded-xl p-3 text-xs text-white cursor-pointer">
                    <input type="radio" name="b2cNoShowType_${suffix}" value="customer_no_show" checked class="mr-1">
                    No responde / ausente
                </label>
                <label class="bg-black border border-zinc-700 rounded-xl p-3 text-xs text-white cursor-pointer">
                    <input type="radio" name="b2cNoShowType_${suffix}" value="customer_denied_access" class="mr-1">
                    Niega el acceso
                </label>
            </div>

            <div class="relative bg-black rounded-2xl overflow-hidden border border-zinc-700 aspect-[3/4]">
                <video data-role="video" class="w-full h-full object-cover" autoplay muted playsinline></video>
                <div data-role="loading" class="absolute inset-0 bg-black flex flex-col items-center justify-center text-gray-400">
                    <i class="fas fa-camera text-3xl mb-3"></i>
                    <p class="text-xs font-bold">ABRIENDO CÁMARA SEGURA...</p>
                </div>
            </div>

            <p class="text-gray-500 text-[10px] mt-3 leading-relaxed">
                Fotografía solamente el acceso o fachada. Evita rostros, interiores, placas y documentos innecesarios.
            </p>

            <div data-role="error" class="hidden mt-3 bg-red-950/50 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl"></div>

            <div class="flex gap-3 mt-5">
                <button type="button" data-action="cancel" class="flex-1 bg-zinc-800 text-white font-bold py-3 rounded-xl text-xs">CANCELAR</button>
                <button type="button" data-action="capture" class="flex-[2] bg-yellow-500 text-black font-black py-3 rounded-xl text-xs disabled:opacity-40" disabled>
                    <i class="fas fa-camera"></i> TOMAR FOTO Y REPORTAR
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const videoElement = modal.querySelector('[data-role="video"]');
    const loading = modal.querySelector('[data-role="loading"]');
    const captureButton = modal.querySelector('[data-action="capture"]');
    const errorElement = modal.querySelector('[data-role="error"]');
    const cancelButtons = modal.querySelectorAll('[data-action="cancel"], [data-action="close"]');

    cancelButtons.forEach((button) => {
        button.addEventListener("click", () => {
            cerrarModalCaptura(modal, videoElement);
            reportButton.disabled = false;
            reportButton.innerHTML = '<i class="fas fa-camera"></i> REPORTAR AUSENCIA / SIN ACCESO';
        });
    });

    abrirCamaraEvidencia({
        videoElement,
        facingMode: "environment",
        includeAudio: false
    })
        .then(() => {
            loading.classList.add("hidden");
            captureButton.disabled = false;
        })
        .catch((error) => {
            console.error("[B2C_NO_SHOW_CAMERA_OPEN_ERROR]", error);
            errorElement.textContent = "No fue posible abrir la cámara. Autoriza el permiso y vuelve a intentarlo.";
            errorElement.classList.remove("hidden");
            reportButton.disabled = false;
            reportButton.innerHTML = '<i class="fas fa-camera"></i> REINTENTAR REPORTE';
        });

    captureButton.addEventListener("click", async () => {
        captureButton.disabled = true;
        captureButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SELLANDO EVIDENCIA...';
        errorElement.classList.add("hidden");

        try {
            const incidentType = modal.querySelector(`input[name="b2cNoShowType_${suffix}"]:checked`)?.value || "customer_no_show";
            const eventType = incidentType;

            const result = await capturarYSubirFotoB2C({
                videoElement,
                serviceId,
                technicianId,
                customerId: serviceData.cliente_id || null,
                actorUid: technicianId,
                actorRole: "tecnico",
                eventType,
                gps: validation.gps || null,
                arrival: validation.arrival || null,
                fallbackReason: validation.fallback
                    ? validation.arrival?.reason || validation.reason || "GPS_EVIDENCE_INSUFFICIENT"
                    : null,
                policy: {
                    geo: GEO_POLICY,
                    requireInAppCapture: true,
                    photoQuality: 0.9
                }
            });

            if (!result.success) {
                errorElement.textContent = result.userMessage || "La evidencia no superó la validación antifraude. Toma una fotografía nueva.";
                errorElement.classList.remove("hidden");
                captureButton.disabled = false;
                captureButton.innerHTML = '<i class="fas fa-camera"></i> TOMAR OTRA FOTO';
                return;
            }

            await registrarIncidenciaAusencia({
                serviceId,
                technicianId,
                incidentType,
                evidenceResult: result,
                validation
            });

            cerrarModalCaptura(modal, videoElement);
            eliminarControl(serviceId);
            aplicarBloqueoCotizador(serviceId, true);

            alert(
                "✅ Incidencia documentada. Se propuso el 50% de la tarifa de visita para revisión, pero no se ejecutó ningún cargo ni movimiento de fondos."
            );
        } catch (error) {
            console.error("[B2C_NO_SHOW_CAPTURE_ERROR]", error);
            errorElement.textContent = "No fue posible registrar la incidencia. La orden y los fondos permanecen sin cambios.";
            errorElement.classList.remove("hidden");
            captureButton.disabled = false;
            captureButton.innerHTML = '<i class="fas fa-redo"></i> REINTENTAR';
        }
    });
}

function servicioControlable(serviceData) {
    return Boolean(
        serviceData &&
        serviceData.estado === "en_sitio" &&
        (serviceData.llegada_cliente_respuesta || "pendiente") !== "recibido"
    );
}

export function instalarControlAusenciaTecnicoB2C(user = null) {
    const technicianId = textoSeguro(
        user?.uid || auth.currentUser?.uid,
        128
    );

    if (!technicianId) {
        console.warn("[B2C_NO_SHOW_NOT_INSTALLED] Falta UID de técnico.");
        return null;
    }

    if (instalaciones.has(technicianId)) {
        return instalaciones.get(technicianId);
    }

    const servicesQuery = query(
        collection(db, "services"),
        where("tecnico_id", "==", technicianId),
        where("estado", "==", "en_sitio")
    );

    const unsubscribe = onSnapshot(
        servicesQuery,
        (snapshot) => {
            const activeIds = new Set();

            snapshot.forEach((serviceSnapshot) => {
                const serviceId = serviceSnapshot.id;
                const serviceData = serviceSnapshot.data();
                activeIds.add(serviceId);

                if (serviceData.ausencia_cliente_estado) {
                    eliminarControl(serviceId);
                    aplicarBloqueoCotizador(serviceId, true);
                    return;
                }

                if (!servicioControlable(serviceData)) {
                    eliminarControl(serviceId);
                    return;
                }

                crearPanelControl({
                    serviceId,
                    serviceData,
                    technicianId
                });
            });

            Array.from(controles.keys()).forEach((serviceId) => {
                if (!activeIds.has(serviceId)) {
                    eliminarControl(serviceId);
                }
            });
        },
        (error) => {
            console.error("[B2C_NO_SHOW_SNAPSHOT_ERROR]", error);
        }
    );

    const installation = {
        version: B2C_TECHNICIAN_NO_SHOW_VERSION,
        unsubscribe
    };

    instalaciones.set(technicianId, installation);
    window.__B2C_TECHNICIAN_NO_SHOW_VERSION__ = B2C_TECHNICIAN_NO_SHOW_VERSION;

    console.log(
        `[B2C_TECHNICIAN_NO_SHOW_READY] v${B2C_TECHNICIAN_NO_SHOW_VERSION}`
    );

    return installation;
}
