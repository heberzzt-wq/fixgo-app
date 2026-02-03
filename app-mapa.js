// app-mapa.js
import { auth, db } from "./firebase.js";
import { collection, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Ejemplo: rastrear ubicaciones de técnicos en tiempo real
const q = query(collection(db, "tecnicos"), where("activo", "==", true));

onSnapshot(q, (snapshot) => {
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        console.log("Ubicación técnico:", data.lat, data.lng);
        // Aquí tu código para mostrar en mapa
    });
});
