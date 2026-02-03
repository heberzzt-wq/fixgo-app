import { 
    auth, db, onAuthStateChanged, signOut,
    collection, onSnapshot, query, orderBy, 
    doc, getDoc, deleteDoc 
} from "./firebase.js";

const getEl = (id) => document.getElementById(id);

// --- 1. VERIFICACIÓN DE SEGURIDAD ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Verificamos si realmente es un admin en Firestore
        const adminDoc = await getDoc(doc(db, "admins", user.uid));
        if (adminDoc.exists()) {
            getEl("nombreAdmin").innerText = `Bienvenido, ${adminDoc.data().nombre || 'Admin'}`;
            inicializarDashboard();
        } else {
            alert("Acceso denegado: No tienes permisos de administrador.");
            window.location.href = "login.html";
        }
    } else {
        window.location.href = "login.html";
    }
});

// --- 2. INICIALIZADOR DE VIGILANCIA EN TIEMPO REAL ---
function inicializarDashboard() {
    escucharTecnicos();
    escucharClientes();
    escucharServicios();
}

// --- 3. VIGILAR TÉCNICOS (UNIDADES EN CAMPO) ---
function escucharTecnicos() {
    const contenedor = getEl("sectionTecnicos");
    const q = query(collection(db, "tecnicos"), orderBy("online", "desc"));

    onSnapshot(q, (snapshot) => {
        contenedor.innerHTML = "";
        if (snapshot.empty) {
            contenedor.innerHTML = '<p class="text-slate-400 text-xs">No hay técnicos registrados.</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const card = document.createElement("div");
            card.className = "flex items-center justify-between p-4 mb-3 rounded-2xl bg-slate-50 border border-slate-100";
            card.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-2 h-2 rounded-full ${t.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}"></div>
                    <div>
                        <p class="font-bold text-slate-800 text-sm">${t.nombre}</p>
                        <p class="text-[10px] text-slate-500 uppercase">${t.vehiculo} | ${t.placas}</p>
                    </div>
                </div>
                <span class="text-[9px] font-black px-2 py-1 rounded bg-white border border-slate-200">${t.estado || 'S/E'}</span>
            `;
            contenedor.appendChild(card);
        });
    });
}

// --- 4. VIGILAR CLIENTES ---
function escucharClientes() {
    const contenedor = getEl("sectionClientes");
    const q = query(collection(db, "clientes"), orderBy("fechaRegistro", "desc"));

    onSnapshot(q, (snapshot) => {
        contenedor.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const c = docSnap.data();
            const item = document.createElement("div");
            item.className = "flex items-center gap-3 p-3 border-b border-slate-50";
            item.innerHTML = `
                <div class="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold">
                    ${c.nombre.charAt(0)}
                </div>
                <div>
                    <p class="text-xs font-bold text-slate-700">${c.nombre}</p>
                    <p class="text-[9px] text-slate-400">${c.email}</p>
                </div>
            `;
            contenedor.appendChild(item);
        });
    });
}

// --- 5. VIGILAR ÓRDENES (SERVICIOS) ---
function escucharServicios() {
    const contenedor = getEl("sectionServicios");
    const q = query(collection(db, "solicitudes"), orderBy("fechaCreacion", "desc"));

    onSnapshot(q, (snapshot) => {
        contenedor.innerHTML = "";
        if (snapshot.empty) {
            contenedor.innerHTML = '<p class="text-slate-400 text-xs text-center">Sin órdenes activas.</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const s = docSnap.data();
            const statusColor = s.estado === 'PENDIENTE' ? 'text-orange-500' : 'text-blue-500';
            const card = document.createElement("div");
            card.className = "p-4 mb-3 rounded-2xl border-2 border-slate-50 bg-white shadow-sm";
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <p class="text-[10px] font-black ${statusColor}">${s.estado}</p>
                    <button onclick="borrarOrden('${docSnap.id}')" class="text-slate-300 hover:text-red-500"><i class="fas fa-trash"></i></button>
                </div>
                <p class="text-xs font-bold">${s.direccion}</p>
                <p class="text-[9px] text-slate-500 mt-1">Cliente ID: ${s.clienteId.slice(0,8)}...</p>
            `;
            contenedor.appendChild(card);
        });
    });
}

// --- 6. ACCIONES GLOBALES ---
getEl("btnLogout").onclick = () => signOut(auth).then(() => window.location.href = "login.html");

window.borrarOrden = async (id) => {
    if(confirm("¿Eliminar esta orden del sistema?")) {
        await deleteDoc(doc(db, "solicitudes", id));
    }
};
