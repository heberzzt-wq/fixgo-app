/**
 * =====================================================
 * GESTIA PREMIUM - NOC B2B CABINA DE MANDO
 * VERSION: 5.24 (Step 1: Cache Engine & Data Sync)
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
   INDEXED DB CACHE ENGINE (NUEVO PASO 1)
   ===================================================== */
const DB_NAME = "gestia_cache";
const DB_VERSION = 2; // Mantener versión para compatibilidad con el engine del técnico
let localDB;

function initLocalDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = e => {
            const db = e.target.result;
            // Creamos los almacenes si no existen (Cajones de las capturas)
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
// 6. MONITOR DE BITÁCORA EN VIVO & SINCRONIZACIÓN DE HISTORIAL
// ======================================================

/**
 * Función mejorada del Paso 1: Escucha servicios_b2b para tener TODA la data
 * de Jonathan (fotos, materiales, etc.) y la guarda en historial local.
 */
async function sincronizarHistorialConFirestore(edificioId) {
    if (!isOnline) return;

    // Consultamos directamente los servicios finalizados (donde está el oro de la info)
    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioId),
        where("status", "==", "finalizado"),
        orderBy("fecha_cierre", "desc"),
        limit(20)
    );

    onSnapshot(q, async (snap) => {
        console.log(`🔄 Sincronizando ${snap.size} servicios al cache local...`);
        
        // No limpiamos todo, solo actualizamos/añadimos lo nuevo para que persista
        for (const docSnap of snap.docs) {
            const data = docSnap.data();
            const id = docSnap.id;
            
            // Estructuramos el item para el historial local
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

    // Ordenamos por fecha de cierre más reciente
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
            <p class="text-xs text-zinc-400 mt-1 mb-2">Finalizó: ${log.descripcion || 'Mantenimiento'}</p>
            <button onclick="window.verDetalleBitacora('${log.id}')" class="text-xs font-bold text-emerald-400 hover:text-emerald-300">
                [ Ver Reporte Completo ]
            </button>
        `;
        feed.appendChild(item);
    });
}

// Función global para ver la evidencia del técnico
window.verDetalleBitacora = async (servicioId) => {
    if (!servicioId) return;
    try {
        // Primero intentamos leer de cache para velocidad
        const items = await cacheLeerTodos("historial");
        let data = items.find(i => i.id === servicioId);

        // Si no está en cache, buscamos en Firestore
        if(!data) {
            const docSnap = await getDoc(doc(db, "servicios_b2b", servicioId));
            if (!docSnap.exists()) return alert("No se encontró evidencia del servicio.");
            data = docSnap.data();
        }
        
        const foto = data.foto_despues || 'https://via.placeholder.com/300?text=Sin+Foto';
        const firma = data.firma_conformidad || 'https://via.placeholder.com/300x100?text=Sin+Firma';

        const modalHTML = `
            <div id="modalDetalle" class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onclick="this.remove()">
                <div class="bg-zinc-900 p-6 rounded-2xl border border-white/10 max-w-sm w-full space-y-4" onclick="event.stopPropagation()">
                    <h4 class="font-bold text-white">Evidencia de Cierre</h4>
                    <p class="text-xs text-zinc-400">Foto del resultado:</p>
                    <img src="${foto}" class="rounded-lg w-full h-auto max-h-60 object-cover">
                    <p class="text-xs text-zinc-400">Firma de conformidad:</p>
                    <img src="${firma}" class="rounded-lg bg-white p-2 w-full">
                    <button class="w-full py-2 bg-zinc-800 rounded-lg text-xs font-bold" onclick="document.getElementById('modalDetalle').remove()">CERRAR VISTA</button>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    } catch (e) { console.error("Error al recuperar detalle:", e); }
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
            version_core: "5.24"
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

    // PASO 1: Inicializamos la base de datos local del Admin
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

        // Lanzamos el render inicial desde cache (Rápido)
        renderizarHistorialDesdeCache();

        // Disparamos monitores
        escucharPlantillaRealTime(adminContext.edificioId);
        conectarContadorTickets(adminContext.edificioId);
        conectarContadorMantenimientosHoy(adminContext.edificioId);
        
        // El Paso 1 principal: Sincronizar el historial de servicios_b2b al cache
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
        tecnico_nombre: tecnicoNombre, // Guardamos nombre para el cache del admin
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
