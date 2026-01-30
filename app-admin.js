// Importamos solo lo necesario de la configuración que ya creaste
import { db } from './firebase-config.js';
// Importamos las funciones de lectura directamente de la librería oficial
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

console.log("🛠️ Intentando conectar con la base de datos...");

async function cargarDatos() {
    const tablaTec = document.getElementById('tablaTecnicos');
    const listaCli = document.getElementById('listaClientes');

    try {
        // 1. LEER TÉCNICOS
        console.log("Consultando técnicos...");
        const colTecnicos = collection(db, "tecnicos"); // Referencia corregida
        const queryTec = await getDocs(colTecnicos);
        
        tablaTec.innerHTML = ""; // Limpiamos la tabla
        
        if (queryTec.empty) {
            tablaTec.innerHTML = "<tr><td colspan='3' class='py-4 text-center text-slate-500'>No hay técnicos aún.</td></tr>";
        } else {
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

        // 2. LEER CLIENTES
        console.log("Consultando clientes...");
        const colClientes = collection(db, "clientes"); // Referencia corregida
        const queryCli = await getDocs(colClientes);
        
        listaCli.innerHTML = ""; // Limpiamos la lista
        
        if (queryCli.empty) {
            listaCli.innerHTML = "<p class='text-slate-500 text-sm italic'>No hay clientes registrados.</p>";
        } else {
            queryCli.forEach((doc) => {
                const c = doc.data();
                listaCli.innerHTML += `
                    <div class="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 mb-3">
                        <p class="font-bold text-indigo-300 text-sm">${c.nombre || 'Cliente'}</p>
                        <p class="text-xs text-slate-500">${c.telefono || ''} | ${c.direccion || ''}</p>
                    </div>
                `;
            });
        }

    } catch (error) {
        console.error("❌ Error al cargar datos:", error);
    }
}

// Ejecutamos la función al cargar la página
cargarDatos();
