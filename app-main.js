import { auth, db } from "./firebase-auth.js";
import { 
    collection, 
    addDoc, 
    serverTimestamp, 
    query, 
    where, 
    onSnapshot, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. Referencias a los elementos del DOM (IDs de tu index.html)
const solicitudForm = document.getElementById("nuevaSolicitudForm");
const listaServicios = document.getElementById("solicitudesCliente");
const nombreClienteHeader = document.getElementById("nombreCliente");

// 2. Manejo del Formulario de Solicitud
if (solicitudForm) {
    solicitudForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const user = auth.currentUser;
        if (!user) {
            alert("⚠️ Debes iniciar sesión para solicitar un servicio.");
            return;
        }

        // Obtener datos de los inputs (usando el atributo 'name')
        const formData = new FormData(solicitudForm);
        const direccion = formData.get("direccion");
        const descripcion = formData.get("descripcion");

        try {
            // CREAR SOLICITUD (Sincronizado con app-admin.js)
            await addDoc(collection(db, "solicitudes"), {
                clienteId: user.uid,
                clienteNombre: user.displayName || "Cliente",
                direccion: direccion,
                descripcion: descripcion,
                estado: "PENDIENTE",
                fechaCreacion: serverTimestamp(), 
                tecnicoId: null
            });

            alert("🚀 ¡Solicitud enviada con éxito!");
            solicitudForm.reset();

        } catch (error) {
            console.error("Error al crear solicitud:", error);
            alert("❌ Error al enviar la solicitud.");
        }
    });
}

// 3. Cargar Historial Personal del Cliente
function cargarMisServicios(uid) {
    if (!listaServicios) return;

    // Consulta filtrada por el UID del cliente logueado
    const q = query(
        collection(db, "solicitudes"),
        where("clienteId", "==", uid),
        orderBy("fechaCreacion", "desc")
    );

    onSnapshot(q, (snapshot) => {
        listaServicios.innerHTML = "";

        if (snapshot.empty) {
            listaServicios.innerHTML = `<p class="text-slate-600 text-sm italic">No tienes servicios recientes.</p>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const estadoColor = data.estado === 'PENDIENTE' ? 'text-orange-400' : 'text-emerald-400';

            const card = document.createElement("div");
            card.className = "uber-card p-4 rounded-2xl border border-white/5 animate-fade mb-3";
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-white font-bold text-sm">${data.direccion}</p>
                        <p class="text-slate-400 text-xs">${data.descripcion}</p>
                    </div>
                    <span class="text-[10px] font-black uppercase ${estadoColor}">${data.estado}</span>
                </div>
            `;
            listaServicios.appendChild(card);
        });
    });
}

// 4. Observador de estado de sesión
import { onAuthStateChanged } from "./firebase-auth.js";

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (nombreClienteHeader) nombreClienteHeader.innerText = user.displayName || "Usuario";
        cargarMisServicios(user.uid);
    }
});
