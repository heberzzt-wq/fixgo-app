// app-tecnico.js
import { 
    auth, db, onAuthStateChanged, signOut, doc, getDoc, setDoc, 
    updateDoc, collection, query, where, onSnapshot, serverTimestamp 
} from "./firebase.js";

const getEl = (id) => document.getElementById(id);
let watchId = null;

// --- 1. MONITOR DE SESIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const tecRef = doc(db, "tecnicos", user.uid);
        const tecSnap = await getDoc(tecRef);
        if (tecSnap.exists()) {
            actualizarVistaTecnico(tecSnap.data());
        } else {
            await registrarTecnicoPredeterminado(tecRef);
        }
        escucharSolicitudesDisponibles();
        escucharMiServicioActivo(user.uid);
    } else {
        window.location.href = "login.html";
    }
});

function actualizarVistaTecnico(data) {
    if (getEl("nombreTecnico")) getEl("nombreTecnico").innerText = data.nombre || "Técnico FixGo";
    if (getEl("infoVehiculo")) getEl("infoVehiculo").innerText = `${data.vehiculo || 'Sin Vehículo'} | ${data.placas || 'S/N'}`;
}

async function registrarTecnicoPredeterminado(tecRef) {
    await setDoc(tecRef, {
        nombre: "Nuevo Técnico",
        estado: "DISPONIBLE",
        vehiculo: "Por definir",
        placas: "000000"
    });
}

// --- 2. ESCUCHA DE SOLICITUDES (Corregido) ---
function escucharSolicitudesDisponibles() {
    const list = getEl("listaServicios");
    if (!list) return;

    // LUPA: Quitamos el orderBy temporalmente para descartar error de índices en Firebase
    const q = query(
        collection(db, "solicitudes"), 
        where("estado", "==", "SOLICITADO")
    );

    onSnapshot(q, (snapshot) => {
        list.innerHTML = snapshot.empty ? '<div class="text-center py-10 text-slate-600 text-sm italic">Buscando solicitudes...</div>' : '';
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement("div");
            card.className = "uber-card p-6 rounded-[2rem] mb-4 border border-white/5";
            card.innerHTML = `
                <div class="mb-4">
                    <span class="status-badge text-[9px] font-black px-2 py-1 rounded-full uppercase">${data.categoria || 'GENERAL'}</span>
                    <p class="text-lg font-bold text-white mt-2">${data.direccion}</p>
                </div>
                <button onclick="aceptarServicio('${docSnap.id}')" class="w-full bg-indigo-600 text-white font-black py-4 rounded-xl text-xs uppercase">
                    Aceptar Servicio
                </button>
            `;
            list.appendChild(card);
        });
    }, (error) => console.error("Error en solicitudes:", error));
}

window.aceptarServicio = async (id) => {
    const user = auth.currentUser;
    try {
        await updateDoc(doc(db, "solicitudes", id), {
            estado: "EN_CAMINO",
            tecnicoId: user.uid,
            fechaAceptado: serverTimestamp()
        });
        await updateDoc(doc(db, "tecnicos", user.uid), { 
            estado: "EN SERVICIO",
            servicioActualId: id 
        });
        alert("¡Servicio aceptado!");
    } catch (e) {
        console.error(e);
    }
};

// ... (El resto de tus funciones de GPS y Panel de Control se mantienen igual)
