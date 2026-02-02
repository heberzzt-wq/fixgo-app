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
            // SI ES TÉCNICO: Redirigir a su panel
            window.location.href = "area-tecnico.html";
        } else {
            // SI ES CLIENTE: Cargar panel de solicitudes
            mostrarPanelCliente(user);
        }
    } else {
        // SIN SESIÓN: Mostrar Hero y ocultar herramientas
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
    
    // Mostrar nombre del usuario
    if (nombreClienteDisp) {
        nombreClienteDisp.innerText = user.displayName || user.email.split('@')[0];
    }

    // Escuchar solicitudes del cliente en tiempo real
    const q = query(collection(db, "solicitudes"), where("clienteId", "==", user.uid));
    
    onSnapshot(q, (snapshot) => {
        if (!solicitudesLista) return;
        
        solicitudesLista.innerHTML = "";
        
        if (snapshot.empty) {
            solicitudesLista.innerHTML = `
                <div class="text-center py-10">
                    <p class="text-slate-600 text-sm italic">No tienes servicios registrados actualmente.</p>
                </div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const div = document.createElement("div");
            
            // Lógica de botón de rastreo: Solo aparece si el técnico ya aceptó (Estado EN CAMINO o EN SERVICIO)
            const mostrarRastreo = (data.estado === "EN CAMINO" || data.estado === "EN SERVICIO");
            const botonRastreo = mostrarRastreo ? 
                `<button onclick="window.location.href='rastreo.html?id=${id}'" class="mt-3 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black px-4 py-2 rounded-xl transition-all uppercase tracking-widest shadow-lg shadow-indigo-500/20">
                    <i class="fas fa-location-dot mr-1"></i> Rastrear Técnico
                </button>` : '';

            // Definir color del Badge según estado
            let badgeClass = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
            if (data.estado === "EN CAMINO") badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
            if (data.estado === "FINALIZADO") badgeClass = "bg-slate-700/50 text-slate-400 border-white/5";

            div.className = "uber-card p-6 rounded-[2rem] border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fade mb-4";
            div.innerHTML = `
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <p class="text-white font-black text-base italic uppercase tracking-tighter">${data.direccion || 'Sin dirección'}</p>
                    </div>
                    <p class="text-xs text-slate-500 font-medium mb-2">${data.descripcion || 'Sin detalles proporcionados'}</p>
                    ${botonRastreo}
                </div>
                <div class="flex flex-col items-end gap-2">
                    <span class="px-4 py-1.5 ${badgeClass} text-[10px] font-black rounded-full border uppercase tracking-widest">
                        ${data.estado || 'PENDIENTE'}
                    </span>
                    <p class="text-[9px] text-slate-700 font-bold uppercase tracking-tighter">ID: ${id.slice(-6)}</p>
                </div>
            `;
            solicitudesLista.appendChild(div);
        });
    });
}

// --- ENVÍO DE NUEVA SOLICITUD ---
if (nuevaSolicitudForm) {
    nuevaSolicitudForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;

        const btn = nuevaSolicitudForm.querySelector('button');
        const originalText = btn.innerText;
        
        // Bloquear botón y dar feedback
        btn.innerText = "PROCESANDO...";
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
            alert("✅ Solicitud enviada. Buscando técnicos disponibles cerca de ti.");
        } catch (error) {
            console.error("Error Firestore:", error);
            alert("❌ Hubo un error al conectar con FixGo. Revisa tu conexión.");
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });
}

// --- CERRAR SESIÓN ---
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        if(confirm("¿Deseas cerrar tu sesión en FixGo?")) {
            try {
                await signOut(auth);
                window.location.href = "login.html";
            } catch (error) {
                console.error("Error al salir:", error);
            }
        }
    });
}
