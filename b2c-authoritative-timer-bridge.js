/**
 * ======================================================================================
 * B2C AUTHORITATIVE TIMER BRIDGE 2026
 * Archivo: b2c-authoritative-timer-bridge.js
 * Rol: Aplicar el reloj servidor a los contadores de cliente y técnico sin reescribir UI legacy.
 *
 * ALCANCE:
 * - Observa servicios en sitio del usuario autenticado.
 * - Sincroniza reloj por folio y actor.
 * - Corrige visualmente ambos contadores de cinco minutos.
 * - Impide reportar ausencia antes del vencimiento autoritativo.
 * - Muestra UTC, zona horaria IANA, fuente y margen de incertidumbre.
 * - No ejecuta cobros ni cambia el estado del servicio.
 * ======================================================================================
 */

import {
    db,
    collection,
    query,
    where,
    onSnapshot
} from "./firebase.js";

import {
    sincronizarRelojServidor,
    crearDeadlineAutoritativo,
    formatearInstanteServicio,
    resolverZonaHorariaServicio,
    B2C_TIME_AUTHORITY_VERSION
} from "./b2c-time-authority.js";

export const B2C_AUTHORITATIVE_TIMER_BRIDGE_VERSION = "1.0.0";
export const B2C_ARRIVAL_WAIT_MS = 5 * 60 * 1000;

const installations = new Map();
const serviceStates = new Map();

function textoSeguro(value, maxLength = 160) {
    return String(value ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .trim()
        .slice(0, maxLength);
}

function idSeguro(value) {
    return textoSeguro(value, 128)
        .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function formatCountdown(ms) {
    const safe = Math.max(0, Number(ms) || 0);
    const totalSeconds = Math.ceil(safe / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function calidadTraducida(quality) {
    const labels = {
        strong: "fuerte",
        acceptable: "aceptable",
        weak: "débil",
        untrusted_fallback: "no confiable"
    };

    return labels[quality] || quality || "desconocida";
}

function fuenteTraducida(source) {
    const labels = {
        firestore_server_timestamp: "Firestore",
        http_date_header: "servidor HTTP",
        device_clock_fallback: "reloj del dispositivo"
    };

    return labels[source] || source || "desconocida";
}

function selectorCliente(serviceId) {
    return `#b2cClientArrival_${idSeguro(serviceId)}`;
}

function selectorTecnico(serviceId) {
    return `#b2cNoShowControl_${idSeguro(serviceId)}`;
}

function asegurarNotaAutoritativa(container, role) {
    if (!container) return null;

    let note = container.querySelector('[data-b2c-authoritative-time="true"]');

    if (!note) {
        note = document.createElement("p");
        note.dataset.b2cAuthoritativeTime = "true";
        note.className = role === "tecnico"
            ? "text-[9px] text-cyan-400 mt-2 leading-relaxed"
            : "text-[9px] text-cyan-400 mt-3 leading-relaxed text-center";

        const countdown = container.querySelector('[data-role="countdown"]');
        const countdownBox = countdown?.parentElement;

        if (countdownBox) countdownBox.appendChild(note);
        else container.appendChild(note);
    }

    return note;
}

function descripcionReloj(state) {
    const sync = state.clockSync;
    const formatted = formatearInstanteServicio(
        state.serviceData.en_sitio_at,
        state.serviceData
    );
    const zone = resolverZonaHorariaServicio(state.serviceData);
    const uncertainty = Number.isFinite(sync?.uncertaintyMs)
        ? ` ±${Math.ceil(sync.uncertaintyMs)} ms`
        : "";

    const arrivalText = formatted?.formatted
        ? `Llegada: ${formatted.formatted}`
        : "Llegada pendiente de sello servidor";

    return `${arrivalText} · ${zone.timezone} · ${fuenteTraducida(sync?.source)} · sincronización ${calidadTraducida(sync?.quality)}${uncertainty}`;
}

function relojAptoParaControl(clockSync) {
    return Boolean(
        clockSync &&
        ["strong", "acceptable"].includes(clockSync.quality) &&
        clockSync.source !== "device_clock_fallback"
    );
}

function deadlineState(state) {
    return crearDeadlineAutoritativo({
        startTimestamp: state.serviceData.en_sitio_at,
        durationMs: B2C_ARRIVAL_WAIT_MS,
        clockSync: state.clockSync
    });
}

function aplicarCliente(state) {
    const modal = document.querySelector(selectorCliente(state.serviceId));
    if (!modal) return;

    const countdown = modal.querySelector('[data-role="countdown"]');
    const deadlineNote = modal.querySelector('[data-role="deadline-note"]');
    const authorityNote = asegurarNotaAutoritativa(modal, "cliente");
    const deadline = deadlineState(state);

    if (countdown && deadline.valid) {
        countdown.textContent = formatCountdown(deadline.remainingMs);
        countdown.dataset.b2cClockSource = deadline.clockSource;
        countdown.dataset.b2cClockQuality = deadline.clockQuality;

        if (deadline.expired) {
            countdown.classList.remove("text-white");
            countdown.classList.add("text-red-400");
        }
    }

    if (deadlineNote && !deadline.valid) {
        deadlineNote.textContent = "No se recibió una marca de tiempo servidor válida. Puedes confirmar o disputar, pero el plazo no debe usarse para aplicar cargos.";
    }

    if (authorityNote) {
        authorityNote.textContent = descripcionReloj(state);
    }
}

function aplicarTecnico(state) {
    const panel = document.querySelector(selectorTecnico(state.serviceId));
    if (!panel) return;

    const countdown = panel.querySelector('[data-role="countdown"]');
    const note = panel.querySelector('[data-role="note"]');
    const reportButton = panel.querySelector('[data-action="report"]');
    const authorityNote = asegurarNotaAutoritativa(panel, "tecnico");
    const deadline = deadlineState(state);
    const clockReady = relojAptoParaControl(state.clockSync);
    const reportReady = deadline.valid && deadline.expired && clockReady;

    if (countdown && deadline.valid) {
        countdown.textContent = formatCountdown(deadline.remainingMs);
        countdown.dataset.b2cClockSource = deadline.clockSource;
        countdown.dataset.b2cClockQuality = deadline.clockQuality;

        if (deadline.expired) {
            countdown.classList.remove("text-white");
            countdown.classList.add("text-yellow-400");
        }
    }

    if (reportButton) {
        reportButton.dataset.b2cServiceId = state.serviceId;
        reportButton.dataset.b2cAuthoritativeReady = reportReady ? "true" : "false";
        reportButton.disabled = !reportReady;

        if (!clockReady) {
            reportButton.innerHTML = '<i class="fas fa-clock"></i> SINCRONIZANDO HORA SEGURA...';
        } else if (!deadline.valid) {
            reportButton.innerHTML = '<i class="fas fa-shield-halved"></i> FALTA HORA DE LLEGADA SERVIDOR';
        } else if (!deadline.expired) {
            reportButton.innerHTML = '<i class="fas fa-hourglass-half"></i> ESPERANDO PLAZO DE 5 MINUTOS';
        } else {
            reportButton.innerHTML = '<i class="fas fa-camera"></i> REPORTAR AUSENCIA / SIN ACCESO';
        }
    }

    if (note) {
        if (!clockReady) {
            note.textContent = "El reporte permanecerá bloqueado hasta sincronizar una fuente de hora servidor. El reloj del teléfono no es suficiente.";
        } else if (!deadline.valid) {
            note.textContent = "Falta la marca en_sitio_at del servidor. No se habilitará el reporte ni una propuesta económica.";
        } else if (deadline.expired) {
            note.textContent = "Plazo cumplido según hora de servidor. El reporte aún exige GPS, fotografía nueva y revisión antes de cualquier cargo.";
        }
    }

    if (authorityNote) {
        authorityNote.textContent = descripcionReloj(state);
    }
}

function aplicarEstado(state) {
    if (state.actorRole === "cliente") aplicarCliente(state);
    if (state.actorRole === "tecnico") aplicarTecnico(state);
}

async function sincronizarEstado(state, force = false) {
    if (state.syncInProgress) return;
    state.syncInProgress = true;

    try {
        state.clockSync = await sincronizarRelojServidor({
            serviceId: state.serviceId,
            actorUid: state.actorUid,
            actorRole: state.actorRole,
            force
        });
    } catch (error) {
        console.error("[B2C_AUTHORITATIVE_TIME_SYNC_ERROR]", error);
    } finally {
        state.syncInProgress = false;
        aplicarEstado(state);
    }
}

function interceptarReportePrematuro(event) {
    const button = event.target?.closest?.('[data-action="report"]');
    if (!button) return;

    const panel = button.closest('[id^="b2cNoShowControl_"]');
    if (!panel) return;

    const serviceId = button.dataset.b2cServiceId;
    const state = serviceStates.get(`tecnico:${serviceId}`);

    if (!state) return;

    const deadline = deadlineState(state);
    const allowed = button.dataset.b2cAuthoritativeReady === "true" &&
        deadline.valid &&
        deadline.expired &&
        relojAptoParaControl(state.clockSync);

    if (allowed) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    alert(
        "⛔ El reporte aún no está autorizado por la hora del servidor. El reloj del teléfono no puede adelantar el plazo."
    );
}

function instalarInterceptorGlobal() {
    if (window.__B2C_AUTHORITATIVE_REPORT_INTERCEPTOR__) return;

    document.addEventListener(
        "click",
        interceptarReportePrematuro,
        true
    );

    window.__B2C_AUTHORITATIVE_REPORT_INTERCEPTOR__ = true;
}

function limpiarEstadosActor(actorRole, actorUid, activeIds) {
    for (const [key, state] of serviceStates.entries()) {
        if (
            state.actorRole === actorRole &&
            state.actorUid === actorUid &&
            !activeIds.has(state.serviceId)
        ) {
            serviceStates.delete(key);
        }
    }
}

export function instalarPuenteTiempoAutoritativoB2C({
    user,
    actorRole
} = {}) {
    const actorUid = textoSeguro(user?.uid, 128);
    const role = actorRole === "tecnico" ? "tecnico" : "cliente";
    const installationKey = `${role}:${actorUid}`;

    if (!actorUid) {
        console.warn("[B2C_AUTHORITATIVE_TIMER_NOT_INSTALLED] Falta UID.");
        return null;
    }

    if (installations.has(installationKey)) {
        return installations.get(installationKey);
    }

    instalarInterceptorGlobal();

    const actorField = role === "tecnico"
        ? "tecnico_id"
        : "cliente_id";

    const servicesQuery = query(
        collection(db, "services"),
        where(actorField, "==", actorUid),
        where("estado", "==", "en_sitio")
    );

    const unsubscribe = onSnapshot(
        servicesQuery,
        (snapshot) => {
            const activeIds = new Set();

            snapshot.forEach((serviceSnapshot) => {
                const serviceId = serviceSnapshot.id;
                const serviceData = serviceSnapshot.data();
                const key = `${role}:${serviceId}`;
                activeIds.add(serviceId);

                let state = serviceStates.get(key);

                if (!state) {
                    state = {
                        serviceId,
                        serviceData,
                        actorUid,
                        actorRole: role,
                        clockSync: null,
                        syncInProgress: false
                    };
                    serviceStates.set(key, state);
                    sincronizarEstado(state);
                } else {
                    state.serviceData = serviceData;
                }

                aplicarEstado(state);
            });

            limpiarEstadosActor(role, actorUid, activeIds);
        },
        (error) => {
            console.error("[B2C_AUTHORITATIVE_TIMER_SNAPSHOT_ERROR]", error);
        }
    );

    const intervalId = setInterval(() => {
        for (const state of serviceStates.values()) {
            if (state.actorRole !== role || state.actorUid !== actorUid) continue;

            aplicarEstado(state);

            if (
                state.clockSync?.expiresAtClientMs &&
                state.clockSync.expiresAtClientMs <= Date.now()
            ) {
                sincronizarEstado(state, true);
            }
        }
    }, 250);

    const installation = {
        version: B2C_AUTHORITATIVE_TIMER_BRIDGE_VERSION,
        timeAuthorityVersion: B2C_TIME_AUTHORITY_VERSION,
        actorUid,
        actorRole: role,
        unsubscribe,
        stop() {
            clearInterval(intervalId);
            unsubscribe();
            installations.delete(installationKey);
        }
    };

    installations.set(installationKey, installation);
    window.__B2C_AUTHORITATIVE_TIMER_BRIDGE_VERSION__ =
        B2C_AUTHORITATIVE_TIMER_BRIDGE_VERSION;

    console.log(
        `[B2C_AUTHORITATIVE_TIMER_READY] ${role} v${B2C_AUTHORITATIVE_TIMER_BRIDGE_VERSION}`
    );

    return installation;
}
