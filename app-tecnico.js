// app-tecnico.js
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

const panel = document.getElementById("panelTecnico");
const cerrarBtn = document.getElementById("cerrarSesionTecnico");

let tecnicoUid = null;
let tecnicoNombre = null;

// ===== Verificar sesión y rol =====
onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    tecnicoUid = user.uid;

    try {
        const docRef = doc(db, "tecnicos", tecnicoUid);
        const docSnap = await (await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js")).getDoc(docRef);

        if (!docSnap.exists() || docSnap.data().rol !== "TECNICO") {
            alert("❌ Acceso denegado. No tienes permisos de técnico.");
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }

        tecnicoNombre = docSnap.data().nombre || "Técnico";
        document.getElementById("nombreTecnico").innerText = tecnicoNombre;
        document.getElementById("unidadTecnico").innerText = docSnap.data().vehiculo || "Sin unidad asignada";

        escucharSolicitudesPendientes();

    } catch (err) {
        console.error("Error verificando rol:", err);
        alert("❌ Error verificando permisos.");
        await signOut(auth);
        window.location.href = "login.html";
    }
});

// ===== Escuchar solicitudes pendientes =====
function escucharSolicitudesPendientes() {
    const q = query(collection(db, "solicitudes"), where("estado", "==", "PENDIENTE"));

    onSnapshot(q, snapshot => {
        const contenedor = document.getElementById("solicitudesPendientes");
        if (!contenedor) {
            const div = document.createElement("div");
            div.id = "solicitudesPendientes";
            div.className = "mt-6 space-y-4";
            panel.appendChild(div);
        } else {
            contenedor.innerHTML = "";
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const solicitudId = docSnap.id;

            const card = document.createElement("div");
            card.className = "bg-slate-800 p-4 rounded-xl shadow-md flex justify-between items-center";

            card.innerHTML = `
                <div>
                    <p class="font-bold">${data.nombre || "Cliente"}</p>
                    <p class="text-sm text-slate-400">${data.direccion || ""}</p>
                    <p class="text-xs text-slate-500">Tel: ${data.telefono || data.correo || ""}</p>
                </div>
                <button class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-xl text-white font-bold text-sm">
                    Tomar
                </button>
            `;

            const btn = card.querySelector("button");
            btn.addEventListener("click", async () => {
                try {
                    await updateDoc(doc(db, "solicitudes", solicitudId), {
                        estado: "EN SERVICIO",
                        tecnicoUid,
                        tecnicoNombre
                    });
                    alert("✅ Solicitud tomada correctamente.");
                } catch (err) {
                    alert("❌ Error al tomar la solicitud: " + err.message);
                }
            });

            contenedor.appendChild(card);
        });
    });
}

// ===== Cerrar sesión =====
cerrarBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "login.html";
});
