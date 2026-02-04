import { auth, db } from "./firebase.js";
import { 
    doc, 
    updateDoc, 
    setDoc, 
    collection, 
    query, 
    where, 
    onSnapshot, 
    orderBy, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "./firebase.js";

const getEl = (id) => document.getElementById(id);
let watchId = null;

// Monitor de sesión e inicialización del entorno
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const tecRef = doc(db, "tecnicos", user.uid);
        const tecSnap = await getDoc(tecRef);

        if (tecSnap.exists()) {
            const data = tecSnap.data();
            actualizarVistaTecnico(data);
        } else {
            await registrarTecnicoPredeterminado(tecRef);
        }
        escucharSolicitudes();
    } else {
        window.location.href = "login.html";
    }
});

// Función para actualizar vista del técnico
function actualizarVistaTecnico(data) {
    if (getEl("nombreTecnico")) {
        getEl("nombreTecnico").innerText = data.nombre || "Jonathan Catana";
    }
    if (getEl("infoVehiculo")) {
        getEl("infoVehiculo").innerText = `${data.vehiculo || 'Thida'} | ${data.placas || '123456'}`;
    }
}

// Función para registrar un técnico por defecto
async function registrarTecnicoPredeterminado(tecRef) {
    await setDoc(tecRef, {
        nombre: "Jonathan Catana",
        estado: "DISPONIBLE",
        vehiculo: "Thida",
        placas: "123456"
    });
}

// Configuración y control del GPS
const btnGPS = getEl("btnGps");
const gpsStatus = getEl("gpsStatus");

if (btnGPS) {
    btnGPS.onclick = () => {
        if (watchId === null) {
            iniciarRastreoGPS();
        } else {
            detenerRastreoGPS();
        }
    };
}

// Función para iniciar el rastreo GPS
function iniciarRastreoGPS() {
    if (!navigator.geolocation) return alert("GPS no soportado");

    watchId = navigator.geolocation.watchPosition(actualizarUbicacion, manejarErrorGPS, { enableHighAccuracy: true });

    btnGPS.innerHTML = '<i class="fas fa-broadcast-tower animate-pulse"></i> <span>RASTREO ACTIVO</span>';
    btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20";
    if (gpsStatus) gpsStatus.innerText = "TRANSMITIENDO EN TIEMPO REAL";
}

// Función para detener el rastreo GPS
function detenerRastreoGPS() {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;

    btnGPS.innerHTML = '<i class="fas fa-location-arrow"></i> <span>ACTIVAR RASTREO GPS</span>';
    btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-white text-black btn-glow";
    if (gpsStatus) gpsStatus.innerText = "EL SISTEMA ESTÁ EN PAUSA";
}

// Función para actualizar ubicación del técnico en Firebase
async function actualizarUbicacion(pos) {
    const user = auth.currentUser;
    if (user) {
        await updateDoc(doc(db, "tecnicos", user.uid), {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ubicacion: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            ultimaActualizacion: new Date(),
            estado: "DISPONIBLE"
        });
    }
}

// Manejo de errores de GPS
function manejarErrorGPS(err) {
    console.warn("Esperando señal GPS...", err);
}

// Escucha en tiempo real para las solicitudes de servicio
function escucharSolicitudes() {
    const list = getEl("listaServicios");
    if (!list) return;

    const q = query(collection(db, "solicitudes"), where("estado", "==", "PENDIENTE"), orderBy("fechaCreacion", "desc"));

    onSnapshot(q, (snapshot) => {
        list.innerHTML = snapshot.empty ? '<div class="text-center py-10 text-slate-600 text-sm italic">Buscando solicitudes cercanas...</div>' : '';
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "uber-card p-6 rounded-[2rem] mb-4 animate-fade";
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <p class="text-[10px] font-black text-indigo-400 uppercase mb-1">${data.clienteNombre || 'Servicio Urgente'}</p>
                        <p class="text-lg font-bold text-white">${data.direccion}</p>
                    </div>
                </div>
                <button onclick="aceptarServicio('${docSnap.id}')" class="w-full bg-white text-black font-black py-4 rounded-xl text-xs uppercase hover:bg-indigo-500 hover:text-white transition-all">
                    Aceptar Servicio
                </button>
            `;
            list.appendChild(card);
        });
    });
}

// Función para aceptar servicio y actualizar Firebase
window.aceptarServicio = async (id) => {
    try {
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "EN CAMINO",
            tecnicoId: auth.currentUser.uid
        });
        await updateDoc(doc(db, "tecnicos", auth.currentUser.uid), { estado: "EN SERVICIO" });
        alert("¡Servicio aceptado!");
    } catch (e) {
        console.error(e);
    }
};

// Manejo de cierre de sesión
if (getEl("logoutBtn")) {
    getEl("logoutBtn").onclick = () => signOut(auth);
}
