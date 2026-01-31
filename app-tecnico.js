// app-tecnico.js
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, where, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let tecnicoUID = null;
let tecnicoData = null;
let ubicacionInterval = null;
const INTERVALO_ACTUALIZACION = 15000; // 15 segundos

// UI Elements
const nombreTecnicoEl = document.getElementById("nombreTecnico");
const unidadTecnicoEl = document.getElementById("unidadTecnico");
const panelSolicitudes = document.getElementById("solicitudesContainer");

// Cambiar estado
window.cambiarEstado = async (nuevoEstado) => {
    if (!tecnicoUID) return;
    try {
        await updateDoc(doc(db, "tecnicos", tecnicoUID), { estado: nuevoEstado });
        alert(`✅ Estado cambiado a: ${nuevoEstado}`);
    } catch (error) {
        console.error("Error cambiando estado:", error);
    }
};

// Actualizar ubicación
const actualizarUbicacion = async () => {
    if (!tecnicoUID) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            await updateDoc(doc(db, "tecnicos", tecnicoUID), {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                ultimaConexion: serverTimestamp()
            });
        } catch (error) {
            console.error("Error actualizando ubicación:", error);
        }
    });
};

// Escuchar solicitudes pendientes
const escucharSolicitudes = () => {
    const q = query(collection(db, "solicitudes"), where("estado", "==", "PENDIENTE"));
    onSnapshot(q, (snapshot) => {
        panelSolicitudes.innerHTML = "";
        if (snapshot.empty) {
            panelSolicitudes.innerHTML = "<p class='text-slate-400 text-sm'>No hay solicitudes pendientes</p>";
            return;
        }

        snapshot.forEach(docSnap => {
            const solicitud = docSnap.data();
            const div = document.createElement("div");
            div.className = "p-4 mb-3 bg-slate-800 rounded-xl shadow-md flex flex-col gap-2";
            div.innerHTML = `
                <p><strong>Cliente:</strong> ${solicitud.nombre}</p>
                <p><strong>Dirección:</strong> ${solicitud.direccion || "Sin dirección"}</p>
                <p><strong>Teléfono:</strong> ${solicitud.telefono || "Sin teléfono"}</p>
                <div class="flex gap-2 mt-2">
                    <button class="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded" data-id="${docSnap.id}">Aceptar</button>
                    <button class="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded" data-id="${docSnap.id}">Rechazar</button>
                </div>
            `;
            panelSolicitudes.appendChild(div);

            // Botones aceptar/rechazar
            div.querySelector("button[data-id]").addEventListener("click", async (e) => {
                const id = e.target.dataset.id;
                await aceptarSolicitud(id);
            });
            div.querySelectorAll("button")[1].addEventListener("click", async (e) => {
                const id = e.target.dataset.id;
                await rechazarSolicitud(id);
            });
        });
    });
};

// Aceptar solicitud
const aceptarSolicitud = async (solicitudID) => {
    try {
        const docRef = doc(db, "solicitudes", solicitudID);
        await updateDoc(docRef, {
            tecnicoUID,
            estado: "ACEPTADA",
            aceptadaEn: serverTimestamp()
        });

        // Notificar al cliente
        alert("✅ Has aceptado la solicitud. El cliente ha sido notificado.");
    } catch (error) {
        console.error("Error aceptando solicitud:", error);
        alert("❌ Error al aceptar solicitud");
    }
};

// Rechazar solicitud
const rechazarSolicitud = async (solicitudID) => {
    try {
        await updateDoc(doc(db, "solicitudes", solicitudID), { estado: "RECHAZADA" });
        alert("Solicitud rechazada");
    } catch (error) {
        console.error("Error rechazando solicitud:", error);
        alert("❌ Error al rechazar solicitud");
    }
};

// Login y verificación de rol
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    tecnicoUID = user.uid;
    const docSnap = await getDoc(doc(db, "tecnicos", tecnicoUID));
    if (!docSnap.exists() || docSnap.data().rol !== "TECNICO") {
        alert("❌ No tienes permisos de técnico");
        await signOut(auth);
        window.location.href = "login.html";
        return;
    }

    tecnicoData = docSnap.data();
    nombreTecnicoEl.innerText = tecnicoData.nombre || "Técnico";
    unidadTecnicoEl.innerText = tecnicoData.vehiculo || "Sin unidad asignada";

    // Actualizar ubicación cada INTERVALO_ACTUALIZACION
    actualizarUbicacion();
    ubicacionInterval = setInterval(actualizarUbicacion, INTERVALO_ACTUALIZACION);

    // Escuchar solicitudes
    escucharSolicitudes();
});
