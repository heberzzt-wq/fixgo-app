// app-tecnico.js
import { auth, db } from "./firebase.js";
import { collection, onSnapshot, query, where, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Referencias DOM
const listaOrdenes = document.getElementById("listaOrdenes");

// Escuchar solicitudes asignadas al técnico
const q = query(collection(db, "solicitudes"), where("tecnicoId", "==", auth.currentUser.uid), where("estado", "==", "pendiente"));
onSnapshot(q, (snapshot) => {
    listaOrdenes.innerHTML = "";
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const li = document.createElement("li");
        li.textContent = `${data.servicio} - ${data.clienteId}`;
        // Botón aceptar
        const btnAceptar = document.createElement("button");
        btnAceptar.textContent = "Aceptar";
        btnAceptar.addEventListener("click", async () => {
            await updateDoc(doc(db, "solicitudes", docSnap.id), { estado: "en progreso" });
        });
        li.appendChild(btnAceptar);
        listaOrdenes.appendChild(li);
    });
});
