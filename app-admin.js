import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let markers = [];

// Función para iniciar el mapa
function initMap() {
    console.log("📍 Iniciando mapa de control...");
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
    
    // Iniciar monitoreo en vivo
    escucharBaseDeDatos();
}

function escucharBaseDeDatos() {
    const tablaTec = document.getElementById('tablaTecnicos');
    const listaCli = document.getElementById('listaClientes');

    // 1. Escuchar Técnicos (Marcadores + Tabla)
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        tablaTec.innerHTML = "";
        markers.forEach(m => m.setMap(null));
        markers = [];

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            if (t.lat && t.lng) {
                const marker = new google.maps.Marker({
                    position: { lat: Number(t.lat), lng: Number(t.lng) },
                    map: map,
                    title: t.nombre,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: '#3b82f6',
                        fillOpacity: 1,
                        strokeWeight: 2,
                        strokeColor: 'white'
                    }
                });
                markers.push(marker);
            }

            tablaTec.innerHTML += `
                <tr class="border-b border-white/5 hover:bg-white/5 transition">
                    <td class="py-4">
                        <div class="font-bold text-blue-300">${t.nombre}</div>
                        <div class="text-[10px] text-slate-500">${t.cedula || 'Sin ID'}</div>
                    </td>
                    <td class="py-4 text-slate-400 text-xs">${t.vehiculo} <br> <span class="text-blue-500/50">${t.placas || ''}</span></td>
                    <td class="py-4 text-right">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="text-red-500/30 hover:text-red-500 p-2 transition">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
        });
    });

    // 2. Escuchar Clientes
    onSnapshot(collection(db, "clientes"), (snapshot) => {
        listaCli.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const c = docSnap.data();
            const id = docSnap.id;
            listaCli.innerHTML += `
                <div class="bg-white/5 p-4 rounded-2xl flex justify-between items-center border border-white/5 hover:border-indigo-500/30 transition">
                    <div>
                        <p class="font-bold text-sm text-indigo-300">${c.nombre}</p>
                        <p class="text-[10px] text-slate-500">${c.telefono} | ${c.direccion}</p>
                    </div>
                    <button onclick="eliminarRegistro('clientes', '${id}')" class="text-slate-600 hover:text-red-500 p-2">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`;
        });
    });
}

// Globalizar función de eliminar
window.eliminarRegistro = async function(coleccion, id) {
    if (confirm("¿Estás seguro de eliminar este registro del sistema?")) {
        try {
            await deleteDoc(doc(db, coleccion, id));
        } catch (e) { console.error("Error al borrar:", e); }
    }
}

// CARGADOR DE SEGURIDAD (Espera a que Google Maps exista)
window.addEventListener('load', () => {
    const checkGoogle = setInterval(() => {
        if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
            initMap();
            clearInterval(checkGoogle);
        }
    }, 1000);
});
