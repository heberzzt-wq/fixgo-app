// app-cliente.js
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let clienteUID = null;
let clienteData = null;

// UI Elements
const nombreClienteEl = document.getElementById("nombreCliente");
const solicitudesContainer = document.getElementById("solicitudesCliente");
const nuevaSolicitudForm = document.getElementById("nuevaSolicitudForm");

// Validar sesión y rol
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    clienteUID = user.uid;
    const docSnap = await getDoc(doc(db, "clientes", clienteUID));

    if (!docSnap.exists() || docSnap.data().rol !== "CLIENTE") {
        alert("❌ No tienes permisos de cliente.");
        await signOut(auth);
        window.location.href = "login.html";
        return;
    }

    clienteData = docSnap.data();
    nombreClienteEl.innerText = clienteData.nombre || "Cliente";

    // Escuchar solicitudes en tiempo real
    escucharSolicitudes();
});

// Función para crear nueva solicitud
nuevaSolicitudForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = {};
    nuevaSolicitudForm.querySelectorAll("input, textarea").forEach(input => {
        formData[input.name] = input.value.trim();
    });

    if (!formData.direccion || !formData.descripcion) {
        alert("⚠️ Completa todos los campos.");
        return;
    }

    try {
        await addDoc(collection(db, "solicitudes"), {
            clienteUID,
            nombre: clienteData.nombre || "",
            telefono: clienteData.telefono || "",
            direccion: formData.direccion,
            descripcion: formData.descripcion,
            estado: "PENDIENTE",
            creadoEn: serverTimestamp(),
            tecnicoUID: null
        });

        alert("✅ Solicitud creada correctamente.");
        nuevaSolicitudForm.reset();
    } catch (error) {
        console.error("Error creando solicitud:", error);
        alert("❌ Error al crear la solicitud");
    }
});

// Escuchar solicitudes del cliente en tiempo real
const escucharSolicitudes = () => {
    const q = collection(db, "solicitudes");
    onSnapshot(q, (snapshot) => {
        solicitudesContainer.innerHTML = "";

        snapshot.forEach(docSnap => {
            const sol = docSnap.data();
            if (sol.clienteUID !== clienteUID) return;

            const div = document.createElement("div");
            div.className = "p-4 mb-3 bg-white/10 rounded-xl shadow-md";
            div.innerHTML = `
                <p><strong>Dirección:</strong> ${sol.direccion}</p>
                <p><strong>Descripción:</strong> ${sol.descripcion}</p>
                <p><strong>Estado:</strong> ${sol.estado}</p>
                <p><strong>Técnico:</strong> ${sol.tecnicoUID || "Pendiente"}</p>
            `;

            // Notificación simple si fue aceptada
            if (sol.estado === "ACEPTADA") {
                div.classList.add("bg-green-600/30");
            } else if (sol.estado === "RECHAZADA") {
                div.classList.add("bg-red-600/30");
            }

            solicitudesContainer.appendChild(div);
        });

        if (solicitudesContainer.innerHTML === "") {
            solicitudesContainer.innerHTML = "<p class='text-slate-400 text-sm'>No tienes solicitudes activas</p>";
        }
    });
};
