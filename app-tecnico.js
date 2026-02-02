// app-tecnico.js
import { auth, db, signOut, onAuthStateChanged } from "./firebase-auth.js"; // Importación corregida a tu central

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

let tecnicoUID = null;
let watchID = null;

// Elementos de la Interfaz (Aseguramos que coincidan con el HTML)
const nombreTecnicoEl = document.getElementById("nombreTecnico");
const infoVehiculoEl = document.getElementById("unidadTecnico"); // Ajustado a unidadTecnico según tu HTML
// Elementos de la Interfaz (Sincronizados con tu HTML)
const nombreTecnicoEl = document.getElementById("nombreTecnico");
const infoVehiculoEl = document.getElementById("infoVehiculo"); // Antes era unidadTecnico
const panelSolicitudes = document.getElementById("listaServicios"); // Antes era solicitudesList
const btnGps = document.getElementById("btnGps"); // Antes era btnDisponible
const logoutBtn = document.getElementById("logoutBtn");
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    tecnicoUID = user.uid;
    try {
        const docSnap = await getDoc(doc(db, "tecnicos", tecnicoUID));
        if (docSnap.exists()) {
            const data = docSnap.data();
            nombreTecnicoEl.innerText = data.nombre || "Técnico";
            infoVehiculoEl.innerText = `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`;
            escucharSolicitudes();
        } else {
            alert("Acceso denegado: No eres técnico en la base de datos.");
            signOut(auth);
        }
    } catch (e) {
        console.error("Error al cargar perfil:", e);
    }
});

// 2. Control del GPS y Disponibilidad
if (btnGps) {
    btnGps.addEventListener("click", () => {
        if (!watchID) {
            activarRastreo();
        } else {
            desactivarRastreo();
        }
    });
}

function activarRastreo() {
    if (!navigator.geolocation) return alert("Tu navegador no soporta GPS");

    // Feedback visual
    const statusIcon = document.getElementById("statusIndicator");
    statusIcon?.classList.replace("bg-slate-800", "bg-emerald-500");
    btnGps.classList.add("ring-4", "ring-emerald-500/50");

    watchID = navigator.geolocation.watchPosition(async (pos) => {
        try {
            await updateDoc(doc(db, "tecnicos", tecnicoUID), {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                ultimaConexion: serverTimestamp(),
                estado: "DISPONIBLE"
            });
        } catch (error) {
            console.error("Error actualizando ubicación:", error);
        }
    }, (err) => console.error(err), { enableHighAccuracy: true });
}

function desactivarRastreo() {
    if (watchID) navigator.geolocation.clearWatch(watchID);
    watchID = null;
    
    const statusIcon = document.getElementById("statusIndicator");
    statusIcon?.classList.replace("bg-emerald-500", "bg-slate-800");
    btnGps.classList.remove("ring-4", "ring-emerald-500/50");
    
    updateDoc(doc(db, "tecnicos", tecnicoUID), { estado: "INACTIVO" });
}

// 3. Escuchar Solicitudes Pendientes
function escucharSolicitudes() {
    const q = query(collection(db, "solicitudes"), where("estado", "==", "PENDIENTE"));
    
    onSnapshot(q, (snapshot) => {
        if (!panelSolicitudes) return;
        panelSolicitudes.innerHTML = "";
        
        if (snapshot.empty) {
            panelSolicitudes.innerHTML = "<p class='text-slate-500 text-center py-4 italic text-sm'>No hay servicios pendientes.</p>";
            return;
        }

        snapshot.forEach(docSnap => {
            const sol = docSnap.data();
            const div = document.createElement("div");
            div.className = "bg-slate-900/80 p-5 rounded-2xl border border-white/5 shadow-xl animate-fade";
            div.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <h4 class="font-bold text-indigo-400 uppercase text-xs tracking-widest">${sol.clienteNombre || 'Cliente'}</h4>
                    <span class="text-[9px] bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full font-black">NUEVO</span>
                </div>
                <p class="text-sm text-white font-medium mb-1"><i class="fas fa-map-marker-alt text-red-500 mr-2"></i>${sol.direccion}</p>
                <p class="text-[11px] text-slate-400 mb-4">${sol.descripcion}</p>
                <button data-id="${docSnap.id}" class="btn-aceptar w-full bg-white text-black py-3 rounded-xl font-black text-xs hover:bg-indigo-500 hover:text-white transition-all uppercase">
                    Aceptar Servicio
                </button>
            `;
            
            // Evento para el botón dentro del módulo
            div.querySelector(".btn-aceptar").addEventListener("click", (e) => {
                const id = e.target.getAttribute("data-id");
                aceptarServicio(id);
            });

            panelSolicitudes.appendChild(div);
        });
    });
}

// 4. Función de Aceptar (Interna al módulo)
async function aceptarServicio(id) {
    if (!watchID) {
        alert("⚠️ Debes activar tu GPS/Disponibilidad para aceptar servicios.");
        return;
    }
    try {
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "EN CAMINO",
            tecnicoId: tecnicoUID,
            aceptadoEn: serverTimestamp()
        });
        alert("✅ ¡Servicio aceptado! Dirígete a la ubicación.");
    } catch (error) {
        alert("Error al aceptar el servicio");
    }
}

// 5. Logout
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => signOut(auth));
}
