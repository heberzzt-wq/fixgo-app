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
let markers = []; // Para limpiar marcadores viejos si se mueve el GPS

function initMap() {
    console.log("📍 Inicializando mapa...");
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.1619, lng: -86.8515 }, // Cancún
        zoom: 12,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] }
        ],
        disableDefaultUI: true,
        zoomControl: true
    });
    
    // Escuchar cambios en tiempo real (GPS en vivo)
    escucharTecnicos();
    cargarClientes();
}

// 1. ESCUCHAR TÉCNICOS EN TIEMPO REAL
function escucharTecnicos() {
    const tablaTec = document.getElementById('tablaTecnicos');
    
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        tablaTec.innerHTML = "";
        // Limpiar marcadores anteriores
        markers.forEach(m => m.setMap(null));
        markers = [];

        snapshot.forEach((documento) => {
            const t = documento.data();
            const id = documento.id;

            // Pintar en Mapa si tiene GPS
            if (t.lat && t.lng) {
                const marker = new google.maps.Marker({
                    position: { lat: t.lat, lng: t.lng },
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

            // Pintar en Tabla
            tablaTec.innerHTML += `
                <tr class="border-b border-white/5">
                    <td class="py-4 font-bold text-blue-300">${t.nombre}</td>
                    <td class="py-4 text-slate-500 text-xs">${t.vehiculo}</td>
                    <td class="py-4 text-right">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="text-red-500/50 hover:text-red-500 p-2">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
        });
    });
}

// 2. CARGAR CLIENTES
async function cargarClientes() {
    const listaCli = document.getElementById('listaClientes');
    const queryCli = await getDocs(collection(db, "clientes"));
    listaCli.innerHTML = "";
    queryCli.forEach((documento) => {
        const c = documento.data();
        const id = documento.id;
        listaCli.innerHTML += `
            <div class="bg-white/5 p-4 rounded-2xl flex justify-between items-center border border-white/5">
                <div>
                    <p class="font-bold text-sm text-indigo-300">${c.nombre || 'Cliente'}</p>
                    <p class="text-[10px] text-slate-500">${c.telefono || ''} | ${c.direccion || ''}</p>
                </div>
                <button onclick="eliminarRegistro('clientes', '${id}')" class="text-slate-600 hover:text-red-500">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
    });
}

// 3. ELIMINAR REGISTROS
window.eliminarRegistro = async function(coleccion, id) {
    if (confirm("¿Borrar este registro permanentemente?")) {
        try {
            await deleteDoc(doc(db, coleccion, id));
            // No hace falta recargar, onSnapshot actualiza la tabla solo
        } catch (e) { alert("Error al borrar"); }
    }
}

// DISPARAR INICIO AL CARGAR VENTANA
window.onload = () => {
    // Esperar un segundo para asegurar que Google Maps cargó
    setTimeout(initMap, 1000);
};
