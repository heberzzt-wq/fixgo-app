import { auth, db, doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where } from "./firebase.js";

let adminContext = null; 

console.log("⚡ GESTIA MASTER: Puerto Cancún Logic Engine v5.18 Online.");

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
        
        // Marcamos el territorio: Puerto Cancún
        const nombreDisplay = adminContext.nombre_residencial || "OPERACIONES PUERTO CANCÚN";
        document.getElementById("lblNombreResidencial").innerText = nombreDisplay.toUpperCase();

        if (adminContext.residencialId) {
            escucharPlantillaRealTime(adminContext.residencialId);
            conectarContadorTickets(adminContext.residencialId);
        }
    });
});

// 2. REGISTRO DE ACTIVOS HUMANOS
document.getElementById("formAltaPersonal").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!adminContext?.residencialId) return;

    const btn = document.getElementById("btnGuardarPersonal");
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-sync fa-spin"></i> PROCESANDO...';

    const nuevoEmpleado = {
        nombre: document.getElementById("regNombre").value.trim(),
        telefono: document.getElementById("regTelefono").value.trim(),
        email: document.getElementById("regCorreo").value.trim().toLowerCase(),
        rol: document.getElementById("regRol").value,
        especialidad: document.getElementById("regEspecialidad").value,
        residencialId: adminContext.residencialId, 
        nombre_residencial: adminContext.nombre_residencial,
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

    // Estructura de Orden de Trabajo para Puerto Cancún
    const ticketData = {
        residencialId: adminContext.residencialId,
        nombre_residencial: adminContext.nombre_residencial,
        sector: document.getElementById("tickZona").value, // Macro-Zona
        punto_exacto: document.getElementById("tickPunto").value.trim(), // Lote/Muelle/Depto
        descripcion: document.getElementById("tickDesc").value.trim(),
        prioridad: document.getElementById("tickPrioridad").value,
        tecnicoId: document.getElementById("tickAsignado").value,
        status: "pendiente",
        tipo: "B2B_INTERNO",
        metodo_pago: "nomina_residencial",
        fecha_creacion: serverTimestamp(),
        creado_por: auth.currentUser.uid
    };

    try {
        await addDoc(collection(db, "services"), ticketData);
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
function escucharPlantillaRealTime(residencialId) {
    const q = query(collection(db, "users"), where("residencialId", "==", residencialId));

    onSnapshot(q, (snap) => {
        const tabla = document.getElementById("tablaEmpleadosB2B");
        const select = document.getElementById("tickAsignado");
        if (!tabla) return;

        tabla.innerHTML = "";
        select.innerHTML = '<option value="">-- Seleccionar Especialista --</option>';
        
        snap.forEach(docSnap => {
            const emp = docSnap.data();
            const empId = docSnap.id;
            
            if(emp.rol === "admin_b2b" || emp.rol === "ceo") return; 

            if (emp.rol === "tecnico" && emp.estado === "activo") {
                const opt = document.createElement("option");
                opt.value = empId;
                opt.textContent = `${emp.nombre.toUpperCase()} [${emp.especialidad.toUpperCase()}]`;
                select.appendChild(opt);
            }

            const row = document.createElement("tr");
            row.className = "hover:bg-white/[0.02] transition-all text-xs";
            row.innerHTML = `
                <td class="p-6">
                    <div class="font-bold text-white uppercase tracking-tighter">${emp.nombre}</div>
                    <div class="text-[9px] text-zinc-600 font-mono">${emp.email}</div>
                </td>
                <td class="p-6">
                    <div class="text-[10px] text-emerald-500 font-black uppercase tracking-widest">${emp.rol}</div>
                    <div class="text-[9px] text-zinc-400 font-bold uppercase italic">${emp.especialidad}</div>
                </td>
                <td class="p-6 text-center">
                    <span class="px-3 py-1 rounded-full text-[9px] font-black border ${emp.estado === 'activo' ? 'border-emerald-500/20 text-emerald-500 bg-emerald-500/5' : 'border-red-500/20 text-red-500 bg-red-500/5'}">
                        ${emp.estado.toUpperCase()}
                    </span>
                </td>
                <td class="p-6 text-right">
                    <div class="flex justify-end gap-3">
                        <button onclick="window.cambiarEstado('${empId}', '${emp.estado === 'activo' ? 'suspendido' : 'activo'}')" 
                            class="text-zinc-500 hover:text-white transition-colors p-2">
                            <i class="fas ${emp.estado === 'activo' ? 'fa-pause' : 'fa-play'} text-[11px]"></i>
                        </button>
                        <button onclick="window.eliminarEmpleado('${empId}', '${emp.nombre}')" 
                            class="text-zinc-700 hover:text-red-500 transition-colors p-2">
                            <i class="fas fa-trash-alt text-[11px]"></i>
                        </button>
                    </div>
                </td>
            `;
            tabla.appendChild(row);
        });
    });
}

function conectarContadorTickets(residencialId) {
    const q = query(collection(db, "services"), where("residencialId", "==", residencialId), where("status", "==", "pendiente"));
    onSnapshot(q, (snap) => {
        document.getElementById("countTickets").innerText = snap.size;
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
