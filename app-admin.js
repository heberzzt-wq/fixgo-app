import { auth, db, signOut, onAuthStateChanged } from "./firebase.js"; 
import { 
    doc, getDoc, collection, query, where, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const getEl = (id) => document.getElementById(id);
let map;
let marcadoresTecnicos = {}; 

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }

    // Verificación simple de admin (puedes reforzarla con Claims de Firebase)
    const adminRef = doc(db, "admins", user.uid);
    const adminSnap = await getDoc(adminRef);

    // Si no existe colección admins, permitimos paso temporal para configurar (OJO: Cerrar en prod)
    if (true) { // CAMBIAR 'true' por lógica real de roles
        if(getEl("nombreAdmin")) getEl("nombreAdmin").textContent = user.email;
        inicializarMapa();
        escucharTecnicos();
        escucharServicios();
        escucharClientes();
    }
});

function inicializarMapa() {
    if (!getEl('map')) return;
    map = L.map('map').setView([21.1619, -86.8515], 12); // Cancún Centro
    
    // Mapa Dark Mode (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: 'FixGo Admin',
        maxZoom: 19
    }).addTo(map);
}

function escucharTecnicos() {
    const cont = getEl("sectionTecnicos");
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        if(cont) cont.innerHTML = "";
        
        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;
            const enServicio = t.estado === "EN SERVICIO";
            const colorDot = enServicio ? "bg-amber-500" : "bg-emerald-500";

            // Render Lista Lateral
            if(cont) {
                cont.innerHTML += `
                    <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm mb-3 flex justify-between items-center hover:shadow-md transition-shadow cursor-pointer" onclick="map.setView([${t.lat}, ${t.lng}], 16)">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs">
                                <i class="fas fa-user-astronaut"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-slate-800 text-sm">${t.nombre || 'Técnico'}</h4>
                                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${t.vehiculo || 'N/A'}</p>
                            </div>
                        </div>
                        <div class="${colorDot} w-2 h-2 rounded-full ${enServicio ? 'animate-pulse' : ''}"></div>
                    </div>
                `;
            }

            // Render Marcadores Mapa
            if (t.lat && t.lng) {
                const iconHtml = `<div class="relative">
                    <div class="${enServicio ? 'bg-amber-500' : 'bg-emerald-500'} w-4 h-4 rounded-full border-2 border-white shadow-lg"></div>
                    ${enServicio ? '<div class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping"></div>' : ''}
                </div>`;

                const customIcon = L.divIcon({
                    className: 'custom-marker',
                    html: iconHtml
                });

                if (marcadoresTecnicos[id]) {
                    marcadoresTecnicos[id].setLatLng([t.lat, t.lng]);
                    marcadoresTecnicos[id].setIcon(customIcon);
                } else {
                    marcadoresTecnicos[id] = L.marker([t.lat, t.lng], { icon: customIcon })
                        .addTo(map)
                        .bindPopup(`<b>${t.nombre}</b><br>${t.estado}`);
                }
            }
        });
    });
}

function escucharServicios() {
    const cont = getEl("sectionServicios");
    const q = query(collection(db, "solicitudes"), orderBy("fechaCreacion", "desc")); // Limitar en prod

    onSnapshot(q, (snapshot) => {
        if(cont) cont.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const s = docSnap.data();
            const estadosColor = {
                "SOLICITADO": "text-slate-500 bg-slate-100",
                "EN_CAMINO": "text-blue-600 bg-blue-50",
                "EN_SITIO": "text-amber-600 bg-amber-50",
                "FINALIZADO": "text-emerald-600 bg-emerald-50"
            };

            if(cont) {
                cont.innerHTML += `
                    <div class="p-3 mb-2 border-b border-slate-100 last:border-0">
                        <div class="flex justify-between mb-1">
                            <span class="text-[9px] font-black uppercase ${estadosColor[s.estado] || 'bg-gray-100'} px-2 py-0.5 rounded">${s.estado}</span>
                            <span class="text-[9px] text-slate-400">${s.categoria || 'Gral'}</span>
                        </div>
                        <p class="text-xs font-bold text-slate-700 truncate">${s.direccion}</p>
                        <p class="text-[9px] text-slate-400 mt-1">Tech: ${s.tecnicoId ? 'Asignado' : 'Pendiente'}</p>
                    </div>
                `;
            }
        });
    });
}

function escucharClientes() {
    // Similar lógica para llenar la lista horizontal de clientes
}

getEl("btnLogout")?.addEventListener("click", () => signOut(auth));
