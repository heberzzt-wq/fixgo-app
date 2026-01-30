import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.innerText = "OBTENIENDO GPS...";
    btn.disabled = true;

    // SOLICITAR UBICACIÓN REAL
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            const inputs = form.querySelectorAll('input');
            const datosTecnico = {
                nombre: inputs[0].value,
                cedula: inputs[1].value,
                vehiculo: inputs[2].value,
                placas: inputs[3].value,
                lat: lat,
                lng: lng,
                ultimaConexion: new Date().toISOString(),
                estado: "ACTIVO"
            };

            try {
                await addDoc(collection(db, "tecnicos"), datosTecnico);
                alert("✅ Registrado con éxito en tu ubicación actual.");
                window.location.href = "index.html";
            } catch (error) {
                alert("Error: " + error.message);
            }
        }, (error) => {
            alert("⚠️ Por favor activa el GPS para registrarte.");
            btn.innerText = "ENVIAR SOLICITUD DE ALTA";
            btn.disabled = false;
        });
    } else {
        alert("Tu navegador no soporta GPS.");
    }
});
