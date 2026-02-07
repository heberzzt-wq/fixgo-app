/**
 * ======================================================
 * FIXGO - APP TÉCNICO v2.0
 * Lógica Completa: Auth + GPS + Botones
 * ======================================================
 */
import {
    auth,
    db,
    observarAuth,
    doc,
    setDoc,
    updateDoc,
    onSnapshot,
    serverTimestamp,
    signOut
} from "./firebase.js";

// Importamos el motor GPS para activarlo al entrar
// (Asegúrate de que gps-motor.js tenga 'export function iniciarTracking')
import { iniciarTracking } from "./gps-motor.js";

// Variables
let usuarioActual = null;
let suscripcionMisiones = null;

/**
 * 1. INICIALIZACIÓN
 */
console.log("🚀 Iniciando sistema técnico...");

observarAuth(async (user) => {
    // Si no hay sesión, al login
    if (!user) {
        console.warn("No hay sesión activa. Redirigiendo...");
        window.location.href = "login.html";
        return;
    }

    usuarioActual = user;
    console.log("✅ Técnico detectado:", user.email);

    // 2. PROTECCIÓN ANTI-EXPULSIÓN
    // En lugar de botarte si falta el rol, intentamos arreglarlo
    if (user.rol !== "tecnico") {
        console.log("⚠️ Rol no definido o incorrecto. Verificando perfil...");
        await asegurarPerfilTecnico(user);
    }

    // 3. ACTUALIZAR UI
    actualizarInterfazBasica();
    
    // 4. ENCENDER GPS
    if (typeof iniciarTracking === 'function') {
        iniciarTracking();
        console.log("📡 GPS Activado automáticante.");
    }

    // 5. ACTIVAR BOTONES
    conectarBotones();
    escucharEstadoMision();
});

/**
 * FUNCIÓN CLAVE: Evita que el sistema te saque
 * Si el usuario existe en Auth pero no en Firestore, lo crea.
 */
async function asegurarPerfilTecnico(user) {
    const tecRef = doc(db, "tecnicos", user.uid);
    try {
        await setDoc(tecRef, {
            uid: user.uid,
            email: user.email,
            nombre: user.nombre || "Técnico FixGo",
            rol: "tecnico",
            disponible: true,
            ultimaConexion: serverTimestamp()
        }, { merge: true });
        console.log("🔧 Perfil técnico sincronizado.");
    } catch (e) {
        console.error("Error asegurando perfil:", e);
    }
}

/**
 * LÓGICA DE BOTONES
 */
function conectarBotones() {
    const btnEnCamino = document.getElementById("btnEnCamino");
    const btnLlegue = document.getElementById("btnLlegue");
    const btnLogout = document.getElementById("btnLogout");

    // Botón: VOY EN CAMINO
    if (btnEnCamino) {
        btnEnCamino.onclick = async () => {
            btnEnCamino.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESANDO...';
            await actualizarEstado("En camino");
            
            // Cambio visual local inmediato
            btnEnCamino.classList.add("hidden");
            btnLlegue.classList.remove("hidden");
        };
    }

    // Botón: YA LLEGUÉ
    if (btnLlegue) {
        btnLlegue.onclick = async () => {
            btnLlegue.innerHTML = '<i class="fas fa-spinner fa-spin"></i> FINALIZANDO...';
            await actualizarEstado("En sitio");
            
            btnLlegue.innerText = "ESPERANDO CLIENTE...";
            btnLlegue.disabled = true;
            btnLlegue.classList.add("opacity-50");
        };
    }

    // Botón: SALIR
    if (btnLogout) {
        btnLogout.onclick = () => {
            if(confirm("¿Cerrar sesión?")) {
                signOut(auth).then(() => window.location.href = "login.html");
            }
        };
    }
}

/**
 * ACTUALIZAR ESTADO EN FIREBASE
 */
async function actualizarEstado(nuevoEstado) {
    if (!usuarioActual) return;
    
    const refRastreo = doc(db, "rastreo", "tecnicoActivo");
    
    try {
        await updateDoc(refRastreo, {
            estado: nuevoEstado,
            updatedAt: serverTimestamp()
        });
        console.log("Estado actualizado a:", nuevoEstado);
    } catch (e) {
        // Si falla porque no existe el documento, lo creamos
        await setDoc(refRastreo, {
            uid: usuarioActual.uid,
            estado: nuevoEstado,
            lat: 21.1619,
            lng: -86.8515
        }, { merge: true });
    }
}

/**
 * UI BÁSICA
 */
function actualizarInterfazBasica() {
    const elNombre = document.getElementById("userName");
    const elEstado = document.getElementById("statusLabel");
    
    if (elNombre) elNombre.innerText = usuarioActual.nombre || "Socio FixGo";
    if (elEstado) {
        elEstado.innerText = "EN LÍNEA";
        elEstado.className = "text-emerald-500 font-bold bg-emerald-900/20 px-3 py-1 rounded-full";
    }
}

/**
 * ESCUCHA DE ESTADO (Para persistencia al recargar)
 */
function escucharEstadoMision() {
    const ref = doc(db, "rastreo", "tecnicoActivo");
    onSnapshot(ref, (snap) => {
        if(snap.exists()) {
            const data = snap.data();
            const btnEnCamino = document.getElementById("btnEnCamino");
            const btnLlegue = document.getElementById("btnLlegue");
            
            if (data.estado === "En camino") {
                if(btnEnCamino) btnEnCamino.classList.add("hidden");
                if(btnLlegue) btnLlegue.classList.remove("hidden");
            } else if (data.estado === "En sitio") {
                if(btnEnCamino) btnEnCamino.classList.add("hidden");
                if(btnLlegue) {
                    btnLlegue.classList.remove("hidden");
                    btnLlegue.innerText = "ESPERANDO CLIENTE";
                    btnLlegue.disabled = true;
                }
            }
        }
    });
}
