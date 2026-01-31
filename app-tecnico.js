// app-tecnico.js
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, updateDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

// Elementos del DOM
const solicitudesContainer = document.getElementById("solicitudesPendientes");
const btnCerrarSesion = document.getElementById("cerrarSesionTecnico");

// Estado del técnico
let tecnicoData = null;

// Verificar usuario logueado y rol
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const docRef = doc(db, "tecnicos", user.uid);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists() || docSnap.data().rol !== "TECNICO") {
            alert("❌ Acceso denegado. No eres técnico.");
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }

        tecnicoData = docSnap.data();
        document.getElementById("nombreTecnico").innerText = tecnicoData.nombre || "Técnico";
        document.getElementById("unidadTecnico").innerText = tecnicoData.vehiculo || "Sin unidad asignada";

        // Escuchar solicitudes pendientes
        escucharSolicitudesPendientes();
    } catch (error) {
        console.error("Error verificando rol:", error);
        alert("❌ Error verificando permisos.");
        await signOut(auth);
        window.location.href = "login.html";
    }
});

// Función para escuchar solicitudes pendientes
function escucharSolicitudesPendientes() {
    const q = query(collection(db, "solicitudes"), where("estado", "==", "PENDIENTE"));
    onSnapshot(q, (snapshot) => {
        solicitudesContainer.innerHTML = ""; // limpiar
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "bg-white p-4 rounded-xl shadow mb-4 text-gray-800";
            card.innerHTML = `
                <p><strong>Cliente:</strong> ${data.clienteNombre}</p>
                <p><strong>Dirección:</strong> ${data.direccion}</p>
                <p><strong>Teléfono:</strong> ${data.telefono}</p>
                <button class="acceptBtn bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded mt-2">
                    Aceptar solicitud
                </button>
            `;

            const btn = card.querySelector(".acceptBtn");
            btn.addEventListener("click", async () => aceptarSolicitud(docSnap.id, data));

            solicitudesContainer.appendChild(card);
        });
    });
}

// Función para aceptar solicitud
async function aceptarSolicitud(solicitudId, solicitudData) {
    if (!tecnicoData) return;

    try {
        const docRef = doc(db, "solicitudes", solicitudId);
        await updateDoc(docRef, {
            estado: "EN SERVICIO",
            tecnicoUid: auth.currentUser.uid,
            tecnicoNombre: tecnicoData.nombre,
            aceptadoEn: new Date().toISOString()
        });
        alert("✅ Solicitud aceptada correctamente.");
    } catch (error) {
        alert("❌ Error al aceptar solicitud: " + error.message);
    }
}

// Cerrar sesión
if (btnCerrarSesion) {
    btnCerrarSesion.addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "login.html";
    });
}
