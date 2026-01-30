import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDyplCp33LneGhqr6yd1VsIYBMdsLDK7gA",
    authDomain: "fixgo-44e4d.firebaseapp.com", // Cambiado a 44e4d
    projectId: "fixgo-44e4d",                 // Cambiado a 44e4d
    storageBucket: "fixgo-44e4d.appspot.com",   // Cambiado a 44e4d
    messagingSenderId: "54271811634",
    appId: "1:54271811634:web:53a6f4e1f727774e74e64f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cargarDatos() {
    console.log("🚀 Iniciando carga de datos final...");
    const tablaTec = document.getElementById('tablaTecnicos');
    const listaCli = document.getElementById('listaClientes');

    try {
        // Cargar Técnicos
        const queryTec = await getDocs(collection(db, "tecnicos"));
        console.log("✅ Técnicos en BD:", queryTec.size);
        tablaTec.innerHTML = "";
        
        if (queryTec.empty) {
            tablaTec.innerHTML = "<tr><td colspan='3' class='py-10 text-center text-slate-500'>No hay técnicos registrados aún.</td></tr>";
        } else {
            queryTec.forEach((doc) => {
                const t = doc.data();
                tablaTec.innerHTML += `
                    <tr class="border-b border-slate-700/50">
                        <td class="py-4 font-bold text-blue-400">${t.nombre || 'N/A'}</td>
                        <td class="py-4 text-slate-400 text-xs">${t.vehiculo || 'N/A'}</td>
                        <td class="py-4"><span class="bg-green-500/10 text-green-400 px-2 py-1 rounded-md text-[10px] font-black italic">ACTIVO</span></td>
                    </tr>`;
            });
        }

        // Cargar Clientes
        const queryCli = await getDocs(collection(db, "clientes"));
        console.log("✅ Clientes en BD:", queryCli.size);
        listaCli.innerHTML = "";
        
        if (queryCli.empty) {
            listaCli.innerHTML = "<p class='text-slate-500 text-sm p-4'>No hay clientes registrados.</p>";
        } else {
            queryCli.forEach((doc) => {
                const c = doc.data();
                listaCli.innerHTML += `
                    <div class="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 mb-3 shadow-sm">
                        <p class="font-bold text-indigo-300 text-sm">${c.nombre || 'Cliente'}</p>
                        <p class="text-xs text-slate-500">${c.telefono || ''} | ${c.direccion || ''}</p>
                    </div>`;
            });
        }
    } catch (e) {
        console.error("❌ Error al leer:", e);
    }
}

cargarDatos();
