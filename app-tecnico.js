import { auth, db } from "./firebase-auth.js";
import { 
    doc, 
    updateDoc, 
    collection, 
    query, 
    where, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Referencias a los botones de la Captura 307
const btnDisponible = document.querySelector('button:contains("DISPONIBLE")') || document.querySelectorAll('button')[0];
const btnEnServicio = document.querySelector('button:contains("EN SERVICIO")') || document.querySelectorAll('button')[1];

// 1. Función para actualizar el estado del técnico (Jonathan)
async function actualizarEstadoTecnico(nuevoEstado) {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const tecnicoRef = doc(db, "tecnicos", user.uid);
        await updateDoc(tecnicoRef, {
            estado: nuevoEstado // "DISPONIBLE" o "EN SERVICIO"
        });
        alert(`Estado actualizado a: ${nuevoEstado}`);
    } catch (error) {
        console.error("Error al actualizar estado:", error);
    }
}

// 2. Asignar clics a los botones
if (btnDisponible) {
    btnDisponible.addEventListener("click", () => actualizarEstadoTecnico("DISPONIBLE"));
}

if (btnEnServicio) {
    btnEnServicio.addEventListener("click", () => actualizarEstadoTecnico("EN SERVICIO"));
}

// 3. Escuchar solicitudes entrantes (Esto requiere el índice de la Captura 307)
function escucharSolicitudes() {
    const q = query(collection(db, "solicitudes"), where("estado", "==", "PENDIENTE"));

    onSnapshot(q, (snapshot) => {
        const contenedor = document.getElementById("solicitudesEntrantesContainer"); // Asegúrate que este ID exista
        if (!contenedor) return;
        
        contenedor.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // Aquí se genera la tarjeta de la solicitud con el botón "Aceptar"
            contenedor.innerHTML += `
                <div class="uber-card p-4 mb-4 rounded-2xl border border-white/10">
                    <p class="text-indigo-400 font-black text-xs">${data.clienteNombre}</p>
                    <p class="text-white font-bold">${data.direccion}</p>
                    <button onclick="aceptarServicio('${docSnap.id}')" class="mt-3 w-full bg-indigo-600 py-2 rounded-xl">ACEPTAR</button>
                </div>
            `;
        });
    });
}
