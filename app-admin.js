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

    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        tablaTec.innerHTML = "";
        document.getElementById('countTec').innerText = snapshot.size;

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            if (t.lat && t.lng) {
                if (markers[id]) markers[id].setMap(null); 
                
                // ICONO SVG BLANCO PURO (INMUNE A ERRORES DE COLOR EXTERNOS)
                const camionetaBlanca = {
                    path: "M15.39,3L13.07,5H21V16H19V14H5V16H3V5H10.93L8.61,3H3A2,2 0 0,0 1,5V16A2,2 0 0,0 3,18H4A2,2 0 0,0 6,20A2,2 0 0,0 8,18H16A2,2 0 0,0 18,20A2,2 0 0,0 20,18H21A2,2 0 0,0 23,16V5A2,2 0 0,0 21,3H15.39M15,11V9H19V11H15M10,11V9H14V11H10M5,11V9H9V11H5M6,18A1,1 0 0,1 5,17A1,1 0 0,1 6,16A1,1 0 0,1 7,17A1,1 0 0,1 6,18M18,18A1,1 0 0,1 17,17A1,1 0 0,1 18,16A1,1 0 0,1 19,17A1,1 0 0,1 18,18Z",
                    fillColor: "#FFFFFF", // Blanco brillante
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: "#3b82f6", // Contorno azul para que resalte más
                    scale: 1.8,
                    anchor: new google.maps.Point(12, 12)
                };

                const marker = new google.maps.Marker({
                    position: { lat: Number(t.lat), lng: Number(t.lng) },
                    map: map,
                    icon: camionetaBlanca,
                    animation: google.maps.Animation.DROP
                });

                marker.addListener("click", () => {
                    infoWindow.setContent(`
                        <div style="color:#0f172a; padding:10px; font-family:sans-serif;">
                            <b style="color:#2563eb;">${t.nombre.toUpperCase()}</b><br>
                            <span style="font-size:12px;">🚐 ${t.vehiculo}</span>
                        </div>`);
                    infoWindow.open(map, marker);
                });

                markers[id] = marker;
            }

            tablaTec.innerHTML += `
                <tr class="border-b border-white/5">
                    <td class="py-4">
                        <div class="font-bold text-blue-300 text-base">${t.nombre}</div>
                    </td>
                    <td class="py-4 text-slate-400 text-xs">${t.vehiculo}</td>
                    <td class="py-4 text-right">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="text-red-500/50 hover:text-red-500 transition">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
        });
    });

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
                        <p class="text-[10px] text-slate-500">${c.telefono} | ${c.direccion}</p>
                    </div>
                    <button onclick="eliminarRegistro('clientes', '${id}')" class="text-slate-600 hover:text-red-500">
                        <i class="fas fa-times-circle text-xl"></i>
                    </button>
                </div>`;
        });
    });
}

window.eliminarRegistro = async function(coleccion, id) {
    if (confirm("🚨 ¿ELIMINAR REGISTRO?")) {
        try {
            if (markers[id]) markers[id].setMap(null);
            await deleteDoc(doc(db, coleccion, id));
        } catch (e) { console.error(e); }
    }
}

window.addEventListener('load', () => {
    const loader = setInterval(() => {
        if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
            initMap();
            clearInterval(loader);
        }
    }, 1000);
});
