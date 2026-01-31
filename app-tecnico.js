// app-tecnico.js
import { getFirestore, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const db = getFirestore(app);

export async function cambiarEstado(estado) {
    const uid = window.tecnicoUid;
    if (!uid) return;
    try {
        await updateDoc(doc(db, "tecnicos", uid), { estado });
        window.tecnicoDisponible = estado === "DISPONIBLE";
    } catch (error) {
        console.error("Error cambiando estado:", error);
        alert("❌ No se pudo actualizar el estado.");
    }
}
