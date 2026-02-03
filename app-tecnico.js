import { 
    auth, db, onAuthStateChanged, 
    doc, getDoc, setDoc, updateDoc, 
    collection, query, where, orderBy, onSnapshot, 
    serverTimestamp 
} from "./firebase.js";

// --- REFERENCIAS DE INTERFAZ ---
const getEl = (id) => document.getElementById(id);
let watchId = null;

// --- 1. GESTIÓN DE SESIÓN Y PERFIL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Sesión activa:", user.uid);
        const tecRef = doc(db, "tecnicos", user.uid);
        const tecSnap = await getDoc(tecRef);
        
        if (tecSnap.exists()) {
            const data = tecSnap.data();
            // Actualizamos la UI con los datos del técnico
            if (getEl("nombreTecnico")) getEl("nombreTecnico").innerText = data.nombre || "Técnico FixGo";
            if (getEl("infoVehiculo")) getEl("infoVehiculo").innerText = `${data.vehiculo || 'Sin Vehículo'} | ${data.placas || '---'}`;
        } else {
            // Si el perfil no existe en Firestore, lo creamos inicialmente
            await setDoc(tecRef, {
                nombre: user.displayName || "Jonathan Catana",
                estado: "DISPONIBLE",
                vehiculo: "Thida",
                placas: "123456",
                online: true,
                createdAt: serverTimestamp()
            });
        }
        // Empezamos a escuchar solicitudes de clientes
        escucharSolicitudes();
    } else {
        // Si no hay usuario, redirigir al login
        window.location.href = "login.html";
    }
});

// --- 2. MOTOR GPS PROFESIONAL (ALTA CONCURRENCIA) ---
const btnGPS = getEl("btnGps");
const gpsStatus = getEl("gpsStatus");

if (btnGPS) {
    btnGPS.onclick = () => {
        if (watchId === null) {
            // INICIAR RASTREO
            if (!navigator.geolocation) return alert("Tu dispositivo no soporta GPS.");

            watchId = navigator.geolocation.watchPosition(async (pos) => {
                const user = auth.currentUser;
                if (user) {
                    const tecRef = doc(db, "tecnicos", user.uid);
                    const coords = { 
                        lat: pos.coords.latitude, 
                        lng: pos.coords.longitude 
                    };

                    // Guardamos la ubicación con redundancia para que el mapa nunca falle
                    await updateDoc(tecRef, {
                        ubicacion: coords, // Formato objeto
                        lat: coords.lat,   // Formato plano
                        lng: coords.lng,
                        lastUpdate: serverTimestamp()
                    });
                    console.log("📍 GPS Actualizado en Servidor");
                }
            }, (err) => {
                console.error("Error GPS:", err);
            }, { 
                enableHighAccuracy: true, 
                distanceFilter: 10 // Solo actualiza si se mueve más de 10 metros para ahorrar datos
            });

            // Estilos visuales de Activo (Verde)
            btnGPS.innerHTML = '<i class="fas fa-broadcast-tower animate-pulse"></i> <span>RASTREO ACTIVO</span>';
            btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20";
            if (gpsStatus) gpsStatus.innerText = "SISTEMA EN VIVO - TRANSMITIENDO";
        } else {
            // DETENER RASTREO
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            btnGPS.innerHTML = '<i class="fas fa-location-arrow"></i> <span>ACTIVAR RASTREO GPS</span>';
            btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-white text-black btn-glow";
            if (gpsStatus) gpsStatus.innerText = "EL SISTEMA ESTÁ EN PAUSA";
        }
    };
}

// --- 3. ESCUCHAR SOLICITUDES (HANDSHAKE TIPO UBER) ---
function escucharSolicitudes() {
    const list = getEl("listaServicios");
    if (!list) return;

    // Solo escuchamos solicitudes que nadie ha tomado (PENDIENTE)
    const q = query(
        collection(db, "solicitudes"), 
        where("estado", "==", "PENDIENTE"), 
        orderBy("fechaCreacion", "desc")
    );
    
    onSnapshot(q, (snapshot) => {
        list.innerHTML = "";
        if (snapshot.empty) {
            list.innerHTML = '<div class="text-center py-10 text-slate-600 text-sm italic">Esperando nuevas solicitudes...</div>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "uber-card p-6 rounded-[2rem] mb-4 border border-white/5 animate-fade bg-[#121212]";
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <p class="text-[10px] font-black text-indigo-400 uppercase mb-1">${data.clienteNombre || 'Cliente FixGo'}</p>
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

// --- 4. FUNCIÓN GLOBAL PARA ACEPTAR SERVICIO ---
window.aceptarServicio = async (solicitudId) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        // Bloqueamos la solicitud para este técnico
        await updateDoc(doc(db, "solicitudes", solicitudId), {
            estado: "EN CAMINO",
            tecnicoId: user.uid,
            fechaAceptado: serverTimestamp()
        });

        // Cambiamos el estado del técnico a Ocupado
        await updateDoc(doc(db, "tecnicos", user.uid), { 
            estado: "EN SERVICIO" 
        });

        alert("¡Servicio aceptado! Dirígete al punto indicado.");
    } catch (e) {
        console.error(e);
        alert("Error: El servicio ya no está disponible.");
    }
};
