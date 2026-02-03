// app-admin.js
import { auth, db } from "./firebase.js";
import { collection, addDoc, getDocs, onSnapshot, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Ejemplo: cargar solicitudes
const solicitudesRef = collection(db, "solicitudes");
const q = query(solicitudesRef, orderBy("fecha", "desc"));

onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
            const data = change.doc.data();
            console.log("Nueva solicitud:", data);
            // Aquí tu código para mostrar en UI
        }
    });
});

// Función para agregar nueva solicitud (si aplica admin)
async function agregarSolicitud(solicitud) {
    try {
        await addDoc(solicitudesRef, {
            ...solicitud,
            fecha: serverTimestamp()
        });
        console.log("Solicitud agregada correctamente");
    } catch (error) {
        console.error("Error agregando solicitud:", error);
    }
}
