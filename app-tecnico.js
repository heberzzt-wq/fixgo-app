/**
 * ======================================================
 * FIXGO - APP TÉCNICO v2.0 (MODO UBER BLACK)
 * Sincronización de Servicios y GPS
 * ======================================================
 */
import {
    auth,
    db,
    observarAuth,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    serverTimestamp,
    signOut
} from "./firebase.js";

// Importamos el motor GPS para activarlo al entrar
// Asegúrate de que gps-motor.js tenga 'export function iniciarTracking'
import { iniciarTracking } from "./gps-motor.js";

// Variables de Estado Interno
let usuarioActual = null;
let suscripcionSolicitudes = null;

/**
 * INICIALIZACIÓN Y PROTECCIÓN DE RUTA
 */
observarAuth(async (user) => {
    // 1. Si no hay usuario en absoluto, ahí sí mandamos a Login
    if (!user) {
        console.log("Sin sesión. Redirigiendo a Login...");
        window.location.href = "login.html";
        return;
    }

    // 2. Si el usuario existe pero no tiene rol, lo arreglamos en vez de expulsarlo
    if (!user.rol || user.rol !== "tecnico") {
        console.warn("Usuario sin rol de técnico detectado. Intentando reparar perfil...");
        await asegurarPerfilTecnico(user);
        // Recargamos el usuario con los nuevos datos (simulado)
        user.rol = "tecnico"; 
    }

    usuarioActual = user;
    console.log("✅ Panel Técnico Activo para:", usuarioActual.email);

    // Actualizar Interfaz
    actualizarInterfazBasica();
    
    // Activar GPS automáticamente
    if(typeof iniciarTracking === 'function') {
        iniciarTracking(); 
    }
    
    // Activar Listeners
    conectarEventosGlobales();
    escucharMisionesActivas();
});

/**
 * REPARACIÓN DE PERFIL (Evita que te bote)
 */
async function asegurarPerfilTecnico(user) {
    const tecRef = doc(db, "tecnicos", user.uid);
    const userRef = doc(db, "usuarios", user.uid);

    try {
        // Datos base
        const datosBase = {
            uid: user.uid,
            email: user.email,
            nombre: user.displayName || user.nombre || "Socio FixGo",
            rol: "tecnico",
            disponible: true,
            ultimaConexion: serverTimestamp()
        };

        // Guardamos en ambas colecciones para asegurar compatibilidad
        await setDoc(tecRef, datosBase, { merge: true });
        await setDoc(userRef, datosBase, { merge: true });
        
        console.log("🔧 Perfil reparado exitosamente.");
    } catch (e) {
        console.error("Error al reparar técnico:", e);
    }
}

/**
 * MONITOR DE MISIONES (RADAR)
 */
function escucharMisionesActivas() {
    if (suscripcionSolicitudes) suscripcionSolicitudes();

    // Escuchamos cambios en el documento global de rastreo
    // Esto permite sincronizar los botones si recargas la página
    const q = doc(db, "rastreo", "tecnicoActivo"); 

    suscripcionSolicitudes = onSnapshot(q, (snapshot) => {
        if (!snapshot.exists()) {
            renderModoLibre();
            return;
        }
        const datos = snapshot.data();
        manejarCambioDeEstado(datos);
    });
}

/**
 * LÓGICA DE INTERFAZ Y EVENTOS
 */
function conectarEventosGlobales() {
    // Botón de Cerrar Sesión
    const btnLogout = document.getElementById("btnLogout");
    if (btnLogout) {
        btnLogout.onclick = () => signOut(auth).then(() => window.location.href = "login.html");
    }

    // Botones de Misión
    const btnEnCamino = document.getElementById("btnEnCamino");
    const btnLlegue = document.getElementById("btnLlegue");

    if (btnEnCamino) {
        btnEnCamino.onclick = () => {
            btnEnCamino.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> ENVIANDO...';
            actualizarEstadoMision("En camino");
        };
    }

    if (btnLlegue) {
        btnLlegue.onclick = () => {
            btnLlegue.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> ENVIANDO...';
            actualizarEstadoMision("En sitio");
        };
    }
}

async function actualizarEstadoMision(nuevoEstado) {
    if (!usuarioActual) return;

    // Actualizamos el documento que lee el mapa
    const ref = doc(db, "rastreo", "tecnicoActivo");
    try {
        await updateDoc(ref, {
            estado: nuevoEstado,
            updatedAt: serverTimestamp()
        });
        console.log("Misión actualizada a:", nuevoEstado);
    } catch (e) {
        // Si no existe, lo creamos
        await setDoc(ref, {
            uid: usuarioActual.uid,
            estado: nuevoEstado,
            lat: 21.1619,
            lng: -86.8515
        });
    }
}

function actualizarInterfazBasica() {
    const labelNombre = document.getElementById("userName");
    const statusLabel = document.getElementById("statusLabel");
    
    if (labelNombre) labelNombre.innerText = usuarioActual.nombre || "Socio FixGo";
    if (statusLabel) {
        statusLabel.innerText = "EN LÍNEA";
        statusLabel.className = "bg-emerald-900/30 text-emerald-500 status-badge font-bold border border-emerald-500/20";
    }
}

function renderModoLibre() {
    // Estado inicial
}

function manejarCambioDeEstado(datos) {
    const btnEnCamino = document.getElementById("btnEnCamino");
    const btnLlegue = document.getElementById("btnLlegue");
    const statusLabel = document.getElementById("statusLabel");

    if (!datos || !datos.estado) return;

    if (datos.estado === "En camino") {
        if(btnEnCamino) btnEnCamino.classList.add("hidden");
        if(btnLlegue) btnLlegue.classList.remove("hidden");
        if(statusLabel) statusLabel.innerText = "EN RUTA AL CLIENTE";
    } else if (datos.estado === "En sitio") {
        if(btnEnCamino) btnEnCamino.classList.add("hidden");
        if(btnLlegue) {
            btnLlegue.classList.remove("hidden");
            btnLlegue.innerText = "ESPERANDO CLIENTE";
            btnLlegue.disabled = true;
            btnLlegue.classList.add("opacity-50");
        }
        if(statusLabel) statusLabel.innerText = "EN EL SITIO";
    }
}
