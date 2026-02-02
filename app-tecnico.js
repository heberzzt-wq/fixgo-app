import { auth, db } from "./firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    doc, 
    updateDoc,
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const listaPendientes = document.getElementById("solicitudesPendientes");

// 1. Jonathan escucha solo las solicitudes PENDIENTES
function cargarSolicitudesDisponibles() {
    const q = query(
        collection(db, "solicitudes"), 
        where("estado", "==", "PENDIENTE"),
        orderBy("fechaCreacion", "desc")
    );

    onSnapshot(q, (snapshot) => {
        if (!listaPendientes) return;
        listaPendientes.innerHTML = "";

        if (snapshot.empty) {
            listaPendientes.innerHTML = '<p class="text-slate-500 italic text-center">No hay servicios nuevos por ahora...</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;

            const div = document.createElement("div");
            div.className = "uber-card p-6 rounded-[2rem] border border-white/10 mb-4 animate-fade";
            div.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h4 class="text-indigo-400 font-black text-xs uppercase tracking-widest">${data.clienteNombre}</h4>
                        <p class="text-xl font-bold text-white">${data.direccion}</p>
                    </div>
                </div>
                <p class="text-slate-400 text-sm mb-6">${data.descripcion}</p>
                <button onclick="aceptarServicio('${id}')" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-tighter">
                    Aceptar y Ver Ruta
                </button>
            `;
            listaPendientes.appendChild(div);
        });
    });
}

// 2. Jonathan acepta el servicio
window.aceptarServicio = async (id) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const docRef = doc(db, "solicitudes", id);
        await updateDoc(docRef, {
            estado: "EN CAMINO",
            tecnicoId: user.uid // Aquí se guarda el ID de Jonathan: JFQnmY9b1...
        });
        
        alert("¡Servicio aceptado! Iniciando navegación...");
        // Aquí podrías redirigirlo a su propio mapa de navegación
    } catch (error) {
        console.error("Error al aceptar:", error);
    }
};

// Iniciar al detectar usuario
import { onAuthStateChanged } from "./firebase-auth.js";
onAuthStateChanged(auth, (user) => {
    if (user) cargarSolicitudesDisponibles();
});
