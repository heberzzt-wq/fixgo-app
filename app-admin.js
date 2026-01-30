import { db, collection, getDocs } from './firebase-config.js';

console.log("🛠️ Panel Admin Conectado");

async function cargarDatos() {
    const tablaTec = document.getElementById('tablaTecnicos');
    const listaCli = document.getElementById('listaClientes');

    // Cargar Técnicos
    const queryTec = await getDocs(collection(db, "tecnicos"));
    tablaTec.innerHTML = "";
    queryTec.forEach((doc) => {
        const t = doc.data();
        tablaTec.innerHTML += `
            <tr class="border-b border-slate-700/50">
                <td class="py-4 font-bold">${t.nombre}</td>
                <td class="py-4 text-slate-400 text-xs">${t.vehiculo}</td>
                <td class="py-4"><span class="bg-green-500/10 text-green-500 px-2 py-1 rounded-md text-[10px] font-black">ACTIVO</span></td>
            </tr>
        `;
    });

    // Cargar Clientes
    const queryCli = await getDocs(collection(db, "clientes"));
    listaCli.innerHTML = "";
    queryCli.forEach((doc) => {
        const c = doc.data();
        listaCli.innerHTML += `
            <div class="bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
                <p class="font-bold text-indigo-300 text-sm">${c.nombre}</p>
                <p class="text-xs text-slate-500">${c.telefono} | ${c.direccion}</p>
            </div>
        `;
    });
}

cargarDatos();
