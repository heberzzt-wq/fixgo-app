// app-admin.js
import { auth, signOut } from "./firebase-auth.js";
import { db } from "./firebase-config.js";
import { 
    doc, 
    getDoc, 
    collection, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 🔹 ALERT para confirmar que el archivo está vinculado
console.log("Sistema Admin Inicializado");

// --- 1. FUNCIÓN PARA CARGAR TÉCNICOS ---
async function cargarTecnicos() {
    const cont = document.getElementById("sectionTecnicos"); // Asegúrate que este ID exista en tu HTML
    if (!cont) return;

    try {
        const querySnapshot = await getDocs(collection(db, "tecnicos"));
        cont.innerHTML = ""; // Limpia el texto de carga

        if (querySnapshot.empty) {
            cont.innerHTML = `<p class="text-slate-500 italic">No hay técnicos registrados.</p>`;
            return;
        }

        querySnapshot.forEach((doc) => {
            const t = doc.data();
            // Creamos una tarjeta visual para cada técnico
            cont.innerHTML += `
                <div class="bg-slate-800/50 p-4 rounded-2xl border border-white/5 mb-3 flex justify-between items-center">
                    <div>
                        <h4 class="font-bold text-blue-400">${t.nombre || "Sin nombre"}</h4>
                        <p class="text-xs text-slate-400">${t.vehiculo || "No asignado"} | ${t.placas || "Sin placas"}</p>
                    </div>
                    <span class="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full border border-emerald-500/20">ACTIVO</span>
                </div>
            `;
        });
    } catch (e) {
        console.error("Error cargando técnicos:", e);
        cont.innerHTML = "Error al conectar con técnicos.";
    }
}

// --- 2. FUNCIÓN PARA CARGAR CLIENTES ---
async function cargarClientes() {
    const cont = document.getElementById("sectionClientes"); // Asegúrate que este ID exista en tu HTML
    if (!cont) return;

    try {
        const querySnapshot = await getDocs(collection(db, "clientes"));
        cont.innerHTML = ""; 

        if (querySnapshot.empty) {
            cont.innerHTML = `<p class="text-slate-500 italic">No hay clientes aún.</p>`;
            return;
        }

        querySnapshot.forEach((doc) => {
            const c = doc.data();
            cont.innerHTML += `
                <div class="bg-slate-800/50 p-4 rounded-2xl border border-white/5 mb-3 flex items-center gap-4">
                    <div class="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
                        <i class="fas fa-user text-slate-400 text-sm"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-white">${c.nombre || "Usuario"}</h4>
                        <p class="text-xs text-slate-500">${c.correo || "Sin correo"}</p>
                    </div>
                </div>
            `;
        });
    } catch (e) {
        console.error("Error cargando clientes:", e);
        cont.innerHTML = "Error al conectar con clientes.";
    }
}

// --- 3. VERIFICACIÓN DE SESIÓN ---
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists() && adminSnap.data().rol === "ADMIN") {
            const data = adminSnap.data();

            const elementoNombre = document.getElementById("nombreAdmin");
            if (elementoNombre) {
                elementoNombre.textContent = data.nombre || "Administrador";
            }

            // Llamamos a las funciones reales de carga
            await cargarTecnicos();
            await cargarClientes();

        } else {
            alert("❌ Acceso denegado: No eres Administrador.");
            await signOut(auth);
            window.location.href = "login.html";
        }
    } catch (error) {
        console.error("Error al verificar Admin:", error);
    }
});

// --- 4. BOTÓN SALIR ---
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "login.html";
    });
}
