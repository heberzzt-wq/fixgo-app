import { 
    auth, db, onAuthStateChanged, 
    collection, query, where, onSnapshot, orderBy, 
    doc, updateDoc, deleteDoc 
} from "./firebase.js";

const getEl = (id) => document.getElementById(id);
let map;
let markers = {}; // Para rastrear múltiples técnicos sin duplicar iconos

// --- 1. PROTECCIÓN DE RUTA (Solo Admin) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Admin logueado:", user.email);
        initAdminDashboard();
    } else {
        window.location.href = "login.html";
    }
});

function initAdminDashboard() {
    initGlobalMap();
    escucharTodosLosTecnicos();
    escucharTodasLasSolicitudes();
}

// --- 2. MAPA GLOBAL DE OPERACIONES ---
function initGlobalMap() {
    const mapDiv = getEl("mapaGlobal");
    if (!mapDiv) return;

    map = new google.maps.Map(mapDiv, {
        center: { lat: 21.1619, lng: -86.8515 },
        zoom: 12,
        styles: [ { "stylers": [ { "color": "#131314" } ] } ] // Estilo oscuro Uber
    });
}

// --- 3. RASTREO MULTI-USUARIO (10,000 técnicos potenciales) ---
function escucharTodosLosTecnicos() {
    // Escuchamos a todos los técnicos que estén online
    const q = query(collection(db, "tecnicos"), where("online", "==", true));

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const id = change.doc.id;

            if (change.type === "added" || change.type === "modified") {
                const pos = data.ubicacion || { lat: data.lat, lng: data.lng };
                
                if (pos && pos.lat && pos.lng) {
                    actualizarMarcadorTecnico(id, pos, data);
                }
            }
            if (change.type === "removed") {
                if (markers[id]) {
                    markers[id].setMap(null);
                    delete markers[id];
                }
            }
        });
    });
}

function actualizarMarcadorTecnico(id, pos, data) {
    if (markers[id]) {
        // Si ya existe, solo movemos la posición
        markers[id].setPosition(pos);
    } else {
        // Si es nuevo, creamos el marcador
        markers[id] = new google.maps.Marker({
            position: pos,
            map: map,
            title: data.nombre,
            icon: {
                url: data.estado === "EN SERVICIO" ? 
                     "https://maps.google.com/mapfiles/ms/icons/red-dot.png" : 
                     "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
                scaledSize: new google.maps.Size(35, 35)
            }
        });
    }
}

// --- 4. GESTIÓN CENTRAL DE SOLICITUDES ---
function escucharTodasLasSolicitudes() {
    const container = getEl("listaSolicitudesAdmin");
    if (!container) return;

    const q = query(collection(db, "solicitudes"), orderBy("fechaCreacion", "desc"));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            
            const row = document.createElement("div");
            row.className = "flex items-center justify-between p-4 border-b border-white/5 text-xs";
            row.innerHTML = `
                <div class="flex-1">
                    <p class="text-white font-bold">${data.clienteNombre}</p>
                    <p class="text-slate-400">${data.direccion}</p>
                </div>
                <div class="flex-1 text-center">
                    <span class="px-2 py-1 rounded-full ${getEstadoClase(data.estado)}">
                        ${data.estado}
                    </span>
                </div>
                <div class="flex-1 text-right">
                    <button onclick="eliminarSolicitud('${id}')" class="text-red-500 hover:text-red-300">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(row);
        });
    });
}

function getEstadoClase(estado) {
    switch(estado) {
        case "PENDIENTE": return "bg-yellow-500/10 text-yellow-500";
        case "EN CAMINO": return "bg-blue-500/10 text-blue-500";
        case "TERMINADO": return "bg-emerald-500/10 text-emerald-500";
        default: return "bg-slate-500/10 text-slate-500";
    }
}

// Funciones globales para botones
window.eliminarSolicitud = async (id) => {
    if (confirm("¿Estás seguro de eliminar esta solicitud?")) {
        await deleteDoc(doc(db, "solicitudes", id));
    }
};
