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

// --- 1. MONITOR DE SESIÓN Y PERFIL ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const tecRef = doc(db, "tecnicos", user.uid);
        const tecSnap = await getDoc(tecRef);

        if (tecSnap.exists()) {
            actualizarVistaTecnico(tecSnap.data());
        } else {
            // Auto-registro de seguridad si falla el alta manual
            await registrarTecnicoPredeterminado(tecRef);
        }
        
        // ACTIVAR LISTENERS
        escucharSolicitudesDisponibles();
        escucharMiServicioActivo(user.uid);
    } else {
        window.location.href = "login.html";
    }
});

function actualizarVistaTecnico(data) {
    if (getEl("nombreTecnico")) getEl("nombreTecnico").innerText = data.nombre || "Técnico FixGo";
    if (getEl("infoVehiculo")) getEl("infoVehiculo").innerText = `${data.vehiculo || 'Unidad'} | ${data.placas || '---'}`;
}

async function registrarTecnicoPredeterminado(tecRef) {
    await setDoc(tecRef, {
        nombre: "Técnico Nuevo",
        estado: "DISPONIBLE",
        vehiculo: "No registrado",
        placas: "---"
    });
}

// --- 2. CONTROL GPS (ON/OFF) ---
const btnGPS = getEl("btnGps");
const gpsStatus = getEl("gpsStatus");

if (btnGPS) {
    btnGPS.onclick = () => {
        if (watchId === null) iniciarRastreoGPS();
        else detenerRastreoGPS();
    };
}

function iniciarRastreoGPS() {
    if (!navigator.geolocation) return alert("Tu dispositivo no soporta GPS.");
    
    // Alta precisión activada
    watchId = navigator.geolocation.watchPosition(actualizarUbicacion, manejarErrorGPS, { 
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
    
    btnGPS.innerHTML = '<i class="fas fa-satellite-dish animate-pulse"></i> <span>RASTREO ACTIVO</span>';
    btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 transition-all";
    if (gpsStatus) gpsStatus.innerText = "TRANSMITIENDO UBICACIÓN";
    
    // Actualizar estado en DB
    const user = auth.currentUser;
    if(user) updateDoc(doc(db, "tecnicos", user.uid), { gpsActivo: true });
}

function detenerRastreoGPS() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    
    btnGPS.innerHTML = '<i class="fas fa-power-off"></i> <span>ACTIVAR GPS</span>';
    btnGPS.className = "w-full py-5 rounded-2xl font-black text-lg flex items-center justify-center gap-3 bg-slate-900 text-white hover:bg-slate-800 transition-all";
    if (gpsStatus) gpsStatus.innerText = "SISTEMA EN PAUSA";

    const user = auth.currentUser;
    if(user) updateDoc(doc(db, "tecnicos", user.uid), { gpsActivo: false });
}

async function actualizarUbicacion(pos) {
    const user = auth.currentUser;
    if (user) {
        // Escribimos en Firestore (Ligero)
        await updateDoc(doc(db, "tecnicos", user.uid), {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ubicacion: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            ultimaActualizacion: serverTimestamp()
        });
    }
}

function manejarErrorGPS(err) { console.warn("GPS Error:", err); }

// --- 3. RADAR DE SOLICITUDES (DISPONIBLES) ---
function escucharSolicitudesDisponibles() {
    const list = getEl("listaServicios");
    if (!list) return;

    const q = query(
        collection(db, "solicitudes"), 
        where("estado", "==", "SOLICITADO")
    );

    onSnapshot(q, (snapshot) => {
        list.innerHTML = snapshot.empty 
            ? '<div class="text-center py-10 text-slate-400 text-xs uppercase tracking-widest">Esperando servicios...</div>' 
            : '';
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            // Diseño Uber-like Dark
            card.className = "bg-slate-800 p-6 rounded-[2rem] mb-4 animate-fade border border-slate-700 shadow-xl";
            card.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <span class="bg-blue-500/20 text-blue-400 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                        ${data.categoria || 'GENERAL'}
                    </span>
                    <i class="fas fa-map-marker-alt text-slate-500"></i>
                </div>
                <p class="text-xl font-bold text-white mb-2 leading-tight">${data.direccion}</p>
                <p class="text-slate-400 text-sm mb-6 border-l-2 border-slate-600 pl-3 italic">"${data.descripcion || 'Sin descripción'}"</p>
                
                <button onclick="aceptarServicio('${docSnap.id}')" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl text-sm uppercase tracking-widest shadow-lg shadow-blue-600/20 transition-all transform active:scale-95">
                    Aceptar Misión
                </button>
            `;
            list.appendChild(card);
        });
    });
}

// Global para llamar desde HTML
window.aceptarServicio = async (id) => {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        // 1. Asignar solicitud
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "EN_CAMINO",
            tecnicoId: user.uid,
            fechaAceptado: serverTimestamp()
        });
        
        // 2. Ocupar Técnico
        await updateDoc(doc(db, "tecnicos", user.uid), { 
            estado: "EN SERVICIO",
            servicioActualId: id 
        });

        alert("✅ Servicio aceptado. GPS Prioritario activado.");
        if (watchId === null) iniciarRastreoGPS(); // Auto-activar GPS

    } catch (e) {
        console.error(e);
        alert("⚠️ Otro técnico ganó este servicio.");
    }
};

// --- 4. GESTIÓN DE SERVICIO ACTIVO (TU CÓDIGO CORTADO) ---
function escucharMiServicioActivo(uid) {
    const panelAcciones = getEl("panelAccionesTecnico");
    const contenedorBusqueda = getEl("contenedorBusqueda");

    const q = query(
        collection(db, "solicitudes"), 
        where("tecnicoId", "==", uid)
    );

    onSnapshot(q, (snapshot) => {
        // Filtrar localmente estados activos
        const activo = snapshot.docs.find(d => {
            const st = d.data().estado;
            return st === "EN_CAMINO" || st === "EN_SITIO";
        });

        if (!activo) {
            // MODO RADAR (BUSCANDO)
            if (panelAcciones) panelAcciones.classList.add("hidden");
            if (contenedorBusqueda) contenedorBusqueda.classList.remove("hidden");
            
            // Asegurar estado disponible
            updateDoc(doc(db, "tecnicos", uid), { estado: "DISPONIBLE", servicioActualId: null }).catch(()=>{});

        } else {
            // MODO MISIÓN (ACTIVO)
            if (panelAcciones) panelAcciones.classList.remove("hidden");
            if (contenedorBusqueda) contenedorBusqueda.classList.add("hidden");
            
            const serv = activo.data();
            const id = activo.id;
            
            let botonAccion = '';
            let estadoTexto = '';

            // LÓGICA DE BOTONES SEGÚN ESTADO
            if (serv.estado === 'EN_CAMINO') {
                estadoTexto = '<span class="text-blue-400 animate-pulse">EN RUTA AL DESTINO</span>';
                botonAccion = `
                    <button onclick="marcarLlegada('${id}')" class="w-full bg-indigo-600 text-white font-black py-5 rounded-2xl text-lg uppercase shadow-xl hover:bg-indigo-500 transition-all">
                        <i class="fas fa-flag-checkered mr-2"></i> Marcar Llegada
                    </button>`;
            } else if (serv.estado === 'EN_SITIO') {
                estadoTexto = '<span class="text-emerald-400">TRABAJANDO EN SITIO</span>';
                botonAccion = `
                    <button onclick="finalizarServicio('${id}')" class="w-full bg-emerald-600 text-white font-black py-5 rounded-2xl text-lg uppercase shadow-xl hover:bg-emerald-500 transition-all">
                        <i class="fas fa-check-circle mr-2"></i> Finalizar Trabajo
                    </button>`;
            }

            panelAcciones.innerHTML = `
                <div class="bg-slate-900 p-8 rounded-[2.5rem] border-2 border-indigo-500/50 shadow-2xl relative overflow-hidden">
                    <div class="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl"></div>
                    
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Misión Activa</h3>
                        <div class="text-[10px] font-bold uppercase tracking-widest bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
                            ${estadoTexto}
                        </div>
                    </div>

                    <div class="mb-8">
                        <p class="text-2xl font-black text-white leading-tight mb-2">${serv.direccion}</p>
                        <p class="text-slate-400 text-sm font-medium border-l-4 border-indigo-500 pl-4 py-1 bg-slate-800/50 rounded-r-lg">
                            ${serv.descripcion || 'Sin instrucciones adicionales'}
                        </p>
                    </div>

                    ${botonAccion}

                    <div class="mt-6 text-center">
                        <a href="tel:${serv.clienteTelefono || '#'}" class="text-slate-500 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors">
                            <i class="fas fa-phone-alt mr-1"></i> Contactar Cliente
                        </a>
                    </div>
                </div>
            `;
        }
    });
}

// --- 5. FUNCIONES DE CAMBIO DE ESTADO (GLOBALES) ---

window.marcarLlegada = async (id) => {
    if(!confirm("¿Confirmas que has llegado a la ubicación?")) return;
    try {
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "EN_SITIO",
            fechaLlegada: serverTimestamp()
        });
    } catch (e) { console.error(e); }
};

window.finalizarServicio = async (id) => {
    if(!confirm("¿Servicio completado y pagado?")) return;
    try {
        const user = auth.currentUser;
        
        // 1. Cerrar Solicitud
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "FINALIZADO",
            fechaFin: serverTimestamp()
        });

        // 2. Liberar Técnico
        await updateDoc(doc(db, "tecnicos", user.uid), {
            estado: "DISPONIBLE",
            servicioActualId: null
        });

        alert("🏆 ¡Gran trabajo! Estás listo para el siguiente.");
    } catch (e) { console.error(e); }
};

// Logout
const btnLogout = getEl("btnLogout");
if(btnLogout) {
    btnLogout.addEventListener("click", () => {
        signOut(auth).then(() => window.location.href = "login.html");
    });
}
