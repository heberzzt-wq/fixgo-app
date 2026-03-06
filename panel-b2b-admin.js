import { auth, db, doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where } from "./firebase.js";

let adminContext = null; 

console.log("👔 Arrancando Panel Administrador B2B (Modo Recursos Humanos)...");

// 1. Escáner de seguridad
auth.onAuthStateChanged((userAuth) => {
    if (!userAuth) {
        console.warn("🔒 Nadie ha iniciado sesión. El panel está bloqueado.");
        return; 
    }

    // 2. Buscar el perfil de este usuario
    const adminRef = doc(db, "users", userAuth.uid);
    onSnapshot(adminRef, (docSnap) => {
        if (!docSnap.exists()) return;

        adminContext = docSnap.data();

        // 3. Encendemos el panel
        document.getElementById("panelAdminB2B").classList.remove("hidden");
        document.getElementById("lblNombreResidencial").innerText = adminContext.nombre_residencial || "Condominio Sin Nombre";

        // 4. Arrancamos el radar de empleados
        if (adminContext.residencialId) {
            escucharPlantilla(adminContext.residencialId);
        }
    });
});

// Conectamos el botón de guardar
document.getElementById("formAltaPersonal").addEventListener("submit", registrarEmpleado);

async function registrarEmpleado(e) {
    e.preventDefault();

    if (!adminContext || !adminContext.residencialId) {
        return alert("Error crítico: Tu cuenta no tiene un ID de condominio configurado.");
    }

    const btn = document.getElementById("btnGuardarPersonal");
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> CREANDO...';
    btn.disabled = true;

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
        alert(`✅ Empleado Registrado Exitosamente para ${adminContext.nombre_residencial}.`);
        document.getElementById("formAltaPersonal").reset();
    } catch (error) {
        console.error("Error al registrar:", error);
        alert("❌ Error al guardar en base de datos. Revisa tu conexión.");
    } finally {
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
    }
}

function escucharPlantilla(residencialId) {
    const q = query(
        collection(db, "users"), 
        where("residencialId", "==", residencialId)
    );

    onSnapshot(q, (snap) => {
        const tabla = document.getElementById("tablaEmpleadosB2B");
        if (!tabla) return;
        tabla.innerHTML = "";

        if (snap.empty) {
            tabla.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-xs text-gray-500">Aún no tienes personal registrado en este complejo.</td></tr>`;
            return;
        }

        snap.forEach(docSnap => {
            const emp = docSnap.data();
            const empId = docSnap.id; // 👈 OBTENEMOS EL ID ÚNICO DEL DOCUMENTO
            
            if(emp.rol === "admin_b2b" || emp.rol === "ceo") return; 

            // ⚡ BOTONES DE ACCIÓN DINÁMICOS
            const btnSuspender = emp.estado === 'activo' 
                ? `<button onclick="window.cambiarEstado('${empId}', 'suspendido')" class="text-yellow-500 hover:text-yellow-400 p-1 transition-transform active:scale-90" title="Suspender Temporalmente"><i class="fas fa-pause-circle text-lg"></i></button>`
                : `<button onclick="window.cambiarEstado('${empId}', 'activo')" class="text-emerald-500 hover:text-emerald-400 p-1 transition-transform active:scale-90" title="Reactivar"><i class="fas fa-play-circle text-lg"></i></button>`;
            
            const btnEliminar = `<button onclick="window.eliminarEmpleado('${empId}', '${emp.nombre}')" class="text-red-500 hover:text-red-400 p-1 ml-2 transition-transform active:scale-90" title="Despedir (Borrar)"><i class="fas fa-trash text-lg"></i></button>`;

            const row = document.createElement("tr");
            row.className = "border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors";
            row.innerHTML = `
                <td class="p-3 text-sm font-bold text-white">${emp.nombre}</td>
                <td class="p-3 text-[10px] text-zinc-400 uppercase font-black tracking-wider">${emp.rol ? emp.rol.replace('_', ' ') : 'N/A'}</td>
                <td class="p-3 text-xs text-emerald-400">${emp.especialidad || 'N/A'}</td>
                <td class="p-3 text-xs text-blue-300 font-mono">${emp.telefono}</td>
                <td class="p-3 text-right flex justify-end items-center gap-3">
                    <span class="${emp.estado === 'activo' ? 'bg-emerald-900/30 text-emerald-500 border-emerald-500/30' : 'bg-red-900/30 text-red-500 border-red-500/30'} border px-2 py-1 rounded text-[9px] font-black uppercase w-20 text-center">
                        ${emp.estado}
                    </span>
                    <div class="border-l border-zinc-700 pl-3 flex items-center">
                        ${btnSuspender}
                        ${btnEliminar}
                    </div>
                </td>
            `;
            tabla.appendChild(row);
        });
    });
}

// ============================================================================
// 🛠️ FUNCIONES GLOBALES DE RECURSOS HUMANOS
// ============================================================================

window.cambiarEstado = async function(empId, nuevoEstado) {
    if(!confirm(`¿Seguro que deseas cambiar el estado a ${nuevoEstado.toUpperCase()}?`)) return;
    
    try {
        const empleadoRef = doc(db, "users", empId);
        await updateDoc(empleadoRef, { estado: nuevoEstado });
    } catch (error) {
        console.error("Error al actualizar estado:", error);
        alert("❌ Permiso denegado o error de conexión.");
    }
};

window.eliminarEmpleado = async function(empId, nombre) {
    if(!confirm(`⚠️ PELIGRO: ¿Estás seguro de que quieres DESPEDIR y borrar a ${nombre}?\n\nEsta acción NO se puede deshacer.`)) return;
    
    try {
        const empleadoRef = doc(db, "users", empId);
        await deleteDoc(empleadoRef);
    } catch (error) {
        console.error("Error al eliminar:", error);
        alert("❌ Permiso denegado para borrar. Revisa tus reglas de Firebase.");
    }
};
