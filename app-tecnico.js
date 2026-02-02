import { auth, db } from "./firebase-auth.js";
import { 
    doc, updateDoc, setDoc, collection, query, where, 
    onSnapshot, orderBy, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "./firebase-auth.js";

const getEl = (id) => document.getElementById(id);
let watchId = null;

// 1. Control de Sesión
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const tecRef = doc(db, "tecnicos", user.uid);
        const tecSnap = await getDoc(tecRef);
        
        if (tecSnap.exists()) {
            const data = tecSnap.data();
            if (getEl("nombreTecnico")) getEl("nombreTecnico").innerText = data.nombre || "Jonathan Catana";
            if (getEl("infoVehiculo")) getEl("infoVehiculo").innerText = `${data.vehiculo || 'Thida'} | ${data.placas || '123456'}`;
        } else {
            await setDoc(tecRef, {
                nombre: "Jonathan Catana",
                estado: "DISPONIBLE",
                vehiculo: "Thida",
                placas: "123456"
            });
        }
        escucharSolicitudes();
    } else {
        window.location.href = "login.html";
    }
});

// 2. Motor GPS (Ajustado a id="btnGps" e id="gpsStatus")
const btnGPS = getEl("btnGps");
const gpsStatus = getEl("gpsStatus");

if (btnGPS) {
    btnGPS.onclick = () => {
        if (watchId === null) {
            if (!navigator.geolocation) return alert("GPS no soportado");

            watchId = navigator.geolocation.watchPosition(async (pos) => {
                const user = auth.currentUser;
                if (user) {
                    await updateDoc(doc(db, "tecnicos", user.uid), {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        ubicacion: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                        ultimaActualizacion: new Date()
                    });
                }
            }, (err) => console.error(err), { enableHighAccuracy: true });

            // Cambiar visual a ACTIVO
            btnGPS.innerHTML = '<i class="fas fa-broadcast-tower animate-pulse"></i> <span>RASTREO ACTIVO</span>';
            btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 bg-emerald-500 text-white btn-glow";
            if (gpsStatus) gpsStatus.innerText = "Transmitiendo en tiempo real";
        } else {
            // DETENER
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            btnGPS.innerHTML = '<i class="fas fa-location-arrow"></i> <span>ACTIVAR RASTREO GPS</span>';
            btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 bg-white text-black btn-glow";
            if (gpsStatus) gpsStatus.innerText = "El sistema está en pausa";
        }
    };
}

// 3. Escuchar Solicitudes (Ajustado a id="listaServicios")
function escucharSolicitudes() {
    const list = getEl("listaServicios");
    if (!list) return;

    const q = query(collection(db, "solicitudes"), where("estado", "==", "PENDIENTE"), orderBy("fechaCreacion", "desc"));
    
    onSnapshot(q, (snapshot) => {
        list.innerHTML = "";
        if (snapshot.empty) {
            list.innerHTML = '<div class="text-center py-10 text-slate-600 text-sm italic">Buscando solicitudes cercanas...</div>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "uber-card p-6 rounded-[2rem] animate-fade";
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <p class="text-[10px] font-black text-indigo-400 uppercase mb-1">${data.clienteNombre || 'Servicio Urgente'}</p>
                        <p class="text-lg font-bold text-white">${data.direccion}</p>
                    </div>
                    <span class="bg-indigo-500/10 text-indigo-400 text-[9px] px-2 py-1 rounded font-black italic">NUEVO</span>
                </div>
                <button onclick="aceptarServicio('${docSnap.id}')" class="w-full bg-white text-black font-black py-4 rounded-xl text-xs uppercase hover:bg-indigo-500 hover:text-white transition-all">Aceptar Servicio</button>
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
        alert("¡Servicio aceptado!");
    } catch (e) { alert("Error: " + e.message); }
};

if (getEl("logoutBtn")) getEl("logoutBtn").onclick = () => signOut(auth);
