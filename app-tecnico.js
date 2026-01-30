import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k",
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    appId: "1:54271811634:web:53a6f4e1f727774e74e64f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 1. FUNCIÓN PARA CAMBIAR ESTADO (La que ya tenías)
window.cambiarEstado = async function(nuevoEstado) {
    if (!window.currentTecId) return alert("Error: ID no detectado");
    const tecRef = doc(db, "tecnicos", window.currentTecId);
    try {
        await updateDoc(tecRef, { estado: nuevoEstado });
        alert("Estado actualizado a " + nuevoEstado);
    } catch (e) { console.error(e); }
}

// 2. MOTOR DE GPS EN TIEMPO REAL
// Esta función se activa en cuanto el técnico entra a su panel
function iniciarSeguimientoGPS() {
    if (!navigator.geolocation) {
        return alert("Tu navegador no soporta GPS");
    }

    // "watchPosition" sigue al técnico mientras se mueve
    navigator.geolocation.watchPosition(async (position) => {
        if (!window.currentTecId) return;

        const { latitude, longitude } = position.coords;
        const tecRef = doc(db, "tecnicos", window.currentTecId);

        try {
            await updateDoc(tecRef, {
                lat: latitude,
                lng: longitude,
                ultimaActualizacion: new Date().toISOString()
            });
            console.log("📍 Ubicación actualizada:", latitude, longitude);
        } catch (error) {
            console.error("Error enviando GPS:", error);
        }
    }, 
    (error) => {
        console.warn("Error de GPS: ", error.message);
    }, 
    {
        enableHighAccuracy: true, // Usa GPS de alta precisión
        maximumAge: 0,
        timeout: 5000
    });
}

// Iniciar el GPS automáticamente
iniciarSeguimientoGPS();
