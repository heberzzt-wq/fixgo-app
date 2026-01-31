// app-tecnico.js
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

const panel = document.getElementById("panelTecnico");

// Variables de estado
let tecnicoUid = null;
let tecnicoData = null;

// ===== MONITOREAR AUTENTICACIÓN =====
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    tecnicoUid = user.uid;

    // Traer datos del técnico
    const tecnicoRef = doc(db, "tecnicos", tecnicoUid);
    const tecnicoSnap = await tecnicoRef.get ? await tecnicoRef.get() : null;

    // Mostrar info del técnico
    tecnicoData = tecnicoSnap?.data() || {};
    document.getElementById("nombreTecnico").innerText = tecnicoData.nombre || "Técnico";
    document.getElementById("unidadTecnico").innerText = tecnicoData.vehiculo || "Sin unidad asignada";

    // Monitorear solicitudes pendientes
    initSolicitudes();
});

// ===== FUNCIONES DE ESTADO =====
window.cambiarEstado = async (estado) => {
    if (!tecnicoUid) return;
    try {
        const tecnicoRef = doc(db, "tecnicos", tecnicoUid);
        await updateDoc(tecnicoRef, { estado });
        alert(`✅ Estado cambiado a ${estado}`);
    } catch (error) {
        console.error("Error cambiando estado:", error);
    }
};

// ===== MONITOREAR SOLICITUDES PENDIENTES =====
const initSolicitudes = () => {
    const solicitudesRef = collection(db, "solicitudes");
    const q = query(solicitudesRef, where("estado", "==", "PENDIENTE"));

    onSnapshot(q, (snapshot) => {
        renderSolicitudes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
};

// ===== RENDERIZAR SOLICITUDES =====
const renderSolicitudes = (solicitudes) => {
    let container = document.getElementById("solicitudesContainer");

    // Crear contenedor si no existe
    if (!container) {
        container = document.createElement("div");
        container.id = "solicitudesContainer";
        container.className = "mt-6 grid gap-4";
        panel.appendChild(container);
    }

    container.innerHTML = ""; // Limpiar

    if (solicitudes.length === 0) {
        container.innerHTML = `<p class="text-slate-400 text-sm text-center">No hay solicitudes pendientes.</p>`;
        return;
    }

    solicitudes.forEach((sol) => {
        const card = document.createElement("div");
        card.className = "bg-slate-800/60 border border-white/10 p-4 rounded-2xl flex justify-between items-center";

        card.innerHTML = `
            <div>
                <p class="font-bold text-white">${sol.nombre || "Cliente"}</p>
                <p class="text-slate-300 text-sm">${sol.direccion || "Sin dirección"}</p>
                <p class="text-slate-300 text-sm">${sol.descripcion || ""}</p>
            </div>
            <button class="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded-xl text-sm">
                Aceptar
            </button>
        `;

        // Evento aceptar solicitud
        card.querySelector("button").addEventListener("click", () => aceptarSolicitud(sol.id));
        container.appendChild(card);
    });
};

// ===== ACEPTAR SOLICITUD =====
const aceptarSolicitud = async (solId) => {
    if (!tecnicoUid) return;

    try {
        const solRef = doc(db, "solicitudes", solId);
        await updateDoc(solRef, {
            estado: "EN PROCESO",
            tecnicoAsignado: tecnicoUid,
            aceptadoEn: new Date().toISOString()
        });

        // Cambiar estado técnico automáticamente a "EN SERVICIO"
        const tecnicoRef = doc(db, "tecnicos", tecnicoUid);
        await updateDoc(tecnicoRef, { estado: "EN SERVICIO" });

        alert("✅ Solicitud aceptada!");
    } catch (error) {
        console.error("Error aceptando solicitud:", error);
        alert("❌ No se pudo aceptar la solicitud.");
    }
};
