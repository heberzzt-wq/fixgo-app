import { auth, db, doc, getDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, limit, setDoc } from "./firebase.js";

let adminContext = null; 

console.log("⚡ GESTIA MASTER: NOC B2B Cabina de Mando v5.19 Online.");

// ======================================================
// RELOJ EN TIEMPO REAL
// ======================================================

setInterval(() => {
    const clock = document.getElementById('clock');
    if(clock) clock.innerText = new Date().toLocaleTimeString('es-MX', { hour12: false });
}, 1000);


// ======================================================
// 1. MONITOR DE ACCESO MASTER & CONTEXTO B2B (FIX)
// ======================================================

auth.onAuthStateChanged((userAuth) => {

    if (!userAuth) {
        window.location.href = "login.html";
        return;
    }

    // Escuchamos el perfil del usuario en tiempo real
    onSnapshot(doc(db, "users", userAuth.uid), (docSnap) => {

        if (!docSnap.exists()) {
            console.error("⛔ Perfil no encontrado en Firestore.");
            return;
        }

        adminContext = docSnap.data();

        // ------------------------------------------------
        // REGLA DE SEGURIDAD
        // ------------------------------------------------

        if (!adminContext.edificioId) {

            console.error("⛔ ERROR CRÍTICO: Admin B2B sin edificioId.");

            alert(
                "⚠️ PERFIL INCOMPLETO:\n" +
                "Tu usuario no está vinculado a ningún edificio.\n\n" +
                "Contacta a soporte para completar la vinculación."
            );

            document.getElementById("panelAdminB2B").classList.add("hidden");
            return;
        }

        // ------------------------------------------------
        // ACTIVACIÓN DE UI
        // ------------------------------------------------

        document.getElementById("panelAdminB2B").classList.remove("hidden");

        // Normalización de nombre
        const nombreEdificio =
            adminContext.edificioNombre ||
            adminContext.nombre_edificio ||
            "EDIFICIO SIN NOMBRE";

        const lbl = document.getElementById("lblNombreEdificio");
        if (lbl) lbl.innerText = nombreEdificio.toUpperCase();


        // ------------------------------------------------
        // DISPARO DE MONITORES
        // ------------------------------------------------

        escucharPlantillaRealTime(adminContext.edificioId);
        conectarContadorTickets(adminContext.edificioId);
        conectarContadorMantenimientosHoy(adminContext.edificioId);
        escucharBitacoraRealTime(adminContext.edificioId);
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

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> PROCESANDO...';

    const nuevoEmpleado = {

        nombre: document.getElementById("regNombre").value.trim(),
        telefono: document.getElementById("regTelefono").value.trim(),
        email: document.getElementById("regCorreo").value.trim().toLowerCase(),

        rol: document.getElementById("regRol").value,
        especialidad: document.getElementById("regEspecialidad").value,

        tecnico_vehiculo: "PENDIENTE",
        tecnico_placas: "000-000",

        edificioId: adminContext.edificioId,
        edificioNombre: adminContext.edificioNombre,

        estado: "activo",
        disponible: true,

        fecha_registro: serverTimestamp()
    };

    try {

        await addDoc(collection(db, "users"), nuevoEmpleado);

        alert("✅ Activo desplegado en el sistema.");

        document.getElementById("formAltaPersonal").reset();

    } catch (err) {

        alert("❌ Error de Firebase. Revisa las reglas.");

    } finally {

        btn.disabled = false;
        btn.innerHTML = "Dar de Alta en Red B2B";

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

    const ticketData = {

        edificioId: adminContext.edificioId,
        edificioNombre: adminContext.edificioNombre,

        ubicacion_especifica: document.getElementById("tickPunto").value.trim(),
        descripcion: document.getElementById("tickDesc").value.trim(),

        prioridad: document.getElementById("tickPrioridad").value,
        tecnicoId: document.getElementById("tickAsignado").value,

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


// ======================================================
// 4. RADAR DE PLANTILLA (REPARADO: Inyección de Tabla)
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

        // Limpieza de UI
        tabla.innerHTML = "";
        select.innerHTML = '<option value="">-- Seleccionar Especialista --</option>';

        let tecnicosActivos = 0;

        snap.forEach(docSnap => {
            const emp = docSnap.data();
            const empId = docSnap.id;

            // Filtro de seguridad: No mostrar administradores en el radar operativo
            if(emp.rol === "admin_b2b" || emp.rol === "ceo" || emp.rol === "admin") return;

            // 1. Llenado del Select de Despacho
            if (emp.rol === "tecnico" && emp.estado === "activo") {
                tecnicosActivos++;
                const opt = document.createElement("option");
                opt.value = empId;
                opt.textContent = `${(emp.nombre || 'SIN NOMBRE').toUpperCase()} [${(emp.especialidad || 'GENERAL').toUpperCase()}]`;
                select.appendChild(opt);
            }

            // 2. Inyección Visual en la Tabla (Lo que faltaba)
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
        where("status", "in", ["programado", "en_proceso"])
    );

    onSnapshot(q, (snap) => {
        document.getElementById("countOrdenesPendientes").innerText = snap.size;
    });

}

function conectarContadorMantenimientosHoy(edificioId) {

    const hoy = new Date().toISOString().split('T')[0];

    const q = query(
        collection(db, "servicios_b2b"),
        where("edificioId", "==", edificioId),
        where("fecha_programada", "==", hoy)
    );

    onSnapshot(q, (snap) => {
        document.getElementById("countMantenimientosHoy").innerText = snap.size;
    });

}

// ======================================================
// 6. MONITOR DE BITÁCORA EN VIVO
// ======================================================

function escucharBitacoraRealTime(edificioId) {
    const q = query(
        collection(db, "bitacora_edificios"), 
        where("edificioId", "==", edificioId), 
        orderBy("fecha", "desc"), 
        limit(10)
    );

    onSnapshot(q, (snap) => {
        const feed = document.getElementById("feedBitacora");
        if (!feed) return;
        feed.innerHTML = "";

        if (snap.empty) {
            feed.innerHTML = `<p class="text-zinc-600 text-sm italic text-center pt-10">Esperando reportes de cierre...</p>`;
            return;
        }

        snap.forEach(docSnap => {
            const log = docSnap.data();
            const fecha = log.fecha ? log.fecha.toDate().toLocaleTimeString('es-MX') : '--:--';

            const item = document.createElement("div");
            item.className = "bg-zinc-900 p-3 rounded-xl border border-white/5";
            item.innerHTML = `
                <div class="flex justify-between items-start">
                    <p class="text-sm font-bold text-white">${log.tecnico || 'Técnico'}</p>
                    <span class="text-xs text-zinc-500">${fecha}</span>
                </div>
                <p class="text-xs text-zinc-400 mt-1 mb-2">Finalizó: ${log.resumen || 'Mantenimiento'}</p>
                <button onclick="window.verDetalleBitacora('${log.servicioId}')" class="text-xs font-bold text-blue-400 hover:text-blue-300">
                    [ Ver Foto/Firma ]
                </button>
            `;
            feed.appendChild(item);
        });
    });
}

// Función global para ver la evidencia del técnico
window.verDetalleBitacora = async (servicioId) => {
    if (!servicioId) return;
    try {
        const docSnap = await getDoc(doc(db, "servicios_b2b", servicioId));
        if (!docSnap.exists()) return alert("No se encontró evidencia del servicio.");
        
        const data = docSnap.data();
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
// 7. MONITOR DE AVANCE DE RUTINA (V5.19 - COMPLEMENTO)
// ======================================================

function escucharAvanceRutina(edificioId) {
    const hoy = new Date().toISOString().split('T')[0];
    const dashboardRutinas = document.getElementById('dashboard-rutinas');
    if (!dashboardRutinas) return;

    // 1. Monitoreamos los logs de tareas completadas hoy
    const q = query(
        collection(db, "log_rutinas"),
        where("edificioId", "==", edificioId),
        where("fechaCompletado", "==", hoy)
    );

    onSnapshot(q, async (logSnapshot) => {
        // Creamos un Set con los IDs de tareas terminadas para comparar rápido
        const completadasHoyIds = new Set(logSnapshot.docs.map(d => d.data().tareaId));
        
        // 2. Traemos el Plan Maestro (el que acabas de sincronizar con el JSON)
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
        const tareasDiarias = rutinaMaster.Diaria || []; // Ajusta según la estructura de tu JSON
        const totalTareas = tareasDiarias.length;
        
        let conteoCompletadas = 0;
        tareasDiarias.forEach(tarea => { 
            if (completadasHoyIds.has(tarea.id_tarea)) {
                conteoCompletadas++;
            }
        });

        // 3. Cálculo de porcentaje para el gráfico SVG
        const porcentaje = totalTareas > 0 ? Math.round((conteoCompletadas / totalTareas) * 100) : 0;

        // 4. Inyección de UI en el Dashboard
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
// IMPORTADOR DE PLAN MAESTRO (FIX ROBUSTO)
// ======================================================

window.importarRutinaMaestra = async () => {

    if (!adminContext?.edificioId) {
        return alert("❌ ERROR: El contexto del edificio no ha cargado correctamente.");
    }

    const confirmacion = confirm(
        `¿Deseas importar el plan maestro para ${
            adminContext.edificioNombre || "este edificio"
        }?\n\nEsto actualizará las rutinas diarias, semanales y mensuales.`
    );

    if (!confirmacion) return;

    const btn = document.activeElement;

    const originalHTML = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> SINCRONIZANDO...';

    try {

        const response = await fetch('./mantenimiento_edificio.json');

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}. Verifica que mantenimiento_edificio.json exista en la raíz.`
            );
        }

        const rutinaData = await response.json();

        const rutinaRef = doc(db, "config_rutinas", adminContext.edificioId);

        await setDoc(
            rutinaRef,
            {
                ...rutinaData,

                edificioId: adminContext.edificioId,

                lastUpdated: serverTimestamp(),

                updatedBy: auth.currentUser.uid,

                version_core: "5.19"
            },
            { merge: true }
        );

        console.log(
            "✅ Plan Maestro guardado en config_rutinas/" +
            adminContext.edificioId
        );

        alert("✅ SINCRONIZACIÓN EXITOSA");

    } catch (error) {

        console.error("❌ Error Crítico:", error);

        alert(
            `❌ ERROR DE SINCRONIZACIÓN\n\n${error.message}\n\nRevisa el JSON.`
        );

    } finally {

        btn.innerHTML = originalHTML;
        btn.disabled = false;

    }

};


// ======================================================
// LOGOUT
// ======================================================

window.logout = () => auth.signOut();
