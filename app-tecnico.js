import { auth, db } from "./firebase-auth.js";
import { 
    doc, updateDoc, setDoc, collection, query, where, 
    onSnapshot, orderBy, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "./firebase-auth.js";

// --- 1. CONFIGURACIÓN Y REFERENCIAS ---
const getEl = (id) => document.getElementById(id);
let watchId = null; // Para controlar el GPS

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const tecRef = doc(db, "tecnicos", user.uid);
        const tecSnap = await getDoc(tecRef);
        
        if (tecSnap.exists()) {
            const data = tecSnap.data();
            if (getEl("nombreTecnico")) getEl("nombreTecnico").innerText = data.nombre || "Jonathan Catana";
            actualizarInterfazEstado(data.estado);
        } else {
            // Si el técnico es nuevo, lo registramos en la base de datos
            await setDoc(tecRef, {
                nombre: "Jonathan Catana",
                estado: "DISPONIBLE",
                vehiculo: "Thida",
                placas: "123456",
                fechaRegistro: new Date()
            });
            actualizarInterfazEstado("DISPONIBLE");
        }
        escucharSolicitudes();
    } else {
        window.location.href = "login.html";
    }
});

// --- 2. GESTIÓN DE ESTADOS (DISPONIBLE / EN SERVICIO) ---
async function cambiarEstado(nuevoEstado) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        await updateDoc(doc(db, "tecnicos", user.uid), { estado: nuevoEstado });
        actualizarInterfazEstado(nuevoEstado);
    } catch (error) { 
        console.error("Error al cambiar estado:", error); 
    }
}

function actualizarInterfazEstado(estado) {
    const indicator = getEl("statusIndicator");
    const txtSistema = getEl("unidadTecnico"); // El texto que dice "Pausa"

    if (indicator) {
        if (estado === "DISPONIBLE") {
            indicator.className = "w-20 h-20 bg-emerald-500 rounded-full mx-auto flex items-center justify-center text-3xl shadow-lg animate-pulse";
            indicator.innerHTML = '<i class="fas fa-check"></i>';
            if (txtSistema) {
                txtSistema.innerText = "SISTEMA ACTIVO - ESPERANDO";
                txtSistema.className = "text-emerald-400 text-[10px] font-bold uppercase tracking-[0.3em]";
            }
        } else {
            indicator.className = "w-20 h-20 bg-orange-500 rounded-full mx-auto flex items-center justify-center text-3xl shadow-lg";
            indicator.innerHTML = '<i class="fas fa-tools"></i>';
            if (txtSistema) {
                txtSistema.innerText = "SISTEMA EN RUTA - RASTREANDO";
                txtSistema.className = "text-orange-400 text-[10px] font-bold uppercase tracking-[0.3em]";
            }
        }
    }
}

// Eventos de los botones de estado
if (getEl("btnDisponible")) getEl("btnDisponible").onclick = () => cambiarEstado("DISPONIBLE");
if (getEl("btnServicio")) getEl("btnServicio").onclick = () => cambiarEstado("EN SERVICIO");

// --- 3. MOTOR DE RASTREO GPS REAL-TIME ---
const btnGPS = getEl("btnActivarGPS");

if (btnGPS) {
    btnGPS.onclick = () => {
        if (watchId === null) {
            // INICIAR RASTREO
            if (!navigator.geolocation) return alert("Tu dispositivo no tiene GPS");

            watchId = navigator.geolocation.watchPosition(async (pos) => {
                const user = auth.currentUser;
                if (user) {
                    const tecRef = doc(db, "tecnicos", user.uid);
                    await updateDoc(tecRef, {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        ubicacion: { 
                            lat: pos.coords.latitude, 
                            lng: pos.coords.longitude 
                        },
                        ultimaActualizacion: new Date()
                    });
                    console.log("📍 GPS Actualizado");
                }
            }, (err) => {
                console.error("Error GPS:", err);
                alert("Activa el GPS de tu celular/navegador");
            }, { enableHighAccuracy: true });

            // Visual del botón activo
            btnGPS.innerHTML = '<i class="fas fa-broadcast-tower animate-pulse mr-2"></i> RASTREO ACTIVO';
            btnGPS.style.backgroundColor = "#10b981"; // Verde
            btnGPS.style.color = "white";
        } else {
            // DETENER RASTREO
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            btnGPS.innerHTML = '<i class="fas fa-location-arrow mr-2"></i> ACTIVAR RASTREO GPS';
            btnGPS.style.backgroundColor = "white";
            btnGPS.style.color = "black";
        }
    };
}

// --- 4. ESCUCHAR SOLICITUDES ENTRANTE ---
function escucharSolicitudes() {
    const list = getEl("solicitudesList");
    if (!list) return;

    const q = query(
        collection(db, "solicitudes"), 
        where("estado", "==", "PENDIENTE"), 
        orderBy("fechaCreacion", "desc")
    );
    
    onSnapshot(q, (snapshot) => {
        list.innerHTML = "";
        if (snapshot.empty) {
            list.innerHTML = '<p class="text-slate-600 text-center text-xs italic">Buscando servicios cerca...</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "uber-card p-5 rounded-[1.5rem] border border-white/5 mb-3 animate-fade";
            card.innerHTML = `
                <p class="text-[10px] font-black text-indigo-400 uppercase mb-1">${data.clienteNombre || 'Cliente'}</p>
                <p class="text-sm font-bold text-white mb-1">${data.direccion}</p>
                <button onclick="aceptarServicio('${docSnap.id}')" class="w-full bg-white text-black font-black py-3 rounded-xl mt-3 text-xs uppercase">Aceptar</button>
            `;
            list.appendChild(card);
        });
    });
}

window.aceptarServicio = async (id) => {
    try {
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "EN CAMINO",
            tecnicoId: auth.currentUser.uid
        });
        cambiarEstado("EN SERVICIO");
        alert("¡Servicio aceptado! Dirígete al destino.");
    } catch (e) { 
        alert("Error al aceptar: " + e.message); 
    }
};
