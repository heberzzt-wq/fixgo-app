import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k", // Nueva API Key
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    appId: "1:54271811634:web:53a6f4e1f727774e74e64f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.cambiarEstado = async function(nuevoEstado) {
    if (!window.currentTecId) return alert("Error: ID no detectado");
    const tecRef = doc(db, "tecnicos", window.currentTecId);
    try {
        await updateDoc(tecRef, { estado: nuevoEstado });
        alert("Estado actualizado a " + nuevoEstado);
    } catch (e) { console.error(e); }
}
