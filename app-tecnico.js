/**
 * ======================================================
 * FIXGO - APP TÉCNICO v3.0 (Fixed Uploads & Sync)
 * ======================================================
 */
import {
    auth,
    db,
    observarAuth,
    doc,
    setDoc,
    serverTimestamp,
    signOut,
    onSnapshot
} from "./firebase.js";

// Intentamos importar el GPS
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

    if (user.rol !== "tecnico") {
        alert("Acceso denegado. Área exclusiva para técnicos.");
        window.location.href = "index.html";
        return;
    }

    usuarioActual = user;
    console.log("✅ Técnico autenticado:", user.uid);

    // Actualizar Nombre en UI
    const elNombre = document.getElementById("userName");
    if (elNombre) elNombre.innerText = user.nombre || "Socio FixGo";

    // Iniciar GPS
    if (gpsModule && gpsModule.iniciarTracking) {
        gpsModule.iniciarTracking(user.uid);
    }

    // Activar funciones
    conectarBotonesMision();
    conectarSubidaDocumentos(); // <--- ESTO FALTABA
    escucharEstadoMision();
});

// 2. LÓGICA DE BOTONES DE MISIÓN (Ruta)
function conectarBotonesMision() {
    const btnEnCamino = document.getElementById("btnEnCamino");
    const btnLlegue = document.getElementById("btnLlegue");
    const btnLogout = document.getElementById("btnLogout");

    if (btnEnCamino) {
        btnEnCamino.onclick = async () => {
            btnEnCamino.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PROCESANDO...';
            await actualizarEstado("En camino");
        };
    }

    if (btnLlegue) {
        btnLlegue.onclick = async () => {
            btnLlegue.innerHTML = '<i class="fas fa-spinner fa-spin"></i> FINALIZANDO...';
            await actualizarEstado("En sitio");
        };
    }

    if (btnLogout) {
        btnLogout.onclick = () => {
            if(confirm("¿Cerrar turno?")) {
                signOut(auth).then(() => window.location.href = "login.html");
            }
        };
    }
}

// 3. LÓGICA DE SUBIDA DE DOCUMENTOS (NUEVO)
function conectarSubidaDocumentos() {
    // Helper para conectar botón con input
    const conectarInput = (btnId, inputId) => {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        
        if (!btn || !input) return;

        // Click en botón abre el input file
        btn.onclick = () => input.click();

        // Cuando se selecciona un archivo
        input.onchange = async (e) => {
            if (e.target.files.length > 0) {
                btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
                
                // SIMULACIÓN DE SUBIDA (Aquí iría Firebase Storage)
                // Por ahora simulamos 1 segundo de carga y éxito
                setTimeout(() => {
                    btn.className = "bg-emerald-500 text-white text-xs font-black px-4 py-2 rounded-lg transition-all";
                    btn.innerHTML = '<i class="fas fa-check"></i> OK';
                    alert("Documento cargado correctamente (Simulación)");
                }, 1500);
            }
        };
    };

    conectarInput("btnINE", "inputINE");
    conectarInput("btnCSF", "inputCSF");
    conectarInput("btnVehiculo", "inputVehiculo");
}

// 4. ACTUALIZAR BASE DE DATOS
async function actualizarEstado(nuevoEstado) {
    if (!usuarioActual) return;
    const refRastreo = doc(db, "rastreo", usuarioActual.uid);
    try {
        await setDoc(refRastreo, {
            uid: usuarioActual.uid,
            nombre: usuarioActual.nombre || "Técnico",
            estado: nuevoEstado,
            updatedAt: serverTimestamp(),
            lat: 21.1619, 
            lng: -86.8515
        }, { merge: true });
    } catch (e) {
        console.error("Error actualizando estado:", e);
    }
}

// 5. ESCUCHAR CAMBIOS DE ESTADO (UI)
function escucharEstadoMision() {
    if (!usuarioActual) return;
    const ref = doc(db, "rastreo", usuarioActual.uid);
    
    onSnapshot(ref, (snap) => {
        const btnEnCamino = document.getElementById("btnEnCamino");
        const btnLlegue = document.getElementById("btnLlegue");
        const statusLabel = document.getElementById("statusLabel");

        if(snap.exists()) {
            const data = snap.data();
            if (statusLabel) statusLabel.innerText = data.estado ? data.estado.toUpperCase() : "ONLINE";

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
            }
        }
    });
}
