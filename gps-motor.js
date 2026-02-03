// gps-motor.js
import { auth, db } from "./firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Actualizar ubicación del técnico en tiempo real
navigator.geolocation.watchPosition(async (pos) => {
    if (!auth.currentUser) return;

    const { latitude, longitude } = pos.coords;
    try {
        await updateDoc(doc(db, "tecnicos", auth.currentUser.uid), {
            lat: latitude,
            lng: longitude,
            ultimaActualizacion: new Date()
        });
    } catch (error) {
        console.error("Error actualizando ubicación:", error);
    }
});
