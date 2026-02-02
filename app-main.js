// app-admin.js
import { auth, db } from "./firebase-auth.js";
import { 
    collection, 
    query, 
    onSnapshot, 
    orderBy,
    doc,
    deleteDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const listaGlobal = document.getElementById("listaGlobalSolicitudes");
const statsTotal = document.getElementById("statsTotal");

// 1. Escuchar TODAS las solicitudes del sistema
function cargarPanelAdmin() {
    const q = query(collection(db, "solicitudes"), orderBy("fechaCreacion", "desc"));

    onSnapshot(q, (snapshot) => {
        if (!listaGlobal) return;
        listaGlobal.innerHTML = "";
        
        // Actualizar contador rápido
        if (statsTotal) statsTotal.innerText = snapshot.size;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const div = document.createElement("div");
            
            // Colores por estado
            const colorEstado = {
                'PENDIENTE': 'text-orange-400 bg-orange-400/10',
                'EN CAMINO': 'text-emerald-400 bg-emerald-400/10',
                'FINALIZADO': 'text-slate-500 bg-slate-500/10'
            }[data.estado] || 'text-white bg-white/10';

            div.className = "uber-card p-4 rounded-2xl border border-white/5 flex flex-col gap-3 mb-3 animate-fade";
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-xs font-black text-indigo-400 uppercase tracking-widest">${data.clienteNombre || 'Usuario'}</p>
                        <p class="text-sm font-bold text-white">${data.direccion || 'Sin dirección'}</p>
                    </div>
                    <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase ${colorEstado}">
                        ${data.estado}
                    </span>
                </div>
                
                <div class="flex justify-between items-center pt-2 border-t border-white/5">
                    <p class="text-[10px] text-slate-500 font-mono">ID: ${id.slice(-6)}</p>
                    <div class="flex gap-2">
                        <button onclick="eliminarSolicitud('${id}')" class="text-red-500 hover:text-red-400 p-2 text-xs">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            listaGlobal.appendChild(div);
        });
    });
}

// 2. Función para eliminar (Control de Admin)
window.eliminarSolicitud = async (id) => {
    if (confirm("¿Seguro que deseas eliminar este registro permanentemente?")) {
        try {
            await deleteDoc(doc(db, "solicitudes", id));
            alert("Registro eliminado.");
        } catch (error) {
            console.error("Error al eliminar:", error);
        }
    }
};

// Ejecutar al cargar
cargarPanelAdmin();
