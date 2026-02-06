/**
 * FIXGO - APP-CLIENTE.JS
 * Control de Interfaz y Flujo de Usuario
 */
import { 
    auth, 
    db, 
    observarAuth, 
    crearSolicitud, 
    escucharSolicitudesActivas,
    actualizarUbicacion 
} from "./firebase.js";

// Elementos de la UI
const hero = document.getElementById("hero");
const clientDashboard = document.getElementById("clientDashboard");
const btnSolicitar = document.getElementById("btnSolicitar");
const userInfo = document.getElementById("userInfo");

/* ==========================================
   1. GESTIÓN DE ESTADO DE SESIÓN (CALLBACK)
   ========================================== */

// Usamos observarAuth que definimos en firebase.js
observarAuth((user) => {
    if (user) {
        // SI HAY USUARIO: Personalizar y mostrar Dashboard
        console.log("Cliente autenticado:", user.uid);
        
        if (hero) hero.classList.add("hidden"); // Ocultamos el Hero
        if (clientDashboard) clientDashboard.classList.remove("hidden"); // Mostramos App
        
        if (userInfo) {
            userInfo.innerHTML = `
                <p class="text-xs font-bold text-blue-500">BIENVENIDO</p>
                <h2 class="text-xl font-black">${user.nombre || 'Usuario'}</h2>
            `;
        }

        // Iniciar rastreo de sus solicitudes actuales
        iniciarEscuchaSolicitudes(user.uid);

    } else {
        // CALLBACK(NULL): No hay sesión, volvemos al estado inicial
        console.log("Sin sesión activa.");
        
        if (hero) hero.classList.remove("hidden"); // Mostramos el Hero (Login/Registro)
        if (clientDashboard) clientDashboard.classList.add("hidden"); // Ocultamos App
    }
});

/* ==========================================
   2. MOTOR DE SOLICITUDES (MARKETPLACE)
   ========================================== */

async function manejarSolicitud() {
    // 1. Obtener datos del formulario de la UI
    const servicioSelect = document.getElementById("servicioTipo");
    const descripcion = document.getElementById("descripcionTarea");

    if (!servicioSelect.value) return alert("Selecciona un servicio");

    // 2. Feedback visual (Loading)
    btnSolicitar.disabled = true;
    btnSolicitar.innerText = "BUSCANDO TÉCNICO...";

    try {
        // 3. Comunicación con Firebase (Punto 2 y 5 del Blueprint)
        const nuevaSolicitud = {
            vertical: "FIX", // O "ROAD" según UI
            servicio: servicioSelect.value,
            descripcion: descripcion.value,
            montoBase: 250, // Tarifa base inicial
            lat: 21.1619,   // Estos vendrían del GPS-MOTOR.JS
            lng: -86.8515
        };

        const docRef = await crearSolicitud(auth.currentUser.uid, nuevaSolicitud);
        alert("Solicitud enviada con éxito. ID: " + docRef.id);

    } catch (error) {
        console.error("Error al solicitar:", error);
        alert("Hubo un error al conectar con el servidor.");
    } finally {
        btnSolicitar.disabled = false;
        btnSolicitar.innerText = "SOLICITAR AHORA";
    }
}

/* ==========================================
   3. RASTREO EN TIEMPO REAL
   ========================================== */

function iniciarEscuchaSolicitudes(uid) {
    // Escuchamos cambios en Firestore (Modo Uber)
    escucharSolicitudesActivas('cliente', uid, (solicitudes) => {
        const listaUI = document.getElementById("listaServiciosActivos");
        if (!listaUI) return;

        if (solicitudes.length === 0) {
            listaUI.innerHTML = `<p class="text-slate-500 text-sm italic">No tienes servicios activos.</p>`;
            return;
        }

        listaUI.innerHTML = solicitudes.map(s => `
            <div class="bg-slate-900 p-4 rounded-2xl border border-slate-800 mb-3">
                <div class="flex justify-between items-center">
                    <span class="text-[10px] font-black bg-blue-600 px-2 py-1 rounded-lg">${s.estado}</span>
                    <span class="text-slate-500 text-[10px]">${new Date(s.creadoEn?.toDate()).toLocaleTimeString()}</span>
                </div>
                <h4 class="font-bold mt-2">${s.servicio}</h4>
                <p class="text-xs text-slate-400">${s.tecnicoId ? 'Técnico en camino' : 'Buscando al mejor técnico...'}</p>
            </div>
        `).join('');
    });
}

// Event Listeners
if (btnSolicitar) {
    btnSolicitar.addEventListener("click", manejarSolicitud);
}
