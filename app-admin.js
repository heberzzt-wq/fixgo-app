// app-admin.js - Control Total FixGo
import { auth, signOut } from "./firebase-auth.js";
import { db } from "./firebase-config.js";
import {
    doc,
    getDoc,
    collection,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

console.log("🚀 Sistema de Acción Admin FixGo Activo");

// --- 1. Acción: Cargar Técnicos con Rastreo ---
async function cargarTecnicos() {
    const cont = document.getElementById("sectionTecnicos");
    if (!cont) return;

    try {
        const querySnapshot = await getDocs(collection(db, "tecnicos"));
        cont.innerHTML = "";

        if (querySnapshot.empty) {
            cont.innerHTML = `<p class="text-slate-500 italic text-center py-4">Sin unidades reportadas.</p>`;
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            cont.innerHTML += `
                <div class="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm mb-4 transition-all hover:shadow-md">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-blue-200">
                                <i class="fas fa-truck-pickup"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800 leading-tight">${t.nombre || "Técnico"}</h4>
                                <p class="text-[10px] text-blue-600 font-bold uppercase tracking-tighter">${t.vehiculo || "Unidad"} | ${t.placas || "S/P"}</p>
                            </div>
                        </div>
                        <span class="text-[9px] bg-emerald-100 text-emerald-600 px-2 py-1 rounded-lg font-black border border-emerald-200">EN LÍNEA</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="verMapaTecnico('${id}')" class="flex items-center justify-center gap-2 bg-slate-900 text-white text-[10px] font-bold py-3 rounded-xl hover:bg-blue-600 transition-all">
                            <i class="fas fa-location-crosshairs"></i> RASTREAR
                        </button>
                        <button onclick="verDetalles('${id}', 'tecnicos')" class="flex items-center justify-center gap-2 bg-slate-100 text-slate-600 text-[10px] font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">
                            <i class="fas fa-info-circle"></i> PERFIL
                        </button>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        console.error("Error técnicos:", e);
        cont.innerHTML = "Error de conexión.";
    }
}

// --- 2. Acción: Cargar Clientes y sus Servicios ---
async function cargarClientes() {
    const cont = document.getElementById("sectionClientes");
    if (!cont) return;

    try {
        const querySnapshot = await getDocs(collection(db, "clientes"));
        cont.innerHTML = "";

        if (querySnapshot.empty) {
            cont.innerHTML = `<p class="text-slate-500 italic text-center py-4">No hay clientes en la base.</p>`;
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const c = docSnap.data();
            const id = docSnap.id;

            cont.innerHTML += `
                <div class="bg-slate-50 p-4 rounded-[1.5rem] border border-slate-200 mb-4 transition-all">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center">
                                <i class="fas fa-user text-sm"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800">${c.nombre || "Usuario"}</h4>
                                <p class="text-[10px] text-slate-400 font-medium">${c.correo || "Sin correo"}</p>
                            </div>
                        </div>
                        <button onclick="verServiciosCliente('${id}', '${c.nombre}')" class="w-8 h-8 bg-white border border-slate-200 text-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                            <i class="fas fa-concierge-bell text-xs"></i>
                        </button>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        console.error("Error clientes:", e);
    }
}

// --- 3. Funciones Globales de Acción (Window) ---

// Acción: Abrir mapa de rastreo del técnico
window.verMapaTecnico = (id) => {
    // Redirige pasando el ID por la URL para que el mapa sepa a quién seguir
    window.location.href = `rastreo.html?id=${id}`;
};

// Acción: Ver servicios activos de un cliente
window.verServiciosCliente = async (clienteId, nombre) => {
    try {
        // Buscamos en una colección llamada "servicios" donde el clienteId coincida
        const q = query(collection(db, "servicios"), where("clienteId", "==", clienteId));
        const snap = await getDocs(q);

        let detalle = `SOLICITUDES DE ${nombre.toUpperCase()}:\n`;

        if (snap.empty) {
            alert(`${detalle}\nActualmente no tiene servicios pendientes.`);
        } else {
            snap.forEach(s => {
                const serv = s.data();
                detalle += `\n- ${serv.descripcion || 'Servicio'} (${serv.estado || 'Pendiente'})`;
            });
            alert(detalle);
        }
    } catch (e) {
        alert("Error al consultar servicios.");
    }
};

// Acción: Ver detalles generales
window.verDetalles = async (id, coleccion) => {
    const docSnap = await getDoc(doc(db, coleccion, id));
    if (docSnap.exists()) {
        const d = docSnap.data();
        alert(`Ficha FixGo:\nNombre: ${d.nombre}\nContacto: ${d.correo || d.telefono}\nEstado: ${d.estado || 'ACTIVO'}`);
    }
};

// --- 4. Control de Acceso ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists() && adminSnap.data().rol === "ADMIN") {
            const data = adminSnap.data();
            const elNombre = document.getElementById("nombreAdmin");
            if (elNombre) elNombre.textContent = data.nombre || "Admin FixGo";

            // Disparar carga de datos
            await cargarTecnicos();
            await cargarClientes();
        } else {
            alert("No tienes permisos de administrador.");
            await signOut(auth);
            window.location.href = "login.html";
        }
    } catch (error) {
        console.error("Error Auth:", error);
    }
});

// Botón Logout
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "login.html";
    });
}
