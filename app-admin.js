import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

console.log("🛠️ Intentando conectar con la base de datos...");

async function cargarDatos() {
    const tablaTec = document.getElementById('tablaTecnicos');
    const listaCli = document.getElementById('listaClientes');

    try {
        // LEER TÉCNICOS
        console.log("Consultando técnicos...");
        const queryTec = await getDocs(collection(db, "tecnicos"));
        
        if (queryTec.empty) {
            tablaTec.innerHTML = "<tr><td colspan='3' class='py-4 text-center text-slate-500'>No hay técnicos registrados aún.</td></tr>";
        } else {
            tablaTec.innerHTML = "";
            queryTec.forEach((doc) => {
                const t = doc.data();
                tablaTec.innerHTML += `
                    <tr class="border-b border-slate-700/50">
                        <td class="py-4 font-bold text-blue-300">${t.nombre || 'Sin nombre'}</td>
                        <td class="py-4 text-slate-400 text-xs">${t.vehiculo || 'N/A'}</td>
                        <td class="py-4"><span class="bg-green-500/10 text-green-400 px-2 py-1 rounded-md text-[10px] font-black italic">ACTIVO</span></td>
                    </tr>
                `;
            });
        }

        // LEER CLIENTES
        console.log("Consultando clientes...");
        const queryCli = await getDocs(collection(db, "clientes"));
        
        if (queryCli.empty) {
            listaCli.innerHTML = "<p class='text-slate-500 text-sm'>No hay clientes registrados.</p>";
        } else {
            listaCli.innerHTML = "";
            queryCli.forEach((doc) => {
                const c = doc.data();
                listaCli.innerHTML += `
                    <div class="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 mb-3">
                        <p class="font-bold text-indigo-300 text-sm">${c.nombre || 'Cliente Anónimo'}</p>
                        <p class="text-xs text-slate-500">${c.telefono || 'Sin tel'} | ${c.direccion || 'Sin dir'}</p>
                    </div>
                `;
            });
        }

    } catch (error) {
        console.error("❌ Error al cargar datos:", error);
        alert("Error de conexión. Revisa la consola (F12).");
    }
}

// Ejecutar la carga
cargarDatos();
