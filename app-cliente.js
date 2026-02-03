// app-cliente.js
import { auth, db } from "./firebase.js";
import { collection, addDoc, serverTimestamp, query, onSnapshot, orderBy, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Referencias a DOM
const solicitudForm = document.getElementById("nuevaSolicitudForm");
const listaSolicitudes = document.getElementById("listaSolicitudes");

// Enviar nueva solicitud
solicitudForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const servicio = solicitudForm.servicio.value;
    try {
        await addDoc(collection(db, "solicitudes"), {
            servicio,
            clienteId: auth.currentUser.uid,
            fecha: serverTimestamp(),
            estado: "pendiente"
        });
        solicitudForm.reset();
    } catch (error) {
        console.error("Error al enviar solicitud:", error);
    }
});

// Escuchar solicitudes del cliente en tiempo real
const q = query(collection(db, "solicitudes"), where("clienteId", "==", auth.currentUser.uid), orderBy("fecha", "desc"));
onSnapshot(q, (snapshot) => {
    listaSolicitudes.innerHTML = "";
    snapshot.forEach(doc => {
        const data = doc.data();
        const li = document.createElement("li");
        li.textContent = `${data.servicio} - ${data.estado}`;
        listaSolicitudes.appendChild(li);
    });
});
