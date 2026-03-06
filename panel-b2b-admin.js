import { auth, db, doc, onSnapshot, collection, addDoc, serverTimestamp, query, where } from "./firebase.js";

let adminContext = null; // Empezamos en blanco, Firebase nos dirá quién es

console.log("👔 Arrancando Panel Administrador B2B (Modo Real)...");

// 1. Escáner de seguridad: ¿Quién entró a la página?
auth.onAuthStateChanged((userAuth) => {
    if (!userAuth) {
        console.warn("🔒 Nadie ha iniciado sesión. El panel está bloqueado.");
        return; // Si no hay sesión, no hacemos nada
    }

    console.log("✅ Usuario detectado. Buscando su condominio...");

    // 2. Buscar el perfil de este usuario en la base de datos
    const adminRef = doc(db, "users", userAuth.uid);
    onSnapshot(adminRef, (docSnap) => {
        if (!docSnap.exists()) return;

        adminContext = docSnap.data();

        // 3. Ya tenemos sus datos, ahora sí encendemos el panel
        document.getElementById("panelAdminB2B").classList.remove("hidden");
        document.getElementById("lblNombreResidencial").innerText = adminContext.nombre_residencial || "Condominio Sin Nombre";

        // 4. Arrancamos el radar de empleados con su ID real
        if (adminContext.residencialId) {
            escucharPlantilla(adminContext.residencialId);
        } else {
            console.warn("⚠️ Cuidado: Tu cuenta no tiene un 'residencialId' asignado.");
        }
    });
});

// Conectamos el botón de guardar
document.getElementById("formAltaPersonal").addEventListener("submit", registrarEmpleado);

async function registrarEmpleado(e) {
    e.preventDefault();

    // Candado de seguridad antes de guardar
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
        residencialId: adminContext.residencialId, // 👈 Sello de Aislamiento Automático
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
            
            // Ocultamos al CEO o al Admin para que no salgan en la lista de chacha/técnicos
            if(emp.rol === "admin_b2b" || emp.rol === "ceo") return; 

            const row = document.createElement("tr");
            row.className = "border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors";
            row.innerHTML = `
                <td class="p-3 text-sm font-bold text-white">${emp.nombre}</td>
                <td class="p-3 text-[10px] text-zinc-400 uppercase font-black tracking-wider">${emp.rol ? emp.rol.replace('_', ' ') : 'N/A'}</td>
                <td class="p-3 text-xs text-emerald-400">${emp.especialidad || 'N/A'}</td>
                <td class="p-3 text-xs text-blue-300 font-mono">${emp.telefono}</td>
                <td class="p-3 text-right">
                    <span class="${emp.estado === 'activo' ? 'bg-emerald-900/30 text-emerald-500 border-emerald-500/30' : 'bg-red-900/30 text-red-500 border-red-500/30'} border px-2 py-1 rounded text-[9px] font-black uppercase">
                        ${emp.estado}
                    </span>
                </td>
            `;
            tabla.appendChild(row);
        });
    });
}
