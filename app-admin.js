import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDyplCp33LneGhqr6yd1VsIYBMdsLDK7gA",
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "54271811634",
    appId: "1:54271811634:web:53a6f4e1f727774e74e64f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let map;
let markers = {}; // Usamos un objeto para rastrear marcadores por ID

function initMap() {
    console.log("🛰️ Sistema de Rastreo FixGo Iniciado");
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.1619, lng: -86.8515 },
        zoom: 13,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] }
        ],
        disableDefaultUI: true,
        zoomControl: true
    });
    
    conectarFlota();
}

function conectarFlota() {
    const tablaTec = document.getElementById('tablaTecnicos');
    const listaCli = document.getElementById('listaClientes');

    // ESCUCHA DE TÉCNICOS
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        tablaTec.innerHTML = "";
        document.getElementById('countTec').innerText = snapshot.size;

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            // Actualizar Marcador
            if (t.lat && t.lng) {
                if (markers[id]) markers[id].setMap(null); // Limpiar anterior
                
                markers[id] = new google.maps.Marker({
                    position: { lat: Number(t.lat), lng: Number(t.lng) },
                    map: map,
                    title: t.nombre,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: '#3b82f6',
                        fillOpacity: 1,
                        strokeWeight: 3,
                        strokeColor: 'white'
                    }
                });
            }

            tablaTec.innerHTML += `
                <tr class="border-b border-white/5">
                    <td class="py-5">
                        <div class="font-bold text-blue-300 text-base">${t.nombre}</div>
                        <div class="text-[10px] text-slate-500">ID: ${t.cedula || 'T-GLOBAL'}</div>
                    </td>
                    <td class="py-5">
                        <div class="text-white font-medium">${t.vehiculo}</div>
                        <div class="text-[10px] text-blue-500/70 uppercase">${t.placas || 'En ruta'}</div>
                    </td>
                    <td class="py-5 text-right">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="bg-red-500/10 p-2 rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
        });
    });

    // ESCUCHA DE CLIENTES
    onSnapshot(collection(db, "clientes"), (snapshot) => {
        listaCli.innerHTML = "";
        document.getElementById('countCli').innerText = snapshot.size;
        
        snapshot.forEach((docSnap) => {
            const c = docSnap.data();
            const id = docSnap.id;
            listaCli.innerHTML += `
                <div class="bg-white/5 p-5 rounded-2xl flex justify-between items-center border border-white/5">
                    <div class="flex items-center gap-4">
                        <div class="bg-yellow-500/20 p-3 rounded-full text-yellow-500">
                            <i class="fas fa-user"></i>
                        </div>
                        <div>
                            <p class="font-bold text-sm text-indigo-300">${c.nombre}</p>
                            <p class="text-[10px] text-slate-500">${c.telefono} • ${c.direccion}</p>
                        </div>
                    </div>
                    <button onclick="eliminarRegistro('clientes', '${id}')" class="text-slate-600 hover:text-red-500 transition">
                        <i class="fas fa-times-circle text-xl"></i>
                    </button>
                </div>`;
        });
    });
}

// ELIMINAR REGISTRO
window.eliminarRegistro = async function(coleccion, id) {
    if (confirm("🚨 ¿Deseas dar de baja este registro?")) {
        try {
            if (markers[id]) {
                markers[id].setMap(null);
                delete markers[id];
            }
            await deleteDoc(doc(db, coleccion, id));
        } catch (e) { alert("Error al procesar solicitud"); }
    }
}

// INICIO AUTOMÁTICO
window.addEventListener('load', () => {
    const loader = setInterval(() => {
        if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
            initMap();
            clearInterval(loader);
        }
    }, 1000);
});
