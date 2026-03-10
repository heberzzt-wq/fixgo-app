import { auth, db, doc, getDoc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, limit } from "./firebase.js";

let adminContext = null; 

console.log("⚡ GESTIA MASTER: NOC B2B Cabina de Mando v5.18 Online.");

// Reloj en tiempo real
setInterval(() => {
    const clock = document.getElementById('clock');
    if(clock) clock.innerText = new Date().toLocaleTimeString('es-MX', { hour12: false });
}, 1000);

// 1. MONITOR DE ACCESO MASTER
auth.onAuthStateChanged((userAuth) => {
    if (!userAuth) {
        window.location.href = "login.html";
        return; 
    }

    onSnapshot(doc(db, "users", userAuth.uid), (docSnap) => {
        if (!docSnap.exists()) return;

        adminContext = docSnap.data();
        document.getElementById("panelAdminB2B").classList.remove("hidden");
        
      // TAREA 1: Normalización de Campos (Refactor V5.18)
        // Usa el nombre si existe, si no usa el ID (uxmal39), o un texto por defecto
        const nombreEdificio = adminContext.edificioNombre || adminContext.edificioId || "CABINA DE MANDO B2B";
        document.getElementById("lblNombreEdificio").innerText = nombreEdificio.toUpperCase();

        // TAREA 1: Sincronía de IDs
        if (adminContext.edificioId) {
            escucharPlantillaRealTime(adminContext.edificioId);
            conectarContadorTickets(adminContext.edificioId);
            conectarContadorMantenimientosHoy(adminContext.edificioId);
            escucharBitacoraRealTime(adminContext.edificioId); // TAREA 1: Monitor de Bitácora
        }
    });

// 2. REGISTRO DE ACTIVOS HUMANOS
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

// 3. DESPACHO DE ÓRDENES DE TRABAJO (OT)
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
        status: "programado", // Estado inicial para que lo vea el técnico
        fecha_programada: new Date().toISOString().split('T')[0], // Programado para hoy
        equipo_nombre: "Mantenimiento General",
        tipo: "mantenimiento",
        fecha_creacion: serverTimestamp(), // Mantenemos la fecha de creación
        creado_por: auth.currentUser.uid
    };

    try {
        // TAREA 1: Redirección de Colección
        await addDoc(collection(db, "servicios_b2b"), ticketData);
        alert("🚀 ORDEN DESPACHADA: El especialista recibirá la notificación de inmediato.");
        document.getElementById("formTicketB2B").reset();
    } catch (err) {
        alert("❌ Error al despachar orden.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Despachar Orden de Trabajo";
    }
});

// 4. RADAR DE PLANTILLA Y MÉTRICAS
function escucharPlantillaRealTime(edificioId) {
    // TAREA 1: Filtro de Seguridad
    const q = query(collection(db, "users"), where("edificioId", "==", edificioId));

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
            
            if(emp.rol === "admin_b2b" || emp.rol === "ceo") return; 

            if (emp.rol === "tecnico" && emp.estado === "activo") {
                tecnicosActivos++;
                const opt = document.createElement("option");
                opt.value = empId;
                opt.textContent = `${emp.nombre.toUpperCase()} [${emp.especialidad.toUpperCase()}]`;
                select.appendChild(opt);
            }

            const row = document.createElement("tr");
            row.className = "hover:bg-white/[0.02] transition-all text-xs border-b border-white/5";
            row.innerHTML = `
                <td class="p-3">
                    <div class="font-bold text-white uppercase tracking-tighter">${emp.nombre}</div>
                    <div class="text-[10px] text-zinc-400 font-bold uppercase italic">${emp.especialidad}</div>
                </td>
                <td class="p-3 text-center">
                    <span class="px-3 py-1 rounded-full text-[9px] font-black border ${emp.estado === 'activo' ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' : 'border-red-500/20 text-red-500 bg-red-500/5'}">
                        ${emp.estado.toUpperCase()}
                    </span>
                </td>
            `;
            tabla.appendChild(row);
        });

        document.getElementById("countTecnicosActivos").innerText = tecnicosActivos;
    });
}

function conectarContadorTickets(edificioId) {
    // TAREA 1: Redirección y Filtro de Seguridad
    const q = query(collection(db, "servicios_b2b"), where("edificioId", "==", edificioId), where("status", "in", ["programado", "en_proceso"]));
    onSnapshot(q, (snap) => {
        document.getElementById("countOrdenesPendientes").innerText = snap.size;
    });
}

function conectarContadorMantenimientosHoy(edificioId) {
    const hoy = new Date().toISOString().split('T')[0];
    const q = query(collection(db, "servicios_b2b"), where("edificioId", "==", edificioId), where("fecha_programada", "==", hoy));
    onSnapshot(q, (snap) => {
        document.getElementById("countMantenimientosHoy").innerText = snap.size;
    });
}

// TAREA 1: Monitor de Bitácora
function escucharBitacoraRealTime(edificioId) {
    const q = query(collection(db, "bitacora_edificios"), where("edificioId", "==", edificioId), orderBy("fecha", "desc"), limit(10));

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
            const fecha = log.fecha ? log.fecha.toDate().toLocaleTimeString('es-MX') : '';

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

// 5. COMANDOS GLOBALES DE GESTIÓN
window.cambiarEstado = async (id, estado) => {
    await updateDoc(doc(db, "users", id), { estado: estado });
};

window.eliminarEmpleado = async (id, nombre) => {
    if(!confirm(`¿ELIMINAR ACCESO A ${nombre.toUpperCase()}?`)) return;
    await deleteDoc(doc(db, "users", id));
};

window.verDetalleBitacora = async (servicioId) => {
    if (!servicioId) return;
    try {
        const docSnap = await getDoc(doc(db, "servicios_b2b", servicioId));
        if (!docSnap.exists()) {
            alert("No se encontró el detalle de esta orden de trabajo.");
            return;
        }
        const data = docSnap.data();
        const foto = data.foto_despues || 'https://via.placeholder.com/300?text=No+Foto';
        const firma = data.firma_conformidad || 'https://via.placeholder.com/300x100?text=No+Firma';

        const modalHTML = `
            <div id="modalDetalle" class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onclick="this.remove()">
                <div class="bg-zinc-900 p-6 rounded-2xl border border-white/10 max-w-sm w-full space-y-4">
                    <h4 class="font-bold text-white">Evidencia de Cierre</h4>
                    <p class="text-xs text-zinc-400">Foto del Trabajo Finalizado:</p>
                    <img src="${foto}" class="rounded-lg w-full h-auto max-h-60 object-cover">
                    <p class="text-xs text-zinc-400">Firma de Conformidad:</p>
                    <img src="${firma}" class="rounded-lg bg-white p-2">
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    } catch (error) {
        console.error("Error al ver detalle:", error);
    }
};
