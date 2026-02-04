import { auth, db } from "./firebase.js";
import { 
    collection, 
    addDoc, 
    serverTimestamp, 
    query, 
    where, 
    onSnapshot, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "./firebase.js";

// 1. Referencias al DOM
const solicitudForm = document.getElementById("nuevaSolicitudForm");
const listaServicios = document.getElementById("solicitudesCliente");
const nombreClienteHeader = document.getElementById("nombreCliente");
const inputCategoria = document.getElementById("categoriaSeleccionada");

// 2. Manejo del Formulario de Solicitud
if (solicitudForm) {
    solicitudForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const user = auth.currentUser;
        if (!user) {
            alert("⚠️ Debes iniciar sesión para solicitar un servicio.");
            return;
        }

        // Validar que haya seleccionado una categoría en la cuadrícula
        if (!inputCategoria.value) {
            alert("⚠️ Por favor, selecciona una categoría (Eléctrico, Aire AC, etc.)");
            return;
        }

        const formData = new FormData(solicitudForm);
        const direccion = formData.get("direccion");
        const descripcion = formData.get("descripcion");
        const categoria = inputCategoria.value;

        try {
            // CREAR SOLICITUD CON LOS NUEVOS ESTADOS Y CATEGORÍA
            await addDoc(collection(db, "solicitudes"), {
                clienteId: user.uid,
                clienteNombre: user.displayName || "Cliente",
                categoria: categoria, // <-- Nueva data de la cuadrícula
                direccion: direccion,
                descripcion: descripcion,
                estado: "SOLICITADO", // Iniciamos con el primer estado oficial
                fechaCreacion: serverTimestamp(), 
                tecnicoId: null,
                pagoEstado: "PENDIENTE"
            });

            alert(`🚀 Solicitud de ${categoria} enviada con éxito.`);
            solicitudForm.reset();
            
            // Limpiar selección visual de las tarjetas
            document.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
            inputCategoria.value = "";
            document.getElementById('btnLabel').textContent = "Servicio";

        } catch (error) {
            console.error("Error al crear solicitud:", error);
            alert("❌ Error al enviar la solicitud.");
        }
    });
}

// 3. Cargar Historial Personal del Cliente (Tiempo Real)
function cargarMisServicios(uid) {
    if (!listaServicios) return;

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
            
            // Lógica de colores por estado pulida
            let estadoClase = "text-slate-400";
            if (data.estado === 'SOLICITADO') estadoClase = "text-amber-500";
            if (data.estado === 'EN_CAMINO') estadoClase = "text-indigo-400 animate-pulse";
            if (data.estado === 'FINALIZADO') estadoClase = "text-emerald-500";

            const card = document.createElement("div");
            card.className = "uber-card p-5 rounded-[2rem] border border-white/5 animate-fade mb-4";
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="bg-indigo-500/10 text-indigo-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                                ${data.categoria || 'General'}
                            </span>
                            <span class="text-slate-600 text-[10px]">${data.fechaCreacion ? new Date(data.fechaCreacion.seconds*1000).toLocaleDateString() : ''}</span>
                        </div>
                        <p class="text-white font-bold text-sm leading-tight mb-1">${data.direccion}</p>
                        <p class="text-slate-500 text-xs italic">${data.descripcion}</p>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] font-black uppercase tracking-widest ${estadoClase}">
                            ${data.estado}
                        </span>
                    </div>
                </div>
            `;
            listaServicios.appendChild(card);
        });
    });
}

// 4. Observador de sesión
onAuthStateChanged(auth, (user) => {
    if (user) {
        if (nombreClienteHeader) {
            // Mostrar primer nombre en mayúsculas para estilo Uber
            const nombre = user.displayName ? user.displayName.split(' ')[0].toUpperCase() : "CLIENTE";
            nombreClienteHeader.innerText = nombre;
        }
        cargarMisServicios(user.uid);
    }
});
