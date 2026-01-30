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

async function cargarPerfil() {
    const q = query(collection(db, "tecnicos"), where("nombre", "==", "Pedro"));
    const querySnapshot = await getDocs(q);
    
    querySnapshot.forEach((documento) => {
        document.getElementById('nombreTecnico').innerText = documento.data().nombre;
        document.getElementById('unidadTecnico').innerText = documento.data().vehiculo;
        window.currentTecId = documento.id; 
    });
}

window.cambiarEstado = async function(nuevoEstado) {
    if (!window.currentTecId) return;
    const tecRef = doc(db, "tecnicos", window.currentTecId);
    try {
        await updateDoc(tecRef, { estado: nuevoEstado });
        alert("Estado: " + nuevoEstado);
    } catch (e) { alert("Error de red"); }
}

cargarPerfil();
