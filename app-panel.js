/**
 * ======================================================
 * FIXGO 2026 - PANEL MAESTRO DE CONTROL (LOGIC CORE)
 * Archivo: app-panel.js
 * Versión: 5.7 (FULL LOGIC: FINANCE 32% + LOCKING + CATALOGUE)
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
    getDoc
} from "./firebase.js";

// IMPORTANTE: Importamos getDocs manualmente porque a veces falta en firebase.js
import { getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import { iniciarTracking, detenerTracking } from "./gps-motor.js";

// ======================================================
// 🔔 SISTEMA DE SONIDO CENTRALIZADO (ROBUSTO)
// ======================================================
const audioNotificacion = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-software-interface-start-2574.mp3');
let audioDesbloqueado = false;

function desbloquearAudio() {
    if (audioDesbloqueado) return;
    audioNotificacion.play().then(() => {
        audioNotificacion.pause();
        audioNotificacion.currentTime = 0;
        audioDesbloqueado = true;
        console.log(" 🔊 Sistema de Audio: DESBLOQUEADO Y LISTO.");
        document.removeEventListener('click', desbloquearAudio);
        document.removeEventListener('touchstart', desbloquearAudio);
    }).catch(error => {
        console.log(" ⚠️ Esperando interacción del usuario para activar audio...");
    });
}
document.addEventListener('click', desbloquearAudio);
document.addEventListener('touchstart', desbloquearAudio);

function sonarAlerta() {
    if (!audioDesbloqueado) {
        console.warn(" 🔇 Audio pendiente de desbloqueo (Toca la pantalla).");
        return;
    }
    audioNotificacion.currentTime = 0;
    audioNotificacion.play().catch(e => console.log(" 🔊 Alerta visual: Audio bloqueado por el navegador.", e));
}

// ======================================================
// 📄 CARGADOR DINÁMICO DE PDF
// ======================================================
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

console.log(" 🚀 FIXGO 5.7: Sistema Full Logic Iniciado.");

// ======================================================
// 1. PANEL DE ADMINISTRADOR (Torre de Control)
// ======================================================
export async function iniciarPanelAdmin(user) {
    const elementos = {
        lista: document.getElementById("listaTecnicos"),
        actividad: document.getElementById("listaTransacciones"),
        countServ: document.querySelector(".fa-bolt")?.closest(".uber-card")?.querySelector("h3"),
        countMoney: document.querySelector(".fa-wallet")?.closest(".uber-card")?.querySelector("h3"),
        countOnline: document.getElementById("totalTecnicos")
    };

    // 1.A. GESTIÓN DE TÉCNICOS
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
                if(data.disponible) contOnline++;

                const esPendiente = (data.estado || "pendiente") === "pendiente";
                const ineCheck = data.documentos?.ine ? '<span class="text-emerald-400">✅ INE</span>' : '<span class="text-red-500">❌ INE</span>';
                const csfCheck = data.documentos?.csf ? '<span class="text-emerald-400">✅ CSF</span>' : '<span class="text-red-500">❌ CSF</span>';
                
                // Mostrar Skills
                const skillsStr = data.skills ? data.skills.join(", ").toUpperCase() : "GENERAL";

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
                            <p class="text-[9px] text-blue-400 font-bold mt-1">SKILLS: ${skillsStr}</p>
                            <div class="mt-2 text-[10px] bg-black/20 p-1 rounded inline-block border border-white/5">
                                ${ineCheck} | ${csfCheck}
                            </div>
                            <div class="mt-1">${estadoDot}</div>
                        </div>
                        <div class="flex flex-col gap-2">
                            ${esPendiente ? `
                                <button class="bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs px-3 py-2 rounded shadow-lg transition-transform hover:scale-105" onclick="window.aprobarTecnico('${docSnap.id}')">
                                    APROBAR ACCESO
                                </button>
                            ` : `<i class="fas fa-check-circle text-emerald-800 text-2xl"></i>`}
                        </div>
                    </div>
                `;
                elementos.lista.appendChild(card);
            });

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
            if (!["finalizado", "cancelado"].includes(data.estado)) activos++;

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
                    </div>
                `;
                elementos.actividad.appendChild(item);
            }
        });

        if(elementos.countServ) {
            elementos.countServ.innerText = activos;
            elementos.countServ.style.color = activos > 0 ? "#34d399" : "white";
        }
    });

    // 1.C. MONITOREO DE FINANZAS REALES (Colección Transacciones)
    const qFinanzas = query(collection(db, "transacciones"));
    onSnapshot(qFinanzas, (snap) => {
        let totalComision = 0;
        snap.forEach(doc => {
            totalComision += (doc.data().comision_fixgo || 0);
        });
        if(elementos.countMoney) {
            elementos.countMoney.innerText = `$${totalComision.toFixed(2)}`;
        }
    });

    // Funciones Admin Globales
    window.aprobarTecnico = async (uid) => {
        if(!confirm("¿Estás seguro de aprobar a este técnico?")) return;
        try {
            await updateDoc(doc(db, "users", uid), {
                estado: "activo",
                status: "activo",
                verificado: true,
                aprobadoEn: serverTimestamp()
            });
            alert("✅ Técnico Aprobado.");
        } catch (error) {
            console.error(error);
            alert("Error al aprobar.");
        }
    };

    // --- NUEVO: GESTIÓN DE CATÁLOGO ---
    window.abrirGestorCatalogo = async () => {
        const modal = document.getElementById("modalCatalogo");
        const container = document.getElementById("gridConfiguracion");
        modal.classList.remove("hidden");
        
        const docRef = doc(db, "configuracion", "catalogo_global");
        const docSnap = await getDoc(docRef); 
        let config = { road: true, fix: true, tech: true };
        if(docSnap.exists()) config = docSnap.data();

        container.innerHTML = `
            ${generarSwitch("road", "ROAD (Vial)", config.road)}
            ${generarSwitch("fix", "FIX (Hogar)", config.fix)}
            ${generarSwitch("tech", "TECH (Sistemas)", config.tech)}
        `;
    };

    window.guardarConfiguracionGlobal = async () => {
        const nuevaConfig = {
            road: document.getElementById("cfg_road").checked,
            fix: document.getElementById("cfg_fix").checked,
            tech: document.getElementById("cfg_tech").checked,
            updatedAt: serverTimestamp()
        };
        await setDoc(doc(db, "configuracion", "catalogo_global"), nuevaConfig);
        alert("✅ Catálogo actualizado. Clientes verán cambios al instante.");
        document.getElementById("modalCatalogo").classList.add("hidden");
    };
}

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
        btnLlegue: document.getElementById("btnLlegue")
    };

    const tecnicoRef = doc(db, "users", user.uid);
    onSnapshot(tecnicoRef, (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        const estado = data.estado || "pendiente";

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
                elementos.seccionBolsa.innerHTML = `<div class="p-6 bg-yellow-900/10 border border-yellow-500/30 rounded-2xl text-center"><p class="text-yellow-500 font-bold">Cuenta en Revisión</p></div>`;
            }
            return;
        }

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
            elementos.radarSection?.classList.add("opacity-50", "grayscale");
        }
    });

    if (elementos.toggleONOFF) {
        elementos.toggleONOFF.addEventListener("change", async (e) => {
            await updateDoc(tecnicoRef, { disponible: e.target.checked, last_seen: serverTimestamp() });
        });
    }

    // 2.B. BOLSA DE TRABAJO
    function escucharBolsa(tecnico, contenedor) {
        if(!contenedor) return;
        const q = query(collection(db, "services"), where("estado", "==", "pendiente"), orderBy("created_at", "desc"));
        
        onSnapshot(q, (snap) => {
            contenedor.innerHTML = "";
            if(snap.empty) {
                contenedor.innerHTML = `<p class="text-gray-600 text-[10px] text-center italic py-4">Escaneando zona... esperando solicitudes.</p>`;
                return;
            }
            if(snap.docChanges().some(change => change.type === 'added')) {
                console.log(" 🔔 Nueva solicitud detectada");
                sonarAlerta();
            }
            snap.forEach((docSnap) => {
                const s = docSnap.data();
                
                // FILTRO DE SKILLS: Si el técnico no tiene el skill, no ve el servicio
                const misSkills = tecnico.skills || [];
                // Si la categoría del servicio no está en mis skills, lo salto (a menos que no tenga categoría definida)
                if (s.categoria && !misSkills.includes(s.categoria) && misSkills.length > 0) return;

                const card = document.createElement("div");
                card.className = "bg-zinc-900 border border-zinc-700 p-4 rounded-xl mb-3 animate-pulse border-emerald-500 shadow-lg shadow-emerald-900/20";
                card.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <span class="bg-emerald-500 text-black text-[10px] font-black px-2 py-0.5 rounded uppercase">NUEVA SOLICITUD</span>
                        <span class="text-white font-bold text-xs">${s.categoria ? s.categoria.toUpperCase() : 'GENERAL'}</span>
                    </div>
                    <h4 class="text-white font-bold text-base mb-1">${s.zona || 'Cancún'}</h4>
                    <p class="text-gray-300 text-sm mb-3 font-medium italic">"${s.descripcion}"</p>
                    <button class="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 rounded-lg text-xs uppercase" 
                        onclick="window.tomarServicio('${docSnap.id}', '${tecnico.uid}', '${tecnico.nombre}')">
                        ACEPTAR (BLOQUEAR $550)
                    </button>
                `;
                contenedor.appendChild(card);
            });
        });
    }

    // --- FUNCIÓN TOMAR SERVICIO (CON BLOQUEO V5.7) ---
    window.tomarServicio = async (id, uid, nombre) => {
        // 1. LOCKING: Verificar si ya tiene servicio activo
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
        } catch (error) {
            console.error(error);
            alert("Error: El servicio ya fue tomado o hubo un problema de conexión.");
        }
    };

    // 2.C. FLUJO ACTIVO
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

        if (snap.empty) {
            if(pa) pa.classList.add("translate-y-full");
            return;
        }
        if(pa) pa.classList.remove("translate-y-full");
        
        snap.forEach((docSnap) => {
            const s = docSnap.data();
            const id = docSnap.id;
            const destinoWaze = s.coords ? `${s.coords.lat},${s.coords.lng}` : encodeURIComponent(s.direccion);

            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-blue-500/50 p-6 rounded-2xl relative overflow-hidden mb-4 shadow-xl";
            card.innerHTML = `
                <div class="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase">${s.estado.replace('_', ' ')}</div>
                <h3 class="text-xl font-black text-white mb-1 uppercase">${s.categoria}</h3>
                <p class="text-gray-400 text-sm mb-4"><i class="fas fa-map-marker-alt text-blue-500"></i> ${s.direccion}</p>
                <div class="bg-black/50 p-4 rounded-xl mb-4">
                    <p class="text-xs text-gray-500 uppercase font-bold mb-1">Problema:</p>
                    <p class="text-sm text-white italic">"${s.descripcion}"</p>
                </div>
                <div class="flex gap-2">
                    <a href="https://waze.com/ul?q=${destinoWaze}" target="_blank" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-center text-sm">
                        <i class="fab fa-waze"></i> WAZE
                    </a>
                    <a href="tel:${s.cliente_telefono}" class="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 px-4 rounded-xl text-center">
                        <i class="fas fa-phone"></i>
                    </a>
                </div>
            `;
            ls.appendChild(card);

            const btn1 = elementos.btnEnCamino;
            const btn2 = elementos.btnLlegue;
            btn1.classList.add("hidden");
            btn2.classList.add("hidden");

            if (s.estado === "asignado") {
                btn1.classList.remove("hidden");
                btn1.innerText = "VOY EN CAMINO";
                btn1.onclick = () => actualizarEstado(id, "en_camino");
            } else if (s.estado === "en_camino") {
                btn2.classList.remove("hidden");
                btn2.innerText = "YA LLEGUÉ AL SITIO";
                btn2.onclick = () => actualizarEstado(id, "en_sitio");
            } else if (s.estado === "en_sitio") {
                btn2.classList.remove("hidden");
                btn2.innerText = "INICIAR COTIZACIÓN";
                btn2.className = "w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => mostrarModalCotizacion(id);
            } else if (s.estado === "cotizando") {
                btn2.classList.remove("hidden");
                btn2.innerText = "ESPERANDO AL CLIENTE...";
                btn2.disabled = true;
                btn2.className = "w-full bg-zinc-700 text-gray-400 font-bold py-4 rounded-xl cursor-not-allowed flex items-center justify-center gap-2";
            } else if (s.estado === "trabajando") {
                btn2.classList.remove("hidden");
                btn2.innerText = "📸 FINALIZAR Y EVIDENCIA";
                btn2.disabled = false;
                btn2.className = "w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-lg flex items-center justify-center gap-2 shadow-lg";
                btn2.onclick = () => mostrarModalEvidencia(id);
            }
        });
    });

    async function actualizarEstado(id, estado, extras = {}) {
        try {
            await updateDoc(doc(db, "services", id), { estado: estado, ...extras });
            let textoMapa = "En Ruta";
            if(estado === "en_sitio") textoMapa = "En Sitio";
            if(estado === "trabajando") textoMapa = "Trabajando";
            if(estado === "finalizado") textoMapa = "Disponible";
            
            const rastreoRef = doc(db, "rastreo", "tecnicoActivo");
            await setDoc(rastreoRef, { estado: textoMapa }, { merge: true });
        } catch (error) {
            console.error(error);
            alert("Error actualizando estado.");
        }
    }

    // MODAL EVIDENCIA (CON LÓGICA FINANCIERA 32%)
    function mostrarModalEvidencia(id) {
        if(document.getElementById("modalEvidencia")) return;
        const html = `
            <div id="modalEvidencia" class="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl">
                    <h3 class="text-white font-black text-xl mb-4 text-center">REPORTE FINAL OBLIGATORIO</h3>
                    <p class="text-gray-400 text-xs mb-6 text-center">Para liberar el pago, sube la evidencia.</p>
                    <div class="space-y-4">
                        <div class="bg-black p-4 rounded-xl border border-zinc-800 text-center">
                            <label class="block text-xs font-bold text-emerald-500 mb-2 uppercase">FOTO DEL ANTES</label>
                            <input type="file" id="fileAntes" accept="image/*" class="text-xs text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-zinc-800 file:text-white">
                        </div>
                        <div class="bg-black p-4 rounded-xl border border-zinc-800 text-center">
                            <label class="block text-xs font-bold text-emerald-500 mb-2 uppercase">FOTO DEL DESPUÉS</label>
                            <input type="file" id="fileDespues" accept="image/*" class="text-xs text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-zinc-800 file:text-white">
                        </div>
                    </div>
                    <div class="flex gap-3 mt-8">
                        <button onclick="document.getElementById('modalEvidencia').remove()" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm">CANCELAR</button>
                        <button id="btnSubirEvidencia" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black py-3 rounded-xl font-black text-sm">ENVIAR Y CERRAR</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById("btnSubirEvidencia").onclick = async () => {
            const f1 = document.getElementById("fileAntes").files[0];
            const f2 = document.getElementById("fileDespues").files[0];
            if(!f1 || !f2) { alert("⚠️ Ambas fotos son obligatorias."); return; }

            const btn = document.getElementById("btnSubirEvidencia");
            btn.innerText = "PROCESANDO...";
            btn.disabled = true;

            try {
                const b64_1 = await toBase64(f1);
                const b64_2 = await toBase64(f2);
                
                // OBTENER COSTOS PARA CÁLCULO DE COMISIÓN
                const servicioSnap = await getDoc(doc(db, "services", id));
                const servicioData = servicioSnap.data();
                const costoTotal = servicioData.costo_final || 0;
                const comisionPlataforma = costoTotal * 0.32;
                const gananciaTecnico = costoTotal - comisionPlataforma;

                // 1. ACTUALIZAR SERVICIO
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

                // 2. REGISTRAR TRANSACCIÓN FINANCIERA
                await addDoc(collection(db, "transacciones"), {
                    servicio_id: id,
                    tecnico_id: user.uid,
                    monto_total: costoTotal,
                    comision_fixgo: comisionPlataforma,
                    pago_tecnico: gananciaTecnico,
                    fecha: serverTimestamp(),
                    tipo: "ingreso_servicio"
                });

                document.getElementById("modalEvidencia").remove();
                alert("✅ ¡Servicio Cerrado! Comisión registrada.");
            } catch (e) {
                console.error(e);
                alert("Error al subir evidencia.");
                btn.innerText = "REINTENTAR";
                btn.disabled = false;
            }
        };
    }

    function mostrarModalCotizacion(id) {
        if(document.getElementById("modalCot")) return;
        const html = `
            <div id="modalCot" class="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-zinc-900 w-full max-w-md rounded-3xl p-6 border border-zinc-700 shadow-2xl">
                    <h3 class="text-white font-black text-xl mb-1 text-center">COTIZAR SERVICIO</h3>
                    <p class="text-gray-500 text-xs mb-6 text-center">El cliente debe aprobar este monto.</p>
                    <div class="space-y-4">
                        <div>
                            <label class="text-[10px] font-bold text-emerald-500 uppercase ml-1">Diagnóstico Técnico</label>
                            <input id="inDiag" class="w-full bg-black p-4 text-white rounded-xl text-sm border border-zinc-700 focus:border-emerald-500 outline-none" placeholder="Ej: Cambio de capacitor...">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-emerald-500 uppercase ml-1">Costo Total Final ($MXN)</label>
                            <input id="inCosto" type="number" class="w-full bg-black p-4 text-white rounded-xl text-2xl font-bold border border-zinc-700 focus:border-emerald-500 outline-none" placeholder="0.00">
                        </div>
                    </div>
                    <div class="flex gap-2 mt-8">
                        <button onclick="document.getElementById('modalCot').remove()" class="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-bold text-sm">CANCELAR</button>
                        <button id="btnEnviarCot" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-sm">ENVIAR A CLIENTE</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        document.getElementById("btnEnviarCot").onclick = async () => {
            const diag = document.getElementById("inDiag").value;
            const costo = document.getElementById("inCosto").value;
            if(!diag || !costo) return alert("⚠️ Llena diagnóstico y costo.");
            await actualizarEstado(id, "cotizando", {
                diagnostico: diag,
                costo_final: parseFloat(costo),
                cotizado_at: serverTimestamp()
            });
            document.getElementById("modalCot").remove();
            alert("⏳ Cotización enviada. Esperando cliente...");
        };
    }
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
        // El grid se llenará dinámicamente ahora
    };

    // 1. CARGA DINÁMICA DE SERVICIOS (CATÁLOGO V5.7)
    async function cargarServiciosCliente(contenedorID) {
        const container = document.getElementById(contenedorID);
        if(!container) return;

        onSnapshot(doc(db, "configuracion", "catalogo_global"), (docSnap) => {
            const config = docSnap.exists() ? docSnap.data() : { road: true, fix: true, tech: true };
            container.innerHTML = ""; 
            const servicios = [
                { id: 'road', icon: 'fa-car-crash', color: 'yellow', label: 'ROAD', sub: 'Auxilio Vial' },
                { id: 'fix', icon: 'fa-tools', color: 'blue', label: 'FIX', sub: 'Hogar' },
                { id: 'tech', icon: 'fa-wifi', color: 'purple', label: 'TECH', sub: 'Sistemas' }
            ];

            servicios.forEach(s => {
                const activo = config[s.id];
                const opacity = activo ? 'opacity-100 cursor-pointer hover:scale-105' : 'opacity-40 cursor-not-allowed grayscale';
                const clickAction = activo ? `data-category="${s.id}" class="service-card uber-card p-4 rounded-2xl flex flex-col items-center justify-center text-center gap-2 ${opacity}"` : `class="uber-card p-4 rounded-2xl flex flex-col items-center justify-center text-center gap-2 ${opacity}"`;
                
                const html = `
                <div ${clickAction}>
                    <div class="bg-${s.color}-500/20 p-3 rounded-full text-${s.color}-500">
                        <i class="fas ${s.icon} text-xl"></i>
                    </div>
                    <div>
                        <h3 class="font-black text-sm">${s.label}</h3>
                        <p class="text-[10px] text-gray-500">${activo ? s.sub : 'PRÓXIMAMENTE'}</p>
                    </div>
                </div>`;
                
                const div = document.createElement('div');
                div.innerHTML = html;
                const card = div.firstElementChild;
                
                if(activo) {
                    card.addEventListener("click", () => {
                        document.querySelectorAll(".service-card").forEach(c => c.classList.remove("border-emerald-500", "bg-zinc-800"));
                        card.classList.add("border-emerald-500", "bg-zinc-800");
                        if(el.inputCat) el.inputCat.value = s.id;
                        if(el.labelServicio) el.labelServicio.innerText = s.label;
                    });
                }
                container.appendChild(card);
            });
        });
    }

    cargarServiciosCliente('gridServicios'); // Iniciar carga

    if (el.form) {
        el.form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const cat = el.inputCat.value;
            const dir = el.form.querySelector('[name="direccion"]').value;
            const desc = el.form.querySelector('[name="descripcion"]').value;
            if (!cat) { alert("⚠️ Selecciona un servicio."); return; }
            
            const btn = el.form.querySelector("button");
            const textoOriginal = btn.innerText;
            btn.disabled = true;
            btn.innerText = "OBTENIENDO UBICACIÓN...";

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                        await enviarSolicitudFinal(cat, dir, desc, { lat: pos.coords.latitude, lng: pos.coords.longitude });
                    },
                    async (err) => {
                        console.warn("GPS Cliente no disponible:", err);
                        await enviarSolicitudFinal(cat, dir, desc, null);
                    },
                    { timeout: 5000, enableHighAccuracy: true }
                );
            } else {
                await enviarSolicitudFinal(cat, dir, desc, null);
            }

            async function enviarSolicitudFinal(categoria, direccion, descripcion, coords) {
                if(confirm("Se realizará una retención de garantía ($550 MXN).\n\n¿Autorizar?")) {
                    try {
                        await addDoc(collection(db, "services"), {
                            cliente_id: user.uid,
                            cliente_nombre: user.nombre || "Cliente",
                            cliente_telefono: user.telefono || "",
                            categoria: categoria,
                            direccion: direccion,
                            descripcion: descripcion,
                            estado: "pendiente",
                            created_at: serverTimestamp(),
                            retencion_inicial: 550,
                            costo_final: 0,
                            coords: coords
                        });
                        alert("✅ ¡Solicitud Enviada! Buscando técnico...");
                        el.form.reset();
                        document.querySelectorAll(".service-card").forEach(c => c.classList.remove("border-emerald-500", "bg-zinc-800"));
                        if(el.labelServicio) el.labelServicio.innerText = "SERVICIO";
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

    onSnapshot(query(collection(db, "services"), where("cliente_id", "==", user.uid), orderBy("created_at", "desc")), (snap) => {
        if(!el.lista) return;
        el.lista.innerHTML = "";
        if(snap.docChanges().some(change => change.type === 'modified')) {
            console.log(" 🔔 Actualización de servicio");
            sonarAlerta();
        }
        snap.forEach(docSnap => {
            const s = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement("div");
            card.className = "bg-zinc-900 border border-white/10 p-4 rounded-xl mb-3";
            
            let contenido = `<span class="text-xs font-bold text-yellow-500 animate-pulse">🔎 BUSCANDO TÉCNICO...</span>`;
            if (s.estado !== "pendiente") contenido = `<span class="text-xs font-bold text-blue-400">${s.estado.toUpperCase().replace('_', ' ')}</span>`;

            if (s.estado === "cotizando") {
                contenido = `
                    <div class="bg-zinc-800 p-4 rounded-lg border border-yellow-500 mt-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="text-yellow-500 text-xs font-bold uppercase">Requiere Aprobación</p>
                                <p class="text-white text-2xl font-black mt-1">$${s.costo_final}</p>
                            </div>
                            <i class="fas fa-file-invoice-dollar text-yellow-500 text-2xl"></i>
                        </div>
                        <p class="text-gray-400 text-xs italic mt-2 border-t border-white/10 pt-2">"${s.diagnostico}"</p>
                        <div class="flex gap-2 mt-4">
                            <button onclick="window.responderCotizacion('${id}', false)" class="flex-1 bg-red-900/50 hover:bg-red-900 text-red-200 text-xs py-3 rounded-lg font-bold">RECHAZAR</button>
                            <button onclick="window.responderCotizacion('${id}', true)" class="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs py-3 rounded-lg">APROBAR COSTO</button>
                        </div>
                    </div>`;
            } else if (s.estado === "finalizado") {
                const safeData = encodeURIComponent(JSON.stringify({...s, id: id}));
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
                        <p class="text-[9px] text-gray-500 mb-2 font-bold uppercase">EVIDENCIA:</p>
                        <div class="flex gap-2 mb-4">
                            ${s.evidencia?.antes ? `<div class="relative w-1/2 h-20"><img src="${s.evidencia.antes}" class="w-full h-full object-cover rounded-lg border border-zinc-700"></div>` : ''}
                            ${s.evidencia?.despues ? `<div class="relative w-1/2 h-20"><img src="${s.evidencia.despues}" class="w-full h-full object-cover rounded-lg border border-zinc-700"></div>` : ''}
                        </div>
                        <button onclick="window.generarPDF('${safeData}')" class="w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs py-3 rounded-lg font-bold border border-white/10 flex items-center justify-center gap-2">
                            <i class="fas fa-file-download text-red-500"></i> DESCARGAR REPORTE FISCAL
                        </button>
                    </div>`;
            }
            card.innerHTML = `
                <div class="flex justify-between items-center mb-1">
                    <span class="font-black text-white uppercase tracking-tight">${s.categoria}</span>
                    <span class="text-[10px] text-gray-500">${new Date(s.created_at?.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <p class="text-xs text-gray-400 truncate mb-2"><i class="fas fa-map-marker-alt text-zinc-600"></i> ${s.direccion}</p>
                <div class="mt-2">${contenido}</div>
                ${(s.estado === 'en_camino' || s.estado === 'en_sitio') ? `<a href="rastreo.html?id=${id}" class="block mt-3 text-center bg-blue-600/20 text-blue-400 text-xs py-2.5 rounded-lg border border-blue-500/30 font-bold">SEGUIR TÉCNICO EN VIVO</a>` : ''}
            `;
            el.lista.appendChild(card);
        });
    });

    window.responderCotizacion = async (id, aceptado) => {
        if (aceptado) {
            await updateDoc(doc(db, "services", id), { estado: "trabajando" });
            alert("✅ Costo aprobado. Trabajando...");
        } else {
            if(confirm("⚠️ ¿Cancelar? Se cobrará visita mínima ($550).")) {
                await updateDoc(doc(db, "services", id), {
                    estado: "cancelado",
                    costo_final: 550,
                    cancelado_razon: "Cliente rechazó cotización"
                });
            }
        }
    };

    window.generarPDF = async (encodedData) => {
        const data = JSON.parse(decodeURIComponent(encodedData));
        const btn = document.activeElement;
        const textoOrig = btn.innerText;
        btn.innerText = "GENERANDO...";

        try {
            const { jsPDF } = await cargarLibreriaPDF();
            const doc = new jsPDF();
            
            doc.setFillColor(18, 18, 18);
            doc.rect(0, 0, 215, 40, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(24);
            doc.text("FIXGO", 20, 22);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(16, 185, 129);
            doc.text("MÉXICO", 60, 22);

            doc.setTextColor(200, 200, 200);
            doc.setFontSize(10);
            doc.text("Comprobante de Servicio Digital", 20, 32);
            
            // DATOS FISCALES SIMULADOS (V5.7)
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`RFC EMISOR: FXG260211-H8A`, 20, 45);
            doc.text(`RÉGIMEN: 626 - Simplificado de Confianza`, 20, 50);
            doc.text(`LUGAR: 77500, Cancún, Q.Roo`, 20, 55);
            if(data.folio_fiscal) doc.text(`FOLIO FISCAL: ${data.folio_fiscal}`, 150, 45);

            let y = 70;
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("DETALLES", 20, y);
            y += 10;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Cliente: ${data.cliente_nombre}`, 20, y);
            doc.text(`Categoría: ${data.categoria.toUpperCase()}`, 120, y);
            y += 8;
            doc.text(`Ubicación: ${data.direccion}`, 20, y);
            
            y += 20;
            doc.setFont("helvetica", "bold");
            doc.text("COSTOS", 20, y);
            y += 10;
            doc.setFont("helvetica", "normal");
            doc.text(data.diagnostico || "Sin observaciones.", 20, y);
            
            y += 20;
            doc.setFillColor(245, 245, 245);
            doc.rect(120, y, 70, 40, 'F');
            doc.text("IMPORTE TOTAL:", 125, y + 10);
            
            // Desglose fiscal si existe
            if (data.desglose) {
                doc.setFontSize(8);
                doc.text(`Subtotal: $${data.desglose.subtotal}`, 125, y + 18);
                doc.text(`IVA (16%): $${data.desglose.iva}`, 125, y + 23);
            }

            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.setTextColor(16, 185, 129);
            doc.text(`$${data.costo_final} MXN`, 125, y + 35);

            y += 60;
            if(data.evidencia?.antes) {
                try { doc.addImage(data.evidencia.antes, "JPEG", 20, y, 80, 60); } catch(e){}
            }
            if(data.evidencia?.despues) {
                try { doc.addImage(data.evidencia.despues, "JPEG", 110, y, 80, 60); } catch(e){}
            }

            doc.save(`FixGo_Reporte_${data.id}.pdf`);
            btn.innerText = "DESCARGAR REPORTE";
        } catch (error) {
            console.error(error);
            alert("Error generando PDF.");
            btn.innerText = "REINTENTAR";
        }
    };
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});
