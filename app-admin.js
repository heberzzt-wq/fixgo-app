// app-admin.js - Centro de Comando FixGo Pro
import { 
    auth, 
    db, 
    signOut, 
    onAuthStateChanged 
} from "./firebase.js"; 
import { 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    orderBy, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const getEl = (id) => document.getElementById(id);

// VARIABLES GLOBALES PARA EL MAPA
let map;
let marcadoresTecnicos = {}; 

// --- 1. CONTROL DE ACCESO Y SESIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists() && adminSnap.data().rol === "ADMIN") {
            getEl("nombreAdmin").textContent = adminSnap.data().nombre || "Admin FixGo";
            
            // Inicializar el sistema
            inicializarMapa();
            escucharTecnicos();
            escucharClientes();
            escucharServicios();
        } else {
            alert("Acceso denegado: Se requieren credenciales de Administrador.");
            await signOut(auth);
            window.location.href = "login.html";
        }
    } catch (error) {
        console.error("Error Auth Admin:", error);
    }
});

// --- 2. CONFIGURACIÓN DEL MAPA ---
function inicializarMapa() {
    if (!getEl('map')) return;
    
    // Centrado en Quintana Roo
    map = L.map('map').setView([21.1619, -86.8515], 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);
}

// --- 3. MONITOREO REACTIVO (REAL-TIME) ---

function escucharTecnicos() {
    const cont = getEl("sectionTecnicos");
    
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        cont.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;
            const statusColor = t.estado === "EN SERVICIO" ? "bg-amber-500" : "bg-emerald-500";

            // Renderizado en Lista
            cont.innerHTML += `
                <div class="bg-white p-4 rounded-[1.5rem] border border-slate-200 shadow-sm mb-4 animate-fade">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center">
                                <i class="fas fa-truck-pickup"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800 leading-tight">${t.nombre}</h4>
                                <p class="text-[10px] text-indigo-600 font-bold uppercase tracking-tighter">${t.vehiculo} | ${t.placas}</p>
                            </div>
                        </div>
                        <span class="text-[9px] ${statusColor} text-white px-2 py-1 rounded-lg font-black uppercase">${t.estado || 'EN LÍNEA'}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="enfocarTecnico(${t.lat}, ${t.lng})" class="bg-slate-900 text-white text-[10px] font-bold py-3 rounded-xl hover:bg-indigo-600 transition-all">
                            <i class="fas fa-location-crosshairs"></i> RASTREAR
                        </button>
                        <button onclick="verDetalles('${id}', 'tecnicos')" class="bg-slate-100 text-slate-600 text-[10px] font-bold py-3 rounded-xl hover:bg-slate-200 transition-all">
                            <i class="fas fa-info-circle"></i> PERFIL
                        </button>
                    </div>
                </div>
            `;

            // Actualizar Mapa
            if (t.lat && t.lng) {
                const pos = [t.lat, t.lng];
                if (marcadoresTecnicos[id]) {
                    marcadoresTecnicos[id].setLatLng(pos);
                } else {
                    const icon = L.divIcon({
                        html: `<div class="${statusColor} w-8 h-8 rounded-lg flex items-center justify-center border-2 border-white shadow-lg text-white">
                                <i class="fas fa-truck-pickup text-[10px]"></i>
                               </div>`,
                        className: 'custom-div-icon', iconSize: [32, 32]
                    });
                    marcadoresTecnicos[id] = L.marker(pos, { icon }).addTo(map).bindPopup(`<b>${t.nombre}</b>`);
                }
            }
        });
    });
}

function escucharClientes() {
    const cont = getEl("sectionClientes");
    onSnapshot(collection(db, "usuarios"), (snapshot) => {
        cont.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const c = docSnap.data();
            if (c.rol !== "cliente") return;

            cont.innerHTML += `
                <div class="bg-slate-50 p-4 rounded-[1.5rem] border border-slate-200 min-w-[250px] shadow-sm">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                                <i class="fas fa-user text-sm"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800 text-xs">${c.nombre}</h4>
                                <p class="text-[9px] text-slate-400 font-medium truncate w-32">${c.correo}</p>
                            </div>
                        </div>
                        <button onclick="verServiciosCliente('${docSnap.id}', '${c.nombre}')" class="w-8 h-8 bg-white border border-slate-200 text-indigo-600 rounded-lg flex items-center justify-center hover:bg-indigo-600 hover:text-white transition-all">
                            <i class="fas fa-list-check text-[10px]"></i>
                        </button>
                    </div>
                </div>
            `;
        });
    });
}

function escucharServicios() {
    const cont = getEl("sectionServicios");
    const q = query(collection(db, "solicitudes"), orderBy("fechaCreacion", "desc"));

    onSnapshot(q, (snapshot) => {
        cont.innerHTML = snapshot.empty ? `<p class="text-center text-slate-400 text-xs py-10">Sin órdenes activas</p>` : "";
        snapshot.forEach((docSnap) => {
            const s = docSnap.data();
            const colors = { "SOLICITADO": "bg-amber-500", "EN_CAMINO": "bg-blue-600", "EN_SITIO": "bg-indigo-600", "FINALIZADO": "bg-emerald-500" };

            cont.innerHTML += `
                <div class="p-4 bg-slate-50 rounded-2xl mb-3 border border-slate-200 animate-fade">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-[9px] font-black text-white px-2 py-0.5 rounded-md ${colors[s.estado] || 'bg-slate-400'}">${s.estado}</span>
                        <p class="text-[9px] text-slate-400 font-bold italic uppercase">${s.categoria || 'Gral'}</p>
                    </div>
                    <p class="text-xs font-black text-slate-800 leading-tight">${s.direccion}</p>
                    <div class="mt-3 pt-2 border-t border-slate-200 flex justify-between items-center">
                        <p class="text-[9px] font-bold text-slate-500 uppercase">👤 ${s.clienteNombre || 'Cliente'}</p>
                        <p class="text-[9px] font-bold text-indigo-600 uppercase">🛠️ ${s.tecnicoId ? 'En Proceso' : 'Pendiente'}</p>
                    </div>
                </div>
            `;
        });
    });
}

// --- 4. ACCIONES GLOBALES ---

window.enfocarTecnico = (lat, lng) => {
    if (lat && lng) map.setView([lat, lng], 15);
};

window.verServiciosCliente = async (clienteId, nombre) => {
    const q = query(collection(db, "solicitudes"), where("clienteId", "==", clienteId));
    onSnapshot(q, (snap) => {
        let det = `HISTORIAL DE ${nombre.toUpperCase()}:\n`;
        if (snap.empty) return alert("Sin servicios registrados.");
        snap.forEach(s => {
            const serv = s.data();
            det += `\n📌 [${serv.categoria || 'GRAL'}] - ${serv.estado}\n   Dir: ${serv.direccion}\n`;
        });
        alert(det);
    });
};

window.verDetalles = async (id, col) => {
    const snap = await getDoc(doc(db, col, id));
    if (snap.exists()) {
        const d = snap.data();
        alert(`FICHA TÉCNICA:\nNombre: ${d.nombre}\nUnidad: ${d.vehiculo}\nPlacas: ${d.placas}\nEstado: ${d.estado}`);
    }
};

// LOGOUT
getEl("btnLogout")?.addEventListener("click", async () => {
    if(confirm("¿Cerrar sesión administrativa?")) {
        await signOut(auth);
        window.location.href = "login.html";
    }
});
