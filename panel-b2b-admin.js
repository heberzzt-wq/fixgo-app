/**
 * =====================================================
 * GESTIA PREMIUM - NOC B2B CABINA DE MANDO
 * VERSION: 5.27 (Data Structure Map Fix)
 * Lead Architect: Heberto Mendoza
 * =====================================================
 */

import { auth, db, doc, getDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, limit, setDoc, app } from "./firebase.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let adminContext = null; 

/* =====================================================
   ESTADO GLOBAL & RED
   ===================================================== */
let isOnline = navigator.onLine;

window.addEventListener("online", () => {
    isOnline = true;
    const badge = document.getElementById("networkBadge");
    if(badge){
        badge.innerText = "ONLINE";
        badge.className = "badge-online";
    }
    if(adminContext?.edificioId) sincronizarHistorialConFirestore(adminContext.edificioId);
});

window.addEventListener("offline", () => {
    isOnline = false;
    const badge = document.getElementById("networkBadge");
    if(badge){
        badge.innerText = "OFFLINE";
        badge.className = "badge-offline";
    }
});

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
        
        // Reiniciamos el select de asignación en la creación de tickets
        if(select) {
            select.innerHTML = '<option value="">-- Seleccionar Especialista --</option>';
        }

        let tecnicosActivos = 0;

        snap.forEach(docSnap => {
            const emp = docSnap.data();
            const empId = docSnap.id;

            // Filtro de Seguridad: Solo personal operativo en el Radar
            if(emp.rol === "admin_b2b" || emp.rol === "ceo" || emp.rol === "admin") return;

            // Actualizar Select de Asignación (Solo técnicos activos)
            if (emp.rol === "tecnico" && emp.estado === "activo") {
                tecnicosActivos++;
                if(select) {
                    const opt = document.createElement("option");
                    opt.value = empId;
                    opt.textContent = `${(emp.nombre || 'SIN NOMBRE').toUpperCase()} [${(emp.especialidad || 'GENERAL').toUpperCase()}]`;
                    select.appendChild(opt);
                }
            }

            // Construcción de la Fila con Identidad Visual
            const row = document.createElement("tr");
            row.className = "hover:bg-white/[0.02] transition-all text-xs border-b border-white/5";
            
            // Lógica de Avatar: Foto Real vs Astronauta Placeholder
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
                    <button onclick="verDetalleTecnico('${empId}')" class="text-zinc-600 hover:text-white transition-colors">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </td>
            `;
            tabla.appendChild(row);
        });

        // Actualización de contadores en el Dashboard
        const countLabel = document.getElementById("countTecnicosActivos");
        if (countLabel) {
            countLabel.innerText = tecnicosActivos;
            // Animación sutil de actualización
            countLabel.classList.add("text-emerald-400");
            setTimeout(() => countLabel.classList.remove("text-emerald-400"), 1000);
        }
    });
}
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
            
            /**
             * REGLA DE INTEGRIDAD: 
             * Solo procesamos si existe fecha_cierre.
             * Quitamos la validación estricta de técnico/equipo_nombre porque en rutinas puede no venir.
             */
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

    // Filtramos solo para asegurar que tengan la fecha, que es lo único 100% seguro en el cierre
    const itemsValidos = items.filter(i => i.fecha_para_ordenar);

    if (itemsValidos.length === 0) {
        feed.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 opacity-30">
                <i class="fas fa-box-open text-2xl mb-2"></i>
                <p class="text-[10px] font-black uppercase tracking-widest">Sin reportes registrados</p>
            </div>`;
        return;
    }

    // Ordenamos: Lo más nuevo arriba
    itemsValidos.sort((a, b) => new Date(b.fecha_para_ordenar) - new Date(a.fecha_para_ordenar));

    itemsValidos.forEach(log => {
        const d = new Date(log.fecha_para_ordenar);
        const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

        // MAPEAMOS DIRECTAMENTE A TUS VARIABLES (equipo)
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

        // Render de Materiales (Tu array materiales_utilizados)
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
        
        // MAPEAMOS DIRECTAMENTE A TUS VARIABLES (equipo)
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
        
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, "123456");
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
   DESPACHO DE ORDENES (OT)
   ===================================================== */
document.getElementById("formTicketB2B").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!adminContext) return;

    const btn = document.getElementById("btnCrearTicket");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-bolt fa-spin"></i> ENVIANDO...';

    const tSelect = document.getElementById("tickAsignado");
    const tName = tSelect.options[tSelect.selectedIndex].text.split('[')[0].trim();

    const ticketData = {
        edificioId: adminContext.edificioId,
        edificioNombre: adminContext.edificioNombre,
        ubicacion_especifica: document.getElementById("tickPunto").value.trim(),
        descripcion: document.getElementById("tickDesc").value.trim(),
        prioridad: document.getElementById("tickPrioridad").value,
        tecnicoId: tSelect.value,
        tecnico_nombre: tName,
        status: "programado",
        fecha_programada: new Date().toISOString().split('T')[0],
        equipo: "Mantenimiento General",
        tipo: "mantenimiento",
        fecha_creacion: serverTimestamp(),
        creado_por: auth.currentUser.uid
    };

    try {
        await addDoc(collection(db, "servicios_b2b"), ticketData);
        alert("🚀 ORDEN DESPACHADA CORRECTAMENTE");
        document.getElementById("formTicketB2B").reset();
    } catch (err) {
        alert("❌ Error al despachar.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Despachar Orden de Trabajo";
    }
});
