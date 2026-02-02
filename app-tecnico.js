import { auth, db } from "./firebase-auth.js";
import { 
    doc, updateDoc, setDoc, collection, query, where, 
    onSnapshot, orderBy, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "./firebase-auth.js";

const nombreTecnicoEl = document.getElementById("nombreTecnico");
const statusIndicator = document.getElementById("statusIndicator");
const solicitudesList = document.getElementById("solicitudesList");
const btnDisponible = document.getElementById("btnDisponible");
const btnServicio = document.getElementById("btnServicio");

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const tecRef = doc(db, "tecnicos", user.uid);
        const tecSnap = await getDoc(tecRef);
        
        if (tecSnap.exists()) {
            const data = tecSnap.data();
            if (nombreTecnicoEl) nombreTecnicoEl.innerText = data.nombre || "Jonathan Catana";
            actualizarInterfazEstado(data.estado);
        } else {
            await setDoc(tecRef, {
                nombre: user.displayName || "Jonathan Catana",
                estado: "DISPONIBLE",
                vehiculo: "Thida",
                placas: "123456"
            });
            actualizarInterfazEstado("DISPONIBLE");
        }
        escucharSolicitudes();
    } else {
        window.location.href = "login.html";
    }
});

async function cambiarEstado(nuevoEstado) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        await updateDoc(doc(db, "tecnicos", user.uid), { estado: nuevoEstado });
        actualizarInterfazEstado(nuevoEstado);
    } catch (error) { console.error("Error:", error); }
}

function actualizarInterfazEstado(estado) {
    // Solo intentamos cambiar la clase si el elemento existe en el HTML
    if (statusIndicator) {
        if (estado === "DISPONIBLE") {
            statusIndicator.className = "w-20 h-20 bg-emerald-500 rounded-full mx-auto flex items-center justify-center text-3xl shadow-lg animate-pulse";
            statusIndicator.innerHTML = '<i class="fas fa-check"></i>';
        } else {
            statusIndicator.className = "w-20 h-20 bg-orange-500 rounded-full mx-auto flex items-center justify-center text-3xl shadow-lg";
            statusIndicator.innerHTML = '<i class="fas fa-tools"></i>';
        }
    }
}

if(btnDisponible) btnDisponible.onclick = () => cambiarEstado("DISPONIBLE");
if(btnServicio) btnServicio.onclick = () => cambiarEstado("EN SERVICIO");

function escucharSolicitudes() {
    const q = query(collection(db, "solicitudes"), where("estado", "==", "PENDIENTE"), orderBy("fechaCreacion", "desc"));
    onSnapshot(q, (snapshot) => {
        if (!solicitudesList) return;
        solicitudesList.innerHTML = "";
        
        if (snapshot.empty) {
            solicitudesList.innerHTML = '<p class="text-slate-600 text-center text-xs italic">Buscando servicios cerca...</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "uber-card p-5 rounded-[1.5rem] border border-white/5 mb-3 animate-fade";
            card.innerHTML = `
                <p class="text-[10px] font-black text-indigo-400 uppercase mb-1">${data.clienteNombre || 'Cliente'}</p>
                <p class="text-sm font-bold text-white mb-1">${data.direccion}</p>
                <button onclick="aceptarServicio('${docSnap.id}')" class="w-full bg-white text-black font-black py-3 rounded-xl mt-3 text-xs uppercase">Aceptar</button>
            `;
            solicitudesList.appendChild(card);
        });
    });
}

window.aceptarServicio = async (id) => {
    try {
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "EN CAMINO",
            tecnicoId: auth.currentUser.uid
        });
        cambiarEstado("EN SERVICIO");
    } catch (e) { console.error(e); }
};
