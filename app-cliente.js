// app-cliente.js
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById("clienteForm");
const estadoDiv = document.getElementById("estadoSolicitud");
const cerrarBtn = document.getElementById("cerrarSesionCliente");

let clienteUid = null;
let solicitudActivaId = null;

// ===== Verificar sesión =====
onAuthStateChanged(auth, user => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        clienteUid = user.uid;
    }
});

// ===== Crear nueva solicitud =====
form.addEventListener("submit", async e => {
    e.preventDefault();
    if (!clienteUid) return;

    const data = Object.fromEntries(new FormData(form));

    try {
        // Guardar solicitud en Firestore
        const docRef = await addDoc(collection(db, "solicitudes"), {
            ...data,
            clienteUid,
            estado: "PENDIENTE",
            tecnicoUid: null,
            tecnicoNombre: null,
            creadoEn: new Date().toISOString()
        });

        solicitudActivaId = docRef.id;
        estadoDiv.innerText = "📌 Solicitud creada. Esperando técnico...";
        form.reset();

        // Escuchar cambios en la solicitud
        escucharActualizacionSolicitud();

    } catch (err) {
        alert("❌ Error creando solicitud: " + err.message);
    }
});

// ===== Escuchar cambios en la solicitud =====
function escucharActualizacionSolicitud() {
    if (!solicitudActivaId) return;

    const docRef = doc(db, "solicitudes", solicitudActivaId);

    onSnapshot(docRef, docSnap => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        if (data.estado === "EN SERVICIO") {
            estadoDiv.innerText = `🚀 Técnico asignado: ${data.tecnicoNombre}`;
        } else if (data.estado === "FINALIZADO") {
            estadoDiv.innerText = `✅ Servicio completado`;
        } else if (data.estado === "CANCELADO") {
            estadoDiv.innerText = `⚠️ Solicitud cancelada`;
        }
    });
}

// ===== Cerrar sesión =====
cerrarBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
});
