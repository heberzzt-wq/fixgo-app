// app-admin.js - Control Total FixGo
import { 
    auth, 
    db, 
    signOut, 
    onAuthStateChanged, 
    doc, 
    getDoc, 
    collection, 
    getDocs, 
    query, 
    where 
} from "./firebase.js"; 

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
            // Definimos un color basado en si está en servicio o libre
            const statusColor = t.enServicio ? "bg-amber-500" : "bg-emerald-500";
            const statusText = t.enServicio ? "OCUPADO" : "EN LÍNEA";

            cont.innerHTML += `
                <div class="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm mb-4 transition-all hover:shadow-md">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-truck-pickup"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800 leading-tight">${t.nombre || "Técnico"}</h4>
                                <p class="text-[10px] text-indigo-600 font-bold uppercase tracking-tighter">${t.vehiculo || "Unidad"} | ${t.placas || "S/P"}</p>
                            </div>
                        </div>
                        <span class="text-[9px] ${statusColor} text-white px-2 py-1 rounded-lg font-black border shadow-sm">${statusText}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="verMapaTecnico('${id}')" class="flex items-center justify-center gap-2 bg-slate-900 text-white text-[10px] font-bold py-3 rounded-xl hover:bg-indigo-600 transition-all">
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

// --- 2. Acción: Cargar Clientes ---
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
                <div class="bg-slate-50 p-4 rounded-[1.5rem] border border-slate-200 mb-4 transition-all hover:bg-white">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                                <i class="fas fa-user text-sm"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800">${c.nombre || "Usuario"}</h4>
                                <p class="text-[10px] text-slate-400 font-medium">${c.correo || "Sin correo"}</p>
                            </div>
                        </div>
                        <button onclick="verServiciosCliente('${id}', '${c.nombre}')" class="w-10 h-10 bg-white border border-slate-200 text-indigo-600 rounded-xl flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                            <i class="fas fa-list-check text-xs"></i>
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

window.verMapaTecnico = (id) => {
    window.location.href = `rastreo.html?id=${id}`;
};

window.verServiciosCliente = async (clienteId, nombre) => {
    try {
        const q = query(collection(db, "servicios"), where("clienteId", "==", clienteId));
        const snap = await getDocs(q);

        let detalle = `HISTORIAL DE ${nombre.toUpperCase()}:\n`;

        if (snap.empty) {
            alert(`${detalle}\nSin servicios registrados.`);
        } else {
            snap.forEach(s => {
                const serv = s.data();
                // Aquí ya mostramos la CATEGORÍA que el cliente eligió en el nuevo index.html
                detalle += `\n📌 [${serv.categoria || 'GRAL'}] - ${serv.estado || 'PENDIENTE'}\n   Detalle: ${serv.descripcion}\n`;
            });
            alert(detalle);
        }
    } catch (e) {
        alert("Error al consultar servicios.");
    }
};

window.verDetalles = async (id, coleccion) => {
    const docSnap = await getDoc(doc(db, coleccion, id));
    if (docSnap.exists()) {
        const d = docSnap.data();
        alert(`FICHA TÉCNICA FIXGO:\n----------------------\nNombre: ${d.nombre}\nVehículo: ${d.vehiculo || 'N/A'}\nPlacas: ${d.placas || 'N/A'}\nStatus: ${d.estado || 'DISPONIBLE'}`);
    }
};

// --- 4. Control de Acceso y Sesión ---
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

            await cargarTecnicos();
            await cargarClientes();
        } else {
            alert("Acceso denegado: Se requieren credenciales de Administrador.");
            await signOut(auth);
            window.location.href = "login.html";
        }
    } catch (error) {
        console.error("Error Auth Admin:", error);
    }
});

const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        if(confirm("¿Cerrar sesión administrativa?")) {
            await signOut(auth);
            window.location.href = "login.html";
        }
    });
}
