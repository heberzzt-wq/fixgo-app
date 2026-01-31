// app-cliente.js
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById("solicitudForm");
const mensaje = document.getElementById("msg");

// Asegurar que el usuario está logueado
let clienteUID = null;
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    clienteUID = user.uid;
});

// Enviar nueva solicitud
if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        mensaje.innerText = "📤 Enviando solicitud...";
        const data = {};

        // Recoger campos
        const inputs = form.querySelectorAll("input, textarea");
        inputs.forEach(input => data[input.name] = input.value.trim());

        try {
            await addDoc(collection(db, "solicitudes"), {
                clienteUID,
                nombreCliente: data.nombre,
                telefono: data.telefono,
                direccion: data.direccion,
                descripcion: data.descripcion || "",
                estado: "PENDIENTE",
                creadoEn: serverTimestamp(),
                asignadoA: null,
                tecnicoNombre: null
            });

            mensaje.innerText = "✅ Solicitud enviada correctamente.";
            form.reset();

        } catch (error) {
            mensaje.innerText = "❌ Error: " + error.message;
        }
    });
}
