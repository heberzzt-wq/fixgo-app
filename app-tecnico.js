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
    getDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "./firebase.js";

const getEl = (id) => document.getElementById(id);
let watchId = null;

// Monitor de sesión e inicialización
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const tecRef = doc(db, "tecnicos", user.uid);
        const tecSnap = await getDoc(tecRef);

        if (tecSnap.exists()) {
            actualizarVistaTecnico(tecSnap.data());
        } else {
            await registrarTecnicoPredeterminado(tecRef);
        }
        
        // Iniciamos la escucha dual: solicitudes nuevas y mi servicio actual
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

// --- CONTROL GPS (Mantenido de tu original) ---
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
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    btnGPS.innerHTML = '<i class="fas fa-location-arrow"></i> <span>ACTIVAR RASTREO GPS</span>';
    btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-white text-black";
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

function manejarErrorGPS(err) { console.warn("Esperando señal GPS...", err); }

// --- FLUJO DE AUTO-ASIGNACIÓN (UBER STYLE) ---

// 1. Escuchar solicitudes que nadie ha tomado
function escucharSolicitudesDisponibles() {
    const list = getEl("listaServicios");
    if (!list) return;

    // Filtramos por "SOLICITADO" (que es el estado inicial del cliente)
    const q = query(
        collection(db, "solicitudes"), 
        where("estado", "==", "SOLICITADO"), 
        orderBy("fechaCreacion", "desc")
    );

    onSnapshot(q, (snapshot) => {
        // Si el técnico ya está en un servicio, no mostramos la lista para evitar distracciones
        list.innerHTML = snapshot.empty ? '<div class="text-center py-10 text-slate-600 text-sm italic">Esperando nuevas solicitudes...</div>' : '';
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "uber-card p-6 rounded-[2rem] mb-4 animate-fade border border-white/5";
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <span class="bg-indigo-500/10 text-indigo-400 text-[9px] font-black px-2 py-1 rounded-full uppercase">${data.categoria || 'GENERAL'}</span>
                        <p class="text-lg font-bold text-white mt-2">${data.direccion}</p>
                        <p class="text-slate-400 text-xs">${data.descripcion}</p>
                    </div>
                </div>
                <button onclick="aceptarServicio('${docSnap.id}')" class="w-full bg-indigo-600 text-white font-black py-4 rounded-xl text-xs uppercase hover:bg-white hover:text-black transition-all shadow-lg">
                    Aceptar y Ver Mapa
                </button>
            `;
            list.appendChild(card);
        });
    });
}

// 2. Función global para tomar el servicio
window.aceptarServicio = async (id) => {
    const user = auth.currentUser;
    try {
        // Actualizamos la solicitud: Le ponemos el técnico y cambiamos el estado
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "EN_CAMINO",
            tecnicoId: user.uid,
            fechaAceptado: serverTimestamp()
        });
        
        // Marcamos al técnico como ocupado
        await updateDoc(doc(db, "tecnicos", user.uid), { 
            estado: "EN SERVICIO",
            servicioActualId: id 
        });

        alert("¡Servicio asignado! Dirígete a la ubicación.");
    } catch (e) {
        console.error("Error al aceptar:", e);
        alert("Este servicio ya no está disponible.");
    }
};

// 3. Escuchar MI SERVICIO ACTIVO (Para mostrar botones de Llegué/Finalizar)
function escucharMiServicioActivo(uid) {
    const panelAcciones = getEl("panelAccionesTecnico"); // Asegúrate de tener este ID en tu HTML
    if (!panelAcciones) return;

    const q = query(
        collection(db, "solicitudes"), 
        where("tecnicoId", "==", uid),
        where("estado", "in", ["EN_CAMINO", "EN_SITIO"])
    );

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            panelAcciones.classList.add("hidden");
            getEl("listaServicios").classList.remove("hidden");
        } else {
            panelAcciones.classList.remove("hidden");
            getEl("listaServicios").classList.add("hidden");
            
            const serv = snapshot.docs[0].data();
            const servId = snapshot.docs[0].id;
            
            panelAcciones.innerHTML = `
                <div class="bg-zinc-900 p-6 rounded-[2.5rem] border border-indigo-500/30">
                    <h3 class="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4">Servicio en Curso</h3>
                    <p class="text-white font-bold mb-1">${serv.direccion}</p>
                    <p class="text-slate-500 text-xs mb-6">${serv.descripcion}</p>
                    
                    <div class="grid grid-cols-1 gap-3">
                        ${serv.estado === 'EN_CAMINO' ? 
                            `<button onclick="actualizarEstadoFlujo('${servId}', 'EN_SITIO')" class="bg-white text-black font-black py-4 rounded-2xl uppercase text-sm">Ya llegué al sitio</button>` : 
                            `<button onclick="actualizarEstadoFlujo('${servId}', 'FINALIZADO')" class="bg-emerald-500 text-white font-black py-4 rounded-2xl uppercase text-sm">Finalizar Trabajo</button>`
                        }
                    </div>
                </div>
            `;
        }
    });
}

// 4. Función para mover el flujo de estados
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
            alert("¡Trabajo completado con éxito!");
        }
    } catch (e) {
        console.error(e);
    }
};

// Logout
if (getEl("logoutBtn")) {
    getEl("logoutBtn").onclick = () => signOut(auth);
}
