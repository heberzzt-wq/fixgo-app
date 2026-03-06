import { auth, db, doc, onSnapshot, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where } from "./firebase.js";

let adminContext = null; 

console.log("👔 GESTIA B2B: Motor de Administración Senior Activo.");

// 1. CONTROL DE ACCESO Y CONTEXTO
auth.onAuthStateChanged((userAuth) => {
    if (!userAuth) {
        console.warn("🔒 Acceso denegado: Sin sesión activa.");
        window.location.href = "login.html";
        return; 
    }

    const adminRef = doc(db, "users", userAuth.uid);
    onSnapshot(adminRef, (docSnap) => {
        if (!docSnap.exists()) return;

        adminContext = docSnap.data();
        document.getElementById("panelAdminB2B").classList.remove("hidden");
        document.getElementById("lblNombreResidencial").innerText = adminContext.nombre_residencial || "Complejo Corporativo";

        if (adminContext.residencialId) {
            escucharPlantilla(adminContext.residencialId);
        }
    });
});

// 2. REGISTRO DE NUEVO PERSONAL
document.getElementById("formAltaPersonal").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!adminContext?.residencialId) return alert("Error: Contexto B2B no cargado.");

    const btn = document.getElementById("btnGuardarPersonal");
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESANDO...';
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
        alert("✅ Personal dado de alta correctamente.");
        document.getElementById("formAltaPersonal").reset();
    } catch (error) {
        console.error("Error B2B Registro:", error);
        alert("❌ Error en Firebase. Revisa las reglas de escritura.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

// 3. GENERACIÓN DE ÓRDENES DE TRABAJO (TICKETS)
document.getElementById("formTicketB2B").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    if (!adminContext) return;

    const btn = document.getElementById("btnCrearTicket");
    btn.disabled = true;
    btn.innerHTML = "ENVIANDO...";

    const ticketData = {
        residencialId: adminContext.residencialId,
        nombre_residencial: adminContext.nombre_residencial,
        ubicacion: document.getElementById("tickArea").value.trim(),
        descripcion: document.getElementById("tickDesc").value.trim(),
        tecnicoId: document.getElementById("tickAsignado").value,
        status: "pendiente",
        tipo: "B2B_INTERNO",
        metodo_pago: "nomina_interna",
        fecha_creacion: serverTimestamp(),
        creado_por: auth.currentUser.uid
    };

    try {
        await addDoc(collection(db, "services"), ticketData);
        alert("🚀 Orden despachada al técnico.");
        document.getElementById("formTicketB2B").reset();
    } catch (error) {
        alert("❌ Error al generar ticket.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "ENVIAR ORDEN";
    }
});

// 4. RADAR DE PLANTILLA EN TIEMPO REAL
function escucharPlantilla(residencialId) {
    const q = query(collection(db, "users"), where("residencialId", "==", residencialId));

    onSnapshot(q, (snap) => {
        const tabla = document.getElementById("tablaEmpleadosB2B");
        const selectTecnicos = document.getElementById("tickAsignado");
        if (!tabla) return;

        tabla.innerHTML = "";
        selectTecnicos.innerHTML = '<option value="">-- Seleccionar Técnico --</option>';
        
        let count = 0;

        snap.forEach(docSnap => {
            const emp = docSnap.data();
            const empId = docSnap.id;
            
            if(emp.rol === "admin_b2b" || emp.rol === "ceo") return; 
            count++;

            // Actualizar select de tickets (solo técnicos activos)
            if (emp.rol === "tecnico" && emp.estado === "activo") {
                const opt = document.createElement("option");
                opt.value = empId;
                opt.textContent = `${emp.nombre} (${emp.especialidad})`;
                selectTecnicos.appendChild(opt);
            }

            // Dibujar Fila en Tabla
            const row = document.createElement("tr");
            row.className = "border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors text-xs";
            row.innerHTML = `
                <td class="p-4 font-bold text-white">${emp.nombre}</td>
                <td class="p-4 uppercase text-zinc-400 text-[10px] font-black">${emp.rol}</td>
                <td class="p-4 text-emerald-400">${emp.especialidad}</td>
                <td class="p-4 text-right flex justify-end gap-2">
                    <button onclick="window.cambiarEstado('${empId}', '${emp.estado === 'activo' ? 'suspendido' : 'activo'}')" 
                        class="${emp.estado === 'activo' ? 'text-yellow-500' : 'text-emerald-500'} p-1">
                        <i class="fas ${emp.estado === 'activo' ? 'fa-pause-circle' : 'fa-play-circle'}"></i>
                    </button>
                    <button onclick="window.eliminarEmpleado('${empId}', '${emp.nombre}')" class="text-red-500 p-1">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tabla.appendChild(row);
        });

        document.getElementById("countPersonal").innerText = `${count} Personal Registrado`;
    });
}

// 5. FUNCIONES GLOBALES DE GESTIÓN
window.cambiarEstado = async (id, estado) => {
    if(!confirm(`¿Cambiar estado a ${estado}?`)) return;
    await updateDoc(doc(db, "users", id), { estado: estado });
};

window.eliminarEmpleado = async (id, nombre) => {
    if(!confirm(`¿Eliminar permanentemente a ${nombre}?`)) return;
    await deleteDoc(doc(db, "users", id));
};
