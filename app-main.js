// app-main.js
import { 
    auth, 
    db, 
    signOut, 
    onAuthStateChanged 
} from "./firebase-auth.js";

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

// Referencias a la interfaz
const heroSection = document.getElementById("heroSection");
const solicitudContainer = document.getElementById("solicitudContainer");
const logoutBtn = document.getElementById("logoutBtn");
const nombreClienteDisp = document.getElementById("nombreCliente");
const nuevaSolicitudForm = document.getElementById("nuevaSolicitudForm");
const solicitudesLista = document.getElementById("solicitudesCliente");

// --- LÓGICA DE CONTROL DE ACCESO ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. Verificamos si es un Técnico
        const tecnicoDoc = await getDoc(doc(db, "tecnicos", user.uid));
        
        if (tecnicoDoc.exists()) {
            window.location.href = "area-tecnico.html";
        } else {
            // Si no es técnico, cargamos la interfaz de cliente
            mostrarPanelCliente(user);
        }
    } else {
        // Limpieza visual si no hay usuario
        heroSection?.classList.remove("hidden");
        solicitudContainer?.classList.add("hidden");
        logoutBtn?.classList.add("hidden");
    }
});

// --- FUNCIONES DEL CLIENTE ---
function mostrarPanelCliente(user) {
    heroSection?.classList.add("hidden");
    solicitudContainer?.classList.remove("hidden");
    logoutBtn?.classList.remove("hidden");
    
    // Nombre amigable
    if (nombreClienteDisp) {
        nombreClienteDisp.innerText = user.displayName || user.email.split('@')[0];
    }

    // Escuchar solicitudes en tiempo real
    const q = query(collection(db, "solicitudes"), where("clienteId", "==", user.uid));
    
    onSnapshot(q, (snapshot) => {
        if (!solicitudesLista) return;
        
        solicitudesLista.innerHTML = "";
        
        if (snapshot.empty) {
            solicitudesLista.innerHTML = '<p class="text-slate-500 text-sm italic">No tienes servicios registrados.</p>';
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            const div = document.createElement("div");
            // Estilo Uber-Dark para las tarjetas
            div.className = "uber-card p-5 rounded-3xl border border-white/5 flex justify-between items-center animate-fade";
            div.innerHTML = `
                <div>
                    <p class="text-white font-bold text-sm">${data.direccion || 'Sin dirección'}</p>
                    <p class="text-[10px] text-slate-500 uppercase tracking-widest mt-1">${data.descripcion || 'Sin detalles'}</p>
                </div>
                <div class="text-right">
                    <span class="px-3 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-black rounded-full border border-indigo-500/20 uppercase">
                        ${data.estado || 'PENDIENTE'}
                    </span>
                </div>
            `;
            solicitudesLista.appendChild(div);
        });
    });
}

// --- ENVÍO DE SOLICITUD ---
if (nuevaSolicitudForm) {
    nuevaSolicitudForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;

        const btn = nuevaSolicitudForm.querySelector('button');
        const originalText = btn.innerText;
        
        // Feedback visual
        btn.innerText = "ENVIANDO...";
        btn.disabled = true;

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
            
            nuevaSolicitudForm.reset();
            alert("¡Solicitud recibida! Un técnico se pondrá en contacto.");
        } catch (error) {
            console.error("Error Firestore:", error);
            alert("Error al conectar con el servidor.");
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });
}

// --- LOGOUT ---
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        try {
            await signOut(auth);
            window.location.href = "login.html";
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    });
}
