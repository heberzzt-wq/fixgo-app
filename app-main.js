import { auth, db } from "./firebase-config.js";
import { 
    doc, 
    getDoc, 
    collection, 
    addDoc, 
    query, 
    where, 
    onSnapshot, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Referencias a la interfaz de tu index.html
const heroSection = document.getElementById("heroSection");
const solicitudContainer = document.getElementById("solicitudContainer");
const logoutBtn = document.getElementById("logoutBtn");
const nombreClienteDisp = document.getElementById("nombreCliente");
const nuevaSolicitudForm = document.getElementById("nuevaSolicitudForm");
const solicitudesLista = document.getElementById("solicitudesCliente");

// --- LOGICA DE ROLES Y VISTAS ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Usuario logueado:", user.uid);
        
        // 1. Verificamos si es un Técnico en Firestore
        const tecnicoDoc = await getDoc(doc(db, "tecnicos", user.uid));
        
        if (tecnicoDoc.exists()) {
            // SI ES TÉCNICO: Lo mandamos a su panel
            window.location.href = "area-tecnico.html";
        } else {
            // SI NO ES TÉCNICO: Asumimos que es cliente y mostramos el formulario
            mostrarPanelCliente(user);
        }
    } else {
        // NADIE LOGUEADO: Mostramos los 3 botones principales
        heroSection.classList.remove("hidden");
        solicitudContainer.classList.add("hidden");
        logoutBtn.classList.add("hidden");
    }
});

// --- FUNCIONES DEL CLIENTE ---
function mostrarPanelCliente(user) {
    heroSection.classList.add("hidden");
    solicitudContainer.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    
    // Mostramos nombre (si no tiene, usamos parte del correo)
    nombreClienteDisp.innerText = user.displayName || user.email.split('@')[0];

    // Cargar solicitudes del cliente en tiempo real
    const q = query(collection(db, "solicitudes"), where("clienteId", "==", user.uid));
    onSnapshot(q, (snapshot) => {
        solicitudesLista.innerHTML = "";
        if (snapshot.empty) {
            solicitudesLista.innerHTML = '<p class="text-slate-400 text-sm">No tienes solicitudes pendientes.</p>';
            return;
        }
        snapshot.forEach((doc) => {
            const data = doc.data();
            const div = document.createElement("div");
            div.className = "bg-white p-4 rounded-2xl border-l-4 border-indigo-500 shadow-sm";
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-slate-800">${data.direccion || 'Sin dirección'}</p>
                        <p class="text-xs text-slate-500">${data.descripcion || 'Sin descripción'}</p>
                    </div>
                    <span class="px-2 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black rounded-lg uppercase">${data.estado || 'PENDIENTE'}</span>
                </div>
            `;
            solicitudesLista.appendChild(div);
        });
    });
}

// --- ESCUCHAR EL FORMULARIO ---
if (nuevaSolicitudForm) {
    nuevaSolicitudForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;

        const formData = new FormData(nuevaSolicitudForm);

        try {
            await addDoc(collection(db, "solicitudes"), {
                clienteId: user.uid,
                clienteNombre: user.displayName || user.email,
                direccion: formData.get("direccion"),
                descripcion: formData.get("descripcion"),
                estado: "PENDIENTE",
                fechaCreacion: serverTimestamp()
            });
            alert("Solicitud enviada correctamente.");
            nuevaSolicitudForm.reset();
        } catch (error) {
            console.error("Error al enviar:", error);
            alert("Error al enviar solicitud.");
        }
    });
}

// --- CERRAR SESIÓN ---
logoutBtn.addEventListener("click", () => signOut(auth));
