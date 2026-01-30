import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// USAMOS EL ID 44e4d QUE ES EL QUE YA FUNCIONÓ EN EL ADMIN
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

const form = document.getElementById('registroForm');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btn = document.getElementById('submitBtn');
    btn.innerText = "REGISTRANDO...";
    btn.disabled = true;

    // Obtenemos los valores de los inputs por su orden
    const inputs = form.querySelectorAll('input');
    
    const datosTecnico = {
        nombre: inputs[0].value,
        cedula: inputs[1].value,
        vehiculo: inputs[2].value,
        placas: inputs[3].value,
        fechaRegistro: new Date().toISOString()
    };

    try {
        // ENVIAMOS A LA COLECCIÓN "tecnicos"
        await addDoc(collection(db, "tecnicos"), datosTecnico);
        
        alert("✅ ¡Técnico registrado con éxito!");
        form.reset();
        window.location.href = "index.html"; // Redirigir al inicio después de registrar
    } catch (error) {
        console.error("Error al registrar:", error);
        alert("❌ Error: " + error.message);
    } finally {
        btn.innerText = "ENVIAR SOLICITUD DE ALTA";
        btn.disabled = false;
    }
});
