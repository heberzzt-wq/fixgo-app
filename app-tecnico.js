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

// Variables de Estado Interno
let usuarioActual = null;
let suscripcionSolicitudes = null;

/**
 * INICIALIZACIÓN Y PROTECCIÓN DE RUTA
 */
observarAuth(async (user) => {
    // Error corregido: Ya no redirige al login si ya estás logueado
    if (!user) {
        console.log("Redirigiendo a Login...");
        window.location.href = "login.html";
        return;
    }

    // Validación de Rol para evitar que clientes entren al panel técnico
    if (user.rol && user.rol !== "tecnico") {
        console.error("Acceso denegado: Rol insuficiente.");
        window.location.href = "index.html";
        return;
    }

    usuarioActual = user;
    console.log("Panel Técnico Activo:", usuarioActual.email);

    // Actualizar Interfaz con datos del usuario
    actualizarInterfazBasica();
    
    // Sincronizar estado en Firestore
    await asegurarExistenciaTecnico();
    
    // Activar Listeners de la App
    conectarEventosGlobales();
    escucharMisionesActivas();
});

/**
 * SINCRONIZACIÓN DE PERFIL TÉCNICO
 */
async function asegurarExistenciaTecnico() {
    const tecRef = doc(db, "tecnicos", usuarioActual.uid);
    try {
        await setDoc(tecRef, {
            uid: usuarioActual.uid,
            nombre: usuarioActual.nombre || "Socio FixGo",
            disponible: true,
            ultimaConexion: serverTimestamp(),
            rol: "tecnico"
        }, { merge: true });
        console.log("Status: DISPONIBLE");
    } catch (e) {
        console.error("Error al sincronizar técnico:", e);
    }
}

/**
 * MONITOR DE MISIONES (RADAR)
 */
function escucharMisionesActivas() {
    if (suscripcionSolicitudes) suscripcionSolicitudes();

    // El técnico escucha solicitudes que estén en estado 'PENDIENTE'
    // O que ya hayan sido asignadas a él específicamente
    const q = doc(db, "solicitudes", usuarioActual.uid); 

    suscripcionSolicitudes = onSnapshot(q, (snapshot) => {
        if (!snapshot.exists()) {
            console.log("Radar: Buscando misiones...");
            renderModoLibre();
            return;
        }

        const mision = snapshot.data();
        manejarCambioDeEstado(mision);
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

    // Botones de Misión (Si existen en el HTML actual)
    const btnEnCamino = document.getElementById("btnEnCamino");
    if (btnEnCamino) {
        btnEnCamino.onclick = () => actualizarEstadoMision("en_camino");
    }

    const btnLlegué = document.getElementById("btnLlegue");
    if (btnLlegué) {
        btnLlegué.onclick = () => actualizarEstadoMision("en_sitio");
    }
}

async function actualizarEstadoMision(nuevoEstado) {
    const ref = doc(db, "solicitudes", usuarioActual.uid);
    try {
        await updateDoc(ref, {
            estado: nuevoEstado,
            actualizadoEn: serverTimestamp()
        });
        console.log("Misión actualizada a:", nuevoEstado);
    } catch (e) {
        console.error("Error al actualizar misión:", e);
    }
}

function actualizarInterfazBasica() {
    const labelNombre = document.getElementById("userName");
    if (labelNombre) labelNombre.innerText = usuarioActual.nombre || "Socio FixGo";
}

function renderModoLibre() {
    const statusLabel = document.getElementById("statusLabel");
    if (statusLabel) statusLabel.innerText = "ESPERANDO MISIONES...";
}

function manejarCambioDeEstado(mision) {
    console.log("Nueva actualización de misión:", mision.estado);
    // Aquí puedes disparar animaciones de UI tipo Uber
}
