import { auth, db, doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where } from "./firebase.js";

let adminContext = null; 

console.log("💎 GESTIAPREMIUM: High-End B2B Engine v5.18 Online.");

// 1. MONITOR DE ACCESO NIVEL SENIOR
auth.onAuthStateChanged((userAuth) => {
    if (!userAuth) {
        window.location.href = "login.html";
        return; 
    }

    const adminRef = doc(db, "users", userAuth.uid);
    onSnapshot(adminRef, (docSnap) => {
        if (!docSnap.exists()) {
            console.error("Critical: Admin Profile Missing.");
            return;
        }

        adminContext = docSnap.data();
        
        // Revelar panel con efecto
        const panel = document.getElementById("panelAdminB2B");
        panel.classList.remove("hidden");
        panel.classList.add("animate-in", "fade-in", "duration-1000");
        
        document.getElementById("lblNombreResidencial").innerText = 
            adminContext.nombre_residencial ? adminContext.nombre_residencial.toUpperCase() : "MASTER CONTROL CENTER";

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
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> ENCRIPTANDO...';

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
        alert("✅ Activo registrado en la red GestiaPremium.");
        document.getElementById("formAltaPersonal").reset();
    } catch (err) {
        alert("❌ Error de protocolo en Base de Datos.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Dar de Alta en el Sistema";
    }
});

// 3. DESPACHO DE ÓRDENES DE TRABAJO
document.getElementById("formTicketB2B").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!adminContext) return;

    const btn = document.getElementById("btnCrearTicket");
    btn.disabled = true;
    btn.innerHTML = "DESPACHANDO...";

    const ticketData = {
        residencialId: adminContext.residencialId,
        nombre_residencial: adminContext.nombre_residencial,
        ubicacion: document.getElementById("tickArea").value.trim(),
        descripcion: document.getElementById("tickDesc").value.trim(),
        tecnicoId: document.getElementById("tickAsignado").value,
        status: "pendiente",
        prioridad: "alta",
        tipo: "B2B_INTERNO",
        fecha_creacion: serverTimestamp(),
        creado_por: auth.currentUser.uid
    };

    try {
        await addDoc(collection(db, "services"), ticketData);
        alert("🚀 Orden de trabajo despachada. Técnico notificado.");
        document.getElementById("formTicketB2B").reset();
    } catch (err) {
        alert("❌ Fallo en el despacho.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Ejecutar Orden de Trabajo";
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
        
        let total = 0;

        snap.forEach(docSnap => {
            const emp = docSnap.data();
            const empId = docSnap.id;
            
            if(emp.rol === "admin_b2b" || emp.rol === "ceo") return; 
            total++;

            if (emp.rol === "tecnico" && emp.estado === "activo") {
                const opt = document.createElement("option");
                opt.value = empId;
                opt.textContent = `${emp.nombre.toUpperCase()} [${emp.especialidad.toUpperCase()}]`;
                select.appendChild(opt);
            }

            const row = document.createElement("tr");
            row.className = "hover:bg-white/[0.02] transition-all group";
            row.innerHTML = `
                <td class="p-6">
                    <div class="font-bold text-white text-sm">${emp.nombre}</div>
                    <div class="text-[10px] text-zinc-500 font-mono italic">${emp.email}</div>
                </td>
                <td class="p-6 text-center">
                    <span class="text-[9px] font-black tracking-widest bg-white/5 border border-white/10 px-3 py-1 rounded-full text-zinc-400 uppercase">
                        ${emp.rol}
                    </span>
                </td>
                <td class="p-6 text-center">
                    <div class="flex items-center justify-center gap-2">
                        <div class="w-2 h-2 rounded-full ${emp.estado === 'activo' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500'}"></div>
                        <span class="text-[10px] font-black uppercase ${emp.estado === 'activo' ? 'text-emerald-500' : 'text-red-500'}">
                            ${emp.estado}
                        </span>
                    </div>
                </td>
                <td class="p-6 text-right">
                    <div class="flex justify-end gap-3">
                        <button onclick="window.cambiarEstado('${empId}', '${emp.estado === 'activo' ? 'suspendido' : 'activo'}')" 
                            class="w-8 h-8 rounded-lg border border-white/5 flex items-center justify-center hover:bg-emerald-500/20 hover:text-emerald-500 transition-all">
                            <i class="fas ${emp.estado === 'activo' ? 'fa-pause' : 'fa-play'} text-[10px]"></i>
                        </button>
                        <button onclick="window.eliminarEmpleado('${empId}', '${emp.nombre}')" 
                            class="w-8 h-8 rounded-lg border border-white/5 flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 transition-all text-zinc-600">
                            <i class="fas fa-trash-alt text-[10px]"></i>
                        </button>
                    </div>
                </td>
            `;
            tabla.appendChild(row);
        });

        document.getElementById("countPersonal").innerText = total;
    });
}

function conectarContadorTickets(residencialId) {
    const q = query(collection(db, "services"), where("residencialId", "==", residencialId), where("status", "==", "pendiente"));
    onSnapshot(q, (snap) => {
        document.getElementById("countTickets").innerText = snap.size;
    });
}

// 5. COMANDOS GLOBALES
window.cambiarEstado = async (id, estado) => {
    try {
        await updateDoc(doc(db, "users", id), { estado: estado });
    } catch (e) { alert("Acceso Denegado."); }
};

window.eliminarEmpleado = async (id, nombre) => {
    if(!confirm(`¿ELIMINAR ACCESO A ${nombre.toUpperCase()}?`)) return;
    try {
        await deleteDoc(doc(db, "users", id));
    } catch (e) { alert("Error de privilegios."); }
};
