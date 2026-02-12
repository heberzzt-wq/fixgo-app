/**
 * ======================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE)
 * Archivo: app-panel.js
 * Versión: 5.8.0 (VERTICALS EXPANSION - ROAD/FIX/MAINT/TECH)
 * Base: V5.7.4 (Alamo Stable)
 * Autor: Heber (CEO & Lead Architect)
 * Descripción: Control total de lógica de negocio, verticales
 * de servicio, gestión de estados y renderizado de UI.
 * ======================================================
 */

import {
    db,
    auth,
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
    getDoc // Importación necesaria para leer configuraciones y PDF Fetch
} from "./firebase.js";

// Importamos getDocs manualmente para validaciones de seguridad extras y consultas únicas
import { getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Importamos el motor GPS para el rastreo en tiempo real
import { iniciarTracking, detenerTracking } from "./gps-motor.js";

// ======================================================
//  🔔  SISTEMA DE SONIDO CENTRALIZADO (ROBUSTO V5.6)
// ======================================================
// Este sistema gestiona las alertas auditivas para técnicos y clientes.
// Se mantiene la lógica de desbloqueo para navegadores modernos (Chrome/Safari).
const audioNotificacion = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
let audioDesbloqueado = false;

// FUNCIÓN DE DESBLOQUEO (Mantenida de V5.6)
// Los navegadores bloquean el sonido si el usuario no ha interactuado primero.
function desbloquearAudio() {
    if (audioDesbloqueado) return;

    audioNotificacion.play().then(() => {
        audioNotificacion.pause();
        audioNotificacion.currentTime = 0;
        audioDesbloqueado = true;
        console.log(" 🔊  Sistema de Audio: DESBLOQUEADO Y LISTO.");

        // Removemos los listeners para no saturar memoria ni eventos
        document.removeEventListener('click', desbloquearAudio);
        document.removeEventListener('touchstart', desbloquearAudio);
    }).catch(error => {
        console.log(" ⚠️ Esperando interacción del usuario para activar audio...");
    });
}
// Agregamos listeners a todo el documento para atrapar el primer clic/toque
document.addEventListener('click', desbloquearAudio);
document.addEventListener('touchstart', desbloquearAudio);

// Función pública para disparar la alerta
function sonarAlerta() {
    if (!audioDesbloqueado) {
        console.warn(" 🔇  Audio pendiente de desbloqueo (Toca la pantalla).");
        return;
    }
    audioNotificacion.currentTime = 0;
    audioNotificacion.play().catch(e => console.log(" 🔊  Alerta visual: Audio bloqueado por el navegador.", e));
}

// ======================================================
//  📄  CARGADOR DINÁMICO DE PDF (SIN ROMPER INICIO)
// ======================================================
// Carga la librería jsPDF bajo demanda solo cuando se necesita generar un recibo.
async function cargarLibreriaPDF() {
    if (window.jspdf) return window.jspdf;
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = () => resolve(window.jspdf);
        script.onerror = () => reject("Error cargando la librería PDF");
        document.head.appendChild(script);
    });
}

console.log(" 🚀  FIXGO 5.8.0: Sistema Full Cargado (Verticales Expandidas + Wallet + PDF Fetch).");

// ======================================================
// 1. PANEL DE ADMINISTRADOR (Torre de Control)
// ======================================================
// Gestiona la vista del admin.html, aprobación de técnicos y monitoreo global.
export async function iniciarPanelAdmin(user) {
    const elementos = {
        lista: document.getElementById("listaTecnicos"),
        actividad: document.getElementById("listaTransacciones"),
        countServ: document.querySelector(".fa-bolt")?.closest(".uber-card")?.querySelector("h3"),
        countMoney: document.querySelector(".fa-wallet")?.closest(".uber-card")?.querySelector("h3"),
        countOnline: document.getElementById("totalTecnicos")
    };

    // 1.A. TÉCNICOS Y APROBACIÓN (LÓGICA DETALLADA V5.6)
    if (elementos.lista) {
        const qTecnicos = query(collection(db, "users"), where("rol", "==", "tecnico"));

        onSnapshot(qTecnicos, (snap) => {
            elementos.lista.innerHTML = "";

            let contOnline = 0;
            let contTotal = 0;
            if (snap.empty) {
                elementos.lista.innerHTML = '<p class="text-gray-500 p-4 italic">No hay técnicos registrados.</p>';
            }
            snap.forEach((docSnap) => {
                const data = docSnap.data();
                contTotal++;

                // Detección de "online" basado en el booleano 'disponible'
                if(data.disponible) {
                    contOnline++;
                }
                const esPendiente = (data.estado || "pendiente") === "pendiente";
                const ineCheck = data.documentos?.ine ? '<span class="text-emerald-400"> ✅  INE</span>' : '<span class="text-red-500"> ❌  INE</span>';
                const csfCheck = data.documentos?.csf ? '<span class="text-emerald-400"> ✅  CSF</span>' : '<span class="text-red-500"> ❌  CSF</span>';

                // Mostrar Skills (NUEVO V5.7)
                const skillsStr = data.skills ? data.skills.join(" • ").toUpperCase() : "GENERAL";

                // Indicador visual
                const estadoDot = data.disponible
                    ? '<span class="text-emerald-500 font-bold text-[10px] animate-pulse">● ONLINE</span>'
                    : '<span class="text-gray-500 text-[10px]">● OFFLINE</span>';

                const card = document.createElement("div");
                card.className = `p-4 mb-3 rounded-xl border ${esPendiente ? 'bg-yellow-900/10 border-yellow-500' : 'bg-zinc-900 border-zinc-800'}`;

                card.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-white text-sm">
                            ${data.nombre}
                            ${esPendiente ? '<span class="text-[9px] bg-yellow-500 text-black px-1 rounded ml-2">NUEVO</span>' : ''}
                        </h4>
                        <p class="text-xs text-gray-400">${data.email}</p>
                        <p class="text-[9px] text-blue-400 font-bold mt-1 tracking-wide">SKILLS: ${skillsStr}</p>
                        <p class="text-xs text-gray-400">${data.telefono || ''}</p>
                        <div class="mt-2 text-[10px] bg-black/20 p-1 rounded inline-block border border-white/5">
                            ${ineCheck} | ${csfCheck}
                        </div>
                        <div class="mt-1">
                            ${estadoDot}
                        </div>
                    </div>

                    <div class="flex flex-col gap-2">
                        ${esPendiente ? `
                        <button class="btn-aprobar bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-3 py-2 rounded shadow-lg transition-transform hover:scale-105" onclick="window.aprobarTecnico('${docSnap.id}')">
                            APROBAR ACCESO
                        </button>
                        ` : `
                        <i class="fas fa-check-circle text-emerald-800 text-2xl"></i>
                        `}
                    </div>
                </div>
                `;
                elementos.lista.appendChild(card);
            });
            // Actualizamos el contador del Dashboard principal
            if(elementos.countOnline) {
                elementos.countOnline.innerHTML = `${contOnline} <span class="text-sm text-gray-500">/ ${contTotal}</span>`;
                elementos.countOnline.style.color = contOnline > 0 ? "#10b981" : "white";
            }
        });
    }

    // 1.B. MONITOREO DE SERVICIOS
    const qServicios = query(collection(db, "services"), orderBy("created_at", "desc"));

    onSnapshot(qServicios, (snap) => {
        if(elementos.actividad) elementos.actividad.innerHTML = "";

        let activos = 0;
        
        if (snap.empty) {
            if(elementos.actividad) elementos.actividad.innerHTML = '<p class="text-gray-500 italic text-sm text-center mt-4">Sin actividad reciente.</p>';
        }
        snap.forEach(docSnap => {
            const data = docSnap.data();

            // Calculo de Activos (Excluyendo finalizados y cancelados)
            if (!["finalizado", "cancelado"].includes(data.estado)) {
                activos++;
            }

            // Renderizar solo los últimos 10 para no saturar el DOM
            if (elementos.actividad && elementos.actividad.children.length < 10) {
                const item = document.createElement("div");
                item.className = "flex justify-between items-center border-b border-white/5 py-3 last:border-0";

                let colorEstado = "text-gray-400";
                if(data.estado === "pendiente") colorEstado = "text-yellow-500";
                if(data.estado === "trabajando") colorEstado = "text-blue-400 animate-pulse";
                if(data.estado === "finalizado") colorEstado = "text-emerald-500";
                
                item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="bg-zinc-800 p-2 rounded-lg"><i class="fas fa-tools text-gray-400"></i></div>
                    <div>
                        <p class="text-xs font-bold text-white uppercase">${data.categoria}</p>
                        <p class="text-[10px] text-gray-500">${data.cliente_nombre || 'Cliente'} • ${data.zona || 'Cancún'}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-[10px] font-bold ${colorEstado} uppercase">${data.estado.replace('_', ' ')}</p>
                    <p class="text-[9px] text-gray-600">Hace un momento</p>
                </div>
                `;
                elementos.actividad.appendChild(item);
            }
        });
        // Actualizar Widgets Superiores
        if(elementos.countServ) {
            elementos.countServ.innerText = activos;
            elementos.countServ.style.color = activos > 0 ? "#34d399" : "white";
        }
    });

    // 1.C. MONITOREO DE FINANZAS REALES (V5.7 - Colección Transacciones)
    const qFinanzas = query(collection(db, "transacciones"));
    onSnapshot(qFinanzas, (snap) => {
        let totalComision = 0;
        snap.forEach(doc => {
            // Sumamos solo la comisión de FixGo (32%)
            totalComision += (doc.data().comision_fixgo || 0);
        });
        if(elementos.countMoney) {
            elementos.countMoney.innerText = `$${totalComision.toFixed(2)}`;
        }
    });

    // Función global para el botón onclick del HTML inyectado
    window.aprobarTecnico = async (uid) => {
        if(!confirm("¿Estás seguro de aprobar a este técnico? Tendrá acceso inmediato a solicitudes.")) return;
        try {
            await updateDoc(doc(db, "users", uid), {
                estado: "activo",
                status: "activo",
                verificado: true,
                aprobadoEn: serverTimestamp()
            });
            alert(" ✅  Técnico Aprobado y Activado.");
        } catch (error) {
            console.error(error);
            alert("Error al aprobar.");
        }
    };

    // --- NUEVO: GESTIÓN DE CATÁLOGO (ADMIN V5.7) ---
    // Función para abrir y cargar el modal de catálogo
    window.abrirGestorCatalogo = async () => {
        const modal = document.getElementById("modalCatalogo");
        const container = document.getElementById("gridConfiguracion");
        if (modal) modal.classList.remove("hidden");
        
        // Leemos la configuración actual
        const docRef = doc(db, "configuracion", "catalogo_global");
        const docSnap = await getDoc(docRef);
        
        let config = { road: true, fix: true, tech: true }; // Default
        if(docSnap.exists()) config = docSnap.data();

        // Generamos los switches
        if (container) {
            container.innerHTML = `
                ${generarSwitch("road", "ROAD (Vial)", config.road)}
                ${generarSwitch("fix", "FIX (Hogar)", config.fix)}
                ${generarSwitch("tech", "TECH (Sistemas)", config.tech)}
            `;
        }
    };

    window.guardarConfiguracionGlobal = async () => {
        const nuevaConfig = {
            road: document.getElementById("cfg_road").checked,
            fix: document.getElementById("cfg_fix").checked,
            tech: document.getElementById("cfg_tech").checked,
            updatedAt: serverTimestamp()
        };
        
        await setDoc(doc(db, "configuracion", "catalogo_global"), nuevaConfig);
        alert("✅ Catálogo actualizado. Los clientes verán los cambios al instante.");
        document.getElementById("modalCatalogo").classList.add("hidden");
    };
}

// Helper para generar HTML de switches
function generarSwitch(key, label, value) {
    return `
    <div class="bg-black p-4 rounded-xl border border-zinc-700 flex justify-between items-center">
        <span class="font-bold text-white">${label}</span>
        <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id="cfg_${key}" class="sr-only peer" ${value ? 'checked' : ''}>
            <div class="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
        </label>
    </div>`;
}

// ======================================================
// 2. PANEL DE TÉCNICO (Socio Operador)
// ======================================================
export async function iniciarPanelTecnico(user) {
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
        walletLabel: document.getElementById("walletSaldo") // ELEMENTO NUEVO V5.7.4
    };

    // 2.A. ESTADO DEL TÉCNICO Y PERFIL
    const tecnicoRef = doc(db, "users", user.uid);
    onSnapshot(tecnicoRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const estado = data.estado || "pendiente";

        // Caso: Pendiente de Aprobación
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

        // Caso: Activo
        if (elementos.toggleONOFF) {
            elementos.toggleONOFF.disabled = false;
            elementos.toggleONOFF.checked = data.disponible === true;
        }

        if (data.disponible) {
            // ENCENDIDO
            iniciarTracking(user.uid);
            elementos.seccionBolsa?.classList.remove("hidden");
            escucharBolsa(user, elementos.listaBolsa); // Le pasamos el user para ver sus Skills

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "EN LÍNEA";
                elementos.statusLabel.className = "bg-emerald-500/20 text-emerald-500 status-badge font-bold animate-pulse";
            }
            elementos.radarSection?.classList.remove("opacity-50", "grayscale");
        } else {
            // APAGADO
            detenerTracking();
            elementos.seccionBolsa?.classList.add("hidden");

            if(elementos.statusLabel) {
                elementos.statusLabel.innerText = "OFFLINE";
                elementos.statusLabel.className = "bg-red-500/20 text-red-500 status-badge font-bold";
            }
            elementos.radarSection?.classList.add("opacity-50", "grayscale");
        }
    });

    // 2.D. WALLET & GANANCIAS (NUEVO BLOQUE V5.7.4)
    // Calcula cuánto dinero ha ganado el técnico específico
    const qWallet = query(collection(db, "transacciones"), where("tecnico_id", "==", user.uid));
    onSnapshot(qWallet, (snap) => {
        let misGanancias = 0;
        snap.forEach(docSnap => {
            const tx = docSnap.data();
            misGanancias += (tx.pago_tecnico || 0);
        });
        
        // Actualizamos la UI si existe el elemento
        if(elementos.walletLabel) {
            elementos.walletLabel.innerText = `$${misGanancias.toFixed(2)}`;
        } else {
            // Si no existe el elemento en el HTML, lo inyectamos temporalmente para depuración
            // Opcional: Esto ayuda a ver si funciona aunque falte el HTML
            console.log("💰 Wallet Técnico:", misGanancias);
        }
    });

    // Listener para el Switch ON/OFF
    if (elementos.toggleONOFF) {
        elementos.toggleONOFF.addEventListener("change", async (e) => {
            await updateDoc(tecnicoRef, {
                disponible: e.target.checked,
                last_seen: serverTimestamp()
            });
        });
    }

    // 2.B. BOLSA DE TRABAJO (CON SONIDO Y FILTRO DE SKILLS)
    function escucharBolsa(tecnico, contenedor) {
        if(!contenedor) return;
        const q = query(collection(db, "services"), where("estado", "==", "pendiente"), orderBy("created_at", "desc"));

        onSnapshot(q, (snap) => {
            contenedor.innerHTML = "";
            if(snap.empty) {
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">Escaneando zona... esperando solicitudes.</p>`;
                return;
            }

            //  🔔  SONIDO: Si llega una nueva solicitud (added)
            if(snap.docChanges().some(change => change.type === 'added')) {
                console.log(" 🔔  Nueva solicitud detectada: SONANDO ALERTA");
                sonarAlerta();
            }

            snap.forEach((docSnap) => {
                const s = docSnap.data();
                const id = docSnap.id;

                // --- FILTRO DE SKILLS (V5.7) ---
                const misSkills = tecnico.skills || [];
                // Si la categoría del servicio no está en mis skills, lo salto (y tengo al menos 1 skill)
                if (s.categoria && misSkills.length > 0 && !misSkills.includes(s.categoria)) {
                    return; // No mostrar este servicio
                }

                const card = document.createElement("div");
                card.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl mb-3 animate-pulse border-emerald-500 shadow-lg shadow-emerald-900/20";

                card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <span class="bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">NUEVA SOLICITUD</span>
                    <span class="text-white font-bold text-xs">${s.categoria ? s.categoria.toUpperCase() : 'GENERAL'}</span>
                </div>
                <h4 class="text-white font-bold text-base mb-1">${s.zona || 'Cancún'}</h4>
                <p class="text-gray-300 text-sm mb-3 font-medium italic">"${s.descripcion}"</p>
                <div class="flex items-center gap-2 mb-3 text-xs text-gray-500">
                    <i class="fas fa-map-marker-alt"></i> ${s.direccion}
                </div>
                <button class="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-lg text-xs uppercase transition-all transform active:scale-95" onclick="window.tomarServicio('${id}', '${tecnico.uid}', '${tecnico.nombre}')">
                    ACEPTAR (BLOQUEAR $550)
                </button>
                `;
                contenedor.appendChild(card);
            });
        });
    }

    // Función global para aceptar servicio (CON BLOQUEO V5.7)
    window.tomarServicio = async (id, uid, nombre) => {
        // 1. VALIDACIÓN DE UNICIDAD (No Multitasking)
        // Verificamos si el técnico ya tiene un servicio activo
        const qCheck = query(
            collection(db, "services"), 
            where("tecnico_id", "==", uid),
            where("estado", "in", ["asignado", "en_camino", "en_sitio", "cotizando", "trabajando"])
        );
        
        const snapCheck = await getDocs(qCheck);
        if (!snapCheck.empty) {
            alert("⛔ BLOQUEO DE SEGURIDAD\n\nYa tienes un servicio activo. Debes finalizarlo antes de tomar otro.");
            return;
        }

        if(!confirm("¿Aceptar este servicio? \n\nSe notificará al cliente y se bloqueará la garantía.")) return;
        try {
            await updateDoc(doc(db, "services", id), {
                estado: "asignado",
                tecnico_id: uid,
                tecnico_nombre: nombre,
                tecnico_telefono: user.telefono || "",
                asignado_at: serverTimestamp()
            });
            // El propio onSnapshot del flujo activo actualizará la UI
        } catch (error) {
            console.error(error);
            alert("Error: El servicio ya fue tomado por otro técnico.");
        }
    };

    // 2.C. FLUJO ACTIVO (MISIONES Y BOTONES)
    // Escuchamos servicios donde soy el técnico y el estado es activo
    const qMisiones = query(
        collection(db, "services"),
        where("tecnico_id", "==", user.uid),
        where("estado", "in", ["asignado", "en_camino", "en_sitio", "cotizando", "trabajando"])
    );
    onSnapshot(qMisiones, (snap) => {
        const ls = elementos.listaServicios;
        const pa = elementos.panelAcciones;

        if (!ls) return;
        ls.innerHTML = "";

        // Si no hay misiones, escondemos el panel inferior
        if (snap.empty) {
            if(pa) pa.classList.add("translate-y-full");
            return;
        }

        // Si hay misiones, mostramos el panel
        if(pa) pa.classList.remove("translate-y-full");
        snap.forEach((docSnap) => {
            const s = docSnap.data();
            const id = docSnap.id;

            // Construcción inteligente del link de Waze
            // Si el cliente dio coordenadas, usamos esas. Si no, la dirección.
            const destinoWaze = s.coords
                ? `${s.coords.lat},${s.coords.lng}`
                : encodeURIComponent(s.direccion);

            // Render Tarjeta
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-blue-500/50 p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl";
            card.innerHTML = `
            <div class="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">
                ${s.estado.replace('_', ' ')}
            </div>
            <h3 class="text-xl font-black text-white mb-1 uppercase">${s.categoria}</h3>
            <p class="text-gray-400 text-sm mb-4">
                <i class="fas fa-map-marker-alt text-blue-500"></i> ${s.direccion}
            </p>
            <div class="bg-black/50 p-4 rounded-xl mb-4">
                <p class="text-xs text-gray-500 uppercase font-bold mb-1">Problema:</p>
                <p class="text-sm text-white italic">"${s.descripcion}"</p>
            </div>
            <div class="flex gap-2">
                <a href="https://waze.com/ul?q=${destinoWaze}" target="_blank" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-center text-sm transition-colors">
                    <i class="fab fa-waze"></i> IR CON WAZE
                </a>
                <a href="tel:${s.cliente_telefono}" class="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl text-center transition-colors">
                    <i class="fas fa-phone"></i>
                </a>
            </div>
            `;
            ls.appendChild(card);

            // GESTIÓN DE BOTONES INFERIORES POR ESTADO
            const btn1 = elementos.btnEnCamino;
            const btn2 = elementos.btnLlegue;

            // Reset visual
            btn1.classList.add("hidden");
            btn2.classList.add("hidden");

            // Lógica de Estados
            if (s.estado === "asignado") {
                btn1.classList.remove("hidden");
                btn1.innerText = "VOY EN CAMINO";
                btn1.className = "w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn1.onclick = () => actualizarEstado(id, "en_camino");
            }
            else if (s.estado === "en_camino") {
                btn2.classList.remove("hidden");
                btn2.innerText = "YA LLEGUÉ AL SITIO";
                btn2.className = "w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => {
                    actualizarEstado(id, "en_sitio");
                };
            }
            else if (s.estado === "en_sitio") {
                btn2.classList.remove("hidden");
                // CAMBIO V5.7: LLAMA AL NUEVO COTIZADOR ALAMO
                btn2.innerText = "CREAR COTIZACIÓN";
                btn2.className = "w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => mostrarModalCotizacionDetallada(id, s);
            }
            else if (s.estado === "cotizando") {
                btn2.classList.remove("hidden");
                btn2.innerText = "ESPERANDO AL CLIENTE...";
                btn2.disabled = true;
                btn2.className = "w-full bg-zinc-700 text-gray-400 font-bold py-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-2";
            }
            else if (s.estado === "trabajando") {
                btn2.classList.remove("hidden");
                btn2.innerText = " 📸  FINALIZAR Y EVIDENCIA";
                btn2.disabled = false;
                btn2.className = "w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => mostrarModalEvidencia(id);
            }
        });
    });

    // Función auxiliar para actualizar estado en Servicios y en Rastreo
    async function actualizarEstado(id, estado, extras = {}) {
        try {
            // 1. Actualizar el documento del servicio
            await updateDoc(doc(db, "services", id), { estado: estado, ...extras });

            // 2. Actualizar el estado público para el mapa (Rastreo)
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
    }

    // ==========================================================
    // NUEVO MODAL: COTIZACIÓN DETALLADA (V5.7 ALAMO STYLE)
    // ==========================================================
    // Esta función reemplaza a la antigua "mostrarModalCotizacion"
    function mostrarModalCotizacionDetallada(id, servicioData) {
        if(document.getElementById("modalCot")) return;
        
        let items = []; // Array temporal para guardar partidas

        const html = `
        <div id="modalCot" class="fixed inset-0 bg-black/95 z-[60] flex flex-col p-4 animate-fade-in overflow-y-auto">
            <div class="bg-zinc-900 w-full max-w-lg mx-auto rounded-3xl p-6 border border-zinc-700 shadow-2xl flex-1 flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-white font-black text-xl">COTIZADOR PRO (ALAMO)</h3>
                    <button onclick="document.getElementById('modalCot').remove()" class="text-gray-500"><i class="fas fa-times"></i></button>
                </div>
                
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
                    ENVIAR AL CLIENTE
                </button>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', html);
        console.log(" 🛠️ Modal de Cotización Abierto");

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
                            <p class="text-white font-bold"><span class="text-emerald-500">${item.cantidad} ${item.unidad}</span> ${item.descripcion}</p>
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

        // Asignación de eventos robusta (V5.7.1)
        setTimeout(() => {
            const btnAdd = document.getElementById("btnAddItem");
            const btnSend = document.getElementById("btnEnviarCot");

            if(btnAdd) {
                btnAdd.onclick = () => {
                    console.log("Click en Agregar Item");
                    const cant = parseFloat(document.getElementById("inCant").value);
                    const unidad = document.getElementById("inUnidad").value.trim();
                    const desc = document.getElementById("inDesc").value.trim();
                    const precio = parseFloat(document.getElementById("inPrecio").value);

                    if(!cant || !desc || !precio) return alert("Llena todos los campos del concepto.");

                    items.push({ cantidad: cant, unidad: unidad || 'pz', descripcion: desc, precio: precio });
                    
                    // Limpiar inputs
                    document.getElementById("inCant").value = "";
                    document.getElementById("inDesc").value = "";
                    document.getElementById("inPrecio").value = "";
                    renderItems();
                };
            }

            if(btnSend) {
                btnSend.onclick = async () => {
                    if(items.length === 0) return alert("Agrega al menos un concepto para cotizar.");
                    
                    const totalFinal = items.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);

                    if(!confirm(`¿Enviar cotización por $${totalFinal.toFixed(2)}?`)) return;

                    // GUARDAR DETALLES EN FIRESTORE
                    // Esta estructura es la que el panel del cliente leerá para armar la tabla
                    try {
                        await updateDoc(doc(db, "services", id), {
                            estado: "cotizando",
                            detalles_cotizacion: items, // Array estructurado
                            costo_final: totalFinal,
                            cotizado_at: serverTimestamp(),
                            diagnostico: "Cotización Detallada" // Fallback
                        });
                        // CONFIRMACIÓN VISUAL (V5.7.3)
                        alert(`✅ Cotización con ${items.length} partidas enviada correctamente.`);
                    } catch (e) {
                        console.error(e);
                        alert("Error al guardar la cotización.");
                    }

                    const modal = document.getElementById("modalCot");
                    if(modal) modal.remove();
                };
            }
        }, 100); // Pequeño delay para asegurar renderizado
    }

    //  📸  MODAL EVIDENCIA (REAL CON BASE64 Y CÁLCULO FINANCIERO V5.7)
    function mostrarModalEvidencia(id) {
        if(document.getElementById("modalEvidencia")) return;

        const html = `
        <div id="modalEvidencia" class="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl">
                <h3 class="text-white font-black text-xl mb-4 text-center">REPORTE FINAL OBLIGATORIO</h3>
                <p class="text-gray-400 text-xs mb-6 text-center">Para liberar el pago, sube la evidencia fotográfica.</p>

                <div class="space-y-4">
                    <div class="bg-black p-4 rounded-xl border border-zinc-800 text-center">
                        <label class="block text-xs font-bold text-emerald-500 mb-2 uppercase">FOTO DEL ANTES</label>
                        <input type="file" id="fileAntes" accept="image/*" class="text-xs text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700">
                    </div>
                    <div class="bg-black p-4 rounded-xl border border-zinc-800 text-center">
                        <label class="block text-xs font-bold text-emerald-500 mb-2 uppercase">FOTO DEL DESPUÉS</label>
                        <input type="file" id="fileDespues" accept="image/*" class="text-xs text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700">
                    </div>
                </div>

                <div class="flex gap-3 mt-8">
                    <button onclick="document.getElementById('modalEvidencia').remove()" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm">CANCELAR</button>
                    <button id="btnSubirEvidencia" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-xl font-black text-sm transition-colors">ENVIAR Y CERRAR</button>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        document.getElementById("btnSubirEvidencia").onclick = async () => {
            const f1 = document.getElementById("fileAntes").files[0];
            const f2 = document.getElementById("fileDespues").files[0];
            if(!f1 || !f2) { alert(" ⚠ ️ Ambas fotos son obligatorias para el reporte."); return; }

            const btn = document.getElementById("btnSubirEvidencia");
            btn.innerText = "SUBIENDO EVIDENCIA...";
            btn.disabled = true;
            try {
                // Conversión a Base64
                const b64_1 = await toBase64(f1);
                const b64_2 = await toBase64(f2);
                
                // CÁLCULO DE COMISIÓN 32% (LOGICA V5.7)
                const servicioSnap = await getDoc(doc(db, "services", id));
                const servicioData = servicioSnap.data();
                const costoTotal = servicioData.costo_final || 0;
                const comisionPlataforma = costoTotal * 0.32;
                const gananciaTecnico = costoTotal - comisionPlataforma;

                // 1. Actualizar Servicio con Evidencia y Datos Fiscales Simulados
                await actualizarEstado(id, "finalizado", {
                    evidencia: { antes: b64_1, despues: b64_2 },
                    finalizado_at: serverTimestamp(),
                    folio_fiscal: "FX-" + Math.random().toString(36).substr(2, 9).toUpperCase(),
                    desglose: {
                        subtotal: (costoTotal / 1.16).toFixed(2),
                        iva: (costoTotal - (costoTotal / 1.16)).toFixed(2),
                        total: costoTotal
                    }
                });

                // 2. NUEVO: REGISTRAR TRANSACCIÓN FINANCIERA
                await addDoc(collection(db, "transacciones"), {
                    servicio_id: id,
                    tecnico_id: user.uid, 
                    monto_total: costoTotal,
                    comision_fixgo: comisionPlataforma, // El 32%
                    pago_tecnico: gananciaTecnico,
                    fecha: serverTimestamp(),
                    tipo: "ingreso_servicio"
                });

                document.getElementById("modalEvidencia").remove();
                alert(" ✅  ¡Servicio Cerrado Exitosamente! Comisión registrada.");
            } catch (e) {
                console.error(e);
                alert("Error subiendo imágenes. Intenta fotos más pequeñas.");
                btn.innerText = "REINTENTAR";
                btn.disabled = false;
            }
        };
    }

    // Helper: Convertir archivo a texto Base64
    const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// ======================================================
// 3. PANEL DE CLIENTE (Usuario Final)
// ======================================================
export async function iniciarPanelCliente(user) {
    const el = {
        form: document.getElementById("nuevaSolicitudForm"),
        lista: document.getElementById("solicitudesCliente"),
        inputCat: document.getElementById("categoriaSeleccionada"),
        labelServicio: document.getElementById("btnLabel"),
        // El grid se llenará dinámicamente con las nuevas Verticales
    };

    // ----------------------------------------------------
    // 3.1 CARGA DINÁMICA DE VERTICALES (EXPANSIÓN V5.8)
    // ----------------------------------------------------
    // Esta función maneja la lógica compleja de Road, Fix, Maint y Tech
    // Desplegando botones individuales para cada servicio y gestionando su estado.
    async function cargarServiciosCliente(contenedorID) {
        const container = document.getElementById(contenedorID);
        if(!container) {
            console.error(`ERROR CRÍTICO: No se encontró el contenedor #${contenedorID} para las verticales.`);
            return;
        }

        console.log("Cargando servicios en container:", contenedorID);

        // DEFINICIÓN MAESTRA DE VERTICALES Y SERVICIOS (LÓGICA BLINDADA)
        // Aquí centralizamos qué servicio pertenece a qué vertical y su estado por defecto
        const DEFINICION_VERTICALES = {
            road: {
                titulo: "FIXGO ROAD (Vial)",
                icono: "fa-car-crash",
                color: "yellow", // Clases de Tailwind: text-yellow-500, bg-yellow-500/20
                modo: "EMERGENCIA (Prioridad Alta)",
                servicios: [
                    { id: "road_llanta", label: "Llantera Móvil", active: true },
                    { id: "road_cerrajero", label: "Cerrajería 24/7", active: true },
                    { id: "road_grua", label: "Grúas", active: false }, // Próximamente
                    { id: "road_mecanico", label: "Mecánico Gral.", active: false }, // Próximamente
                    { id: "road_corriente", label: "Paso Corriente", active: false } // Próximamente
                ]
            },
            fix: {
                titulo: "FIXGO FIX (Hogar)",
                icono: "fa-tools",
                color: "blue", // text-blue-500
                modo: "ON-DEMAND (Cercanía)",
                servicios: [
                    { id: "fix_electricidad", label: "Electricidad", active: true },
                    { id: "fix_plomeria", label: "Plomería", active: true },
                    { id: "fix_ac", label: "Aires Acond. (A/C)", active: true },
                    { id: "fix_jardin", label: "Jardinería", active: false }, // Próximamente
                    { id: "fix_pintura", label: "Pintura", active: false }, // Próximamente
                    { id: "fix_alberca", label: "Albercas", active: false }, // Próximamente
                    { id: "fix_fumigacion", label: "Fumigación", active: false } // Próximamente
                ]
            },
            maint: {
                titulo: "FIXGO MAINT (B2B)",
                icono: "fa-building",
                color: "orange",
                modo: "CONTRATO (Mantenimiento)",
                servicios: [
                    // Toda la vertical está inactiva por ahora, pero preparada
                    { id: "maint_general", label: "Mantenimiento Gral.", active: false }
                ]
            },
            tech: {
                titulo: "FIXGO TECH (Sistemas)",
                icono: "fa-wifi",
                color: "purple",
                modo: "ESPECIALIDAD (Certificado)",
                servicios: [
                    { id: "tech_cctv", label: "CCTV", active: true },
                    { id: "tech_alarma", label: "Sistemas Alarma", active: true },
                    { id: "tech_acceso", label: "Control Accesos", active: true },
                    { id: "tech_elevador", label: "Elevadores", active: false }, // Próximamente
                    { id: "tech_planta", label: "Plantas Eléc.", active: false }, // Próximamente
                    { id: "tech_solar", label: "Paneles Solares", active: false } // Próximamente
                ]
            }
        };

        // Renderizado del HTML
        // Iteramos sobre las 4 verticales principales
        let htmlFinal = "";

        Object.keys(DEFINICION_VERTICALES).forEach(key => {
            const vertical = DEFINICION_VERTICALES[key];
            
            // Header de la Vertical
            htmlFinal += `
            <div class="mb-6 animate-fade-in">
                <div class="flex items-center gap-2 mb-3 border-b border-zinc-800 pb-2">
                    <div class="bg-${vertical.color}-500/20 p-2 rounded-lg text-${vertical.color}-500">
                        <i class="fas ${vertical.icono}"></i>
                    </div>
                    <div>
                        <h3 class="text-white font-black text-sm uppercase">${vertical.titulo}</h3>
                        <p class="text-[9px] text-gray-500 tracking-wider">${vertical.modo}</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-3">
            `;

            // Grid de Servicios dentro de la Vertical
            vertical.servicios.forEach(srv => {
                const opacity = srv.active ? "opacity-100 hover:scale-105 active:scale-95 cursor-pointer" : "opacity-40 grayscale cursor-not-allowed";
                const border = srv.active ? "border-zinc-700 hover:border-emerald-500" : "border-zinc-800 border-dashed";
                const clickAction = srv.active ? `onclick="window.seleccionarServicio('${srv.id}', '${srv.label}')"` : "";
                
                htmlFinal += `
                <div class="bg-zinc-900 border ${border} p-3 rounded-xl flex flex-col items-center text-center transition-all duration-200 service-card-btn ${opacity}" ${clickAction} id="card_${srv.id}">
                    <div class="mb-2">
                        ${srv.active ? '<div class="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_5px_#10b981]"></div>' : '<i class="fas fa-lock text-gray-600 text-xs"></i>'}
                    </div>
                    <span class="text-white font-bold text-xs leading-tight">${srv.label}</span>
                    <span class="text-[8px] text-gray-500 mt-1 uppercase tracking-widest font-bold">${srv.active ? 'DISPONIBLE' : 'PRÓXIMAMENTE'}</span>
                </div>
                `;
            });

            htmlFinal += `
                </div>
            </div>
            `;
        });

        container.innerHTML = htmlFinal;

        // Función Global para la selección (vinculada al window para acceso desde HTML string)
        window.seleccionarServicio = (id, label) => {
            // Reset visual de todas las cards
            document.querySelectorAll('.service-card-btn').forEach(btn => {
                btn.classList.remove('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                btn.classList.add('bg-zinc-900', 'border-zinc-700');
            });

            // Activar visualmente la card seleccionada
            const activeCard = document.getElementById(`card_${id}`);
            if(activeCard) {
                activeCard.classList.remove('bg-zinc-900', 'border-zinc-700');
                activeCard.classList.add('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
            }

            // Llenar inputs ocultos y mostrar en UI
            if(el.inputCat) el.inputCat.value = id; // Guardamos ID específico (ej: road_llanta)
            if(el.labelServicio) el.labelServicio.innerText = label.toUpperCase(); // UI Feedback

            // Scroll suave hacia el formulario para mejor UX
            el.form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
    }

    cargarServiciosCliente('gridServicios'); // Iniciar carga con la nueva lógica V5.8

    // Envío de Solicitud con GPS Oculto
    if (el.form) {
        el.form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const cat = el.inputCat.value; // Ahora trae el ID específico (ej: fix_plomeria)
            const dir = el.form.querySelector('[name="direccion"]').value;
            const desc = el.form.querySelector('[name="descripcion"]').value;
            
            if (!cat) { alert(" ⚠ ️ Por favor selecciona un servicio habilitado de la lista."); return; }
            
            const btn = el.form.querySelector("button");
            const textoOriginal = btn.innerText;
            btn.disabled = true;
            btn.innerText = "OBTENIENDO UBICACIÓN...";
            
            //  🔥  NUEVO: INTENTO DE OBTENER GPS EXACTO DEL CLIENTE
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                        // Éxito GPS
                        await enviarSolicitudFinal(cat, dir, desc, {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude
                        });
                    },
                    async (err) => {
                        // Fallo GPS (Permiso denegado), enviamos sin coords
                        console.warn("GPS Cliente no disponible:", err);
                        await enviarSolicitudFinal(cat, dir, desc, null);
                    },
                    { timeout: 5000, enableHighAccuracy: true }
                );
            } else {
                // Navegador viejo
                await enviarSolicitudFinal(cat, dir, desc, null);
            }
            
            async function enviarSolicitudFinal(categoriaFull, direccion, descripcion, coords) {
                // Parseamos la categoría para separar Vertical del Servicio
                // Ej: "road_llanta" -> Vertical: ROAD, Tipo: LLANTA
                const partes = categoriaFull.split('_');
                const vertical = partes[0].toUpperCase(); 
                const servicio = partes[1] ? partes[1].toUpperCase() : 'GENERAL';

                if(confirm("Se realizará una retención temporal de garantía ($550 MXN).\n\n¿Autorizar solicitud?")) {
                    try {
                        await addDoc(collection(db, "services"), {
                            cliente_id: user.uid,
                            cliente_nombre: user.nombre || "Cliente",
                            cliente_telefono: user.telefono || "",
                            categoria: vertical, // Guardamos la vertical principal para filtrado técnico
                            sub_servicio: servicio, // Guardamos el detalle específico
                            categoria_id: categoriaFull, // ID completo para referencias
                            direccion: direccion,
                            descripcion: descripcion,
                            estado: "pendiente",
                            created_at: serverTimestamp(),
                            retencion_inicial: 550,
                            costo_final: 0,
                            coords: coords // Guardamos las coordenadas para el Waze del técnico
                        });
                        alert(" ✅  ¡ Solicitud Enviada! Buscando técnico cercano...");
                        el.form.reset();
                        // Reset visual
                        if(el.labelServicio) el.labelServicio.innerText = "SERVICIO";
                        document.querySelectorAll('.service-card-btn').forEach(btn => {
                            btn.classList.remove('bg-zinc-800', 'border-emerald-500', 'ring-1', 'ring-emerald-500');
                            btn.classList.add('bg-zinc-900', 'border-zinc-700');
                        });
                    } catch (error) {
                        console.error(error);
                        alert("Error al enviar solicitud.");
                    }
                }
                btn.disabled = false;
                btn.innerText = textoOriginal;
            }
        });
    }

    // Monitor de Servicios en Tiempo Real
    onSnapshot(query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc")), (snap) => {
        if(!el.lista) return;
        el.lista.innerHTML = "";
        //  🔔  SONIDO: Si hay cambios en mi servicio (ej: técnico llega)
        if(snap.docChanges().some(change => change.type === 'modified')) {
            console.log(" 🔔  Actualización de servicio: SONANDO ALERTA");
            sonarAlerta();
        }
        snap.forEach(docSnap => {
            const s = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-white/10 p-4 rounded-xl mb-3";
            let contenido = `<span class="text-xs font-bold text-yellow-500 animate-pulse"> 🔎  BUSCANDO TÉCNICO...</span>`;
            if (s.estado !== "pendiente") contenido = `<span class="text-xs font-bold text-blue-400">${s.estado.toUpperCase().replace('_', ' ')}</span>`;
            
            // LÓGICA DE INTERACCIÓN CLIENTE (V5.7: TABLA ALAMO)
            if (s.estado === "cotizando") {
                // AQUÍ RENDERIZAMOS LA TABLA EXCEL SI EXISTEN DETALLES
                let htmlTabla = "";
                if (s.detalles_cotizacion && s.detalles_cotizacion.length > 0) {
                    const filas = s.detalles_cotizacion.map(item => `
                        <tr>
                            <td>${item.cantidad} ${item.unidad}</td>
                            <td>${item.descripcion}</td>
                            <td class="quote-num">$${item.precio}</td>
                            <td class="quote-num text-white">$${(item.cantidad * item.precio).toFixed(2)}</td>
                        </tr>
                    `).join('');
                    
                    htmlTabla = `
                        <div class="bg-black border border-zinc-700 rounded-lg overflow-hidden my-3">
                            <table class="quote-table" style="width: 100%; border-collapse: collapse; font-size: 10px; color: #ccc;">
                                <thead>
                                    <tr>
                                        <th style="background: #1f1f1f; color: #10b981; padding: 4px;">CANT</th>
                                        <th style="background: #1f1f1f; color: #10b981; padding: 4px;">DESC</th>
                                        <th style="background: #1f1f1f; color: #10b981; padding: 4px;">P.U.</th>
                                        <th style="background: #1f1f1f; color: #10b981; padding: 4px;">IMP.</th>
                                    </tr>
                                </thead>
                                <tbody>${filas}</tbody>
                                <tfoot>
                                    <tr class="quote-total-row" style="background: #1a1a1a; border-top: 2px solid #333;">
                                        <td colspan="3" class="text-right font-bold text-gray-400" style="padding: 4px;">TOTAL:</td>
                                        <td class="quote-num text-emerald-500 font-black text-sm" style="padding: 4px;">$${s.costo_final.toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    `;
                } else {
                    // Fallback para cotización simple antigua
                    htmlTabla = `<p class="text-white text-2xl font-black mt-1">$${s.costo_final}</p><p class="text-gray-400 text-xs italic">"${s.diagnostico}"</p>`;
                }

                contenido = `
                <div class="bg-zinc-800 p-4 rounded-lg border border-yellow-500 mt-2">
                    <div class="flex justify-between items-center mb-2">
                        <p class="text-yellow-500 text-xs font-bold uppercase">PRESUPUESTO GENERADO</p>
                        <span class="bg-yellow-500/20 text-yellow-500 text-[9px] px-2 py-1 rounded">FOLIO: ${id.substring(0,6).toUpperCase()}</span>
                    </div>
                    
                    ${htmlTabla}
                    
                    <div class="mt-2 p-2 bg-black/50 rounded border border-white/5">
                        <p class="legal-note" style="font-size: 8px; color: #666;">* SI HUBIERA CANCELACION TOTAL O PARCIAL... PENALIZACION DEL 20%.</p>
                        <p class="legal-note" style="font-size: 8px; color: #666;">* GARANTIA POR ESCRITO MINIMO DE 6 MESES.</p>
                    </div>

                    <div class="flex gap-2 mt-4">
                        <button onclick="window.responderCotizacion('${id}', false)" class="flex-1 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs py-3 rounded-lg font-bold transition-colors">
                            RECHAZAR
                        </button>
                        <button onclick="window.responderCotizacion('${id}', true)" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs py-3 rounded-lg transition-colors shadow-lg shadow-emerald-500/20">
                            APROBAR COSTO
                        </button>
                    </div>
                </div>
                `;
            } else if (s.estado === "finalizado") {
                // REPORTE CON FOTOS Y BOTÓN PDF (V5.7.4 FETCH ON DEMAND)
                // Ya no pasamos el objeto entero, solo el ID
                contenido = `
                <div class="bg-emerald-900/10 border border-emerald-500/30 p-4 rounded-xl mt-2">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-emerald-500 font-black text-xs uppercase tracking-widest">TICKET FINAL</span>
                        <span class="bg-emerald-500 text-black text-[9px] font-bold px-2 py-0.5 rounded">PAGADO</span>
                    </div>

                    <div class="space-y-2 mb-4">
                        <div class="flex justify-between text-lg text-white font-black">
                            <span>TOTAL:</span>
                            <span>$${s.costo_final}</span>
                        </div>
                    </div>
                    <p class="text-[9px] text-gray-500 mb-2 font-bold uppercase">EVIDENCIA REGISTRADA:</p>
                    <div class="flex gap-2 mb-4">
                        ${s.evidencia?.antes ? `<div class="relative w-1/2 h-20"><img src="${s.evidencia.antes}" class="w-full h-full object-cover rounded-lg border border-zinc-700"><span class="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1 rounded">ANTES</span></div>` : ''}
                        ${s.evidencia?.despues ? `<div class="relative w-1/2 h-20"><img src="${s.evidencia.despues}" class="w-full h-full object-cover rounded-lg border border-zinc-700"><span class="absolute bottom-1 left-1 bg-black/70 text-white text-[8px] px-1 rounded">DESPUÉS</span></div>` : ''}
                    </div>

                    <button onclick="window.generarPDF('${id}')" class="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-3 rounded-lg font-bold border border-white/10 transition-all flex items-center justify-center gap-2">
                        <i class="fas fa-file-download text-red-500"></i> DESCARGAR REPORTE FISCAL
                    </button>
                </div>
                `;
            }
            card.innerHTML = `
            <div class="flex justify-between items-center mb-1">
                <span class="font-black text-white uppercase tracking-tight">${s.categoria} ${s.sub_servicio ? '- ' + s.sub_servicio : ''}</span>
                <span class="text-[10px] text-gray-500">${new Date(s.created_at?.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <p class="text-xs text-gray-400 truncate mb-2"><i class="fas fa-map-marker-alt text-zinc-600"></i> ${s.direccion}</p>

            <div class="mt-2">${contenido}</div>

            ${(s.estado === 'en_camino' || s.estado === 'en_sitio') ? `
            <a href="rastreo.html?id=${id}" class="block mt-3 text-center bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs py-2.5 rounded-lg border border-blue-500/30 transition-colors font-bold flex items-center justify-center gap-2">
                <i class="fas fa-map-marked-alt"></i> SEGUIR TÉCNICO EN VIVO
            </a>
            ` : ''}
            `;
            el.lista.appendChild(card);
        });
    });

    // Respuestas globales del cliente
    window.responderCotizacion = async (id, aceptado) => {
        if (aceptado) {
            await updateDoc(doc(db, "services", id), { estado: "trabajando" });
            alert(" ✅  ¡ Costo aprobado! El técnico comenzará a trabajar ahora.");
        } else {
            if(confirm(" ⚠ ️ ¿Estás seguro de cancelar?\n\nAl haber llegado el técnico, se cobrará la visita mínima ($550).")) {
                await updateDoc(doc(db, "services", id), {
                    estado: "cancelado",
                    costo_final: 550, // Cobro mínimo por cancelación en sitio
                    cancelado_razon: "Cliente rechazó cotización"
                });
            }
        }
    };

    // GENERADOR PDF (CLIENTE - SIMULACIÓN FISCAL V5.7)
    // FIX V5.7.4: RECIBE SOLO ID Y HACE FETCH (NO DATA ESTATICA)
    window.generarPDF = async (serviceId) => {
        const btn = document.activeElement;
        const textoOrig = btn.innerText;
        btn.innerText = "OBTENIENDO DATOS...";
        btn.disabled = true;

        try {
            // 1. FETCH DE DATOS FRESCOS
            const docRef = doc(db, "services", serviceId);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                throw new Error("No se encontró el servicio en la base de datos.");
            }
            
            // Construimos el objeto data con el ID incluido
            const data = { ...docSnap.data(), id: serviceId };

            // 2. CARGA DE LIBRERÍA
            const { jsPDF } = await cargarLibreriaPDF();
            const docPdf = new jsPDF();
            
            // --- DISEÑO DEL PDF ---
            // Header Negro
            docPdf.setFillColor(18, 18, 18);
            docPdf.rect(0, 0, 215, 40, 'F');

            // Logo y Título
            docPdf.setTextColor(255, 255, 255);
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(24);
            docPdf.text("FIXGO", 20, 22);
            docPdf.setFont("helvetica", "normal");
            docPdf.setTextColor(16, 185, 129); // Verde Emerald
            docPdf.text("MÉXICO", 60, 22);

            docPdf.setTextColor(200, 200, 200);
            docPdf.setFontSize(10);
            docPdf.text("Comprobante de Servicio Digital", 20, 32);
            
            // DATOS FISCALES SIMULADOS (V5.7)
            docPdf.setFontSize(8);
            docPdf.setTextColor(150, 150, 150);
            docPdf.text(`RFC EMISOR: FXG260211-H8A`, 20, 45);
            docPdf.text(`RÉGIMEN FISCAL: 626 - Simplificado de Confianza`, 20, 50);
            docPdf.text(`LUGAR EXPEDICIÓN: 77500, Cancún, Q.Roo`, 20, 55);
            
            if(data.folio_fiscal) docPdf.text(`FOLIO FISCAL: ${data.folio_fiscal}`, 150, 45);
            docPdf.text(`FECHA: ${new Date().toLocaleDateString()}`, 150, 50);

            // Información del Cliente
            let y = 70;
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(12);
            docPdf.setFont("helvetica", "bold");
            docPdf.text("DETALLES DEL SERVICIO", 20, y);

            y += 10;
            docPdf.setFont("helvetica", "normal");
            docPdf.setFontSize(10);
            docPdf.text(`Cliente: ${data.cliente_nombre}`, 20, y);
            docPdf.text(`Categoría: ${data.categoria.toUpperCase()}`, 120, y);
            y += 8;
            docPdf.text(`Ubicación: ${data.direccion}`, 20, y);

            // Línea divisora
            y += 15;
            docPdf.setDrawColor(200, 200, 200);
            docPdf.line(20, y, 190, y);

            // Diagnóstico y Costos
            y += 15;
            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(12);
            docPdf.text("DIAGNÓSTICO TÉCNICO Y COSTOS", 20, y);

            y += 10;
            
            // --- FIX V5.7.3: RENDERIZADO DE TABLA (CON DEBUG DE FALLBACK) ---
            if (data.detalles_cotizacion && data.detalles_cotizacion.length > 0) {
                // Render Detailed Table (Alamo Style)
                docPdf.setFontSize(9);
                docPdf.setTextColor(100, 100, 100);
                docPdf.setFont("helvetica", "bold");
                
                // Headers
                docPdf.text("CANT", 20, y);
                docPdf.text("DESCRIPCIÓN", 45, y); 
                docPdf.text("P.UNIT", 140, y);
                docPdf.text("IMPORTE", 170, y);
                
                y += 5;
                docPdf.setDrawColor(50, 50, 50);
                docPdf.setLineWidth(0.5);
                docPdf.line(20, y, 190, y);
                y += 7;

                docPdf.setFont("helvetica", "normal");
                docPdf.setTextColor(0, 0, 0);
                
                data.detalles_cotizacion.forEach(item => {
                    docPdf.text(`${item.cantidad} ${item.unidad}`, 20, y);
                    
                    // Truncar descripción larga
                    const desc = item.descripcion.substring(0, 50) + (item.descripcion.length > 50 ? '...' : '');
                    docPdf.text(desc, 45, y);
                    
                    docPdf.text(`$${item.precio}`, 140, y);
                    docPdf.text(`$${(item.cantidad * item.precio).toFixed(2)}`, 170, y);
                    y += 7;
                });
                y += 5; // Extra padding
            } else {
                // Fallback Legacy con AVISO (Para depuración)
                docPdf.setFont("helvetica", "normal");
                docPdf.setFontSize(10);
                docPdf.setTextColor(50, 50, 50); // Gris oscuro
                
                // Si llegamos aquí, ES PORQUE FIREBASE NO TIENE EL ARRAY
                const diagText = data.diagnostico || "(Sin desglose registrado en base de datos)";
                const splitDiag = docPdf.splitTextToSize(diagText, 170);
                
                docPdf.text(splitDiag, 20, y);
                y += (splitDiag.length * 7) + 5;
                
                // Marca de agua de depuración
                docPdf.setFontSize(8);
                docPdf.setTextColor(255, 0, 0);
                docPdf.text("[INFO: Estructura de datos antigua detectada. Crea un servicio nuevo para ver la tabla.]", 20, y);
                y += 10;
            }

            // Caja de Totales
            docPdf.setFillColor(245, 245, 245);
            docPdf.rect(120, y, 70, 40, 'F'); 
            
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(10);
            docPdf.text("IMPORTE TOTAL:", 125, y + 10);
            
            // Desglose fiscal si existe
            if (data.desglose) {
                docPdf.setFontSize(8);
                docPdf.text(`Subtotal: $${data.desglose.subtotal}`, 125, y + 18);
                docPdf.text(`IVA (16%): $${data.desglose.iva}`, 125, y + 23);
            }

            docPdf.setFont("helvetica", "bold");
            docPdf.setFontSize(16);
            docPdf.setTextColor(16, 185, 129); // Verde
            docPdf.text(`$${data.costo_final} MXN`, 125, y + 35);

            // Evidencia Fotográfica
            y += 60;
            docPdf.setTextColor(0, 0, 0);
            docPdf.setFontSize(12);
            docPdf.text("EVIDENCIA FOTOGRÁFICA", 20, y);
            y += 10;
            if(data.evidencia?.antes) {
                try {
                    docPdf.addImage(data.evidencia.antes, "JPEG", 20, y, 80, 60);
                    docPdf.setFontSize(8);
                    docPdf.text("ESTADO INICIAL", 20, y + 65);
                } catch(e) {}
            }
            if(data.evidencia?.despues) {
                try {
                    docPdf.addImage(data.evidencia.despues, "JPEG", 110, y, 80, 60);
                    docPdf.setFontSize(8);
                    docPdf.text("TRABAJO FINALIZADO", 110, y + 65);
                } catch(e) {}
            }
            // Footer
            docPdf.setFontSize(8);
            docPdf.setTextColor(150, 150, 150);
            docPdf.text("Este documento es un comprobante digital emitido por la plataforma FixGo.", 60, 280);
            docPdf.save(`FixGo_Reporte_${data.id}.pdf`);
            
            btn.innerText = "DESCARGAR REPORTE OFICIAL";
            btn.disabled = false;

        } catch (error) {
            console.error(error);
            alert("Hubo un error generando el PDF. Intenta de nuevo.");
            btn.innerText = "ERROR - REINTENTAR";
            btn.disabled = false;
        }
    };
}
