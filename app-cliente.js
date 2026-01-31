// app-cliente.js
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

// 🔐 Verificar sesión
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    // Mostrar el UID o información del cliente si quieres
    console.log("Cliente conectado:", user.uid);

    // Escuchar solicitudes pendientes del cliente en tiempo real
    const solicitudesRef = collection(db, "solicitudes");
    const q = query(solicitudesRef, where("clienteUid", "==", user.uid));
    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            if (change.type === "added") {
                console.log("Nueva solicitud:", data);
                mostrarSolicitud(data);
            }
            if (change.type === "modified") {
                console.log("Solicitud actualizada:", data);
                actualizarSolicitud(data);
            }
        });
    });
});

// 📄 Crear nueva solicitud
const formSolicitud = document.getElementById("solicitudForm");
if (formSolicitud) {
    formSolicitud.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = formSolicitud.querySelector("button[type=submit]");
        btn.disabled = true;
        btn.innerText = "Enviando solicitud...";

        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Usuario no autenticado");

            const descripcion = formSolicitud.querySelector('[name="descripcion"]').value.trim();
            const direccion = formSolicitud.querySelector('[name="direccion"]').value.trim();

            const nuevaSolicitud = {
                clienteUid: user.uid,
                descripcion,
                direccion,
                estado: "PENDIENTE", // inicial
                tecnicoUid: null, // aún no asignado
                creadoEn: new Date().toISOString(),
            };

            await addDoc(collection(db, "solicitudes"), nuevaSolicitud);

            alert("✅ Solicitud enviada correctamente.");
            formSolicitud.reset();
            btn.disabled = false;
            btn.innerText = "Enviar solicitud";

        } catch (error) {
            alert("❌ Error: " + error.message);
            btn.disabled = false;
            btn.innerText = "Enviar solicitud";
        }
    });
}

// ==== Funciones UI básicas ====
function mostrarSolicitud(data) {
    // Aquí se puede renderizar la solicitud en el panel del cliente
    // Ejemplo simple:
    const contenedor = document.getElementById("misSolicitudes");
    if (contenedor) {
        const div = document.createElement("div");
        div.id = data.id || data.clienteUid + "_" + data.creadoEn;
        div.className = "border p-4 my-2 rounded bg-white/10";
        div.innerHTML = `
            <p><strong>Descripción:</strong> ${data.descripcion}</p>
            <p><strong>Dirección:</strong> ${data.direccion}</p>
            <p><strong>Estado:</strong> <span id="estado_${div.id}">${data.estado}</span></p>
            <p><strong>Técnico asignado:</strong> ${data.tecnicoUid || "Sin asignar"}</p>
        `;
        contenedor.appendChild(div);
    }
}

function actualizarSolicitud(data) {
    const id = data.id || data.clienteUid + "_" + data.creadoEn;
    const estadoSpan = document.getElementById("estado_" + id);
    if (estadoSpan) estadoSpan.innerText = data.estado;
}
