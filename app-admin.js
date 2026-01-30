import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDyplCp33LneGhqr6yd1VsIYBMdsLDK7gA",
    authDomain: "fixgo-bd.firebaseapp.com",
    projectId: "fixgo-bd",
    storageBucket: "fixgo-bd.appspot.com",
    messagingSenderId: "54271811634",
    appId: "1:54271811634:web:53a6f4e1f727774e74e64f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cargarDatos() {
    console.log("🚀 Iniciando carga de datos en Panel Admin...");
    
    const tablaTec = document.getElementById('tablaTecnicos');
    const listaCli = document.getElementById('listaClientes');

    try {
        // --- SECCIÓN TÉCNICOS ---
        const queryTec = await getDocs(collection(db, "tecnicos"));
        console.log("✅ Técnicos leídos:", queryTec.size);
        
        tablaTec.innerHTML = "";
        if (queryTec.empty) {
            tablaTec.innerHTML = "<tr><td colspan='3' class='py-4 text-center text-slate-500'>No hay técnicos registrados.</td></tr>";
        } else {
            queryTec.forEach((doc) => {
                const t = doc.data();
                tablaTec.innerHTML += `
                    <tr class="border-b border-slate-700/50">
                        <td class="py-4 font-bold text-blue-400">${t.nombre || 'Sin nombre'}</td>
                        <td class="py-4 text-slate-400 text-xs">${t.vehiculo || 'N/A'}</td>
                        <td class="py-4"><span class="bg-green-500/10 text-green-400 px-2 py-1 rounded-md text-[10px] font-black italic">ACTIVO</span></td>
                    </tr>`;
            });
        }

        // --- SECCIÓN CLIENTES ---
        const queryCli = await getDocs(collection(db, "clientes"));
        console.log("✅ Clientes leídos:", queryCli.size);
        
        listaCli.innerHTML = "";
        if (queryCli.empty) {
            listaCli.innerHTML = "<p class='text-slate-500 text-sm p-4'>No hay clientes registrados.</p>";
        } else {
            queryCli.forEach((doc) => {
                const c = doc.data();
                listaCli.innerHTML += `
                    <div class="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 mb-3 shadow-sm">
                        <p class="font-bold text-indigo-300 text-sm">${c.nombre || 'Anónimo'}</p>
                        <p class="text-xs text-slate-500">${c.telefono || 'Sin tel'} | ${c.direccion || 'Sin dir'}</p>
                    </div>`;
            });
        }

    } catch (e) {
        console.error("❌ ERROR CRÍTICO:", e.code, e.message);
        if (e.code === 'permission-denied') {
            alert("⚠️ Error de permisos: Revisa las REGLAS en la consola de Firebase.");
        }
    }
}

cargarDatos();
