import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Tu configuración de Firebase inyectada directamente
const firebaseConfig = {
    apiKey: "AIzaSyDyplCp33LneGhqr6yd1VsIYBMdsLDK7gA",
    authDomain: "fixgo-bd.firebaseapp.com",
    projectId: "fixgo-bd",
    storageBucket: "fixgo-bd.appspot.com",
    messagingSenderId: "54271811634",
    appId: "1:54271811634:web:53a6f4e1f727774e74e64f"
};

// Inicializamos Firebase dentro de este archivo
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// ... (mismo encabezado e inicialización de arriba)

async function cargarDatos() {
    console.log("🚀 Probando conexión directa a Firestore...");
    const tablaTec = document.getElementById('tablaTecnicos');

    try {
        // Intento de lectura simple
        const colRef = collection(db, "tecnicos");
        const snapshot = await getDocs(colRef);
        
        console.log("✅ Conexión establecida. Documentos encontrados:", snapshot.size);

        if (snapshot.empty) {
            tablaTec.innerHTML = "<tr><td colspan='3' class='py-4 text-center'>Base de datos vacía.</td></tr>";
        } else {
            // ... resto del código para llenar la tabla
        }
    } catch (e) {
        console.error("❌ ERROR DETECTADO:", e.code, e.message);
        // Si el error es 'permission-denied', el problema es 100% las Reglas de Firebase
    }
}
    try {
        // Consulta Técnicos
        const queryTec = await getDocs(collection(db, "tecnicos"));
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

        // Consulta Clientes
        const queryCli = await getDocs(collection(db, "clientes"));
        listaCli.innerHTML = "";
        if (queryCli.empty) {
            listaCli.innerHTML = "<p class='text-slate-500 text-sm'>No hay clientes.</p>";
        } else {
            queryCli.forEach((doc) => {
                const c = doc.data();
                listaCli.innerHTML += `
                    <div class="bg-slate-900/50 p-4 rounded-2xl border border-slate-700 mb-3">
                        <p class="font-bold text-indigo-300 text-sm">${c.nombre || 'Anónimo'}</p>
                        <p class="text-xs text-slate-500">${c.telefono || ''} | ${c.direccion || ''}</p>
                    </div>`;
            });
        }
    } catch (e) {
        console.error("Error crítico:", e);
    }
}

cargarDatos();
