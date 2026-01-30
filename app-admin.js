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
let markers = {}; 
let infoWindow; 

// 1. FUNCIÓN PARA INICIAR EL MAPA
function initMap() {
    console.log("🚚 Central FixGo: Localizando Unidades...");
    const mapElement = document.getElementById("map");
    
    if (!mapElement) return;

    map = new google.maps.Map(mapElement, {
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
    
    infoWindow = new google.maps.InfoWindow();
    conectarFlota();
}

// 2. CONEXIÓN EN TIEMPO REAL CON FIREBASE
function conectarFlota() {
    const tablaTec = document.getElementById('tablaTecnicos');
    const listaCli = document.getElementById('listaClientes');

    // ESCUCHAR TÉCNICOS
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        if (tablaTec) tablaTec.innerHTML = "";
        document.getElementById('countTec').innerText = snapshot.size;

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            if (t.lat && t.lng) {
                // Si ya existe un marcador para este ID, lo quitamos antes de poner el nuevo
                if (markers[id]) markers[id].setMap(null); 
                
                // ICONO DE CAMIONETA BLANCA (URL DE RESPALDO GARANTIZADA)
                markers[id] = new google.maps.Marker({
                    position: { lat: Number(t.lat), lng: Number(t.lng) },
                    map: map,
                    icon: {
                        url: "https://maps.google.com/mapfiles/kml/pal4/icon54.png", // Icono de transporte blanco de Google
                        scaledSize: new google.maps.Size(35, 35)
                    },
                    title: t.nombre
                });

                markers[id].addListener("click", () => {
                    infoWindow.setContent(`<div class="p-2 text-slate-900 font-sans"><b>${t.nombre}</b><br>${t.vehiculo}</div>`);
                    infoWindow.open(map, markers[id]);
                });
            }

            if (tablaTec) {
                tablaTec.innerHTML += `
                <tr class="border-b border-white/5 hover:bg-white/5 transition">
                    <td class="py-4 font-bold text-blue-400">${t.nombre}</td>
                    <td class="py-4 text-slate-400 text-xs">${t.vehiculo}</td>
                    <td class="py-4 text-right">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="text-red-500 hover:text-red-300 transition">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
            }
        });
    });

    // ESCUCHAR CLIENTES
    onSnapshot(collection(db, "clientes"), (snapshot) => {
        if (listaCli) {
            listaCli.innerHTML = "";
            document.getElementById('countCli').innerText = snapshot.size;
            snapshot.forEach((docSnap) => {
                const c = docSnap.data();
                const id = docSnap.id;
                listaCli.innerHTML += `
                    <div class="bg-white/5 p-4 rounded-2xl flex justify-between items-center border border-white/5 mb-2">
                        <div>
                            <p class="font-bold text-sm text-indigo-300">${c.nombre}</p>
                            <p class="text-[10px] text-slate-500">${c.telefono || 'Sin tel.'}</p>
                        </div>
                        <button onclick="eliminarRegistro('clientes', '${id}')" class="text-slate-600 hover:text-red-500 transition">
                            <i class="fas fa-times-circle text-xl"></i>
                        </button>
                    </div>`;
            });
        }
    });
}

// 3. FUNCIÓN PARA ELIMINAR
window.eliminarRegistro = async function(coleccion, id) {
    if (confirm("⚠️ ¿Eliminar este registro permanentemente?")) {
        try {
            if (markers[id]) markers[id].setMap(null);
            await deleteDoc(doc(db, coleccion, id));
        } catch (e) {
            console.error("Error al borrar:", e);
        }
    }
}

// 4. CARGADOR DE SEGURIDAD
window.addEventListener('load', () => {
    let intentos = 0;
    const interval = setInterval(() => {
        intentos++;
        if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
            initMap();
            clearInterval(interval);
        }
        if (intentos > 10) clearInterval(interval); // Detener si falla mucho
    }, 1000);
});
