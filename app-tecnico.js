// app-tecnico.js
import { 
    auth, 
    db, 
    onAuthStateChanged, 
    signOut, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    collection, 
    query, 
    where, 
    onSnapshot, 
    serverTimestamp 
} from "./firebase.js";

const getEl = (id) => document.getElementById(id);
let watchId = null;

// --- 1. MONITOR DE SESIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const tecRef = doc(db, "tecnicos", user.uid);
        const tecSnap = await getDoc(tecRef);

        if (tecSnap.exists()) {
            actualizarVistaTecnico(tecSnap.data());
        } else {
            await registrarTecnicoPredeterminado(tecRef);
        }
        
        // Iniciamos los escuchas de tiempo real
        escucharSolicitudesDisponibles();
        escucharMiServicioActivo(user.uid);
    } else {
        window.location.href = "login.html";
    }
});

function actualizarVistaTecnico(data) {
    if (getEl("nombreTecnico")) getEl("nombreTecnico").innerText = data.nombre || "Jonathan Catana";
    if (getEl("infoVehiculo")) getEl("infoVehiculo").innerText = `${data.vehiculo || 'Thida'} | ${data.placas || '123456'}`;
}

async function registrarTecnicoPredeterminado(tecRef) {
    await setDoc(tecRef, {
        nombre: "Jonathan Catana",
        estado: "DISPONIBLE",
        vehiculo: "Thida",
        placas: "123456"
    });
}

// --- 2. CONTROL GPS ---
const btnGPS = getEl("btnGps");
const gpsStatus = getEl("gpsStatus");

if (btnGPS) {
    btnGPS.onclick = () => {
        if (watchId === null) iniciarRastreoGPS();
        else detenerRastreoGPS();
    };
}

function iniciarRastreoGPS() {
    if (!navigator.geolocation) return alert("GPS no soportado");
    watchId = navigator.geolocation.watchPosition(actualizarUbicacion, manejarErrorGPS, { enableHighAccuracy: true });
    
    btnGPS.innerHTML = '<i class="fas fa-broadcast-tower animate-pulse"></i> <span>RASTREO ACTIVO</span>';
    btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20";
    if (gpsStatus) gpsStatus.innerText = "TRANSMITIENDO EN TIEMPO REAL";
}

function detenerRastreoGPS() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    btnGPS.innerHTML = '<i class="fas fa-location-arrow"></i> <span>ACTIVAR RASTREO GPS</span>';
    btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-white text-black btn-glow";
    if (gpsStatus) gpsStatus.innerText = "EL SISTEMA ESTÁ EN PAUSA";
}

async function actualizarUbicacion(pos) {
    const user = auth.currentUser;
    if (user) {
        await updateDoc(doc(db, "tecnicos", user.uid), {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ubicacion: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            ultimaActualizacion: serverTimestamp()
        });
    }
}

function manejarErrorGPS(err) { console.warn("Señal GPS débil...", err); }

// --- 3. ESCUCHA DE SOLICITUDES DISPONIBLES ---
function escucharSolicitudesDisponibles() {
    const list = getEl("listaServicios");
    if (!list) return;

    // LUPA: Query limpia sin orderBy para evitar errores de índice y asegurar carga inmediata
    const q = query(
        collection(db, "solicitudes"), 
        where("estado", "==", "SOLICITADO")
    );

    onSnapshot(q, (snapshot) => {
        list.innerHTML = snapshot.empty ? '<div class="text-center py-10 text-slate-600 text-sm italic">Buscando solicitudes cercanas...</div>' : '';
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "uber-card p-6 rounded-[2rem] mb-4 animate-fade border border-white/5";
            card.innerHTML = `
                <div class="mb-4">
                    <span class="status-badge text-[9px] font-black px-2 py-1 rounded-full uppercase">${data.categoria || 'GENERAL'}</span>
                    <p class="text-lg font-bold text-white mt-2">${data.direccion}</p>
                    <p class="text-slate-400 text-xs">${data.descripcion || ''}</p>
                </div>
                <button onclick="aceptarServicio('${docSnap.id}')" class="w-full bg-indigo-600 text-white font-black py-4 rounded-xl text-xs uppercase hover:bg-white hover:text-black transition-all">
                    Aceptar Servicio
                </button>
            `;
            list.appendChild(card);
        });
    }, (error) => {
        console.error("Error en lista solicitudes:", error);
    });
}

window.aceptarServicio = async (id) => {
    const user = auth.currentUser;
    try {
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "EN_CAMINO",
            tecnicoId: user.uid,
            fechaAceptado: serverTimestamp()
        });
        
        await updateDoc(doc(db, "tecnicos", user.uid), { 
            estado: "EN SERVICIO",
            servicioActualId: id 
        });

        alert("¡Servicio aceptado!");
    } catch (e) {
        console.error(e);
        alert("Error: El servicio ya no está disponible.");
    }
};

// --- 4. PANEL DE CONTROL DINÁMICO ---
function escucharMiServicioActivo(uid) {
    const panelAcciones = getEl("panelAccionesTecnico");
    const contenedorBusqueda = getEl("contenedorBusqueda");

    // LUPA: Filtramos por tecnicoId y gestionamos los estados en el cliente
    const q = query(
        collection(db, "solicitudes"), 
        where("tecnicoId", "==", uid)
    );

    onSnapshot(q, (snapshot) => {
        // Buscamos manualmente si hay alguno en camino o en sitio
        const activo = snapshot.docs.find(doc => {
            const st = doc.data().estado;
            return st === "EN_CAMINO" || st === "EN_SITIO";
        });

        if (!activo) {
            if (panelAcciones) panelAcciones.classList.add("hidden");
            if (contenedorBusqueda) contenedorBusqueda.classList.remove("hidden");
        } else {
            if (panelAcciones) panelAcciones.classList.remove("hidden");
            if (contenedorBusqueda) contenedorBusqueda.classList.add("hidden");
            
            const serv = activo.data();
            const servId = activo.id;
            
            panelAcciones.innerHTML = `
                <div class="uber-card p-8 rounded-[2.5rem] border border-indigo-500/40 animate-fade">
                    <h3 class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-4">Trabajo en Curso</h3>
                    <p class="text-white font-bold text-xl leading-tight mb-2">${serv.direccion}</p>
                    <p class="text-slate-500 text-xs mb-8 italic">${serv.descripcion || ''}</p>
                    <div class="grid grid-cols-1 gap-4">
                        ${serv.estado === 'EN_CAMINO' ? 
                            `<button onclick="actualizarEstadoFlujo('${servId}', 'EN_SITIO')" class="bg-white text-black font-black py-5 rounded-2xl uppercase text-sm shadow-lg active:scale-95 transition-transform">Ya llegué al sitio</button>` : 
                            `<button onclick="actualizarEstadoFlujo('${servId}', 'FINALIZADO')" class="bg-emerald-500 text-white font-black py-5 rounded-2xl uppercase text-sm shadow-lg active:scale-95 transition-transform">Finalizar Trabajo</button>`
                        }
                    </div>
                </div>
            `;
        }
    }, (error) => {
        console.error("Error en servicio activo:", error);
    });
}

window.actualizarEstadoFlujo = async (id, nuevoEstado) => {
    try {
        await updateDoc(doc(db, "solicitudes", id), { 
            estado: nuevoEstado,
            fechaCambio: serverTimestamp() 
        });
        
        if (nuevoEstado === "FINALIZADO") {
            await updateDoc(doc(db, "tecnicos", auth.currentUser.uid), { 
                estado: "DISPONIBLE",
                servicioActualId: null 
            });
            alert("¡Servicio completado!");
        }
    } catch (e) {
        console.error("Error al actualizar estado:", e);
    }
};

if (getEl("logoutBtn")) {
    getEl("logoutBtn").onclick = () => signOut(auth);
}
