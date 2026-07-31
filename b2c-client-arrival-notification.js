/**
 * ======================================================================================
 * B2C CLIENT ARRIVAL NOTIFICATION 2026
 * Archivo: b2c-client-arrival-notification.js
 * Rol: Notificación dentro de la app, evidencia visible y acuse de llegada del cliente.
 *
 * ALCANCE:
 * - Muestra al cliente la evidencia de llegada del técnico.
 * - Inicia un contador visual de 5 minutos basado en en_sitio_at del servidor.
 * - Permite confirmar recepción o disputar que el técnico esté en el punto indicado.
 * - Registra hora de servidor para cada respuesta.
 * - No aplica cobros ni determina ausencia de forma autoritativa desde el navegador.
 * ======================================================================================
 */

import {
    db,
    doc,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    limit,
    serverTimestamp
} from "./firebase.js";

import {
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
    sonarAlerta,
    lanzarNotificacionPush
} from "./app-utils.js";

export const B2C_CLIENT_ARRIVAL_NOTIFICATION_VERSION = "1.0.0";
export const B2C_CLIENT_ARRIVAL_WAIT_MS = 5 * 60 * 1000;

const instalaciones = new Map();
const modalesActivos = new Map();

function textoSeguro(value, maxLength = 180) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function idSeguro(value) {
    return textoSeguro(value, 128)
        .replace(/[^a-zA-Z0-9_-]/g, "_");
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
    const totalSeconds = Math.ceil(safe / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function cerrarModal(serviceId) {
    const active = modalesActivos.get(serviceId);
    if (!active) return;

    if (active.intervalId) {
        clearInterval(active.intervalId);
    }

    active.modal?.remove();
    modalesActivos.delete(serviceId);
}

async function registrarNotificacionMostrada({ serviceId, customerId }) {
    const serviceRef = doc(db, "services", serviceId);

    await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(serviceRef);
        if (!snapshot.exists()) return;

        const current = snapshot.data();
        if (String(current.cliente_id || "") !== String(customerId)) return;
        if (current.estado !== "en_sitio") return;

        const alreadyShown = ["mostrada", "respondida", "disputada"].includes(
            current.llegada_notificacion_estado
        );

        if (alreadyShown) return;

        transaction.update(serviceRef, {
            llegada_notificacion_estado: "mostrada",
            llegada_notificacion_mostrada_at: serverTimestamp(),
            llegada_notificacion_version: B2C_CLIENT_ARRIVAL_NOTIFICATION_VERSION,
            llegada_espera_segundos: 300
        });
    });
}

async function responderLlegada({
    serviceId,
    customerId,
    response,
    reason = null
}) {
    const serviceRef = doc(db, "services", serviceId);

    return runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(serviceRef);

        if (!snapshot.exists()) {
            throw new Error("SERVICE_NOT_FOUND");
        }

        const current = snapshot.data();

        if (String(current.cliente_id || "") !== String(customerId)) {
            throw new Error("CUSTOMER_SERVICE_MISMATCH");
        }

        if (current.estado !== "en_sitio") {
            throw new Error(`INVALID_SERVICE_STATE_${current.estado || "unknown"}`);
        }

        if (current.llegada_cliente_respuesta !== "pendiente") {
            return {
                accepted: false,
                reason: "ARRIVAL_ALREADY_ANSWERED",
                currentResponse: current.llegada_cliente_respuesta
            };
        }

        const disputed = response === "ubicacion_disputada";

        transaction.update(serviceRef, {
            llegada_cliente_respuesta: response,
            llegada_cliente_respuesta_at: serverTimestamp(),
            llegada_notificacion_estado: disputed ? "disputada" : "respondida",
            llegada_revision_requerida:
                disputed || current.llegada_revision_requerida === true,
            llegada_disputa_cliente: disputed
                ? {
                    motivo: textoSeguro(reason || "tecnico_no_visible_en_destino", 160),
                    creada_at: serverTimestamp(),
                    version: B2C_CLIENT_ARRIVAL_NOTIFICATION_VERSION
                }
                : null
        });

        return {
            accepted: true,
            response
        };
    });
}

function crearModalLlegada({ serviceId, serviceData, customerId }) {
    cerrarModal(serviceId);

    const suffix = idSeguro(serviceId);
    const modal = document.createElement("div");
    modal.id = `b2cClientArrival_${suffix}`;
    modal.className = "fixed inset-0 bg-black/95 z-[130] flex items-center justify-center p-4 backdrop-blur-sm";

    const technicianName = textoSeguro(
        serviceData.tecnico_nombre || "Tu técnico",
        80
    );
    const evidenceUrl = textoSeguro(
        serviceData.evidencia_llegada?.download_url,
        2048
    );
    const arrivalAtMs = timestampAMilisegundos(serviceData.en_sitio_at);
    const deadlineMs = (arrivalAtMs || Date.now()) + B2C_CLIENT_ARRIVAL_WAIT_MS;
    const reviewRequired = serviceData.llegada_revision_requerida === true;

    modal.innerHTML = `
        <div class="bg-zinc-900 w-full max-w-md rounded-3xl border border-blue-500/40 shadow-2xl overflow-hidden">
            <div class="bg-blue-600/15 border-b border-blue-500/30 p-5">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <p class="text-blue-400 text-[10px] font-black uppercase tracking-[0.18em]">Llegada registrada</p>
                        <h3 class="text-white text-xl font-black mt-1">${technicianName} está en el sitio</h3>
                    </div>
                    <div class="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                        <i class="fas fa-location-dot text-blue-400 text-xl"></i>
                    </div>
                </div>
            </div>

            <div class="p-5">
                <div class="bg-black/50 border border-zinc-700 rounded-2xl p-4 text-center">
                    <p class="text-gray-400 text-[10px] uppercase font-bold tracking-widest">Tiempo para responder</p>
                    <p data-role="countdown" class="text-4xl text-white font-black font-mono mt-1">05:00</p>
                    <p data-role="deadline-note" class="text-gray-500 text-[10px] mt-2 leading-relaxed">
                        Confirma que recibiste al técnico o reporta inmediatamente si no lo ves en el domicilio indicado.
                    </p>
                </div>

                ${evidenceUrl ? `
                    <div class="mt-4">
                        <p class="text-gray-400 text-[10px] uppercase font-bold tracking-widest mb-2">Evidencia de llegada</p>
                        <a href="${evidenceUrl}" target="_blank" rel="noopener noreferrer" class="block bg-black rounded-2xl overflow-hidden border border-zinc-700">
                            <img src="${evidenceUrl}" alt="Evidencia de llegada" class="w-full h-44 object-cover">
                            <div class="p-2 text-center text-blue-400 text-[10px] font-bold">
                                <i class="fas fa-expand"></i> VER CAPTURA COMPLETA
                            </div>
                        </a>
                    </div>
                ` : `
                    <div class="mt-4 bg-yellow-950/30 border border-yellow-500/30 text-yellow-300 text-xs p-3 rounded-xl">
                        La evidencia está siendo procesada. La respuesta del cliente seguirá quedando registrada.
                    </div>
                `}

                ${reviewRequired ? `
                    <div class="mt-4 bg-yellow-950/30 border border-yellow-500/30 text-yellow-300 text-xs p-3 rounded-xl leading-relaxed">
                        <i class="fas fa-triangle-exclamation"></i>
                        La ubicación requirió validación alternativa. Puedes confirmar o disputar la llegada.
                    </div>
                ` : ""}

                <div data-role="error" class="hidden mt-4 bg-red-950/40 border border-red-500/40 text-red-300 text-xs p-3 rounded-xl"></div>

                <div class="grid gap-3 mt-5">
                    <button type="button" data-action="confirm" class="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-4 rounded-xl text-sm transition-all active:scale-95">
                        <i class="fas fa-door-open"></i> CONFIRMAR QUE LO RECIBÍ
                    </button>
                    <button type="button" data-action="dispute" class="w-full bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/40 font-bold py-3 rounded-xl text-xs transition-all active:scale-95">
                        <i class="fas fa-location-crosshairs"></i> EL TÉCNICO NO ESTÁ AQUÍ
                    </button>
                    <button type="button" data-action="minimize" class="w-full text-gray-500 hover:text-white font-bold py-2 text-[10px] uppercase tracking-widest">
                        Minimizar aviso
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const countdownElement = modal.querySelector('[data-role="countdown"]');
    const deadlineNote = modal.querySelector('[data-role="deadline-note"]');
    const errorElement = modal.querySelector('[data-role="error"]');
    const confirmButton = modal.querySelector('[data-action="confirm"]');
    const disputeButton = modal.querySelector('[data-action="dispute"]');
    const minimizeButton = modal.querySelector('[data-action="minimize"]');

    let expired = false;

    const updateCountdown = () => {
        const remaining = deadlineMs - Date.now();
        countdownElement.textContent = formatearContador(remaining);

        if (remaining <= 0 && !expired) {
            expired = true;
            countdownElement.classList.remove("text-white");
            countdownElement.classList.add("text-red-400");
            deadlineNote.textContent = "El periodo de 5 minutos terminó. Aún puedes responder; la plataforma registrará la hora exacta y revisará la evidencia antes de cualquier cargo.";
        }
    };

    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);

    const setBusy = (busy) => {
        confirmButton.disabled = busy;
        disputeButton.disabled = busy;
        confirmButton.classList.toggle("opacity-50", busy);
        disputeButton.classList.toggle("opacity-50", busy);
    };

    confirmButton.addEventListener("click", async () => {
        setBusy(true);
        errorElement.classList.add("hidden");

        try {
            const result = await responderLlegada({
                serviceId,
                customerId,
                response: "recibido"
            });

            if (!result.accepted && result.reason === "ARRIVAL_ALREADY_ANSWERED") {
                cerrarModal(serviceId);
                return;
            }

            cerrarModal(serviceId);
            alert("✅ Recepción confirmada. La hora quedó registrada en Península Tech.");
        } catch (error) {
            console.error("[B2C_CLIENT_ARRIVAL_CONFIRM_ERROR]", error);
            errorElement.textContent = "No se pudo registrar tu confirmación. Revisa conexión y vuelve a intentarlo.";
            errorElement.classList.remove("hidden");
            setBusy(false);
        }
    });

    disputeButton.addEventListener("click", async () => {
        if (!confirm("¿Confirmas que el técnico no se encuentra en el domicilio o punto mostrado? Esta respuesta abrirá revisión y evitará que la llegada se trate como confirmada.")) {
            return;
        }

        setBusy(true);
        errorElement.classList.add("hidden");

        try {
            const result = await responderLlegada({
                serviceId,
                customerId,
                response: "ubicacion_disputada",
                reason: "cliente_reporta_tecnico_no_visible_en_destino"
            });

            if (!result.accepted && result.reason === "ARRIVAL_ALREADY_ANSWERED") {
                cerrarModal(serviceId);
                return;
            }

            cerrarModal(serviceId);
            alert("⚠️ Reporte registrado. La llegada quedó en revisión y no debe resolverse automáticamente desde el dispositivo.");
        } catch (error) {
            console.error("[B2C_CLIENT_ARRIVAL_DISPUTE_ERROR]", error);
            errorElement.textContent = "No se pudo registrar el reporte. Revisa conexión y vuelve a intentarlo.";
            errorElement.classList.remove("hidden");
            setBusy(false);
        }
    });

    minimizeButton.addEventListener("click", () => {
        modal.classList.add("hidden");
    });

    modalesActivos.set(serviceId, {
        modal,
        intervalId,
        deadlineMs
    });

    return modal;
}

function servicioRequiereAviso(serviceData) {
    return Boolean(
        serviceData &&
        serviceData.estado === "en_sitio" &&
        (serviceData.llegada_cliente_respuesta || "pendiente") === "pendiente"
    );
}

export function instalarNotificacionLlegadaClienteB2C(user = null) {
    const customerId = textoSeguro(user?.uid, 128);

    if (!customerId) {
        console.warn("[B2C_CLIENT_ARRIVAL_NOT_INSTALLED] Falta UID de cliente.");
        return null;
    }

    if (instalaciones.has(customerId)) {
        return instalaciones.get(customerId);
    }

    const servicesQuery = query(
        collection(db, "services"),
        where("cliente_id", "==", customerId),
        orderBy("created_at", "desc"),
        limit(50)
    );

    let initialLoad = true;
    const seenArrivalSignature = new Set();

    const unsubscribe = onSnapshot(
        servicesQuery,
        async (snapshot) => {
            const pendingServices = [];

            snapshot.forEach((serviceSnapshot) => {
                const serviceData = serviceSnapshot.data();
                if (!servicioRequiereAviso(serviceData)) return;

                pendingServices.push({
                    id: serviceSnapshot.id,
                    data: serviceData
                });
            });

            for (const service of pendingServices) {
                const arrivalMs = timestampAMilisegundos(service.data.en_sitio_at) || 0;
                const signature = `${service.id}:${arrivalMs}`;

                if (seenArrivalSignature.has(signature) && modalesActivos.has(service.id)) {
                    continue;
                }

                seenArrivalSignature.add(signature);

                try {
                    await registrarNotificacionMostrada({
                        serviceId: service.id,
                        customerId
                    });
                } catch (error) {
                    console.warn("[B2C_CLIENT_ARRIVAL_SHOWN_WRITE_WARNING]", error);
                }

                if (!initialLoad || Date.now() - arrivalMs <= B2C_CLIENT_ARRIVAL_WAIT_MS * 2) {
                    sonarAlerta();
                    lanzarNotificacionPush(
                        "📍 Tu técnico llegó",
                        `${textoSeguro(service.data.tecnico_nombre || "El técnico", 70)} está en el domicilio. Confirma o reporta si no lo ves.`
                    );
                }

                crearModalLlegada({
                    serviceId: service.id,
                    serviceData: service.data,
                    customerId
                });
            }

            initialLoad = false;
        },
        (error) => {
            console.error("[B2C_CLIENT_ARRIVAL_WATCH_ERROR]", error);
        }
    );

    const installation = {
        version: B2C_CLIENT_ARRIVAL_NOTIFICATION_VERSION,
        unsubscribe() {
            unsubscribe();
            instalaciones.delete(customerId);
            for (const serviceId of modalesActivos.keys()) {
                cerrarModal(serviceId);
            }
        }
    };

    instalaciones.set(customerId, installation);
    window.__B2C_CLIENT_ARRIVAL_NOTIFICATION_VERSION__ = B2C_CLIENT_ARRIVAL_NOTIFICATION_VERSION;

    console.log(
        `[B2C_CLIENT_ARRIVAL_NOTIFICATION_READY] v${B2C_CLIENT_ARRIVAL_NOTIFICATION_VERSION}`
    );

    return installation;
}
