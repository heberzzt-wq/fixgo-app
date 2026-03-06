import { db, doc, onSnapshot, collection, addDoc, serverTimestamp, query, where } from "./firebase.js";

// Datos de prueba simulando que ya inició sesión un gerente
let adminContext = {
    residencialId: "puerto_cancun_001", 
    nombre_residencial: "Puerto Cancún Central"
};

console.log("👔 Arrancando Panel Administrador B2B...");

// 1. Mostramos el panel y ponemos el nombre
document.getElementById("panelAdminB2B").classList.remove("hidden");
document.getElementById("lblNombreResidencial").innerText = adminContext.nombre_residencial;

// 2. Arrancamos el radar de la tabla
escucharPlantilla(adminContext.residencialId);

// 3. Conectamos el botón de guardar
document.getElementById("formAltaPersonal").addEventListener("submit", registrarEmpleado);

async function registrarEmpleado(e) {
    e.preventDefault();

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
        alert(`✅ Empleado Registrado Exitosamente.`);
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
            if(emp.rol === "admin_b2b") return; 

            const row = document.createElement("tr");
            row.className = "border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors";
            row.innerHTML = `
                <td class="p-3 text-sm font-bold text-white">${emp.nombre}</td>
                <td class="p-3 text-[10px] text-zinc-400 uppercase font-black tracking-wider">${emp.rol.replace('_', ' ')}</td>
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
