import { auth, db } from "./firebase-auth.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const btnGPS = document.getElementById("btnActivarGPS");
let watchId = null;

if (btnGPS) {
    btnGPS.onclick = () => {
        // Si el rastreo no está activo, lo iniciamos
        if (watchId === null) {
            if (!navigator.geolocation) {
                alert("Tu dispositivo no soporta GPS");
                return;
            }

            watchId = navigator.geolocation.watchPosition(async (position) => {
                const { latitude, longitude } = position.coords;
                const user = auth.currentUser;
                
                if (user) {
                    const tecRef = doc(db, "tecnicos", user.uid);
                    // IMPORTANTE: Guardamos como 'ubicacion' para que coincida con app-cliente.js
                    await updateDoc(tecRef, {
                        ubicacion: { lat: latitude, lng: longitude },
                        lat: latitude, // Lo guardamos de ambas formas por seguridad
                        lng: longitude,
                        ultimaActualizacion: new Date()
                    });
                    console.log("📍 Coordenadas enviadas:", latitude, longitude);
                }
            }, (error) => {
                console.error("Error de GPS:", error);
                alert("Por favor, permite el acceso a tu ubicación.");
            }, { enableHighAccuracy: true });

            // Cambiamos el estilo del botón para mostrar que está activo
            btnGPS.innerHTML = '<i class="fas fa-broadcast-tower animate-pulse mr-2"></i> RASTREO ACTIVO';
            btnGPS.style.backgroundColor = "#10b981"; // Verde esmeralda
            btnGPS.style.color = "white";
        } else {
            // Si ya está activo, lo apagamos
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
            btnGPS.innerHTML = '<i class="fas fa-location-arrow mr-2"></i> ACTIVAR RASTREO GPS';
            btnGPS.style.backgroundColor = "white";
            btnGPS.style.color = "black";
        }
    };
}
