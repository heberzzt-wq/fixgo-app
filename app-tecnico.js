/**
 * ======================================================
 * FIXGO - APP TÉCNICO v2.1 (Fixed Logic)
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

// Intentamos importar el GPS, si falla no rompe la app
let gpsModule = null;
try {
    gpsModule = await import("./gps-motor.js");
} catch (e) {
    console.warn("Módulo GPS no encontrado (Modo desarrollo sin mapa)");
}

let usuarioActual = null;

console.log("🚀 Iniciando sistema técnico...");

// 1. INICIALIZACIÓN Y SEGURIDAD
observarAuth(async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    // Validación estricta de rol
    if (user.rol !== "tecnico") {
        alert("Acceso denegado. Área exclusiva para técnicos.");
        window.location.href = "index.html";
        return;
    }

    usuarioActual = user;
    console.log("✅ Técnico autenticado:", user.uid);

    // Actualizar UI con datos del usuario
    const elNombre = document.getElementById("userName");
    if (elNombre) elNombre.innerText = user.nombre || "Socio FixGo";

    // Iniciar GPS
    if (gpsModule && gpsModule.iniciarTracking) {
        gpsModule.iniciarTracking(user.uid); // Pasamos el UID para rastreo único
    }

    // Inicializar listeners de botones
    conectarBotones();
    escucharEstadoMision();
});

// 2. LÓGICA DE BOTONES
function conectarBotones() {
    const btnEnCamino = document.getElementById("btnEnCamino");
    const btnLlegue = document.getElementById("btnLlegue");
    const btnLogout = document.getElementById("btnLogout");

    // Click: EN CAMINO
    if (btnEnCamino) {
        btnEnCamino.onclick = async () => {
            btnEnCamino.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESANDO...';
            await actualizarEstado("En camino");
        };
    }

    // Click: YA LLEGUÉ
    if (btnLlegue) {
        btnLlegue.onclick = async () => {
            btnLlegue.innerHTML = '<i class="fas fa-spinner fa-spin"></i> FINALIZANDO...';
            await actualizarEstado("En sitio");
        };
    }

    // Click: SALIR
    if (btnLogout) {
        btnLogout.onclick = () => {
            if(confirm("¿Cerrar turno?")) {
                signOut(auth).then(() => window.location.href = "login.html");
            }
        };
    }
}

// 3. ACTUALIZAR BASE DE DATOS (Rastreo Individual)
async function actualizarEstado(nuevoEstado) {
    if (!usuarioActual) return;
    
    // IMPORTANTE: Usamos el UID del técnico, no "tecnicoActivo"
    const refRastreo = doc(db, "rastreo", usuarioActual.uid);
    
    try {
        await setDoc(refRastreo, {
            uid: usuarioActual.uid,
            nombre: usuarioActual.nombre || "Técnico",
            estado: nuevoEstado,
            updatedAt: serverTimestamp(),
            // Coordenadas dummy si el GPS no ha reportado aún
            lat: 21.1619, 
            lng: -86.8515
        }, { merge: true }); // Merge para no borrar coordenadas reales si existen
        
        console.log("Estado actualizado a:", nuevoEstado);
    } catch (e) {
        console.error("Error actualizando estado:", e);
        alert("Error de conexión. Intenta de nuevo.");
    }
}

// 4. ESCUCHAR CAMBIOS DE ESTADO (Para persistencia visual)
function escucharEstadoMision() {
    if (!usuarioActual) return;

    // Escuchamos NUESTRO propio documento
    const ref = doc(db, "rastreo", usuarioActual.uid);
    
    onSnapshot(ref, (snap) => {
        const btnEnCamino = document.getElementById("btnEnCamino");
        const btnLlegue = document.getElementById("btnLlegue");
        const statusLabel = document.getElementById("statusLabel");

        if(snap.exists()) {
            const data = snap.data();
            
            // Actualizar etiqueta superior
            if (statusLabel) statusLabel.innerText = data.estado ? data.estado.toUpperCase() : "ONLINE";

            // Lógica de visualización de botones
            if (data.estado === "En camino") {
                if(btnEnCamino) btnEnCamino.classList.add("hidden");
                if(btnLlegue) {
                    btnLlegue.classList.remove("hidden");
                    btnLlegue.innerHTML = '<i class="fas fa-map-marker-alt text-xl"></i> YA LLEGUÉ AL SITIO';
                    btnLlegue.disabled = false;
                    btnLlegue.classList.remove("opacity-50");
                }
            } else if (data.estado === "En sitio") {
                if(btnEnCamino) btnEnCamino.classList.add("hidden");
                if(btnLlegue) {
                    btnLlegue.classList.remove("hidden");
                    btnLlegue.innerText = "ESPERANDO CLIENTE...";
                    btnLlegue.disabled = true;
                    btnLlegue.classList.add("opacity-50");
                }
            } else {
                // Estado inicial o reset
                if(btnEnCamino) {
                    btnEnCamino.classList.remove("hidden");
                    btnEnCamino.innerHTML = '<i class="fas fa-car-side text-xl"></i> VOY EN CAMINO';
                }
                if(btnLlegue) btnLlegue.classList.add("hidden");
            }
        }
    });
}
