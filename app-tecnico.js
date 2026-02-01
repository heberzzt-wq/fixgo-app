// app-tecnico.js
import { auth, db } from "./firebase-config.js"; // Usamos tu config centralizada
import { 
    doc, 
    getDoc, 
    updateDoc, 
    collection, 
    query, 
    where, 
    onSnapshot, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let tecnicoUID = null;
let watchID = null; // Cambiamos intervalo por watchPosition (más preciso)

// Elementos de la Interfaz (IDs actualizados)
const nombreTecnicoEl = document.getElementById("nombreTecnico");
const infoVehiculoEl = document.getElementById("infoVehiculo");
const panelSolicitudes = document.getElementById("listaServicios");
const btnGps = document.getElementById("btnGps");
const gpsStatus = document.getElementById("gpsStatus");
const logoutBtn = document.getElementById("logoutBtn");

// 1. Verificación de Usuario y Rol
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    tecnicoUID = user.uid;
    const docSnap = await getDoc(doc(db, "tecnicos", tecnicoUID));

    if (docSnap.exists()) {
        const data = docSnap.data();
        nombreTecnicoEl.innerText = data.nombre || "Técnico";
        infoVehiculoEl.innerText = `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`;
        
        // Iniciar escucha de servicios
        escucharSolicitudes();
    } else {
        alert("Acceso denegado: No eres técnico.");
        signOut(auth);
    }
});

// 2. Control del GPS (Encendido/Apagado)
btnGps.addEventListener("click", () => {
    if (!watchID) {
        activarRastreo();
    } else {
        desactivarRastreo();
    }
});

function activarRastreo() {
    if (!navigator.geolocation) return alert("Tu navegador no soporta GPS");

    btnGps.classList.replace("bg-slate-700", "bg-emerald-500");
    btnGps.classList.add("animate-pulse");
    btnGps.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span>RASTREO ACTIVO</span>';
    gpsStatus.innerText = "Transmitiendo ubicación en tiempo real...";
    gpsStatus.classList.replace("text-slate-500", "text-emerald-400");

    watchID = navigator.geolocation.watchPosition(async (pos) => {
        try {
            await updateDoc(doc(db, "tecnicos", tecnicoUID), {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                ultimaConexion: serverTimestamp(),
                estado: "EN RUTA"
            });
        } catch (error) {
            console.error("Error GPS:", error);
        }
    }, (err) => console.error(err), { enableHighAccuracy: true });
}

function desactivarRastreo() {
    navigator.geolocation.clearWatch(watchID);
    watchID = null;
    btnGps.classList.replace("bg-emerald-500", "bg-slate-700");
    btnGps.classList.remove("animate-pulse");
    btnGps.innerHTML = '<i class="fas fa-location-arrow"></i> <span>ACTIVAR RASTREO GPS</span>';
    gpsStatus.innerText = "El rastreo está desactivado";
    gpsStatus.classList.replace("text-emerald-400", "text-slate-500");
}

// 3. Escuchar Solicitudes Pendientes
function escucharSolicitudes() {
    const q = query(collection(db, "solicitudes"), where("estado", "==", "PENDIENTE"));
    
    onSnapshot(q, (snapshot) => {
        panelSolicitudes.innerHTML = "";
        if (snapshot.empty) {
            panelSolicitudes.innerHTML = "<p class='text-slate-500 text-center py-4 italic text-sm'>No hay servicios pendientes en este momento.</p>";
            return;
        }

        snapshot.forEach(docSnap => {
            const sol = docSnap.data();
            const div = document.createElement("div");
            div.className = "bg-slate-800 p-5 rounded-2xl border border-slate-700 shadow-lg";
            div.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <h4 class="font-bold text-indigo-400">${sol.clienteNombre || 'Cliente'}</h4>
                    <span class="text-[10px] bg-slate-700 px-2 py-1 rounded">NUEVO</span>
                </div>
                <p class="text-sm text-slate-300 mb-1"><i class="fas fa-map-marker-alt text-red-400 mr-2"></i>${sol.direccion}</p>
                <p class="text-xs text-slate-500 mb-4">${sol.descripcion}</p>
                <button onclick="aceptarServicio('${docSnap.id}')" class="w-full bg-indigo-600 py-3 rounded-xl font-bold hover:bg-indigo-500 transition-all">
                    ACEPTAR SERVICIO
                </button>
            `;
            panelSolicitudes.appendChild(div);
        });
    });
}

// 4. Aceptar Servicio
window.aceptarServicio = async (id) => {
    try {
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "EN CAMINO",
            tecnicoId: tecnicoUID,
            aceptadoEn: serverTimestamp()
        });
        alert("Servicio aceptado. ¡Ve con cuidado!");
    } catch (error) {
        alert("Error al aceptar el servicio");
    }
};

// 5. Logout
logoutBtn.addEventListener("click", () => signOut(auth));
