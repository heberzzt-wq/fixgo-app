import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, updateDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDyplCp33LneGhqr6yd1VsIYBMdsLDK7gA",
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "54271811634",
    appId: "1:54271811634:web:53a6f4e1f727774e74e64f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Para esta demo, buscaremos al técnico llamado "Pedro"
// En un sistema real, usaríamos un Login.
async function cargarDatos() {
    const q = query(collection(db, "tecnicos"), where("nombre", "==", "Pedro"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        document.getElementById('nombreTecnico').innerText = doc.data().nombre;
        document.getElementById('unidadTecnico').innerText = doc.data().vehiculo;
        window.tecnicoId = doc.id; // Guardamos el ID para actualizar
    });
}

window.cambiarEstado = async function(nuevoEstado) {
    if (!window.tecnicoId) return alert("No se detectó ID de técnico");
    
    const tecRef = doc(db, "tecnicos", window.tecnicoId);
    try {
        await updateDoc(tecRef, { estado: nuevoEstado });
        alert("Estado actualizado a: " + nuevoEstado);
    } catch (e) { console.error(e); }
}

cargarDatos();
