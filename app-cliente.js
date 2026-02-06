import { auth, db, onAuthStateChanged } from "./firebase.js";
import { 
    collection, addDoc, serverTimestamp, query, where, orderBy, limit, onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- REFERENCIAS ---
const formSolicitud = document.getElementById("nuevaSolicitudForm");
const listaHistorial = document.getElementById("solicitudesCliente");

// --- 1. CREAR SOLICITUD ---
if (formSolicitud) {
    formSolicitud.addEventListener("submit", async (e) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return alert("Inicia sesión primero");

        const catInput = document.getElementById("categoriaSeleccionada");
        const categoria = catInput ? catInput.value : "GENERAL";
        
        const formData = new FormData(formSolicitud);

        try {
            await addDoc(collection(db, "solicitudes"), {
                clienteId: user.uid,
                clienteNombre: user.displayName || "Cliente",
                clienteTelefono: "Sin registro", // Idealmente sacarlo del perfil
                direccion: formData.get("direccion"),
                descripcion: formData.get("descripcion"),
                categoria: categoria,
                estado: "SOLICITADO",
                fechaCreacion: serverTimestamp(),
                tecnicoId: null,
                lat: null, lng: null // Pendiente: Geocoding Google Maps
            });

            alert("🚀 Solicitud enviada. Buscando técnicos...");
            formSolicitud.reset();
            if(catInput) catInput.value = "";
            // Reset visual si usas grid de tarjetas
            document.querySelectorAll('.service-card').forEach(c => c.classList.remove('ring-2', 'ring-indigo-500'));

        } catch (error) {
            console.error(error);
            alert("Error al solicitar.");
        }
    });
}

// --- 2. MONITOR DE SERVICIOS ACTIVOS ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Escuchar historial y estado
        const q = query(
            collection(db, "solicitudes"),
            where("clienteId", "==", user.uid),
            orderBy("fechaCreacion", "desc")
        );

        onSnapshot(q, (snapshot) => {
            if (!listaHistorial) return;
            listaHistorial.innerHTML = "";
            
            // Verificar si hay uno activo para mostrar en Panel Principal (Dashboard)
            const activo = snapshot.docs.find(d => ['SOLICITADO', 'EN_CAMINO', 'EN_SITIO'].includes(d.data().estado));
            if(activo) actualizarDashboardCliente(activo.data());

            // Llenar Historial
            snapshot.forEach(doc => {
                const data = doc.data();
                const color = data.estado === 'FINALIZADO' ? 'text-emerald-500' : 'text-indigo-500';
                
                listaHistorial.innerHTML += `
                    <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm mb-3">
                        <div class="flex justify-between mb-2">
                            <span class="text-[10px] font-black bg-slate-100 px-2 py-1 rounded text-slate-600">${data.categoria}</span>
                            <span class="text-[10px] font-bold ${color}">${data.estado}</span>
                        </div>
                        <p class="text-xs text-slate-800 font-bold">${data.direccion}</p>
                        <p class="text-[10px] text-slate-400 mt-1">${new Date(data.fechaCreacion?.seconds * 1000).toLocaleDateString()}</p>
                    </div>
                `;
            });
        });
    }
});

function actualizarDashboardCliente(solicitud) {
    // Aquí puedes actualizar el div principal del cliente para mostrar que tiene un técnico en camino
    // Ejemplo: ocultar formulario, mostrar mapa
    const panelStatus = document.getElementById("panelStatusActivo"); // Asegúrate de tener este ID en HTML
    if(panelStatus) {
        panelStatus.innerHTML = `
            <div class="bg-indigo-600 text-white p-4 rounded-xl shadow-lg animate-fade">
                <p class="text-xs opacity-75 uppercase tracking-widest mb-1">Estado del Servicio</p>
                <h2 class="text-2xl font-black mb-2">${solicitud.estado.replace('_', ' ')}</h2>
                <p class="text-sm">Tu técnico está procesando la orden.</p>
            </div>
        `;
    }
}
