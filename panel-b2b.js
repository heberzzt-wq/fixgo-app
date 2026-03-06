import { db, doc, onSnapshot, collection, addDoc, serverTimestamp, query, where } from "./firebase.js";

let adminContext = null; // Guardará los datos del administrador logueado

export function iniciarPanelAdminB2B(userAuth) {
    console.log("👔 Arrancando Panel Administrador B2B...");
    
    // Mostramos el panel
    document.getElementById("panelAdminB2B").classList.remove("hidden");

    // 1. Escuchar los datos del Administrador actual
    const adminRef = doc(db, "users", userAuth.uid);
    onSnapshot(adminRef, (docSnap) => {
        if (!docSnap.exists()) return;
        adminContext = docSnap.data();
        
        // Poner el nombre del condominio en el título
        const lblResidencial = document.getElementById("lblNombreResidencial");
        if(lblResidencial) lblResidencial.innerText = adminContext.nombre_residencial || "Complejo Sin Nombre";
        
        // Arrancar el radar de empleados para la tabla
        if(adminContext.residencialId) {
            escucharPlantilla(adminContext.residencialId);
        } else {
            console.warn("⚠️ Este administrador no tiene un residencialId asignado.");
        }
    });

    // 2. Conectar el Formulario de Alta
    const form = document.getElementById("formAltaPersonal");
    if(form) {
        form.addEventListener("submit", registrarEmpleado);
    }
}

async function registrarEmpleado(e) {
    e.preventDefault();
    if (!adminContext || !adminContext.residencialId) {
        return alert("Error: Tu cuenta de Admin no tiene un ID de condominio configurado.");
    }

    const btn = document.getElementById("btnGuardarPersonal");
    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> CREANDO...';
    btn.disabled = true;

    // Construimos el JSON del nuevo empleado con el candado B2B
    const nuevoEmpleado = {
        nombre: document.getElementById("regNombre").value.trim(),
        telefono: document.getElementById("regTelefono").value.trim(),
        email: document.getElementById("regCorreo").value.trim().toLowerCase(),
        rol: document.getElementById("regRol").value,
        especialidad: document.getElementById("regEspecialidad").value,
        residencialId: adminContext.residencialId, // 👈 Sello de Aislamiento B2B
        nombre_residencial: adminContext.nombre_residencial,
        estado: "activo",
        disponible: true,
        fecha_registro: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "users"), nuevoEmpleado);
        alert(`✅ Empleado Registrado Exitosamente.\n\nPor favor, dile a ${nuevoEmpleado.nombre} que inicie sesión en la app con su correo electrónico.`);
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
    // Buscamos solo a los usuarios que pertenezcan a ESTE condominio
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
            
            // Ocultamos al propio admin de la tabla para que solo vea a su staff
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
