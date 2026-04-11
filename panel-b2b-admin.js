/**
 * =====================================================
 * GESTIA PREMIUM - NOC B2B CABINA DE MANDO
 * VERSION: 5.30 (Push Centralizado & Secure)
 * Lead Architect: Heberto Mendoza
 * =====================================================
 */

import { 
    auth, db, doc, getDoc, onSnapshot, collection, 
    addDoc, updateDoc, deleteDoc, serverTimestamp, 
    query, where, orderBy, limit, setDoc, app 
} from "./firebase.js";

import { 
    initializeApp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import { 
    getAuth, createUserWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 🔥 CABLE DEL MEGÁFONO: Importamos mensajería para el Admin
import { 
    getMessaging 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

let adminContext = null;

/* =====================================================
    UTILIDADES DE INTERFAZ (UI)
   ===================================================== */
/**
 * Implementación de feedback visual para evitar ReferenceError
 */
function showToast(mensaje, esError = false) {
    console.log(`[Toast] ${esError ? '❌' : '✅'} ${mensaje}`);
    
    // Crear el elemento si no existe en el DOM
    let toastContainer = document.getElementById("toast-container");
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "toast-container";
        toastContainer.className = "fixed bottom-5 right-5 z-[1000] space-y-2";
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement("div");
    toast.className = `px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl border transition-all duration-500 transform translate-y-10 opacity-0 ${
        esError 
        ? "bg-red-500 text-white border-red-400" 
        : "bg-emerald-500 text-black border-emerald-400"
    }`;
    toast.innerText = mensaje;

    toastContainer.appendChild(toast);

    // Animación de entrada
    setTimeout(() => {
        toast.classList.remove("translate-y-10", "opacity-0");
    }, 100);

    // Auto-destrucción
    setTimeout(() => {
        toast.classList.add("translate-y-10", "opacity-0");
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}
/* =====================================================
    MÓDULO: DESPACHO TÁCTICO B2B (PUSH CENTRALIZADO REAL)
    REWRITE v5.31
    Arquitectura: FCM Direct Push + Cola de Auditoría
    ===================================================== */

async function enviarPushEmergenciaB2B(tokenDestino, equipo, descripcion) {

    console.log("📡 Preparando señal de radio para despacho...");

    /* =====================================================
        VALIDACIÓN DE SEGURIDAD
        ===================================================== */

    if (!tokenDestino || tokenDestino.length < 20) {
        console.warn("⚠️ Abortando Push: Token de destino inexistente o inválido.");
        return false;
    }

    try {

        /* =====================================================
            1. REGISTRO DE AUDITORÍA (FIRESTORE)
            ===================================================== */

        const notificacionPayload = {
            token: tokenDestino,
            titulo: equipo,
            mensaje: descripcion,
            prioridad: "alta",
            origen: "NOC_B2B_CABINA",
            status: "ready",
            timestamp: serverTimestamp(),
            audit_user: auth.currentUser?.uid || "sistema"
        };

        await addDoc(
            collection(db, "notificaciones_pendientes"),
            notificacionPayload
        );

        /* =====================================================
            2. PUSH DIRECTO VIA FIREBASE CLOUD MESSAGING
            ===================================================== */

        const pushBody = {
            message: {
                token: tokenDestino,
                notification: {
                    title: equipo,
                    body: descripcion
                },
                data: {
                    tipo: "orden_trabajo",
                    prioridad: "alta",
                    origen: "gestia_noc"
                },
                webpush: {
                    notification: {
                        icon: "/assets/icono-192.png",
                        badge: "/assets/icono-72.png",
                        vibrate: [200,100,200],
                        requireInteraction: true
                    }
                }
            }
        };

        /* =====================================================
            3. ENVÍO A LA API HTTP V1 DE FCM
            ===================================================== */

        const response = await fetch(
            "https://fcm.googleapis.com/v1/projects/fixgo-44e4d/messages:send",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // Este token debe generarse en backend seguro
                    // aquí solo se mantiene compatibilidad
                    "Authorization": "Bearer " + (window.GESTIA_FCM_SERVER_KEY || "")
                },
                body: JSON.stringify(pushBody)
            }
        );

        if (!response.ok) {

            const errorText = await response.text();
            console.error("❌ Error FCM:", errorText);

            showToast("Push en cola, esperando backend", true);

            return false;
        }

        console.log("📡 Push enviado correctamente vía FCM");

        showToast("Señal enviada al radio del técnico");

        return true;

    } catch (error) {

        console.error("❌ Error en Despacho B2B:", error);

        showToast("Falla en la antena de despacho", true);

        return false;
    }
}
/* =====================================================
    ESTADO GLOBAL & RED (V5.18 - Refactored)
   ===================================================== */

// 1. Inicialización de estado basada en la realidad del navegador
let isOnline = navigator.onLine;

/**
 * Centraliza la actualización de la interfaz y la lógica de red
 * @param {boolean} onlineStatus - El estado actual de la conexión
 */
const actualizarInterfazRed = (onlineStatus) => {
    isOnline = onlineStatus;
    const badge = document.getElementById("networkBadge");

    if (badge) {
        if (isOnline) {
            badge.innerText = "ONLINE";
            badge.className = "badge-online";
            
            // Disparar sincronización solo si hay contexto de edificio
            if (adminContext?.edificioId) {
                console.log(`[Red] Conectado. Sincronizando edificio: ${adminContext.edificioId}`);
                sincronizarHistorialConFirestore(adminContext.edificioId);
            }
        } else {
            badge.innerText = "OFFLINE";
            badge.className = "badge-offline";
            console.warn("[Red] El dispositivo está fuera de línea.");
        }
    }
};

// 2. Listeners de eventos de red
window.addEventListener("online", () => actualizarInterfazRed(true));
window.addEventListener("offline", () => actualizarInterfazRed(false));

// 3. Ejecución inmediata al cargar para asegurar que el badge sea correcto desde el inicio
actualizarInterfazRed(navigator.onLine);

/* =====================================================
    INDEXED DB CACHE ENGINE
   ===================================================== */
const DB_NAME = "gestia_cache";
const DB_VERSION = 2; 
let localDB;

function initLocalDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("tareas")) {
                db.createObjectStore("tareas", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("historial")) {
                db.createObjectStore("historial", { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("sync_queue")) {
                db.createObjectStore("sync_queue", { autoIncrement: true });
            }
            if (!db.objectStoreNames.contains("fotos_pendientes")) {
                db.createObjectStore("fotos_pendientes", { autoIncrement: true });
            }
        };

        request.onsuccess = e => {
            localDB = e.target.result;
            console.log("📦 Cache Engine Inicializado");
            resolve();
        };

        request.onerror = e => {
            console.error("❌ Error DB", e);
            reject(e);
        };
    });
}

function cacheGuardar(store, data) {
    return new Promise((resolve, reject) => {
        if(!localDB) return resolve();
        const tx = localDB.transaction(store, "readwrite");
        const objectStore = tx.objectStore(store);
        objectStore.put(data);
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}

function cacheLeerTodos(store) {
    return new Promise((resolve, reject) => {
        if(!localDB) return resolve([]);
        const tx = localDB.transaction(store, "readonly");
        const objectStore = tx.objectStore(store);
        const req = objectStore.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = reject;
    });
}

function cacheLimpiar(store) {
    return new Promise((resolve, reject) => {
        if(!localDB) return resolve();
        const tx = localDB.transaction(store, "readwrite");
        tx.objectStore(store).clear();
        tx.oncomplete = resolve;
        tx.onerror = reject;
    });
}

// ======================================================
// RELOJ EN TIEMPO REAL
// ======================================================
setInterval(() => {
    const clock = document.getElementById('clock');
    if(clock) clock.innerText = new Date().toLocaleTimeString('es-MX', { hour12: false });
}, 1000);

// ======================================================
// 4. RADAR DE PLANTILLA OPERATIVA - V5.23 (OPTIMIZADO FOTO)
// ======================================================
function escucharPlantillaRealTime(edificioId) {
    const q = query(
        collection(db, "users"),
        where("edificioId", "==", edificioId)
    );

    onSnapshot(q, (snap) => {
        const tabla = document.getElementById("tablaEmpleadosB2B");
        const select = document.getElementById("tickAsignado");

        if (!tabla) return;

        tabla.innerHTML = "";
        
        if(select) {
            select.innerHTML = '<option value="">-- Seleccionar Especialista --</option>';
        }

        let tecnicosActivos = 0;

        snap.forEach(docSnap => {
            const emp = docSnap.data();
            const empId = docSnap.id;

            if(emp.rol === "admin_b2b" || emp.rol === "ceo" || emp.rol === "admin") return;

            if (emp.rol === "tecnico" && emp.estado === "activo") {
                tecnicosActivos++;
                if(select) {
                    const opt = document.createElement("option");
                    opt.value = empId;
                    opt.textContent = `${(emp.nombre || 'SIN NOMBRE').toUpperCase()} [${(emp.especialidad || 'GENERAL').toUpperCase()}]`;
                    select.appendChild(opt);
                }
            }

            const row = document.createElement("tr");
            row.className = "hover:bg-white/[0.02] transition-all text-xs border-b border-white/5";
            
            const avatarHTML = emp.foto_perfil 
                ? `<img src="${emp.foto_perfil}" class="w-full h-full object-cover">`
                : `<div class="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-600">
                     <i class="fas fa-user-astronaut text-[10px]"></i>
                   </div>`;

            row.innerHTML = `
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full border border-white/10 overflow-hidden flex-shrink-0 bg-black shadow-inner">
                            ${avatarHTML}
                        </div>
                        
                        <div>
                            <div class="font-bold text-white uppercase tracking-tighter">
                                ${emp.nombre || 'Sin Nombre'}
                            </div>
                            <div class="text-[10px] text-zinc-400 font-bold uppercase italic">
                                ${emp.especialidad || 'General'}
                            </div>
                        </div>
                    </div>
                </td>
                
                <td class="p-4 text-center">
                    <span class="px-3 py-1 rounded-full text-[9px] font-black border ${
                        emp.estado === 'activo' 
                        ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5 shadow-[0_0_10px_rgba(16,185,129,0.05)]' 
                        : 'border-red-500/20 text-red-500 bg-red-500/5'
                    }">
                        ${(emp.estado || 'pendiente').toUpperCase()}
                    </span>
                </td>

                <td class="p-4 text-right">
                    <button onclick="window.verDetalleTecnico('${empId}')" class="text-zinc-600 hover:text-white transition-colors">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </td>
            `;
            tabla.appendChild(row);
        });

        const countLabel = document.getElementById("countTecnicosActivos");
        if (countLabel) {
            countLabel.innerText = tecnicosActivos;
            countLabel.classList.add("text-emerald-400");
            setTimeout(() => countLabel.classList.remove("text-emerald-400"), 1000);
        }
    });
}

/* =====================================================
    PERFIL DEL TÉCNICO (ID CARD EJECUTIVA B2B) + AUTO-DESCARGA
    Soluciona: ReferenceError verDetalleTecnico
   ===================================================== */

window.descargarCredencial = async (nombreTecnico) => {
    const credencial = document.getElementById('tarjetaCredencialB2B');
    const btnCerrar = document.getElementById('btnCerrarCredencial');
    const btnDescargar = document.getElementById('btnDescargarCredencial');

    // Ocultar botones temporalmente para que no salgan en la foto del plástico
    btnCerrar.style.display = 'none';
    btnDescargar.style.display = 'none';

    try {
        if(typeof html2canvas === 'undefined') {
            alert("Falta la librería html2canvas en el HTML.");
            return;
        }

        // Tomar la foto en Alta Resolución (scale: 2) ideal para impresión PVC
        const canvas = await html2canvas(credencial, {
            backgroundColor: '#0a0a0a', 
            scale: 2, 
            useCORS: true // Permite capturar las fotos desde el Storage de Firebase
        });

        // Crear el link de descarga invisible
        const link = document.createElement('a');
        link.download = `Gafete_${nombreTecnico.replace(/\s+/g, '_')}_GestiaPremium.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

        console.log("✅ Gafete descargado para impresión en PVC");

    } catch(e) {
        console.error("❌ Error al generar imagen de Gafete:", e);
        alert("Error al intentar generar el gafete para impresión.");
    } finally {
        // Restaurar botones a su estado original
        btnCerrar.style.display = 'block';
        btnDescargar.style.display = 'flex';
    }
};

window.verDetalleTecnico = async (tecnicoId) => {
    if (!tecnicoId) return;

    try {
        const docSnap = await getDoc(doc(db, "users", tecnicoId));
        
        if (!docSnap.exists()) {
            console.log("[Toast] ❌ El técnico no existe en la base de datos");
            return;
        }

        const data = docSnap.data();
        
        // Avatar fallback
        const avatarUrl = data.foto_perfil || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nombre || 'Tech')}&background=10b981&color=000&bold=true`;

        // Lógica de Flotilla (Vehículo y Placas)
        const vehiculo = data.tecnico_vehiculo && data.tecnico_vehiculo !== "N/A" ? data.tecnico_vehiculo : "Asignación Pendiente";
        const placas = data.tecnico_placas && data.tecnico_placas !== "N/A" ? data.tecnico_placas : "S/P";

        // Lógica de Skills Profesionales
        let skillsHTML = '';
        const especialidadBase = (data.especialidad || 'General').toUpperCase();
        
        // Si es Todólogo, le armamos un portafolio de skills pro
        if (especialidadBase === 'TDOLOGO' || especialidadBase === 'TODOLOGO') {
            skillsHTML = `
                <span class="px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md">⚡ ELÉCTRICO</span>
                <span class="px-2 py-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-md">❄️ HVAC</span>
                <span class="px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">🔧 PLOMERÍA</span>
                <span class="px-2 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-md">🏗️ CIVIL</span>
            `;
        } else {
            // Si tiene una sola especialidad
            skillsHTML = `<span class="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">🛠️ ${especialidadBase}</span>`;
        }

        const modalHTML = `
            <div id="modalPerfilTecnico" class="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 backdrop-blur-md overflow-y-auto" onclick="this.remove()">
                
                <div id="tarjetaCredencialB2B" class="bg-[#0a0a0a] border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden relative" onclick="event.stopPropagation()">

                    <div class="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-3 bg-black rounded-full border border-white/10 shadow-inner z-10"></div>

                    <div class="bg-gradient-to-b from-emerald-600 to-emerald-900 pt-8 pb-12 px-6 relative text-center border-b border-emerald-500/20">
                        <button id="btnCerrarCredencial" onclick="document.getElementById('modalPerfilTecnico').remove()" class="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
                            <i class="fas fa-times-circle text-xl"></i>
                        </button>
                        <p class="text-[8px] font-black text-emerald-100 uppercase tracking-[0.4em] mb-4 opacity-80">Credencial Operativa B2B</p>

                        <div class="w-28 h-28 mx-auto rounded-full border-4 border-[#0a0a0a] overflow-hidden bg-black shadow-2xl relative z-10">
                            <img src="${avatarUrl}" crossorigin="anonymous" class="w-full h-full object-cover">
                        </div>
                    </div>

                    <div class="px-6 pt-3 pb-6 -mt-8 relative z-20 text-center">
                        <h2 class="text-2xl font-black text-white italic uppercase tracking-tighter leading-none">${data.nombre || 'Sin Nombre'}</h2>
                        <p class="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1">${data.rol === 'tecnico' ? 'Ingeniero de Campo' : data.rol}</p>

                        <div class="flex flex-wrap justify-center gap-2 mt-4 text-[9px] font-black tracking-wider">
                            ${skillsHTML}
                        </div>
                    </div>

                    <div class="px-6 pb-6 space-y-3">
                        <div class="bg-zinc-900/80 p-3 rounded-xl border border-white/5 flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-lg">
                                <i class="fas fa-truck-pickup"></i>
                            </div>
                            <div class="flex-1">
                                <label class="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">Unidad Asignada</label>
                                <p class="text-xs font-bold text-white uppercase">${vehiculo}</p>
                            </div>
                            <div class="text-right">
                                <label class="text-[8px] font-black text-zinc-500 uppercase tracking-widest block">Placas</label>
                                <p class="text-xs font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">${placas}</p>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                            <div class="bg-zinc-900/80 p-3 rounded-xl border border-white/5">
                                <label class="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Contacto Radial</label>
                                <p class="text-[11px] font-bold text-white"><i class="fas fa-phone text-zinc-600 mr-1"></i> ${data.telefono || 'S/N'}</p>
                            </div>
                            <div class="bg-zinc-900/80 p-3 rounded-xl border border-white/5">
                                <label class="text-[8px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Estatus</label>
                                <p class="text-[11px] font-black uppercase ${data.estado === 'activo' ? 'text-emerald-500' : 'text-red-500'}">
                                    <i class="fas fa-circle text-[8px] mr-1"></i> ${data.estado || 'Desconocido'}
                                </p>
                            </div>
                        </div>

                        <div class="mt-4 flex flex-col items-center border-t border-white/5 pt-4 mb-2">
                            <i class="fas fa-barcode text-4xl text-zinc-600 opacity-50"></i>
                            <p class="text-[8px] text-zinc-600 font-mono tracking-[0.3em] mt-1">${data.uid ? data.uid.substring(0, 16).toUpperCase() : 'NO-ID-DETECTED'}</p>
                        </div>

                        <button id="btnDescargarCredencial" onclick="window.descargarCredencial('${data.nombre || 'Tecnico'}')" class="w-full bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white border border-emerald-500/30 transition-all rounded-xl py-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest">
                            <i class="fas fa-print"></i> Imprimir Gafete Oficial
                        </button>
                    </div>

                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

    } catch (error) {
        console.error("❌ Error al abrir detalle del técnico:", error);
        console.log("[Toast] ❌ Error de conexión con la base de datos");
    }
};
// ======================================================
// 5. CONTADORES DE DASHBOARD
// ======================================================
function conectarContadorTickets(edificioId) {
    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioId),
        where("status", "in", ["pendiente", "programado", "en_proceso"])
    );
    onSnapshot(q, (snap) => {
        const label = document.getElementById("countOrdenesPendientes");
        if (label) label.innerText = snap.size;
    });
}

function conectarContadorMantenimientosHoy(edificioId) {
    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioId),
        where("status", "in", ["pendiente", "programado", "en_proceso"])
    );
    onSnapshot(q, (snap) => {
        const label = document.getElementById("countMantenimientosHoy");
        if (label) label.innerText = snap.size;
    });
}

// ======================================================
// 6. SINCRONIZACIÓN Y FILTRO (CORREGIDO AL JSON REAL)
// ======================================================

async function sincronizarHistorialConFirestore(edificioId) {
    if (!isOnline) return;

    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioId),
        where("status", "==", "finalizado"),
        orderBy("fecha_cierre", "desc"),
        limit(20)
    );

    onSnapshot(q, async (snap) => {
        console.log(`🔄 NOC Sync: Procesando ${snap.size} servicios...`);
        
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const id = docSnap.id;
            
            if(!data.fecha_cierre) {
                console.warn("⚠️ Filtrando OT sin fecha de cierre:", id);
                continue;
            }

            const itemHistorial = {
                id: id,
                ...data,
                tipo: "OT",
                fecha_para_ordenar: data.fecha_cierre?.toDate() || new Date()
            };
            
            await cacheGuardar("historial", itemHistorial);
        }
        
        renderizarHistorialDesdeCache();
    });
}

async function renderizarHistorialDesdeCache() {
    const items = await cacheLeerTodos("historial");
    const feed = document.getElementById("feedBitacora");
    if (!feed) return;

    feed.innerHTML = "";

    const itemsValidos = items.filter(i => i.fecha_para_ordenar);

    if (itemsValidos.length === 0) {
        feed.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-30">
                <i class="fas fa-box-open text-2xl mb-2"></i>
                <p class="text-[10px] font-black uppercase tracking-widest">Sin reportes registrados</p>
            </div>`;
        return;
    }

    itemsValidos.sort((a, b) => new Date(b.fecha_para_ordenar) - new Date(a.fecha_para_ordenar));

    itemsValidos.forEach(log => {
        const d = new Date(log.fecha_para_ordenar);
        const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

        const nombreEquipoDisplay = log.equipo || log.descripcion || "Mantenimiento General";
        const nombreTecnicoDisplay = log.tecnico_nombre || "TÉCNICO DE CAMPO";

        const item = document.createElement("div");
        item.className = "bg-zinc-900 p-4 rounded-xl border border-white/5 mb-3 hover:border-emerald-500/30 transition-all";
        item.innerHTML = `
            <div class="flex justify-between items-start mb-1">
                <p class="text-[11px] font-black text-white uppercase tracking-tighter">${nombreTecnicoDisplay}</p>
                <span class="text-[10px] text-zinc-500 font-mono font-bold">${hora}</span>
            </div>
            <p class="text-[11px] text-zinc-400 mb-3">Servicio: <span class="text-zinc-200 font-bold uppercase">${nombreEquipoDisplay}</span></p>
            <button onclick="window.verDetalleBitacora('${log.id}')" class="text-[10px] font-black text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-widest">
                [ Abrir Expediente Técnico ]
            </button>
        `;
        feed.appendChild(item);
    });
}

/* =====================================================
    VISUALIZACIÓN DE REPORTE PROFESIONAL (MAPEADO EXACTO)
   ===================================================== */
window.verDetalleBitacora = async (servicioId) => {
    if (!servicioId) return;
    
    try {
        const items = await cacheLeerTodos("historial");
        let data = items.find(i => i.id === servicioId);

        if(!data) {
            const docSnap = await getDoc(doc(db, "servicios_b2b", servicioId));
            if (!docSnap.exists()) return alert("El reporte no existe en la nube.");
            data = docSnap.data();
        }

        let materialesHTML = '<p class="text-zinc-600 italic text-xs">No se registraron materiales en esta intervención.</p>';
        if (data.materiales_utilizados && data.materiales_utilizados.length > 0) {
            materialesHTML = `<div class="space-y-1">
                ${data.materiales_utilizados.map(m => `
                    <div class="flex justify-between text-[11px] bg-black/40 p-2 rounded-lg border border-white/5">
                        <span class="text-zinc-400 font-bold uppercase">${m.nombre}</span>
                        <span class="text-emerald-500 font-black">QTY: ${m.cantidad}</span>
                    </div>
                `).join('')}
            </div>`;
        }

        const fechaDisplay = data.fecha_cierre?.toDate ? data.fecha_cierre.toDate().toLocaleString('es-MX') : 'Finalizado recientemente';
        
        const equipoPrincipal = data.equipo || data.descripcion || "Mantenimiento General";
        const tecnicoResponsable = data.tecnico_nombre || "Técnico de Campo";
        const diagInicial = data.diagnostico_inicial || "Sin comentarios iniciales registrados.";
        const obsFinales = data.observaciones_finales || "Intervención completada sin novedades adicionales.";

        const modalHTML = `
            <div id="modalDetalle" class="fixed inset-0 bg-black/95 z-[500] flex items-center justify-center p-4 overflow-y-auto" onclick="this.remove()">
                <div class="bg-zinc-950 border border-emerald-500/30 w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden" onclick="event.stopPropagation()">
                    
                    <div class="bg-emerald-500 p-8 flex justify-between items-center">
                        <div class="max-w-[80%]">
                            <p class="text-[10px] font-black text-emerald-900 uppercase tracking-[0.4em] mb-1">Expediente de Mantenimiento</p>
                            <h2 class="text-2xl font-black text-black italic uppercase leading-tight truncate">${equipoPrincipal}</h2>
                        </div>
                        <button onclick="document.getElementById('modalDetalle').remove()" class="text-emerald-900 hover:scale-110 transition-transform">
                            <i class="fas fa-times-circle text-3xl"></i>
                        </button>
                    </div>

                    <div class="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                        
                        <div class="grid grid-cols-2 gap-6 border-b border-white/5 pb-6">
                            <div>
                                <label class="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Especialista Asignado</label>
                                <p class="text-sm font-black text-white uppercase">${tecnicoResponsable}</p>
                            </div>
                            <div class="text-right">
                                <label class="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Sello de Cierre</label>
                                <p class="text-sm font-black text-white uppercase">${fechaDisplay}</p>
                            </div>
                        </div>

                        <section>
                            <h4 class="text-[11px] font-black text-emerald-500 uppercase mb-4 flex items-center gap-2 tracking-widest">
                                <i class="fas fa-microscope"></i> 01. Diagnóstico de Entrada
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-zinc-900/40 p-5 rounded-3xl border border-white/5">
                                <div>
                                    <p class="text-xs text-zinc-400 leading-relaxed italic">"${diagInicial}"</p>
                                </div>
                                <div>
                                    <img src="${data.foto_antes || 'https://via.placeholder.com/400?text=SIN+FOTO'}" class="w-full aspect-video object-cover rounded-2xl border border-white/10 shadow-2xl">
                                </div>
                            </div>
                        </section>

                        <section>
                            <h4 class="text-[11px] font-black text-emerald-500 uppercase mb-4 flex items-center gap-2 tracking-widest">
                                <i class="fas fa-tools"></i> 02. Insumos Aplicados
                            </h4>
                            <div class="bg-zinc-900/40 p-5 rounded-3xl border border-white/5">
                                ${materialesHTML}
                            </div>
                        </section>

                        <section>
                            <h4 class="text-[11px] font-black text-emerald-500 uppercase mb-4 flex items-center gap-2 tracking-widest">
                                <i class="fas fa-check-circle"></i> 03. Reporte de Salida
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-zinc-900/40 p-5 rounded-3xl border border-white/5">
                                <div>
                                    <label class="text-[9px] font-black text-zinc-600 uppercase mb-2 block">Notas Finales:</label>
                                    <p class="text-xs text-zinc-300 leading-relaxed">${obsFinales}</p>
                                </div>
                                <div>
                                    <img src="${data.foto_despues || 'https://via.placeholder.com/400?text=SIN+FOTO'}" class="w-full aspect-video object-cover rounded-2xl border border-white/10 shadow-2xl">
                                </div>
                            </div>
                        </section>

                        <section class="border-t border-white/10 pt-8">
                            <div class="flex flex-col items-center justify-center bg-white p-6 rounded-3xl">
                                <p class="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-4 italic">Firma de Conformidad Digital</p>
                                <img src="${data.firma_conformidad || ''}" class="max-h-40">
                            </div>
                        </section>

                    </div>
                    
                    <div class="p-6 bg-zinc-900/50 text-center">
                        <button class="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em] hover:text-white transition-colors" onclick="document.getElementById('modalDetalle').remove()">
                            Cerrar Expediente
                        </button>
                    </div>

                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

    } catch (e) { 
        console.error("Error modal:", e); 
        alert("Error al cargar detalles del reporte.");
    }
};

// ======================================================
// 7. DASHBOARD DE AVANCE OPERATIVO
// ======================================================
function escucharAvanceRutina(edificioId) {
    const hoy = new Date().toISOString().split('T')[0];
    const dashboardRutinas = document.getElementById('dashboard-rutinas');
    if (!dashboardRutinas) return;

    const q = query(
        collection(db, "log_rutinas"),
        where("edificioId", "==", edificioId),
        where("fechaCompletado", "==", hoy)
    );

    onSnapshot(q, async (logSnapshot) => {
        const completadasHoyIds = new Set(logSnapshot.docs.map(d => d.data().tareaId));
        const rutinaSnap = await getDoc(doc(db, "config_rutinas", edificioId));

        if (!rutinaSnap.exists()) return;

        const rutinaMaster = rutinaSnap.data();
        const tareasDiarias = rutinaMaster.Diaria || []; 
        const totalTareas = tareasDiarias.length;
        
        let conteoCompletadas = 0;
        tareasDiarias.forEach(tarea => { 
            if (completadasHoyIds.has(tarea.id_tarea)) {
                conteoCompletadas++;
            }
        });

        const porcentaje = totalTareas > 0 ? Math.round((conteoCompletadas / totalTareas) * 100) : 0;

        dashboardRutinas.innerHTML = `
            <h4 class="text-[10px] font-black uppercase text-zinc-500 mb-6 tracking-widest flex items-center gap-2 italic">
                <i class="fas fa-chart-pie text-emerald-500"></i> Avance Infraestructura (Hoy)
            </h4>
            <div class="flex items-center gap-10">
                <div class="relative w-24 h-24">
                    <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path class="stroke-current text-zinc-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke-width="3"></path>
                        <path class="stroke-current text-emerald-500 transition-all duration-1000 ease-out" 
                            stroke-dasharray="${porcentaje}, 100" 
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                            fill="none" stroke-width="3" stroke-linecap="round"></path>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-2xl font-black text-white italic leading-none">${porcentaje}%</span>
                        <span class="text-[8px] text-zinc-500 font-black uppercase mt-1">Status</span>
                    </div>
                </div>
                <div class="space-y-2">
                    <p class="text-3xl font-black text-white italic tracking-tighter leading-none">${conteoCompletadas} / ${totalTareas}</p>
                    <p class="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Tareas Completadas</p>
                    <div class="flex gap-1.5 mt-4">
                        <div class="h-1.5 w-10 rounded-full ${porcentaje > 0 ? 'bg-emerald-500' : 'bg-zinc-800'}"></div>
                        <div class="h-1.5 w-10 rounded-full ${porcentaje > 50 ? 'bg-emerald-500' : 'bg-zinc-800'}"></div>
                        <div class="h-1.5 w-10 rounded-full ${porcentaje >= 100 ? 'bg-emerald-500' : 'bg-zinc-800'}"></div>
                    </div>
                </div>
            </div>`;
    });
}

// ======================================================
// IMPORTADOR PLAN MAESTRO
// ======================================================
window.importarRutinaMaestra = async () => {
    if (!adminContext?.edificioId) return alert("Contexto no cargado.");
    
    const confirmacion = confirm("¿Sincronizar Plan Maestro con el JSON local?");
    if (!confirmacion) return;

    const btn = document.activeElement;
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> SYNC...';

    try {
        const response = await fetch('./mantenimiento_edificio.json');
        const rutinaData = await response.json();
        const rutinaRef = doc(db, "config_rutinas", adminContext.edificioId);

        await setDoc(rutinaRef, {
            ...rutinaData,
            edificioId: adminContext.edificioId,
            lastUpdated: serverTimestamp(),
            updatedBy: auth.currentUser.uid,
            version_core: "5.27"
        }, { merge: true });

        alert("✅ MASTER SYNC OK");
    } catch (e) {
        alert("❌ Error Sync");
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
};

// ======================================================
// LOGIN / LOGOUT
// ======================================================
window.logout = () => auth.signOut();

auth.onAuthStateChanged(async (userAuth) => {
    if (!userAuth) {
        window.location.href = "login.html";
        return;
    }

    await initLocalDB();

    onSnapshot(doc(db, "users", userAuth.uid), (docSnap) => {
        if (!docSnap.exists()) return;

        adminContext = docSnap.data();

        if (!adminContext.edificioId) {
            document.getElementById("panelAdminB2B").classList.add("hidden");
            alert("Perfil sin edificioId.");
            return;
        }

        document.getElementById("panelAdminB2B").classList.remove("hidden");

        const nombreEdificio = adminContext.edificioNombre || adminContext.nombre_edificio || "EDIFICIO";
        const lbl = document.getElementById("lblNombreEdificio");
        if (lbl) lbl.innerText = nombreEdificio.toUpperCase();

        renderizarHistorialDesdeCache();
        escucharPlantillaRealTime(adminContext.edificioId);
        conectarContadorTickets(adminContext.edificioId);
        conectarContadorMantenimientosHoy(adminContext.edificioId);
        sincronizarHistorialConFirestore(adminContext.edificioId);
        escucharAvanceRutina(adminContext.edificioId);
    });
});

/* =====================================================
    REGISTRO DE TÉCNICOS B2B
   ===================================================== */
document.getElementById("formAltaPersonal").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!adminContext?.edificioId) return;

    const btn = document.getElementById("btnGuardarPersonal");
    const name = document.getElementById("regNombre").value.trim();
    const email = document.getElementById("regCorreo").value.trim().toLowerCase();
    const rol = document.getElementById("regRol").value;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> REGISTRANDO...';

    try {
        const secondaryApp = initializeApp(app.options, "Secondary" + Date.now());
        const secondaryAuth = getAuth(secondaryApp);
        
        // 🔥 CLAVE POR DEFECTO ACTUALIZADA A Uxmal39*
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, "Uxmal39*");
        const nuevoUid = userCredential.user.uid;
        await signOut(secondaryAuth);

        await setDoc(doc(db, "users", nuevoUid), {
            nombre: name,
            email: email,
            telefono: document.getElementById("regTelefono").value.trim(),
            especialidad: document.getElementById("regEspecialidad").value,
            rol: rol,
            tipo_cuenta: "B2B",
            edificioId: adminContext.edificioId,
            edificioNombre: adminContext.edificioNombre || "Residencial",
            estado: "activo",
            status: "activo",
            disponible: true,
            verificado: true,
            aprobado: true,
            expediente_completo: true,
            fecha_registro: serverTimestamp()
        });

        alert(`✅ ${name} registrado con éxito.`);
        document.getElementById("modalAltaPersonal").classList.add("hidden"); 
        document.getElementById("formAltaPersonal").reset();

    } catch (err) {
        alert("❌ Error: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Dar de Alta en Red Oficial";
    }
});

/* =====================================================
     DESPACHO DE ORDENES (OT) - V5.30 PUSH INTEGRADO
     Arquitectura: GestiaPremium B2B
     Lead Architect: Heberto Mendoza
    ===================================================== */

document.getElementById("formTicketB2B").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (typeof adminContext === 'undefined' || !adminContext || !adminContext.edificioId) {
        alert("🚨 Error: Contexto de Administrador no cargado.");
        return;
    }

    const btn = document.getElementById("btnCrearTicket");
    const tSelect = document.getElementById("tickAsignado");
    const prioridad = document.getElementById("tickPrioridad").value;

    if (!tSelect.value) {
        alert("⚠️ Por favor, selecciona un especialista.");
        return;
    }

    btn.disabled = true;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-bolt fa-spin"></i> DESPACHANDO SEÑAL...';

    try {
        const selectedOption = tSelect.options[tSelect.selectedIndex];
        const rawText = selectedOption.text || "";
        const tName = rawText.split('[')[0].trim();

        const edificioIdNormalizado = adminContext.edificioId.toLowerCase().trim().replace(/\s+/g, '');

        const techRef = doc(db, "users", tSelect.value);
        const techSnap = await getDoc(techRef);
        let fcmTokenJonathan = null;

        if (techSnap.exists()) {
            fcmTokenJonathan = techSnap.data().fcmToken;
            console.log("📡 Señal de radio localizada para:", tName);
        }

        const ticketData = {
            edificioId: edificioIdNormalizado,
            edificioNombre: adminContext.edificioNombre,
            ubicacion_especifica: document.getElementById("tickPunto").value.trim(),
            descripcion: document.getElementById("tickDesc").value.trim(),
            prioridad: prioridad,
            tecnicoId: tSelect.value,
            tecnico_nombre: tName,
            status: "pendiente",
            fecha_programada: new Date().toISOString().split('T')[0],
            equipo: "Mantenimiento General",
            tipo: "mantenimiento",
            fecha_creacion: serverTimestamp(),
            creado_por: auth.currentUser.uid
        };

        const docRef = await addDoc(collection(db, "servicios_b2b"), ticketData);
        const nuevaOtId = docRef.id;

        // DISPARO DEL MEGÁFONO CENTRALIZADO
        if (prioridad === "alta" || prioridad === "media") {
            await enviarPushEmergenciaB2B(
                fcmTokenJonathan, 
                `🚨 NUEVA OT: ${ticketData.equipo}`,
                `${ticketData.edificioNombre} - ${ticketData.ubicacion_especifica}`
            );
        }

        showToast("🚀 ORDEN DESPACHADA CORRECTAMENTE");
        document.getElementById("formTicketB2B").reset();
        
        console.log("✅ Sync B2B exitoso. ID de Orden:", nuevaOtId);

    } catch (err) {
        console.error("❌ Error en Despacho B2B:", err);
        alert("❌ Error crítico al despachar: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
});

/* =====================================================
   MÓDULO 12: MOTOR DE EMISIÓN DE PASES DIGITALES (STORAGE + WA)
   Arquitectura: GestiaPremium B2B Enterprise v5.30
   ===================================================== */

// Importación dinámica de Storage para no romper tus encabezados actuales
let storageRef, uploadString, getDownloadURL, storageInstancia;

import("https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js").then(module => {
    storageRef = module.ref;
    uploadString = module.uploadString;
    getDownloadURL = module.getDownloadURL;
});
import("./firebase.js").then(module => {
    storageInstancia = module.storage;
});

let qrInstancia = null;

// Inyectar el botón de WhatsApp dinámicamente en el HTML si no existe
const inyectarBotonWhatsApp = () => {
    const containerBotones = document.querySelector("#formGenerarQR .pt-4.flex.gap-2");
    if(containerBotones && !document.getElementById("btnWhatsAppQR")) {
        const btnWA = document.createElement("button");
        btnWA.type = "button";
        btnWA.id = "btnWhatsAppQR";
        btnWA.className = "hidden bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 rounded-xl transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center";
        btnWA.title = "Enviar por WhatsApp";
        btnWA.innerHTML = '<i class="fab fa-whatsapp text-2xl"></i>';
        containerBotones.appendChild(btnWA);
    }
};

window.abrirModalQR = (tipo) => {
    const modal = document.getElementById("modalGenerarQR");
    const selectTipo = document.getElementById("qrTipo");
    
    inyectarBotonWhatsApp(); 
    
    if(modal && selectTipo) {
        selectTipo.value = tipo;
        
        document.getElementById("qrContenedorVisual").classList.add("hidden");
        document.getElementById("qrContenedorVisual").classList.remove("flex");
        document.getElementById("btnDescargarQR").classList.add("hidden");
        
        const btnWA = document.getElementById("btnWhatsAppQR");
        if(btnWA) btnWA.classList.add("hidden");
        
        if(qrInstancia) {
            qrInstancia.clear();
            document.getElementById("qrCanvas").innerHTML = "";
            qrInstancia = null;
        }
        
        document.getElementById("formGenerarQR").reset();
        selectTipo.value = tipo; 
        
        modal.classList.remove("hidden");
    }
};

document.getElementById("formGenerarQR").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const tipo = document.getElementById("qrTipo").value;
    const nombre = document.getElementById("qrNombre").value.trim();
    const vigencia = document.getElementById("qrVigencia").value;
    
    if(!nombre) {
        showToast("Error: Identificador vacío", true);
        return;
    }
    
    const btn = document.getElementById("btnCrearQR");
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> GENERANDO...';

    // Obtener nombres amigables de la UI
    const tipoLabel = document.querySelector(`#qrTipo option[value="${tipo}"]`)?.innerText || tipo;
    const vigenciaLabel = document.querySelector(`#qrVigencia option[value="${vigencia}"]`)?.innerText || vigencia;
    const edificioNombre = adminContext?.edificioNombre || "NOC B2B - UXMAL 39";

    try {
        const payloadData = {
            app: "GestiaPremium_Access",
            edificioId: adminContext?.edificioId || "DESCONOCIDO",
            tipo_pase: tipo,
            identificador: nombre,
            vigencia: vigencia,
            emision_ts: Date.now()
        };
        const payloadStr = JSON.stringify(payloadData);

        const contenedorVisual = document.getElementById("qrContenedorVisual");
        const qrCanvas = document.getElementById("qrCanvas");
        const lblNombre = document.getElementById("qrLabelNombre");
        const btnDescargar = document.getElementById("btnDescargarQR");
        const btnWA = document.getElementById("btnWhatsAppQR");

        qrCanvas.innerHTML = "";
        
        qrInstancia = new QRCode(qrCanvas, {
            text: payloadStr,
            width: 220,
            height: 220,
            colorDark : "#050505",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });

        lblNombre.innerText = `${tipo.toUpperCase()} - ${nombre}`;
        contenedorVisual.classList.remove("hidden");
        contenedorVisual.classList.add("flex");
        btnDescargar.classList.remove("hidden");
        btnWA.classList.remove("hidden");
        
        showToast(`QR Listo en pantalla`);

        // MOTOR: Descarga Local
        btnDescargar.onclick = () => {
            const canvas = qrCanvas.querySelector("canvas");
            if (canvas) {
                const a = document.createElement("a");
                a.href = canvas.toDataURL("image/png");
                a.download = `QR_${tipo.toUpperCase()}_${nombre.replace(/\s+/g, '_')}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast("Descargado correctamente");
            }
        };

        // MOTOR: Generación de Pase Digital (HTML) y subida a Storage
        btnWA.onclick = async () => {
            if(!storageInstancia) {
                showToast("Conectando con la nube, intenta de nuevo...", true);
                return;
            }

            const oldWaText = btnWA.innerHTML;
            btnWA.disabled = true;
            btnWA.innerHTML = '<i class="fas fa-magic fa-bounce"></i>';
            showToast("Generando Pase Digital Premium...");

            try {
                const canvas = qrCanvas.querySelector("canvas");
                // Convertir QR a Base64 para incrustarlo directo en el HTML
                const qrBase64 = canvas.toDataURL("image/png");

                // ==========================================
                // 🎨 ARQUITECTURA DEL PASE DIGITAL (HTML/CSS)
                // Diseñado para verse perfecto en móviles.
                // ==========================================
                const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pase de Acceso - ${nombre}</title>
    <style>
        body { margin: 0; padding: 20px; background-color: #0d1117; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e6edf3; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
        .pass-card { background: linear-gradient(145deg, #161b22 0%, #0d1117 100%); border: 1px solid #30363d; border-radius: 24px; width: 100%; max-width: 380px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); overflow: hidden; position: relative; }
        .pass-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%); }
        
        .header { padding: 25px 20px 15px 20px; border-b: 1px solid #21262d; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .brand-container { display: flex; items-center; gap: 8px; }
        .brand-icon { width: 20px; height: 20px; background-color: #3b82f6; border-radius: 6px; }
        .brand-name { font-size: 10px; font-weight: 900; color: #3b82f6; text-transform: uppercase; tracking-widest: 0.3em; margin: 0; font-style: italic; }
        .edificio-name { font-size: 16px; font-weight: 800; color: white; text-transform: uppercase; margin: 0; tracking-tighter: -0.05em; }
        
        .data-section { padding: 20px; display: flex; flex-direction: column; gap: 15px; }
        .data-item { display: flex; flex-direction: column; }
        .label { font-size: 10px; font-weight: bold; color: #8b949e; text-transform: uppercase; tracking-widest: 0.15em; margin-bottom: 2px; }
        .value { font-size: 16px; font-weight: 600; color: white; margin: 0; }
        .value.highlight { color: #4ade80; }
        .value.tipo { font-weight: 800; text-transform: uppercase; color: #4299e1; }
        
        .qr-section { padding: 10px 20px 25px 20px; display: flex; justify-content: center; align-items: center; flex-direction: column; }
        .qr-wrapper { background-color: white; padding: 15px; border-radius: 16px; display: flex; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        .qr-image { width: 220px; height: 220px; }
        .tap-instruction { font-size: 11px; font-weight: 600; color: #3b82f6; text-transform: uppercase; tracking-widest: 0.1em; margin-top: 15px; text-align: center; }

        .footer { padding: 15px; background-color: rgba(0,0,0,0.2); border-t: 1px solid #21262d; text-align: center; font-size: 10px; color: #484f58; font-family: monospace; }
    </style>
</head>
<body>
    <div class="pass-card">
        <div class="header">
            <div class="brand-container">
                <div class="brand-icon"></div>
                <h1 class="brand-name">GestiaPremium Access</h1>
            </div>
            <h2 class="edificio-name">${edificioNombre}</h2>
        </div>
        
        <div class="data-section">
            <div class="data-item">
                <span class="label">Identificador</span>
                <p class="value">${nombre}</p>
            </div>
            <div class="row" style="display: flex; gap: 20px;">
                <div class="data-item" style="flex: 1;">
                    <span class="label">Tipo de Pase</span>
                    <p class="value tipo">${tipoLabel}</p>
                </div>
                <div class="data-item" style="flex: 1;">
                    <span class="label">Vigencia</span>
                    <p class="value highlight">${vigenciaLabel}</p>
                </div>
            </div>
        </div>
        
        <div class="qr-section">
            <div class="qr-wrapper">
                <img src="${qrBase64}" alt="Código QR de Acceso" class="qr-image">
            </div>
            <p class="tap-instruction">Muestre este código en la terminal de caseta</p>
        </div>

        <div class="footer">
            Pase generado por NOC-B2B | Id: ${payloadData.emision_ts}
        </div>
    </div>
</body>
</html>
`;
                // ==========================================

                // Ruta: qrs_accesos / edificioId / archivo.html
                const edificioSafe = adminContext?.edificioId || "NOC_GENERAL";
                // Cambiamos la extensión a .html
                const fileName = `pases_digitales/${edificioSafe}/${tipo}_${nombre.replace(/\s+/g, '_')}_${Date.now()}.html`;
                
                const fileRef = storageRef(storageInstancia, fileName);
                
                // IMPORTANTE: Subir como raw string con contentType text/html
                await uploadString(fileRef, htmlContent, 'raw', { contentType: 'text/html' });
                
                const publicUrl = await getDownloadURL(fileRef);
                
                // Texto pre-armado para WhatsApp con el link al pase HTML
                const mensajeRaw = `APPCCESS: Control de acceso residencial y empresarial con operación sin intermediarios.\n\n🎟️ Su Pase Digital de Acceso está listo aquí: ${publicUrl}`;
                const linkWA = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensajeRaw)}`;
                
                showToast("Redirigiendo a WhatsApp...");
                window.open(linkWA, '_blank');
                
            } catch (error) {
                console.error("❌ Error generando pase digital:", error);
                showToast("Falla técnica al generar pase", true);
            } finally {
                btnWA.innerHTML = oldWaText;
                btnWA.disabled = false;
            }
        };

    } catch(error) {
        console.error("❌ Error QR:", error);
        showToast("Error en renderizado", true);
    } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
    }
});
/* =====================================================
   PUENTE A TERMINAL HEBERTO - REPORTE FLOTILLA (B2B)
   ===================================================== */
window.reportarFallaVehiculo = async () => {
    // Feedback visual en consola
    console.log("📡 Conectando con NOC B2B..."); 
    
    // El prompt de fuego que el botón le inyectará a la IA
    const comando = "Terminal Heberto, asume contexto de Operador B2B. Localiza mi vehículo asignado (UVZ343K) en flotilla_b2b y abre el módulo para reportar fallas mecánicas en uxmal39.";
    
    if (window.KernelHeberto) {
        try {
            // Pintamos la burbuja si existe la función
            if (window.agregarBurbujaUsuario) {
                window.agregarBurbujaUsuario(comando);
            }
            
            // Disparamos el Kernel
            const res = await window.KernelHeberto.execute(comando);
            
            // Si la IA nos devuelve una tarjeta UI, la dibujamos
            if (res.success && res.ui?.type === "proposal_card") {
                if (window.renderProposalCard) {
                    window.renderProposalCard(res.data);
                }
            } else if (res.data?.mensaje_ceo && window.agregarBurbujaSistema) {
                window.agregarBurbujaSistema(res.data.mensaje_ceo);
            }
            
        } catch(e) {
            console.error("❌ Fallo comunicando con Kernel B2B:", e);
            alert("🚨 Error reportando falla en Flotilla. Revisa la consola F12.");
        }
    } else {
        alert("🚨 Terminal Heberto offline. No se detectó la instancia del Kernel.");
    }
};