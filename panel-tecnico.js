/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MÓDULO DE TÉCNICO (SOCIO OPERADOR)
 * ======================================================================================
 * Archivo: panel-tecnico.js
 * Descripción: Motor de radar, GPS, colisiones, cotizador y evidencia Cloud.
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR. MANTENER LOGICA.
 * ======================================================================================
 */

import {
    db,
    storage,
    doc,
    updateDoc,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    setDoc,
    getDoc 
} from "./firebase.js";

// 🔥 INYECCIÓN NIVEL UBER (Firestore & Storage)
import { getDocs, arrayUnion, runTransaction, limit, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// 🔔 INYECCIÓN V5.18.3: MOTOR PUSH FCM (Firebase Cloud Messaging)
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

// Motor GPS
import { iniciarTracking, detenerTracking } from "./gps-motor.js";

// Sistema Nervioso Compartido
import { escaparHTML, calcularDistancia, sonarAlerta, lanzarNotificacionPush, cargarLibreriaPDF, urlABase64 } from "./app-utils.js";

// ======================================================================================
// 2. PANEL DE TÉCNICO (SOCIO OPERADOR + V5.18.6)
// ======================================================================================
export async function iniciarPanelTecnico(user) {
    console.log(" 🔧 Iniciando Panel de Técnico (Modo Uber Cash / Storage 4K / UI Disciplinaria)...");
    
    activarMotorFCM(user.uid);

    const elementos = {
        statusLabel: document.getElementById("statusLabel"),
        toggleONOFF: document.getElementById("toggleONOFF"),
        radarSection: document.getElementById("radarSection"),
        seccionBolsa: document.getElementById("seccionBolsa"),
        listaBolsa: document.getElementById("listaBolsa"),
        listaServicios: document.getElementById("listaServicios"),
        panelAcciones: document.getElementById("panelAcciones"),
        btnEnCamino: document.getElementById("btnEnCamino"), 
        btnLlegue: document.getElementById("btnLlegue"), 
        walletLabel: document.getElementById("walletSaldo"),
        btnRetiro: document.getElementById("btnRetiro"),
        contenedorHistorialRetiros: document.getElementById("contenedorHistorialRetiros"),
        listaMisRetiros: document.getElementById("listaMisRetiros"),
        listaMisTickets: document.getElementById("listaMisTickets"),
        badgeNivel: document.getElementById("badgeNivel"),
        contenedorEstrellas: document.getElementById("contenedorEstrellas"),
        txtServicios: document.getElementById("txtServicios"),
        fotoPerfil: document.getElementById("fotoPerfil"),
        fotoIcono: document.getElementById("fotoIcono")
    };

    const tecnicoRef = doc(db, "users", user.uid);
    onSnapshot(tecnicoRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const estado = data.estado || "pendiente";
        const strikes = data.strikes || 0;

        // --- 🌟 RENDERIZADO DE ESTRELLAS, NIVEL Y FOTO ---
        const reputacion = data.reputacion || 5.0;
        const estrellas = "⭐".repeat(Math.round(reputacion));
        const nivel = data.nivel || "BRONCE";
        
        let colorNivel = "text-orange-500 bg-orange-600/20 border-orange-500/30";
        if(nivel === "PLATA") colorNivel = "text-gray-300 bg-gray-600/20 border-gray-500/30";
        if(nivel === "ORO") colorNivel = "text-yellow-400 bg-yellow-600/20 border-yellow-500/30";

        if(elementos.badgeNivel) {
            elementos.badgeNivel.className = `${colorNivel} text-[10px] font-black px-2 py-0.5 rounded border`;
            elementos.badgeNivel.innerText = `NIVEL ${nivel}`;
        }
        if(elementos.contenedorEstrellas) {
            elementos.contenedorEstrellas.innerHTML = `${estrellas} <span class="text-[10px] text-gray-500 font-bold ml-1">(${reputacion.toFixed(1)})</span>`;
        }
        if(elementos.txtServicios) {
            elementos.txtServicios.classList.remove("hidden");
            elementos.txtServicios.innerText = `${data.servicios_completados || 0} SERVICIOS FINALIZADOS`;
        }
        if(elementos.fotoPerfil && elementos.fotoIcono) {
            if(data.foto_perfil || data.fotoPerfil) {
                elementos.fotoPerfil.src = data.foto_perfil || data.fotoPerfil;
                elementos.fotoPerfil.classList.remove("hidden");
                elementos.fotoIcono.classList.add("hidden");
            } else {
                elementos.fotoPerfil.classList.add("hidden");
                elementos.fotoIcono.classList.remove("hidden");
            }
        }

        // 🔥 LÓGICA DE SUSPENSIÓN (STRIKES 1, 2 Y 3)
        if (["suspendido", "suspendido_grave", "baneado_permanente"].includes(estado)) {
            let msgSuspendido = "Cuenta Suspendida Temporalmente";
            let descSuspendido = "Se ha detectado una anomalía en tu servicio. Revisa tu saldo retenido.";
            let iconSuspendido = "fa-exclamation-triangle";
            
            if (estado === "suspendido") {
                descSuspendido = "Penalización Nivel 1 (24 Horas). Tus fondos han sido retenidos preventivamente.";
            } else if (estado === "suspendido_grave") {
                msgSuspendido = "Suspensión Grave (7 Días)";
                descSuspendido = "Penalización Nivel 2. Tienes múltiples reportes críticos. Tu saldo está congelado.";
            } else if (estado === "baneado_permanente") {
                msgSuspendido = "CUENTA BLOQUEADA DEFINITIVAMENTE";
                descSuspendido = "Por violaciones graves a los términos de servicio de GestiaPremium, esta cuenta ha sido cerrada.";
                iconSuspendido = "fa-skull-crossbones";
            }

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "SUSPENDIDO";
                elementos.statusLabel.className = "bg-red-900/50 text-red-500 status-badge font-black border border-red-500/50 animate-pulse";
            }
            if(elementos.toggleONOFF) {
                elementos.toggleONOFF.disabled = true;
                elementos.toggleONOFF.checked = false;
            }
            detenerTracking();
            if(elementos.radarSection) elementos.radarSection.classList.add("hidden");
            if(elementos.seccionBolsa) {
                elementos.seccionBolsa.classList.remove("hidden");
                elementos.seccionBolsa.innerHTML = `
                <div class="p-6 bg-red-900/20 border border-red-500/50 rounded-2xl text-center shadow-xl shadow-red-900/20">
                    <i class="fas ${iconSuspendido} text-red-500 text-4xl mb-4 animate-bounce"></i>
                    <p class="text-red-500 text-lg font-black uppercase tracking-widest">${msgSuspendido}</p>
                    <p class="text-gray-400 text-xs mt-2 leading-relaxed">${descSuspendido}</p>
                    <div class="mt-5 inline-block bg-black px-4 py-2 rounded-lg border border-red-900">
                        <p class="text-red-500 font-bold text-xs uppercase tracking-widest">STRIKES ACUMULADOS: ${strikes} / 3</p>
                    </div>
                </div>
                `;
            }
            return; 
        }

        // 🟡 LÓGICA DE REVISIÓN (NUEVOS TÉCNICOS)
        if (estado === "pendiente") {
            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "EN REVISIÓN";
                elementos.statusLabel.className = "bg-yellow-500/20 text-yellow-500 status-badge font-bold";
            }
            if(elementos.toggleONOFF) {
                elementos.toggleONOFF.disabled = true;
                elementos.toggleONOFF.checked = false;
            }
            if(elementos.radarSection) elementos.radarSection.classList.add("hidden");
            if(elementos.seccionBolsa) {
                elementos.seccionBolsa.innerHTML = `
                <div class="p-6 bg-yellow-900/10 border border-yellow-500/30 rounded-2xl text-center">
                    <i class="fas fa-lock text-yellow-500 text-2xl mb-2"></i>
                    <p class="text-yellow-500 text-sm font-bold">Cuenta en Revisión</p>
                    <p class="text-gray-500 text-xs mt-1">El administrador está validando tus documentos.</p>
                </div>
                `;
            }
            return;
        }

        // 🟢 LÓGICA NORMAL (ACTIVOS)
        if (elementos.toggleONOFF) {
            elementos.toggleONOFF.disabled = false;
            elementos.toggleONOFF.checked = data.disponible === true;
        }

        if (data.disponible) {
            iniciarTracking(user.uid);
            elementos.seccionBolsa?.classList.remove("hidden");
            escucharBolsa(user, elementos.listaBolsa); 

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "EN LÍNEA";
                elementos.statusLabel.className = "bg-emerald-500/20 text-emerald-500 status-badge font-bold animate-pulse";
            }
            elementos.radarSection?.classList.remove("opacity-50", "grayscale");
        } else {
            detenerTracking();
            elementos.seccionBolsa?.classList.add("hidden");

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "OFFLINE";
                elementos.statusLabel.className = "bg-red-500/20 text-red-500 status-badge font-bold";
            }
            elements.radarSection?.classList.add("opacity-50", "grayscale");
        }
    });

    const qWallet = query(collection(db, "transacciones"), where("tecnico_id", "==", user.uid));
    const qRetirosPendientes = query(collection(db, "retiros"), where("tecnico_id", "==", user.uid), where("estado", "==", "pendiente"));
    
    let saldoBrutoDisponible = 0;
    let saldoRetenido = 0;
    let retirosEnProceso = 0;

    onSnapshot(qWallet, (snap) => {
        saldoBrutoDisponible = 0;
        saldoRetenido = 0;
        const ahora = new Date();

        snap.forEach(docSnap => {
            const tx = docSnap.data();
            const monto = (tx.pago_tecnico || 0);
            
            // Abonos de Stripe ahora suman positivamente a la cuenta del técnico
            if (tx.tipo === "retiro_fondos" || tx.tipo === "penalizacion" || tx.tipo === "abono_deuda" || tx.tipo === "abono_stripe") { 
                saldoBrutoDisponible += monto; 
            } else {
                if (tx.fecha && tx.fecha.toDate) {
                    const fechaTx = tx.fecha.toDate();
                    const diffHoras = Math.abs(ahora - fechaTx) / 36e5;

                    if (diffHoras >= 24) {
                        saldoBrutoDisponible += monto;
                    } else {
                        saldoRetenido += monto;
                    }
                } else {
                    saldoRetenido += monto;
                }
            }
        });
        
        actualizarUIWallet();
    });

    onSnapshot(qRetirosPendientes, (snap) => {
        retirosEnProceso = 0;
        snap.forEach(docSnap => {
            retirosEnProceso += docSnap.data().monto;
        });
        actualizarUIWallet();
    });

    function actualizarUIWallet() {
        const saldoRealDisponible = saldoBrutoDisponible - retirosEnProceso;
        
        // 🔥 INYECCIÓN: Guardamos el saldo real a nivel global para que el Radar (tomarServicio) pueda leerlo
        window.saldoActualTecnico = saldoRealDisponible;

        let saldoFormat = saldoRealDisponible < 0 ? "-$" + Math.abs(saldoRealDisponible).toFixed(2) : "$" + saldoRealDisponible.toFixed(2);

        if(elementos.walletLabel) {
            elementos.walletLabel.innerHTML = `
            ${saldoFormat}
            <span class="text-[9px] text-gray-400 block font-normal">EN PROCESO: $${saldoRetenido.toFixed(2)}</span>
            `;
            
            if(saldoRealDisponible <= -1000) {
                elementos.walletLabel.classList.add("animate-pulse", "text-red-500"); 
            } else {
                elementos.walletLabel.classList.remove("animate-pulse", "text-red-500");
            }
        }

        if(elementos.btnRetiro) {
            if(retirosEnProceso > 0) {
                elementos.btnRetiro.disabled = true;
                elementos.btnRetiro.onclick = null;
            } 
            else if(saldoRealDisponible > 0) {
                elementos.btnRetiro.disabled = false;
                elementos.btnRetiro.onclick = async () => {
                    if(!confirm(`¿Deseas solicitar el retiro de $${saldoRealDisponible.toFixed(2)} a tu cuenta vía SPEI?`)) return;
                    elementos.btnRetiro.disabled = true;
                    try {
                        await addDoc(collection(db, "retiros"), {
                            tecnico_id: user.uid,
                            tecnico_nombre: user.nombre || "Técnico",
                            monto: saldoRealDisponible,
                            estado: "pendiente",
                            fecha_solicitud: serverTimestamp()
                        });
                        alert("✅ Solicitud de retiro enviada con éxito.");
                    } catch (error) {
                        console.error("Error al solicitar retiro:", error);
                        alert("❌ Hubo un error al procesar tu solicitud. Intenta de nuevo.");
                        elementos.btnRetiro.disabled = false;
                    }
                };
            } else {
                elementos.btnRetiro.disabled = true;
                elementos.btnRetiro.onclick = null;
            }
        }
    }

    if (elementos.listaMisRetiros && elementos.contenedorHistorialRetiros) {
        const qMisRetiros = query(
            collection(db, "retiros"),
            where("tecnico_id", "==", user.uid),
            where("estado", "==", "aprobado"),
            orderBy("fecha_aprobacion", "desc")
        );

        onSnapshot(qMisRetiros, (snap) => {
            elementos.listaMisRetiros.innerHTML = "";
            if(snap.empty) {
                elementos.contenedorHistorialRetiros.classList.add("hidden");
                return;
            }

            elementos.contenedorHistorialRetiros.classList.remove("hidden");

            snap.forEach(docSnap => {
                const ret = docSnap.data();
                const id = docSnap.id;
                
                let fechaFormat = "";
                if(ret.fecha_aprobacion) {
                    const dateObj = new Date(ret.fecha_aprobacion.seconds * 1000);
                    fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }

                const item = document.createElement("div");
                item.className = "flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-lg";
                item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-emerald-900/30 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                        <i class="fas fa-check text-xs"></i>
                    </div>
                    <div>
                        <p class="text-white font-bold text-sm">$${ret.monto.toFixed(2)}</p>
                        <p class="text-[9px] text-gray-500">${fechaFormat} • LIQUIDADO</p>
                    </div>
                </div>
                <button onclick="window.generarPDFRetiro('${id}')" class="text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 rounded-lg text-[10px] font-bold transition-colors flex items-center gap-1 border border-emerald-500/30 shadow">
                    <i class="fas fa-download"></i> PDF
                </button>
                `;
                elementos.listaMisRetiros.appendChild(item);
            });
        }, (error) => {
            console.warn("Falta índice compuesto para historial de retiros del técnico.", error);
            elementos.listaMisRetiros.innerHTML = '<p class="text-red-500 text-[10px] text-center p-2 border border-red-500/30 rounded-xl bg-red-900/10">Construyendo índice en Firebase... (Recarga en 3 min)</p>';
            elementos.contenedorHistorialRetiros.classList.remove("hidden");
        });
    }

    if (elementos.listaMisTickets) {
        const qMisTickets = query(
            collection(db, "services"),
            where("tecnico_id", "==", user.uid),
            where("estado", "==", "finalizado"),
            orderBy("finalizado_at", "desc")
        );

        onSnapshot(qMisTickets, (snap) => {
            elementos.listaMisTickets.innerHTML = "";
            if(snap.empty) {
                elementos.listaMisTickets.innerHTML = '<p class="text-gray-600 text-[10px] text-center italic py-4">Aún no tienes servicios finalizados.</p>';
                return;
            }

            snap.forEach(docSnap => {
                const s = docSnap.data();
                const id = docSnap.id;
                
                let fechaFormat = "";
                const ahora = new Date();
                let esRetenido = true;

                if(s.finalizado_at) {
                    const dateObj = new Date(s.finalizado_at.seconds * 1000);
                    fechaFormat = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    
                    const diffHoras = Math.abs(ahora - dateObj) / 36e5;
                    if (diffHoras >= 24) esRetenido = false;
                }

                const badgeStatus = '<span class="bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 text-[8px] px-2 py-0.5 rounded font-black tracking-widest uppercase"><i class="fas fa-check-circle"></i> COBRADO</span>';

                const item = document.createElement("div");
                item.className = "bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-lg";
                item.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="text-white font-bold text-xs uppercase">${escaparHTML(s.categoria)} | ${escaparHTML(s.sub_servicio || 'GRAL')}</span>
                    ${badgeStatus}
                </div>
                <div class="flex justify-between items-end">
                    <div>
                        <p class="text-[9px] text-gray-500 mb-1"><i class="fas fa-calendar-alt"></i> ${fechaFormat}</p>
                        <p class="text-[9px] text-gray-500"><i class="fas fa-hashtag"></i> Folio: ${s.folio_fiscal || id.substring(0,6).toUpperCase()}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-[10px] text-gray-500 mb-0.5 uppercase font-bold">Cobro ${s.metodo_pago === 'stripe' ? 'Stripe' : 'en Efectivo'}:</p>
                        <p class="${s.metodo_pago === 'stripe' ? 'text-blue-400' : 'text-emerald-400'} font-black text-sm">$${s.costo_final ? s.costo_final.toFixed(2) : '0.00'}</p>
                    </div>
                </div>
                `;
                elementos.listaMisTickets.appendChild(item);
            });
        }, (error) => {
            console.warn("Falta índice compuesto para historial de tickets del técnico.", error);
            elementos.listaMisTickets.innerHTML = '<p class="text-red-500 text-[10px] text-center p-2 border border-red-500/30 rounded-xl bg-red-900/10">Construyendo índice de tickets en Firebase... (Recarga en 3 min)</p>';
        });
    }

    if (elementos.toggleONOFF) {
        elementos.toggleONOFF.addEventListener("change", async (e) => {
            await updateDoc(tecnicoRef, {
                disponible: e.target.checked,
                last_seen: serverTimestamp()
            });
        });
    }

    // 🔥 ESCUDO ANTI-SPAM + RADAR STRIPE (V5.18.6)
    function escucharBolsa(tecnico, contenedor) {
        if(!contenedor) return;
        // INYECCIÓN DE RADAR: Ahora escucha "pendiente" (Efectivo) y "pagado" (Stripe)
        const q = query(collection(db, "services"), where("estado", "in", ["pendiente", "pagado"]), orderBy("created_at", "desc"), limit(50));

        let cargaInicial = true;

        onSnapshot(q, (snap) => {
            contenedor.innerHTML = "";
            let counter = 0;

            if(snap.empty) {
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">Escaneando zona... esperando solicitudes.</p>`;
                cargaInicial = false; 
                return;
            }

            let hayNuevos = false;
            snap.docChanges().forEach(change => {
                if (change.type === 'added') hayNuevos = true;
            });

            if (!cargaInicial && hayNuevos) {
                console.log(" 🔔 ¡Alerta Real! Nueva solicitud en la zona.");
                sonarAlerta();
                lanzarNotificacionPush("¡NUEVA SOLICITUD GESTIAPREMIUM!", "Servicio detectado en tu área. Ábrelo ahora.");
            }

            snap.forEach((docSnap) => {
                const s = docSnap.data();
                const id = docSnap.id;

                // 🔥 ESCUDO ANTI-BUCLES: Si el ticket ya tiene dueño, NUNCA lo muestres en el radar
                if (s.tecnico_id) return; 

                if (s.rejected_by && s.rejected_by.includes(tecnico.uid)) {
                    return; 
                }

                const misSkills = tecnico.skills || [];
                if (s.categoria && misSkills.length > 0 && !misSkills.includes(s.categoria)) {
                    return; 
                }

                counter++; 

                // Identificador UI de método de pago
                let badgeMetodo = s.metodo_pago === 'stripe'
                    ? '<span class="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase shadow-[0_0_8px_rgba(37,99,235,0.8)]"><i class="fab fa-stripe-s"></i> PAGADO STRIPE</span>'
                    : '<span class="bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase shadow-[0_0_8px_rgba(16,185,129,0.8)]"><i class="fas fa-money-bill"></i> PAGO EFECTIVO</span>';

                let btnAceptar = s.metodo_pago === 'stripe'
                    ? `<button class="flex-[4] bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-lg text-xs uppercase transition-all transform active:scale-95" onclick="window.tomarServicio('${id}', '${tecnico.uid}', '${tecnico.nombre}', 'stripe')">ACEPTAR TICKET</button>`
                    : `<button class="flex-[4] bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-lg text-xs uppercase transition-all transform active:scale-95" onclick="window.tomarServicio('${id}', '${tecnico.uid}', '${tecnico.nombre}', 'efectivo')">ACEPTAR TICKET</button>`;

                const card = document.createElement("div");
                card.className = `bg-zinc-900 border ${s.metodo_pago === 'stripe' ? 'border-blue-500 shadow-blue-900/20' : 'border-emerald-500 shadow-emerald-900/20'} p-4 rounded-xl mb-3 animate-pulse shadow-lg`;

                card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    ${badgeMetodo}
                    <span class="text-white font-bold text-xs">${s.categoria ? escaparHTML(s.categoria.toUpperCase()) : 'GENERAL'}</span>
                </div>
                <h4 class="text-white font-bold text-base mb-1">${escaparHTML(s.zona || 'Cancún')}</h4>
                <p class="text-gray-300 text-sm mb-3 font-medium italic">"${escaparHTML(s.descripcion)}"</p>
                <div class="flex items-center gap-2 mb-3 text-xs text-gray-500">
                    <i class="fas fa-map-marker-alt"></i> ${escaparHTML(s.direccion)}
                </div>
                
                <div class="flex gap-2">
                    <button class="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-400 font-bold py-3 rounded-lg text-xs transition-colors" onclick="window.rechazarServicio('${id}', '${tecnico.uid}')">
                        <i class="fas fa-times"></i>
                    </button>
                    ${btnAceptar}
                </div>
                `;
                contenedor.appendChild(card);
            });

            if (counter === 0) {
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">No hay solicitudes disponibles para tu perfil.</p>`;
            }

            cargaInicial = false; 
        });
    }

    window.rechazarServicio = async (id, uid) => {
        if(!confirm("¿Estás seguro de ocultar esta solicitud?\n\nNo podrás verla nuevamente, pero seguirá disponible para otros técnicos.")) return;
        
        try {
            await updateDoc(doc(db, "services", id), {
                rejected_by: arrayUnion(uid)
            });
        } catch (error) {
            console.error(error);
            alert("Error al intentar rechazar el servicio. Intenta de nuevo.");
        }
    };

    window.tomarServicio = async (id, uid, nombre, metodo_pago) => {
        // 🔥 INYECCIÓN: CANDADO ANTI-DEUDA MILITAR (-$1,000 MXN)
        if (window.saldoActualTecnico <= -1000) {
            alert("⛔ BLOQUEO FINANCIERO OPERATIVO\n\nTu saldo negativo ha superado el límite de -$1,000 MXN.\n\nPor políticas de GestiaPremium, debes liquidar tus comisiones pendientes para volver a aceptar servicios.");
            return;
        }

        const qCheck = query(
            collection(db, "services"), 
            where("tecnico_id", "==", uid),
            where("estado", "in", ["asignado", "en_camino", "en_sitio", "cotizando", "procesando_saldo", "trabajando"])
        );
        
        const snapCheck = await getDocs(qCheck);
        if (!snapCheck.empty) {
            alert("⛔ BLOQUEO DE SEGURIDAD\n\nYa tienes un servicio activo. Debes finalizarlo antes de tomar otro.");
            return;
        }

        let mensajeConfirmacion = "¿Deseas aceptar esta misión de servicio?\n\nRecuerda: Es OBLIGATORIO elaborar el diagnóstico y la cotización al llegar al sitio.";

        if(!confirm(mensajeConfirmacion)) return;
        
        try {
            const serviceRef = doc(db, "services", id);
            
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(serviceRef);
                
                if (!sfDoc.exists()) throw "ERROR_NO_EXISTE";
                if (!["pendiente", "pagado"].includes(sfDoc.data().estado)) throw "ERROR_COLISION"; 

                transaction.update(serviceRef, {
                    estado: "asignado",
                    tecnico_id: uid,
                    tecnico_nombre: nombre,
                    tecnico_telefono: user.telefono || "",
                    asignado_at: serverTimestamp() 
                });
            });
            
            console.log("🚀 Transacción Atómica Exitosa: Ticket asegurado.");
        } catch (error) {
            console.error(error);
            if (error === "ERROR_COLISION") {
                alert("💥 ¡COLISIÓN EVITADA!\n\nFuiste demasiado lento. Otro técnico aceptó este servicio milisegundos antes que tú.");
            } else {
                alert("Error al procesar la solicitud en el servidor. Intenta de nuevo.");
            }
        }
    };

    // 🔥 MISIONES ACTIVAS & WATCHDOG DE CLIENTE (V5.19.0)
    const qMisiones = query(
        collection(db, "services"),
        where("tecnico_id", "==", user.uid),
        where("estado", "in", ["asignado", "en_camino", "en_sitio", "cotizando", "procesando_saldo", "trabajando", "cancelado"]) 
    );

    onSnapshot(qMisiones, (snap) => {
        const ls = elementos.listaServicios;
        const pa = elementos.panelAcciones;

        if (!ls) return;
        ls.innerHTML = "";

        if (snap.empty) {
            if(pa) pa.classList.add("translate-y-full");
            return;
        }

        if(pa) pa.classList.remove("translate-y-full");

        // 🔥 INYECCIÓN: WATCHDOG DE AUDIO PARA EL TÉCNICO
        snap.docChanges().forEach(change => {
            if (change.type === 'modified') {
                const sData = change.doc.data();
                if (sData.oculto_para_tecnico) return; 

                if (sData.estado === 'trabajando') {
                    sonarAlerta();
                    lanzarNotificacionPush("✅ ¡Cotización Aprobada!", "El cliente aceptó el presupuesto. Puedes iniciar la reparación.");
                } else if (sData.estado === 'cancelado') {
                    sonarAlerta();
                    lanzarNotificacionPush("🚫 Servicio Declinado", "El cliente rechazó el presupuesto. Se ha aplicado el cargo de visita.");
                }
            }
        });
        
        snap.forEach((docSnap) => {
            const s = docSnap.data();
            const id = docSnap.id;

            if (s.oculto_para_tecnico) return;

            const destinoWaze = s.coords
                ? `${s.coords.lat},${s.coords.lng}`
                : encodeURIComponent(s.direccion);

            let botonAccionHTML = "";

            if (s.estado === "asignado") {
                botonAccionHTML = `
                <button onclick="window.actualizarEstadoGlobal('${id}', 'en_camino')" class="w-full mt-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95">
                    <i class="fas fa-motorcycle"></i> VOY EN CAMINO
                </button>`;
            } else if (s.estado === "en_camino") {
                botonAccionHTML = `
                <button id="btn_llegada_${id}" onclick="window.validarLlegada('${id}', ${s.coords ? s.coords.lat : 'null'}, ${s.coords ? s.coords.lng : 'null'})" class="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95">
                    <i class="fas fa-map-marker-alt"></i> YA LLEGUÉ AL SITIO
                </button>`;
            } else if (s.estado === "en_sitio") {
                botonAccionHTML = `
                <button onclick="window.abrirCotizadorGlobal('${id}')" class="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95">
                    <i class="fas fa-clipboard-list"></i> ELABORAR DIAGNÓSTICO Y COTIZAR
                </button>`;
            } else if (s.estado === "cotizando") {
                botonAccionHTML = `
                <button disabled class="w-full mt-4 bg-zinc-700 text-gray-400 font-bold py-4 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed">
                    <i class="fas fa-hourglass-half animate-spin"></i> ESPERANDO APROBACIÓN DEL CLIENTE...
                </button>`;
            } else if (s.estado === "procesando_saldo") {
                botonAccionHTML = `
                <button disabled class="w-full mt-4 bg-blue-900/50 text-blue-400 font-bold py-4 rounded-xl border border-blue-500/30 flex items-center justify-center gap-2 cursor-not-allowed shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                    <i class="fas fa-circle-notch fa-spin"></i> CLIENTE PAGANDO SALDO EN STRIPE...
                </button>`;
            } else if (s.estado === "trabajando") {
                botonAccionHTML = `
                <button onclick="window.abrirEvidenciaGlobal('${id}')" class="w-full mt-4 bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95">
                    <i class="fas fa-camera"></i> FINALIZAR Y CERRAR
                </button>`;
            } else if (s.estado === "cancelado") {
                botonAccionHTML = `
                <div class="bg-red-900/30 border border-red-500 p-4 rounded-xl mt-4 text-center">
                    <p class="text-red-400 font-bold text-sm mb-2"><i class="fas fa-ban"></i> EL CLIENTE RECHAZÓ EL COSTO</p>
                    <p class="text-xs text-gray-300">El servicio fue cancelado. Cobra tu visita ($550 MXN) y cierra este ticket.</p>
                </div>
                <button onclick="window.ocultarTicketCancelado('${id}')" class="w-full mt-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-transform active:scale-95">
                    <i class="fas fa-eye-slash"></i> OCULTAR Y CONTINUAR
                </button>`;
            }

            const card = document.createElement("div");
            card.className = `bg-zinc-900 border ${s.estado === 'cancelado' ? 'border-red-500' : 'border-blue-500/50'} p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl`;
            card.innerHTML = `
            <div class="absolute top-0 right-0 ${s.estado === 'cancelado' ? 'bg-red-600' : 'bg-blue-600'} text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">
                ${s.estado.replace('_', ' ')}
            </div>
            <h3 class="text-xl font-black text-white mb-1 uppercase">${escaparHTML(s.categoria)}</h3>
            <p class="text-gray-400 text-sm mb-4">
                <i class="fas fa-map-marker-alt text-blue-500"></i> ${escaparHTML(s.direccion)}
            </p>
            <div class="bg-black/50 p-4 rounded-xl mb-4">
                <p class="text-xs text-gray-500 uppercase font-bold mb-1">Problema Reportado:</p>
                <p class="text-sm text-white italic">"${escaparHTML(s.descripcion)}"</p>
            </div>
            <div class="flex gap-2">
                <a href="https://waze.com/ul?q=${destinoWaze}" target="_blank" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-center text-sm transition-colors ${s.estado === 'cancelado' ? 'pointer-events-none opacity-50' : ''}">
                    <i class="fab fa-waze"></i> IR CON WAZE
                </a>
                <a href="tel:${s.cliente_telefono}" class="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl text-center transition-colors">
                    <i class="fas fa-phone"></i>
                </a>
            </div>

            ${botonAccionHTML} 
            
            ${s.estado !== 'cancelado' ? `
            <div class="mt-4 border-t border-white/5 pt-4 text-center">
                <button onclick="window.cancelarMisionActiva('${id}')" class="text-red-500 text-xs font-bold underline hover:text-red-400">
                    CANCELAR SERVICIO (RIESGO PENALIZACIÓN)
                </button>
            </div>` : ''}
            `;
            ls.appendChild(card);
        });
    });

    window.ocultarTicketCancelado = async (id) => {
        try {
            await updateDoc(doc(db, "services", id), { oculto_para_tecnico: true });
        } catch (e) {
            console.error("Error al ocultar:", e);
        }
    };

    window.actualizarEstadoGlobal = async (id, estado, extras = {}) => {
        try {
            await updateDoc(doc(db, "services", id), { estado: estado, ...extras });

            let textoMapa = "En Ruta";
            if(estado === "en_sitio") textoMapa = "En Sitio";
            if(estado === "trabajando") textoMapa = "Trabajando";
            if(estado === "finalizado") textoMapa = "Disponible";
            const rastreoRef = doc(db, "rastreo", "tecnicoActivo");
            await setDoc(rastreoRef, { estado: textoMapa }, { merge: true });
        } catch (error) {
            console.error("Error actualizando estado:", error);
            alert("Error de conexión. Intenta de nuevo.");
        }
    };

    // 🔥 INYECCIÓN DE PROTOCOLO ANTI-BLOQUEO GPS Y TIMEOUT
    window.validarLlegada = (id, targetLat, targetLng) => {
        const btn = document.getElementById(`btn_llegada_${id}`);
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-satellite text-white animate-spin"></i> VERIFICANDO GPS...';
        btn.disabled = true;

        if (navigator.geolocation && targetLat && targetLng) {
            navigator.geolocation.getCurrentPosition((pos) => {
                const dist = calcularDistancia(pos.coords.latitude, pos.coords.longitude, targetLat, targetLng);
                if (dist > 1000) { 
                    alert(`🛑 ALERTA ANTIFRAUDE: El sistema detecta que estás a ${Math.round(dist)} metros del cliente.\n\nDebes estar físicamente en el lugar para cambiar el estado a "En Sitio".`);
                    btn.innerHTML = textoOriginal;
                    btn.disabled = false;
                } else {
                    window.actualizarEstadoGlobal(id, "en_sitio");
                }
            }, (err) => {
                console.warn("Error GPS técnico (Bypass activado por timeout/error):", err);
                // Si falla el GPS (por estar bajo techo o timeout), NO bloqueamos al técnico.
                window.actualizarEstadoGlobal(id, "en_sitio"); 
            }, { 
                enableHighAccuracy: true,
                timeout: 10000, // ⏳ MÁXIMO 10 SEGUNDOS. Si satélite no responde, se activa Bypass.
                maximumAge: 15000 
            });
        } else {
            window.actualizarEstadoGlobal(id, "en_sitio"); 
        }
    };

    window.abrirCotizadorGlobal = (id) => {
        getDoc(doc(db, "services", id)).then(snap => {
            if(snap.exists()) mostrarModalCotizacionDetallada(id, snap.data());
        });
    };

    window.abrirEvidenciaGlobal = (id) => {
        mostrarModalEvidencia(id);
    };

    function mostrarModalCotizacionDetallada(id, servicioData) {
        if(document.getElementById("modalCot")) return;
        
        let items = []; 

        const html = `
        <div id="modalCot" class="fixed inset-0 bg-black/95 z-[60] flex flex-col p-4 animate-fade-in overflow-y-auto">
            <div class="bg-zinc-900 w-full max-w-lg mx-auto rounded-3xl p-6 border border-zinc-700 shadow-2xl flex-1 flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-white font-black text-xl flex items-center gap-2"><img src="assets/gestiapremium-icon.svg" class="w-6 h-6 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"> COTIZADOR PRO</h3>
                    <button onclick="document.getElementById('modalCot').remove()" class="text-gray-500"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="bg-zinc-800 p-3 rounded-xl mb-4 border border-blue-900/50">
                    <label class="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-2 block"><i class="fas fa-stethoscope"></i> 1. Reporte de Diagnóstico Obligatorio:</label>
                    <textarea id="inDiagnostico" rows="3" placeholder="Describe detalladamente el problema que encontraste en el sitio..." class="w-full bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-blue-500 outline-none resize-none"></textarea>
                </div>

                <label class="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mb-2 block"><i class="fas fa-list"></i> 2. Conceptos y Costos:</label>
                <div class="flex-1 overflow-y-auto mb-4 border border-zinc-800 rounded-xl bg-black/50 p-2" id="listaPartidas">
                    <p class="text-gray-600 text-xs text-center italic py-10">Agrega conceptos para cotizar.</p>
                </div>

                <div class="bg-zinc-800 p-3 rounded-xl mb-4 space-y-2 border border-zinc-700">
                    <div class="flex gap-2">
                        <input id="inCant" type="number" placeholder="Cant." class="w-16 bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none">
                        <input id="inUnidad" type="text" placeholder="Unidad" class="w-20 bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none">
                        <input id="inDesc" type="text" placeholder="Descripción (Ej: Cable 12)" class="flex-1 bg-black text-white p-3 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none">
                    </div>
                    <div class="flex gap-2 items-center">
                        <div class="flex-1 relative">
                            <span class="absolute left-3 top-3 text-gray-500 text-xs">$</span>
                            <input id="inPrecio" type="number" placeholder="Precio Unitario" class="w-full bg-black text-white p-3 pl-6 rounded-lg text-xs border border-zinc-600 focus:border-emerald-500 outline-none font-mono">
                        </div>
                        <button id="btnAddItem" class="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-bold text-xs transition-colors"><i class="fas fa-plus"></i> AGREGAR</button>
                    </div>
                </div>

                <div class="flex justify-between items-center bg-black p-4 rounded-xl border border-emerald-900 mb-4">
                    <span class="text-gray-400 text-xs font-bold uppercase">Total Cotización</span>
                    <span id="txtTotalCot" class="text-emerald-500 font-black text-xl">$0.00</span>
                </div>

                <button id="btnEnviarCot" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl text-sm shadow-lg shadow-blue-900/20 transition-transform active:scale-95">
                    ENVIAR DIAGNÓSTICO Y COSTOS AL CLIENTE
                </button>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', html);

        const renderItems = () => {
            const container = document.getElementById("listaPartidas");
            const txtTotal = document.getElementById("txtTotalCot");
            container.innerHTML = "";
            let grandTotal = 0;

            if(items.length === 0) {
                container.innerHTML = `<p class="text-gray-600 text-xs text-center italic py-4">Sin conceptos.</p>`;
            } else {
                items.forEach((item, index) => {
                    const importe = item.cantidad * item.precio;
                    grandTotal += importe;
                    const row = document.createElement("div");
                    row.className = "flex justify-between items-start border-b border-zinc-800 py-2 text-xs last:border-0 animate-fade-in";
                    row.innerHTML = `
                    <div class="flex-1">
                        <p class="text-white font-bold"><span class="text-emerald-500">${item.cantidad} ${escaparHTML(item.unidad)}</span> ${escaparHTML(item.descripcion)}</p>
                        <p class="text-gray-500 text-[10px]">$${item.precio} c/u</p>
                    </div>
                    <div class="text-right">
                        <p class="text-white font-mono">$${importe.toFixed(2)}</p>
                        <button class="text-red-500 text-[10px] underline btn-delete hover:text-red-400" data-idx="${index}">Eliminar</button>
                    </div>
                    `;
                    container.appendChild(row);
                });
            }
            txtTotal.innerText = `$${grandTotal.toFixed(2)}`;
            
            document.querySelectorAll(".btn-delete").forEach(btn => {
                btn.onclick = (e) => {
                    const idx = parseInt(e.target.dataset.idx);
                    items.splice(idx, 1);
                    renderItems();
                };
            });
        };

        setTimeout(() => {
            const btnAdd = document.getElementById("btnAddItem");
            const btnSend = document.getElementById("btnEnviarCot");

            if(btnAdd) {
                btnAdd.onclick = () => {
                    const cant = parseFloat(document.getElementById("inCant").value);
                    const unidad = document.getElementById("inUnidad").value.trim();
                    const desc = document.getElementById("inDesc").value.trim();
                    const precio = parseFloat(document.getElementById("inPrecio").value);

                    if(!cant || !desc || !precio) return alert("Llena todos los campos del concepto.");

                    items.push({ cantidad: cant, unidad: unidad || 'pz', descripcion: desc, precio: precio });
                    
                    document.getElementById("inCant").value = "";
                    document.getElementById("inDesc").value = "";
                    document.getElementById("inPrecio").value = "";
                    renderItems();
                };
            }

            if(btnSend) {
                btnSend.onclick = async () => {
                    const diagTexto = document.getElementById("inDiagnostico").value.trim();
                    if (!diagTexto || diagTexto.length < 10) {
                        return alert("⚠️ OBLIGATORIO:\nDebes escribir un reporte de diagnóstico detallado (mínimo 10 caracteres) explicando qué falla tiene el cliente.");
                    }

                    if(items.length === 0) return alert("Agrega al menos un concepto a cobrar.");
                    
                    const totalFinal = items.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);

                    if(!confirm(`¿Enviar diagnóstico y cotización por un total de $${totalFinal.toFixed(2)} al cliente para su revisión?`)) return;

                    try {
                        await updateDoc(doc(db, "services", id), {
                            estado: "cotizando",
                            diagnostico: diagTexto,
                            detalles_cotizacion: items, 
                            costo_final: totalFinal,
                            cotizado_at: serverTimestamp()
                        });
                        alert(`✅ Diagnóstico y Cotización enviados.\n\nEspera a que el cliente lo apruebe en su aplicación para comenzar a trabajar.`);
                    } catch (e) {
                        console.error(e);
                        alert("Error al guardar la cotización.");
                    }

                    const modal = document.getElementById("modalCot");
                    if(modal) modal.remove();
                };
            }
        }, 100); 
    }

    function mostrarModalEvidencia(id) {
        if(document.getElementById("modalEvidencia")) return;

        const html = `
        <div id="modalEvidencia" class="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl">
                <div class="flex justify-center mb-4"><img src="assets/gestiapremium-icon.svg" class="w-12 h-12 drop-shadow-[0_0_12px_rgba(59,130,246,0.5)]"></div>
                <h3 class="text-white font-black text-xl mb-2 text-center">REPORTE FINAL OBLIGATORIO</h3>
                <p class="text-gray-400 text-[10px] mb-6 text-center">Sube hasta 4 fotos (Mínimo 1 del Antes y 1 del Después) para liberar el cobro. Los archivos pesados se subirán directamente a Google Cloud.</p>

                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="bg-black p-3 rounded-xl border border-red-900/50 text-center">
                        <label class="block text-[10px] font-bold text-red-500 mb-2 uppercase tracking-widest">ANTES (Foto 1)</label>
                        <input type="file" id="fileA1" accept="image/*" class="text-[9px] w-full text-gray-400 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-2 file:rounded">
                    </div>
                    <div class="bg-black p-3 rounded-xl border border-red-900/50 text-center">
                        <label class="block text-[10px] font-bold text-red-500 mb-2 uppercase tracking-widest">ANTES (Foto 2)</label>
                        <input type="file" id="fileA2" accept="image/*" class="text-[9px] w-full text-gray-400 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-2 file:rounded">
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <div class="bg-black p-3 rounded-xl border border-emerald-900/50 text-center">
                        <label class="block text-[10px] font-bold text-emerald-500 mb-2 uppercase tracking-widest">DESPUÉS (Foto 1)</label>
                        <input type="file" id="fileD1" accept="image/*" class="text-[9px] w-full text-gray-400 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-2 file:rounded">
                    </div>
                    <div class="bg-black p-3 rounded-xl border border-emerald-900/50 text-center">
                        <label class="block text-[10px] font-bold text-emerald-500 mb-2 uppercase tracking-widest">DESPUÉS (Foto 2)</label>
                        <input type="file" id="fileD2" accept="image/*" class="text-[9px] w-full text-gray-400 file:bg-zinc-800 file:text-white file:border-0 file:py-1 file:px-2 file:rounded">
                    </div>
                </div>

                <div class="bg-black p-3 rounded-xl border border-blue-900/50 text-center mt-4">
                    <label class="block text-[10px] font-bold text-blue-400 mb-2 uppercase tracking-widest">
                        <i class="fas fa-pen-nib"></i> Firma Digital del Cliente (Aceptación de Servicio)
                    </label>
                    <canvas id="canvasFirma" class="w-full h-32 bg-zinc-800 rounded-lg border border-zinc-700 cursor-crosshair touch-none"></canvas>
                    <button type="button" onclick="window.limpiarFirma()" class="text-[9px] text-gray-500 mt-2 uppercase underline hover:text-white transition-colors">
                        <i class="fas fa-eraser"></i> Limpiar Firma
                    </button>
                </div>

                <div class="flex gap-3 mt-8">
                    <button onclick="document.getElementById('modalEvidencia').remove()" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm">CANCELAR</button>
                    <button id="btnSubirEvidencia" class="flex-[2] bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-xl font-black text-sm transition-colors">SUBIR Y CERRAR ORDEN</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        
        document.getElementById("btnSubirEvidencia").onclick = async () => {
            const fA1 = document.getElementById("fileA1").files[0];
            const fA2 = document.getElementById("fileA2").files[0];
            const fD1 = document.getElementById("fileD1").files[0];
            const fD2 = document.getElementById("fileD2").files[0];

            if(!fA1 || !fD1) { alert(" ⚠ Es obligatorio subir al menos la FOTO 1 del ANTES y la FOTO 1 del DESPUÉS."); return; }

            if (!storage) {
                alert("❌ Error: Firebase Storage no está configurado. Contacta a soporte técnico.");
                return;
            }

            const btn = document.getElementById("btnSubirEvidencia");
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SUBIENDO AL SERVIDOR CLOUD...';
            btn.disabled = true;
            
            try {
                const subirImagenAStorage = async (file, nombreAsignado) => {
                    if(!file) return null;
                    const storageRef = ref(storage, `servicios/${id}/${nombreAsignado}_${Date.now()}.jpg`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    return url;
                };

                const [urlA1, urlA2, urlD1, urlD2] = await Promise.all([
                    subirImagenAStorage(fA1, 'antes_1'),
                    subirImagenAStorage(fA2, 'antes_2'),
                    subirImagenAStorage(fD1, 'despues_1'),
                    subirImagenAStorage(fD2, 'despues_2')
                ]);

                btn.innerHTML = '<i class="fas fa-cog fa-spin"></i> FINALIZANDO COBRO...';
                
                const timestampMetadatos = new Date().toISOString();
                const userAgentCorto = navigator.userAgent.substring(0, 50);
                
                const servicioSnap = await getDoc(doc(db, "services", id));
                const servicioData = servicioSnap.data();
                const costoTotal = servicioData.costo_final || 0;

                const comisionFixGoPura = costoTotal * 0.30; 
                const aporteGarantia = costoTotal * 0.02; 
                const retencionIVA = costoTotal * 0.08; 
                const retencionISR = costoTotal * 0.10; 
                
                let deudaTecnico = 0;
                if (servicioData.metodo_pago === "stripe") {
                    deudaTecnico = (costoTotal - (costoTotal * 0.32)); 
                } else {
                    deudaTecnico = -(costoTotal * 0.32);
                }

                const canvas = document.getElementById("canvasFirma");
                const firmaData = canvas ? canvas.toDataURL("image/png") : null;

                await runTransaction(db, async (transaction) => {
                    const servicioRef = doc(db, "services", id);
                    const tecnicoRef = doc(db, "users", user.uid);
                    
                    const sSnap = await transaction.get(servicioRef);
                    if (!sSnap.exists()) throw "ERROR_NO_EXISTE";
                    if (sSnap.data().estado !== "trabajando") throw "ERROR_ESTADO_INVALIDO";

                    transaction.update(servicioRef, {
                        estado: "finalizado",
                        finalizado_at: serverTimestamp(),
                        folio_fiscal: "FX-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
                        evidencia: { 
                            antes1: urlA1,
                            antes2: urlA2 || null,
                            despues1: urlD1,
                            despues2: urlD2 || null,
                            firma_cliente: firmaData, 
                            metadatos: {
                                fecha_captura: timestampMetadatos,
                                dispositivo_tecnico: userAgentCorto,
                                certificacion_legal: true,
                                almacenamiento: "Google Cloud Storage + Firebase Auth"
                            }
                        },
                        desglose: {
                            subtotal: (costoTotal / 1.16).toFixed(2),
                            iva: (costoTotal - (costoTotal / 1.16)).toFixed(2),
                            total: costoTotal
                        }
                    });

                    if (servicioData.metodo_pago !== "stripe") {
                        const transRef = doc(collection(db, "transacciones"));
                        transaction.set(transRef, {
                            servicio_id: id,
                            tecnico_id: user.uid, 
                            monto_total: costoTotal,
                            comision_fixgo: comisionFixGoPura, 
                            aporte_garantia: aporteGarantia, 
                            retencion_iva: retencionIVA, 
                            retencion_isr: retencionISR, 
                            pago_tecnico: deudaTecnico, 
                            fecha: serverTimestamp(),
                            tipo: "ingreso_servicio",
                            metodo_pago: "efectivo"
                        });
                    } else {
                        const transRef = doc(collection(db, "transacciones"));
                        transaction.set(transRef, {
                            servicio_id: id,
                            tecnico_id: user.uid,
                            monto_total: 0, 
                            pago_tecnico: Math.abs(deudaTecnico), 
                            fecha: serverTimestamp(),
                            tipo: "abono_stripe",
                            descripcion: "Liquidación por servicio pagado en Stripe"
                        });
                    }

                    transaction.update(tecnicoRef, {
                        reputacion: increment(0.1), 
                        servicios_completados: increment(1)
                    });
                });

                let textoMapa = "Disponible";
                const rastreoRef = doc(db, "rastreo", "tecnicoActivo");
                await setDoc(rastreoRef, { estado: textoMapa }, { merge: true });

                document.getElementById("modalEvidencia").remove();
                alert(" ✅ ¡CÍRCULO DE SEGURIDAD CERRADO!\n\n1. Firma resguardada.\n2. Evidencia en Cloud.\n3. Finanzas liquidadas.\n4. Reputación aumentada.");
                
            } catch (e) {
                console.error("Error crítico subiendo evidencia a Storage:", e);
                alert("Error de conexión al servidor Cloud. Revisa tu internet e intenta de nuevo.");
                btn.innerText = "REINTENTAR SUBIDA";
                btn.disabled = false;
            }
        };

        setTimeout(() => {
            const canvas = document.getElementById('canvasFirma');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let dibujando = false;

            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            ctx.strokeStyle = "#60a5fa"; 
            ctx.lineWidth = 3;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";

            const obtenerPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                return { x: clientX - rect.left, y: clientY - rect.top };
            };

            const iniciar = (e) => { dibujando = true; const p = obtenerPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
            const mover = (e) => { if (!dibujando) return; e.preventDefault(); const p = obtenerPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
            const parar = () => { dibujando = false; };

            canvas.addEventListener('mousedown', iniciar);
            canvas.addEventListener('mousemove', mover);
            canvas.addEventListener('mouseup', parar);
            canvas.addEventListener('touchstart', iniciar);
            canvas.addEventListener('touchmove', mover);
            canvas.addEventListener('touchend', parar);

            window.limpiarFirma = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); };
        }, 100);
    }

    window.generarPDFRetiro = async (retiroId) => {
        try {
            const docRef = doc(db, "retiros", retiroId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                throw new Error("No se encontró la información del retiro.");
            }
            
            const data = { ...docSnap.data(), id: retiroId };
            
            const { jsPDF } = await cargarLibreriaPDF();
            const docPdf = new jsPDF();
            
            docPdf.setFillColor(18, 18, 18);
            docPdf.rect(0, 0, 215, 40, 'F');

            docPdf.setTextColor(255, 255, 255);
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(24);
            docPdf.text("GESTIAPREMIUM", 20, 22);
            docPdf.setFont("helvetica", "normal");
            docPdf.setTextColor(16, 185, 129); 
            docPdf.text("MÉXICO", 85, 22);

            docPdf.setTextColor(200, 200, 200);
            docPdf.setFontSize(10);
            docPdf.text("Comprobante de Liquidación (SPEI)", 20, 32);
            
            docPdf.setFontSize(8);
            docPdf.setTextColor(150, 150, 150);
            docPdf.text(`RFC EMISOR: FXG260211-H8A`, 20, 45);
            
            let fechaFormat = new Date().toLocaleDateString();
            if(data.fecha_aprobacion) {
                fechaFormat = new Date(data.fecha_aprobacion.seconds * 1000).toLocaleDateString();
            }
            
            docPdf.text(`FOLIO RETIRO: SPEI-${data.id.substring(0,6).toUpperCase()}`, 130, 45);
            docPdf.text(`FECHA APROBACIÓN: ${fechaFormat}`, 130, 50);

            let y = 70;
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(14);
            docPdf.setFont("helvetica", "bold");
            docPdf.text("DETALLES DE LA TRANSFERENCIA", 20, y);

            y += 10;
            docPdf.setFont("helvetica", "normal");
            docPdf.setFontSize(11);
            docPdf.text(`Beneficiario (Socio Técnico): ${data.tecnico_nombre}`, 20, y);
            y += 8;
            docPdf.text(`Estado: LIQUIDADO / APROBADO`, 20, y);
            
            y += 20;
            
            docPdf.setFillColor(245, 245, 245);
            docPdf.rect(20, y, 170, 30, 'F');
            
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(12);
            docPdf.setTextColor(50, 50, 50);
            docPdf.text("MONTO TRANSFERIDO:", 30, y + 18);
            
            docPdf.setFontSize(20);
            docPdf.setTextColor(16, 185, 129); 
            docPdf.text(`$${data.monto.toFixed(2)} MXN`, 110, y + 20);

            y += 60;
            docPdf.setFontSize(9);
            docPdf.setTextColor(150, 150, 150);
            docPdf.setFont("helvetica", "normal");
            
            const notaLegal = "Este documento es un comprobante de liquidación digital emitido por la plataforma GestiaPremium. Los fondos han sido transferidos a la cuenta bancaria registrada por el socio especialista. El tiempo de reflejo en cuenta puede variar dependiendo de la institución bancaria receptora.";
            const splitNota = docPdf.splitTextToSize(notaLegal, 170);
            docPdf.text(splitNota, 20, y);
            
            docPdf.save(`GestiaPremium_Liquidacion_${data.id.substring(0,6)}.pdf`);

        } catch (error) {
            console.error("Error al generar PDF de retiro:", error);
            alert("Hubo un error al generar el comprobante. Intenta de nuevo.");
        }
    };

    window.cambiarFotoPerfil = async (uid) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    await updateDoc(doc(db, "users", uid), {
                        foto_perfil: event.target.result,
                        fotoPerfil: event.target.result 
                    });
                    alert("✅ Foto de perfil actualizada correctamente.");
                } catch(err) {
                    console.error("Error subiendo foto:", err);
                    alert("Error al actualizar la foto de perfil en el servidor.");
                }
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    };

    window.cambiarLogoFactura = async (uid) => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png, image/jpeg'; 
        
        fileInput.onchange = async (e) => {
            const file = e.target.files[0];
            if(!file) return;
            
            if (file.size > 2 * 1024 * 1024) {
                alert("⚠️ El logo es demasiado pesado. Elige una imagen menor a 2MB.");
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    await updateDoc(doc(db, "users", uid), {
                        logo_factura: event.target.result 
                    });
                    alert("✅ Logo comercial actualizado.\n\nTus próximas facturas y comprobantes al cliente saldrán con tu identidad corporativa.");
                } catch(err) {
                    console.error("Error subiendo logo de factura:", err);
                    alert("Error al guardar el logo en el servidor. Intenta de nuevo.");
                }
            };
            reader.readAsDataURL(file);
        };
        fileInput.click();
    };

} 

async function activarMotorFCM(uid) {
    console.log("🛠️ [FCM DEBUG] Iniciando Motor FCM para UID:", uid);
    try {
        const messaging = getMessaging(); 
        console.log("🛠️ [FCM DEBUG] Instancia Messaging obtenida.");

        console.log("🛠️ [FCM DEBUG] Solicitando permiso de notificaciones al navegador...");
        const permission = await Notification.requestPermission();
        console.log("🛠️ [FCM DEBUG] Resultado del permiso:", permission);
        
        if (permission === 'granted') {
            console.log("🔔 [FCM] Permiso concedido. Esperando Service Worker...");
            
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(async (registration) => {
                    console.log("🛠️ [FCM DEBUG] Service Worker listo. Obteniendo Token con VAPID...");
                    try {
                        const currentToken = await getToken(messaging, { 
                            vapidKey: 'BJ_qj7caLzTumvHvJxy3kdTK50gW1NYJBFKso7Imx_shSMBFqLwQbzRTyNFCEs9n3b3OlEIoJI4U4jXPx6CLsYQ',
                            serviceWorkerRegistration: registration 
                        });
                        
                        console.log("🛠️ [FCM DEBUG] Token recibido de Google:", currentToken ? "SÍ (Oculto por seguridad)" : "NO (null)");

                        if (currentToken) {
                            console.log("🔑 [FCM] Token generado. Intentando guardar en DB...");
                            await updateDoc(doc(db, "users", uid), { fcmToken: currentToken });
                            console.log("✅ [FCM] ¡Éxito! Token guardado en Firebase DB.");
                        } else {
                            console.warn("⚠️ [FCM] El navegador no generó token.");
                        }
                    } catch (tokenError) {
                        console.error("❌ [FCM CRÍTICO] Falló la obtención del Token. Error de Google:", tokenError);
                    }
                }).catch(swError => {
                    console.error("❌ [FCM CRÍTICO] Error con el Service Worker:", swError);
                });
            } else {
                console.warn("⚠️ [FCM] El navegador no soporta Service Workers.");
            }
        } else {
            console.warn("🚫 [FCM] Permiso denegado por el usuario.");
        }

        onMessage(messaging, (payload) => {
            console.log("🔔 [FCM] Push recibido en Primer Plano:", payload);
            sonarAlerta();
        });

    } catch (error) {
        console.error("❌ [FCM GENERAL] El motor Push falló al iniciar.", error);
    }
}
