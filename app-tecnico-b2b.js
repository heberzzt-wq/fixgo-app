import { auth, db, doc, onSnapshot, collection, query, where, updateDoc } from "./firebase.js";

// --- CONFIGURACIÓN DE ALERTAS ---
const SONIDO_ALERTA = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"); // Sonido tipo "Beep" industrial
let primeraCarga = true;

console.log("🛠️ App Técnico: Monitor de Órdenes Puerto Cancún Activo.");

// 1. SOLICITAR PERMISOS DE NOTIFICACIÓN AL CARGAR
if (Notification.permission !== "granted") {
    Notification.requestPermission();
}

// 2. MONITOR DE SESIÓN Y TICKET
auth.onAuthStateChanged((user) => {
    if (user) {
        escucharMisOrdenes(user.uid);
    } else {
        console.warn("🔒 Sin sesión: El técnico debe loguearse.");
    }
});

function escucharMisOrdenes(tecnicoId) {
    // Buscamos tickets PENDIENTES asignados a este técnico específico
    const q = query(
        collection(db, "services"), 
        where("tecnicoId", "==", tecnicoId),
        where("status", "==", "pendiente")
    );

    onSnapshot(q, (snap) => {
        // Evitamos que suene mil veces al abrir la app la primera vez
        if (primeraCarga) {
            primeraCarga = false;
            return;
        }

        snap.docChanges().forEach((change) => {
            if (change.type === "added") {
                const ticket = change.doc.data();
                const ticketId = change.doc.id;
                
                // 🔥 ACCIÓN SENIOR: DISPARAR ALERTAS
                lanzarAlertaAudible();
                lanzarNotificacionVisual(ticket, ticketId);
            }
        });
    });
}

// 3. FUNCIÓN AUDIBLE (EL "CHIFLIDO" PARA EL TÉCNICO)
function lanzarAlertaAudible() {
    SONIDO_ALERTA.play().catch(err => {
        console.warn("🔇 El navegador bloqueó el audio. Requiere interacción previa del usuario.");
    });
    
    // Vibración (Solo para Android/Chrome)
    if ("vibrate" in navigator) {
        navigator.vibrate([500, 200, 500]);
    }
}

// 4. FUNCIÓN VISUAL (NOTIFICACIÓN EN PANTALLA)
function lanzarNotificacionVisual(ticket, id) {
    const titulo = `🚨 NUEVA ORDEN: ${ticket.sector}`;
    const opciones = {
        body: `${ticket.punto_exacto}\n${ticket.descripcion}\nPRIORIDAD: ${ticket.prioridad.toUpperCase()}`,
        icon: "https://cdn-icons-png.flaticon.com/512/1048/1048953.png", // Icono de herramienta
        tag: id, // Evita duplicados
        requireInteraction: true // La notificación no se quita hasta que el técnico la toque
    };

    if (Notification.permission === "granted") {
        const n = new Notification(titulo, opciones);
        n.onclick = () => {
            window.focus();
            console.log("El técnico abrió el ticket:", id);
        };
    } else {
        // Fallback si no hay permisos: un Alert clásico que bloquea la pantalla
        alert(`🚨 ¡NUEVA ORDEN DE TRABAJO!\n\nZONA: ${ticket.sector}\nUBICACIÓN: ${ticket.punto_exacto}\nTAREA: ${ticket.descripcion}`);
    }
}

// 5. FUNCIÓN PARA QUE EL TÉCNICO ACEPTE LA CHAMBA
window.aceptarOrden = async (id) => {
    try {
        await updateDoc(doc(db, "services", id), {
            status: "en_proceso",
            fecha_aceptacion: new Date()
        });
        alert("✅ Orden aceptada. ¡A darle!");
    } catch (err) {
        console.error("Error al aceptar:", err);
    }
};
