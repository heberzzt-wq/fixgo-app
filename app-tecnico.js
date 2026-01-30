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

async function cargarDatos() {
    // Buscamos a Pedro en la base de datos
    const q = query(collection(db, "tecnicos"), where("nombre", "==", "Pedro"));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
        document.getElementById('nombreTecnico').innerText = "No encontrado";
        return;
    }

    querySnapshot.forEach((documento) => {
        document.getElementById('nombreTecnico').innerText = documento.data().nombre;
        document.getElementById('unidadTecnico').innerText = documento.data().vehiculo;
        window.tecnicoId = documento.id; 
    });
}

window.cambiarEstado = async function(nuevoEstado) {
    if (!window.tecnicoId) return alert("Error: ID no encontrado");
    
    const tecRef = doc(db, "tecnicos", window.tecnicoId);
    try {
        await updateDoc(tecRef, { estado: nuevoEstado });
        alert("Estado actualizado: " + nuevoEstado);
    } catch (e) { alert("Error al conectar"); }
}

cargarDatos();
