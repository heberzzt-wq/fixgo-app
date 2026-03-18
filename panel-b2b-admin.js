/**
 * =====================================================
 * GESTIA PREMIUM - NOC B2B CABINA DE MANDO
 * VERSION: 5.25 (Step 2: Professional Full Report View)
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
    console.log("🟢 Conexión restablecida - Sincronizando NOC...");
    if(adminContext?.edificioId) sincronizarHistorialConFirestore(adminContext.edificioId);
});

window.addEventListener("offline", () => {
    isOnline = false;
    console.log("🔴 NOC en modo Offline - Usando Cache Local");
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
            console.log("📦 IndexedDB inicializada en Admin NOC");
            resolve();
        };

        request.onerror = e => {
            console.error("❌ Error al abrir IndexedDB", e);
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
// 4. RADAR DE PLANTILLA
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
        select.innerHTML = '<option value="">-- Seleccionar Especialista --</option>';

        let tecnicosActivos = 0;

        snap.forEach(docSnap => {
            const emp = docSnap.data();
            const empId = docSnap.id;

            if(emp.rol === "admin_b2b" || emp.rol === "ceo" || emp.rol === "admin") return;

            if (emp.rol === "tecnico" && emp.estado === "activo") {
                tecnicosActivos++;
                const opt = document.createElement("option");
                opt.value = empId;
                opt.textContent = `${(emp.nombre || 'SIN NOMBRE').toUpperCase()} [${(emp.especialidad || 'GENERAL').toUpperCase()}]`;
                select.appendChild(opt);
            }

            const row = document.createElement("tr");
            row.className = "hover:bg-white/[0.02] transition-all text-xs border-b border-white/5";
            row.innerHTML = `
                <td class="p-3">
                    <div class="font-bold text-white uppercase tracking-tighter">${emp.nombre || 'Sin Nombre'}</div>
                    <div class="text-[10px] text-zinc-400 font-bold uppercase italic">${emp.especialidad || 'General'}</div>
                </td>
                <td class="p-3 text-center">
                    <span class="px-3 py-1 rounded-full text-[9px] font-black border ${
                        emp.estado === 'activo' 
                        ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' 
                        : 'border-red-500/20 text-red-500 bg-red-500/5'
                    }">
                        ${(emp.estado || 'pendiente').toUpperCase()}
                    </span>
                </td>
            `;
            tabla.appendChild(row);
        });

        const countLabel = document.getElementById("countTecnicosActivos");
        if (countLabel) countLabel.innerText = tecnicosActivos;
    });
}

// ======================================================
// 5. CONTADORES
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
// 6. MONITOR DE BITÁCORA EN VIVO & SINCRONIZACIÓN
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
        console.log(`🔄 Sincronizando ${snap.size} servicios al cache local...`);
        
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const id = docSnap.id;
            
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

    if (items.length === 0) {
        feed.innerHTML = `<p class="text-zinc-600 text-sm italic text-center pt-10">Esperando reportes de cierre...</p>`;
        return;
    }

    items.sort((a, b) => new Date(b.fecha_para_ordenar) - new Date(a.fecha_para_ordenar));

    items.forEach(log => {
        const fecha = log.fecha_para_ordenar ? new Date(log.fecha_para_ordenar).toLocaleTimeString('es-MX') : '--:--';

        const item = document.createElement("div");
        item.className = "bg-zinc-900 p-3 rounded-xl border border-white/5 mb-3";
        item.innerHTML = `
            <div class="flex justify-between items-start">
                <p class="text-sm font-bold text-white">${log.tecnico_nombre || 'Especialista'}</p>
                <span class="text-xs text-zinc-500">${fecha}</span>
            </div>
            <p class="text-xs text-zinc-400 mt-1 mb-2">Finalizó: ${log.equipo_nombre || log.descripcion || 'Mantenimiento'}</p>
            <button onclick="window.verDetalleBitacora('${log.id}')" class="text-xs font-bold text-emerald-400 hover:text-emerald-300">
                [ VER REPORTE DESPLEGABLE ]
            </button>
        `;
        feed.appendChild(item);
    });
}

/**
 * PASO 2: Visualización de Reporte Avanzado
 * Genera un reporte completo con toda la info que Jonathan sube.
 */
window.verDetalleBitacora = async (servicioId) => {
    if (!servicioId) return;
    
    try {
        // 1. Obtener la data (Cache o Firestore)
        const items = await cacheLeerTodos("historial");
        let data = items.find(i => i.id === servicioId);

        if(!data) {
            const docSnap = await getDoc(doc(db, "servicios_b2b", servicioId));
            if (!docSnap.exists()) return alert("Reporte no localizado.");
            data = docSnap.data();
        }

        // 2. Procesar Materiales
        let materialesHTML = '<p class="text-zinc-500 italic">No se registraron materiales.</p>';
        if (data.materiales_utilizados && data.materiales_utilizados.length > 0) {
            materialesHTML = `<ul class="space-y-1">
                ${data.materiales_utilizados.map(m => `
                    <li class="flex justify-between text-xs bg-black/30 p-2 rounded border border-white/5">
                        <span class="text-zinc-300 font-bold">${m.nombre.toUpperCase()}</span>
                        <span class="text-emerald-500">x${m.cantidad}</span>
                    </li>
                `).join('')}
            </ul>`;
        }

        // 3. Formatear Fecha
        const fechaFin = data.fecha_cierre?.toDate ? data.fecha_cierre.toDate().toLocaleString() : 'Reciente';

        // 4. Inyección del Modal Reporte
        const modalHTML = `
            <div id="modalDetalle" class="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 overflow-y-auto" onclick="this.remove()">
                <div class="bg-zinc-950 border border-emerald-500/30 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden" onclick="event.stopPropagation()">
                    
                    <div class="bg-emerald-500 p-6 flex justify-between items-center">
                        <div>
                            <p class="text-[10px] font-black text-emerald-950 uppercase tracking-[0.3em]">Reporte de Servicio B2B</p>
                            <h2 class="text-2xl font-black text-black italic uppercase leading-none mt-1">${data.equipo_nombre || 'MANTENIMIENTO'}</h2>
                        </div>
                        <button onclick="document.getElementById('modalDetalle').remove()" class="text-emerald-950 hover:scale-110 transition-transform">
                            <i class="fas fa-times-circle text-2xl"></i>
                        </button>
                    </div>

                    <div class="p-6 space-y-8 max-h-[75vh] overflow-y-auto">
                        
                        <div class="grid grid-cols-2 gap-4 border-b border-white/5 pb-4">
                            <div>
                                <label class="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Técnico Responsable</label>
                                <p class="text-sm font-bold text-white uppercase">${data.tecnico_nombre || 'N/A'}</p>
                            </div>
                            <div class="text-right">
                                <label class="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Finalizado en</label>
                                <p class="text-sm font-bold text-white uppercase">${fechaFin}</p>
                            </div>
                        </div>

                        <section>
                            <h4 class="text-xs font-black text-emerald-500 uppercase mb-3 flex items-center gap-2">
                                <i class="fas fa-stethoscope"></i> 1. Diagnóstico Inicial
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-900/50 p-4 rounded-2xl border border-white/5">
                                <div>
                                    <p class="text-xs text-zinc-300 italic">"${data.diagnostico_inicial || 'Sin diagnóstico registrado'}"</p>
                                </div>
                                <div>
                                    <p class="text-[9px] font-black text-zinc-500 uppercase mb-2">Evidencia de Entrada:</p>
                                    <img src="${data.foto_antes || 'https://via.placeholder.com/300?text=Sin+Foto'}" class="w-full aspect-video object-cover rounded-xl border border-white/10 shadow-lg">
                                </div>
                            </div>
                        </section>

                        <section>
                            <h4 class="text-xs font-black text-emerald-500 uppercase mb-3 flex items-center gap-2">
                                <i class="fas fa-box-open"></i> 2. Insumos y Materiales
                            </h4>
                            <div class="bg-zinc-900/50 p-4 rounded-2xl border border-white/5">
                                ${materialesHTML}
                            </div>
                        </section>

                        <section>
                            <h4 class="text-xs font-black text-emerald-500 uppercase mb-3 flex items-center gap-2">
                                <i class="fas fa-check-double"></i> 3. Resultado y Cierre
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-900/50 p-4 rounded-2xl border border-white/5">
                                <div>
                                    <p class="text-[9px] font-black text-zinc-500 uppercase mb-2 italic">Observaciones del Técnico:</p>
                                    <p class="text-xs text-zinc-300">${data.observaciones_finales || 'Servicio completado satisfactoriamente.'}</p>
                                </div>
                                <div>
                                    <p class="text-[9px] font-black text-zinc-500 uppercase mb-2 font-bold">Evidencia de Salida:</p>
                                    <img src="${data.foto_despues || 'https://via.placeholder.com/300?text=Sin+Foto'}" class="w-full aspect-video object-cover rounded-xl border border-white/10 shadow-lg">
                                </div>
                            </div>
                        </section>

                        <section class="border-t border-white/10 pt-6">
                            <div class="flex flex-col items-center justify-center bg-white p-4 rounded-2xl">
                                <p class="text-[9px] font-black text-zinc-400 uppercase mb-2">Firma Digital de Conformidad</p>
                                <img src="${data.firma_conformidad || 'https://via.placeholder.com/300x100?text=Firma+Pendiente'}" class="max-h-32">
                            </div>
                        </section>

                    </div>
                    
                    <div class="p-4 bg-zinc-900 text-center">
                        <button class="text-[10px] font-black text-zinc-500 uppercase tracking-widest hover:text-white transition-colors" onclick="document.getElementById('modalDetalle').remove()">
                            Cerrar Expediente Técnico
                        </button>
                    </div>

                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

    } catch (e) { 
        console.error("Error al renderizar reporte:", e); 
        alert("Error al cargar la info del reporte.");
    }
};

// ======================================================
// 7. MONITOR DE AVANCE DE RUTINA (V5.19)
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

        if (!rutinaSnap.exists()) {
            dashboardRutinas.innerHTML = `
                <div class="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p class="text-[10px] text-amber-500 font-black uppercase tracking-widest">⚠️ Sin Plan Maestro</p>
                    <p class="text-xs text-zinc-500 mt-1">Sincroniza el JSON para ver el avance operativo.</p>
                </div>`;
            return;
        }

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
            <h4 class="text-[10px] font-black uppercase text-zinc-500 mb-4 tracking-widest flex items-center gap-2">
                <i class="fas fa-chart-pie text-emerald-500"></i> Avance Rutina Preventiva (Hoy)
            </h4>
            <div class="flex items-center gap-6">
                <div class="relative w-20 h-20">
                    <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path class="stroke-current text-zinc-800" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke-width="3"></path>
                        <path class="stroke-current text-emerald-500 transition-all duration-1000 ease-out" 
                            stroke-dasharray="${porcentaje}, 100" 
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                            fill="none" stroke-width="3" stroke-linecap="round"></path>
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center">
                        <span class="text-xl font-black text-white leading-none">${porcentaje}%</span>
                        <span class="text-[8px] text-zinc-500 font-bold">READY</span>
                    </div>
                </div>
                <div class="space-y-1">
                    <p class="text-lg font-black text-white tracking-tighter leading-none">${conteoCompletadas} / ${totalTareas}</p>
                    <p class="text-[10px] font-bold text-zinc-400 uppercase">Tareas Ejecutadas</p>
                    <div class="flex gap-1 mt-2">
                        <span class="h-1 w-8 rounded-full ${porcentaje > 0 ? 'bg-emerald-500' : 'bg-zinc-800'}"></span>
                        <span class="h-1 w-8 rounded-full ${porcentaje > 50 ? 'bg-emerald-500' : 'bg-zinc-800'}"></span>
                        <span class="h-1 w-8 rounded-full ${porcentaje >= 100 ? 'bg-emerald-500' : 'bg-zinc-800'}"></span>
                    </div>
                </div>
            </div>`;
    });
}

// ======================================================
// IMPORTADOR DE PLAN MAESTRO
// ======================================================
window.importarRutinaMaestra = async () => {
    if (!adminContext?.edificioId) {
        return alert("❌ ERROR: El contexto del edificio no ha cargado correctamente.");
    }

    const confirmacion = confirm(`¿Deseas importar el plan maestro?`);
    if (!confirmacion) return;

    const btn = document.activeElement;
    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SINCRONIZANDO...';

    try {
        const response = await fetch('./mantenimiento_edificio.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}.`);

        const rutinaData = await response.json();
        const rutinaRef = doc(db, "config_rutinas", adminContext.edificioId);

        await setDoc(rutinaRef, {
            ...rutinaData,
            edificioId: adminContext.edificioId,
            lastUpdated: serverTimestamp(),
            updatedBy: auth.currentUser.uid,
            version_core: "5.25"
        }, { merge: true });

        alert("✅ SINCRONIZACIÓN EXITOSA");
    } catch (error) {
        alert(`❌ ERROR: ${error.message}`);
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
};

// ======================================================
// LOGOUT
// ======================================================
window.logout = () => auth.signOut();

// ======================================================
// 1. MONITOR DE ACCESO & INICIO DE CACHE
// ======================================================
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
            return;
        }

        document.getElementById("panelAdminB2B").classList.remove("hidden");

        const nombreEdificio = adminContext.edificioNombre || adminContext.nombre_edificio || "EDIFICIO SIN NOMBRE";
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

// ======================================================
// 2. REGISTRO DE ACTIVOS HUMANOS
// ======================================================
document.getElementById("formAltaPersonal").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!adminContext?.edificioId) return;

    const btn = document.getElementById("btnGuardarPersonal");
    const originalText = "Dar de Alta en Red B2B";

    const nombreInput = document.getElementById("regNombre").value.trim();
    const emailInput = document.getElementById("regCorreo").value.trim().toLowerCase();
    const rolInput = document.getElementById("regRol").value;
    const passwordTemp = "123456";

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> CREANDO CUENTA...';

    try {
        const secondaryApp = initializeApp(app.options, "SecondaryApp" + Date.now());
        const secondaryAuth = getAuth(secondaryApp);
        
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, emailInput, passwordTemp);
        const nuevoUid = userCredential.user.uid;
        await signOut(secondaryAuth);

        const nuevoEmpleado = {
            nombre: nombreInput,
            telefono: document.getElementById("regTelefono").value.trim(),
            email: emailInput,
            rol: rolInput,
            tipo_cuenta: "B2B",
            especialidad: document.getElementById("regEspecialidad").value,
            tecnico_vehiculo: "N/A",
            tecnico_placas: "N/A",
            edificioId: adminContext.edificioId,
            edificioNombre: adminContext.edificioNombre || "Edificio B2B",
            estado: "activo",
            status: "activo",
            disponible: true,
            verificado: true,
            aprobado: true, 
            aprobadoPor: "admin_b2b",
            expediente_completo: true,
            fecha_registro: serverTimestamp()
        };

        await setDoc(doc(db, "users", nuevoUid), nuevoEmpleado);
        alert(`🚀 ¡ÉXITO! Técnico ${nombreInput} registrado.`);
        document.getElementById("modalAltaPersonal").classList.add("hidden"); 
        document.getElementById("formAltaPersonal").reset();

    } catch (err) {
        alert("❌ Error al registrar.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
});

// ======================================================
// 3. DESPACHO DE ORDENES DE TRABAJO
// ======================================================
document.getElementById("formTicketB2B").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!adminContext) return;

    const btn = document.getElementById("btnCrearTicket");
    btn.disabled = true;
    btn.innerHTML = "ENVIANDO ORDEN...";

    const tecnicoSelect = document.getElementById("tickAsignado");
    const tecnicoNombre = tecnicoSelect.options[tecnicoSelect.selectedIndex].text;

    const ticketData = {
        edificioId: adminContext.edificioId,
        edificioNombre: adminContext.edificioNombre,
        ubicacion_especifica: document.getElementById("tickPunto").value.trim(),
        descripcion: document.getElementById("tickDesc").value.trim(),
        prioridad: document.getElementById("tickPrioridad").value,
        tecnicoId: tecnicoSelect.value,
        tecnico_nombre: tecnicoNombre, 
        status: "programado",
        fecha_programada: new Date().toISOString().split('T')[0],
        equipo_nombre: "Mantenimiento General",
        tipo: "mantenimiento",
        fecha_creacion: serverTimestamp(),
        creado_por: auth.currentUser.uid
    };

    try {
        await addDoc(collection(db, "servicios_b2b"), ticketData);
        alert("🚀 ORDEN DESPACHADA");
        document.getElementById("formTicketB2B").reset();
    } catch (err) {
        alert("❌ Error al despachar orden.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Despachar Orden de Trabajo";
    }
});
