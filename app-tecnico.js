// app-tecnico.js
import { auth, db, signOut, onAuthStateChanged } from "./firebase-auth.js";
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

// 1. Elementos de la Interfaz (Sincronizados con area-tecnico.html)
const nombreTecnicoEl = document.getElementById("nombreTecnico");
const infoVehiculoEl = document.getElementById("infoVehiculo");
const panelSolicitudes = document.getElementById("listaServicios");
const btnGps = document.getElementById("btnGps");
const logoutBtn = document.getElementById("logoutBtn");

// 2. Verificación de Usuario y Carga de Perfil
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
            // Evitamos errores si el elemento no existe en el HTML
            if (nombreTecnicoEl) nombreTecnicoEl.innerText = data.nombre || "Técnico";
            if (infoVehiculoEl) infoVehiculoEl.innerText = `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`;
            
            escucharSolicitudes();
        } else {
            alert("Acceso denegado: No eres técnico en la base de datos.");
            signOut(auth);
        }
    } catch (e) {
        console.error("Error al cargar perfil:", e);
    }
});

// 3. Control del GPS y Disponibilidad
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

    // Actualizamos el botón visualmente
    btnGps.classList.replace("bg-white", "bg-emerald-500");
    btnGps.classList.add("text-white", "ring-4", "ring-emerald-500/50");
    btnGps.querySelector("span").innerText = "RASTREO ACTIVO";

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
    
    // Revertimos el botón
    btnGps.classList.replace("bg-emerald-500", "bg-white");
    btnGps.classList.remove("text-white", "ring-4", "ring-emerald-500/50");
    btnGps.querySelector("span").innerText = "ACTIVAR RASTREO GPS";
    
    updateDoc(doc(db, "tecnicos", tecnicoUID), { estado: "INACTIVO" });
}

// 4. Escuchar Solicitudes Pendientes
function escucharSolicitudes() {
    const q = query(collection(db, "solicitudes"), where("estado", "==", "PENDIENTE"));
    
    onSnapshot(q, (snapshot) => {
        if (!panelSolicitudes) return;
        panelSolicitudes.innerHTML = "";
        
        if (snapshot.empty) {
            panelSolicitudes.innerHTML = `
                <div class="text-center py-20">
                    <p class="text-slate-600 text-sm italic">No hay servicios pendientes en tu zona.</p>
                </div>`;
            return;
        }

        snapshot.forEach(docSnap => {
            const sol = docSnap.data();
            const div = document.createElement("div");
            div.className = "bg-slate-900/80 p-5 rounded-2xl border border-white/5 shadow-xl";
            div.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <h4 class="font-bold text-indigo-400 uppercase text-xs tracking-widest">${sol.clienteNombre || 'Cliente'}</h4>
                    <span class="text-[9px] bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded-full font-black">NUEVO</span>
                </div>
                <p class="text-sm text-white font-medium mb-1"><i class="fas fa-map-marker-alt text-red-500 mr-2"></i>${sol.direccion}</p>
                <p class="text-[11px] text-slate-400 mb-4">${sol.descripcion || 'Sin descripción'}</p>
                <button data-id="${docSnap.id}" class="btn-aceptar w-full bg-white text-black py-3 rounded-xl font-black text-xs hover:bg-indigo-500 hover:text-white transition-all uppercase">
                    Aceptar Servicio
                </button>
            `;
            
            div.querySelector(".btn-aceptar").addEventListener("click", (e) => {
                const id = e.target.getAttribute("data-id");
                aceptarServicio(id);
            });

            panelSolicitudes.appendChild(div);
        });
    });
}

async function aceptarServicio(id) {
    if (!watchID) {
        alert("⚠️ Debes activar tu GPS para aceptar servicios.");
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
