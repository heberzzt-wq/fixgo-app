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

function initMap() {
    console.log("🚚 Iniciando Mapa de Flota...");
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
    
    infoWindow = new google.maps.InfoWindow();
    conectarFlota();
}

function conectarFlota() {
    const tablaTec = document.getElementById('tablaTecnicos');
    const listaCli = document.getElementById('listaClientes');

    // ESCUCHA TÉCNICOS
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        tablaTec.innerHTML = "";
        document.getElementById('countTec').innerText = snapshot.size;

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            if (t.lat && t.lng) {
                if (markers[id]) markers[id].setMap(null); 
                
                // USAMOS UNA IMAGEN REAL DE CAMIONETA BLANCA (PNG)
                const marker = new google.maps.Marker({
                    position: { lat: Number(t.lat), lng: Number(t.lng) },
                    map: map,
                    icon: {
                        url: "https://img.icons8.com/isometric/50/ffffff/delivery-truck.png", // Camioneta Blanca Isométrica
                        scaledSize: new google.maps.Size(40, 40)
                    }
                });

                marker.addListener("click", () => {
                    infoWindow.setContent(`<div style="color:#000; padding:5px;"><b>${t.nombre}</b><br>${t.vehiculo}</div>`);
                    infoWindow.open(map, marker);
                });

                markers[id] = marker;
            }

            tablaTec.innerHTML += `
                <tr class="border-b border-white/5">
                    <td class="py-4 font-bold text-blue-300">${t.nombre}</td>
                    <td class="py-4 text-slate-400 text-xs">${t.vehiculo}</td>
                    <td class="py-4 text-right">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="text-red-500 hover:text-red-300">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
        });
    });

    // ESCUCHA CLIENTES
    onSnapshot(collection(db, "clientes"), (snapshot) => {
        listaCli.innerHTML = "";
        document.getElementById('countCli').innerText = snapshot.size;
        snapshot.forEach((docSnap) => {
            const c = docSnap.data();
            const id = docSnap.id;
            listaCli.innerHTML += `
                <div class="bg-white/5 p-4 rounded-2xl flex justify-between items-center border border-white/5 mb-2">
                    <div>
                        <p class="font-bold text-sm text-indigo-300">${c.nombre}</p>
                        <p class="text-[10px] text-slate-500">${c.telefono}</p>
                    </div>
                    <button onclick="eliminarRegistro('clientes', '${id}')" class="text-slate-600 hover:text-red-500">
                        <i class="fas fa-times-circle text-xl"></i>
                    </button>
                </div>`;
        });
    });
}

window.eliminarRegistro = async function(coleccion, id) {
    if (confirm("¿Eliminar este registro?")) {
        try {
            if (markers[id]) markers[id].setMap(null);
            await deleteDoc(doc(db, coleccion, id));
        } catch (e) { console.error(e); }
    }
}

// INICIO SEGURO
window.addEventListener('load', () => {
    const timer = setInterval(() => {
        if (typeof google !== 'undefined') {
            initMap();
            clearInterval(timer);
        }
    }, 1000);
});
