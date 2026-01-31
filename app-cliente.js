// app-cliente.js
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

// Elementos del DOM
const form = document.getElementById("solicitudForm");
const solicitudesContainer = document.getElementById("misSolicitudes");
const btnCerrarSesion = document.getElementById("cerrarSesion");

// Verificar usuario logueado
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    // Escuchar solicitudes del cliente en tiempo real
    const q = query(collection(db, "solicitudes"), where("clienteUid", "==", user.uid));
    onSnapshot(q, (snapshot) => {
        solicitudesContainer.innerHTML = ""; // limpiar
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "bg-white p-4 rounded-xl shadow mb-4 text-gray-800";
            card.innerHTML = `
                <p><strong>Servicio:</strong> ${data.direccion}</p>
                <p><strong>Estado:</strong> ${data.estado}</p>
                <p><strong>Técnico:</strong> ${data.tecnicoNombre || "Pendiente"}</p>
            `;
            solicitudesContainer.appendChild(card);
        });
    });
});

// Crear nueva solicitud
if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const nombre = form.nombre.value.trim();
        const telefono = form.telefono.value.trim();
        const direccion = form.direccion.value.trim();

        if (!nombre || !telefono || !direccion) {
            alert("⚠️ Completa todos los campos");
            return;
        }

        try {
            const user = auth.currentUser;
            await addDoc(collection(db, "solicitudes"), {
                clienteUid: user.uid,
                clienteNombre: nombre,
                telefono,
                direccion,
                estado: "PENDIENTE",
                creadoEn: new Date().toISOString()
            });
            alert("✅ Solicitud enviada, esperando técnico disponible.");
            form.reset();
        } catch (error) {
            alert("❌ Error creando solicitud: " + error.message);
        }
    });
}

// Cerrar sesión
if (btnCerrarSesion) {
    btnCerrarSesion.addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "login.html";
    });
}
