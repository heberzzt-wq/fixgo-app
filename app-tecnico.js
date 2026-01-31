// app-tecnico.js
import { app } from "./firebase-config.js";
import { auth, signOut, onAuthStateChanged } from "./firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const db = getFirestore(app);

const nombreTecnico = document.getElementById("nombreTecnico");
const unidadTecnico = document.getElementById("unidadTecnico");
const panelTecnico = document.getElementById("panelTecnico");

// 🔐 Protege acceso y verifica rol
onAuthStateChanged(auth, async (user) => {
    if (!user) return window.location.href = "login.html";

    try {
        const docRef = doc(db, "tecnicos", user.uid);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists() || docSnap.data().rol !== "TECNICO") {
            alert("❌ Acceso denegado. No eres técnico.");
            await signOut(auth);
            return window.location.href = "login.html";
        }

        // Mostrar info
        const data = docSnap.data();
        nombreTecnico.innerText = data.nombre || "Técnico";
        unidadTecnico.innerText = data.vehiculo || "Sin unidad";

        // Monitorear estado actual
        panelTecnico.dataset.estado = data.estado || "DISPONIBLE";

        // Opcional: actualizar ubicación periódicamente
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (pos) => {
                await updateDoc(docRef, {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                });
            });
        }

        // Cargar solicitudes asignadas al técnico en tiempo real
        cargarSolicitudes(user.uid);

    } catch (error) {
        console.error("Error verificando rol:", error);
        alert("❌ Error verificando permisos.");
        await signOut(auth);
        window.location.href = "login.html";
    }
});

// Cambiar estado técnico
window.cambiarEstado = async (nuevoEstado) => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const docRef = doc(db, "tecnicos", user.uid);
        await updateDoc(docRef, { estado: nuevoEstado });
        panelTecnico.dataset.estado = nuevoEstado;
        unidadTecnico.innerText = nuevoEstado === "DISPONIBLE" ? unidadTecnico.innerText : unidadTecnico.innerText;
        alert(`✅ Estado cambiado a ${nuevoEstado}`);
    } catch (error) {
        console.error("Error cambiando estado:", error);
        alert("❌ No se pudo cambiar el estado.");
    }
};

// Función para mostrar solicitudes asignadas
function cargarSolicitudes(uidTecnico) {
    const solicitudesRef = collection(db, "solicitudes");
    const q = query(solicitudesRef, where("asignadoA", "==", uidTecnico));

    onSnapshot(q, (snapshot) => {
        // Crear contenedor si no existe
        let contenedor = document.getElementById("listaSolicitudes");
        if (!contenedor) {
            contenedor = document.createElement("div");
            contenedor.id = "listaSolicitudes";
            contenedor.className = "mt-6 space-y-3";
            panelTecnico.appendChild(contenedor);
        }
        contenedor.innerHTML = "";

        if (snapshot.empty) {
            contenedor.innerHTML = "<p class='text-slate-400'>No tienes solicitudes asignadas.</p>";
        } else {
            snapshot.forEach(docu => {
                const s = docu.data();
                const div = document.createElement("div");
                div.className = "bg-slate-800/50 p-4 rounded-xl shadow-md text-left";
                div.innerHTML = `
                    <p><strong>Cliente:</strong> ${s.nombre}</p>
                    <p><strong>Dirección:</strong> ${s.direccion}</p>
                    <p><strong>Teléfono:</strong> ${s.telefono}</p>
                    <p><strong>Estado:</strong> ${s.estado}</p>
                `;
                contenedor.appendChild(div);
            });
        }
    });
}
