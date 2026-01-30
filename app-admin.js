import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k",
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

window.initMap = function() {
    console.log("🚚 Central FixGo: Buscando camionetas blancas...");
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.1619, lng: -86.8515 },
        zoom: 12,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020617" }] }
        ],
        disableDefaultUI: true
    });
    escucharFlota();
};

function escucharFlota() {
    // AJUSTE DE IDS SEGÚN TU HTML:
    const tabla = document.getElementById('tablaTecnicos');
    const contador = document.getElementById('countTec'); // Cambiado de 'contadorActivos' a 'countTec'

    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        if (tabla) tabla.innerHTML = "";
        let activos = 0;

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;
            
            // Forzamos conversión a número (por si vienen como texto desde Firebase)
            const lat = Number(t.lat);
            const lng = Number(t.lng);

            if (!isNaN(lat) && !isNaN(lng)) {
                activos++;
                const pos = { lat, lng };

                // Gestionar marcadores en el mapa
                if (markers[id]) {
                    markers[id].setPosition(pos);
                } else {
                    markers[id] = new google.maps.Marker({
                        position: pos,
                        map: map,
                        title: t.nombre,
                        icon: {
                            url: "https://img.icons8.com/isometric/50/ffffff/delivery-truck.png", // CAMIONETA BLANCA
                            scaledSize: new google.maps.Size(45, 45)
                        }
                    });
                }

                // Inyectar filas en la tabla (ID Operador / Vehículo / Acción)
                if (tabla) {
                    tabla.innerHTML += `
                    <tr class="border-b border-white/5 hover:bg-white/5 transition">
                        <td class="py-4">
                            <div class="flex items-center gap-3">
                                <div class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                                <div>
                                    <div class="font-bold text-blue-400">${t.nombre}</div>
                                    <div class="text-[10px] text-slate-500 font-mono">${id.substring(0,6)}</div>
                                </div>
                            </div>
                        </td>
                        <td class="py-4 text-slate-400 text-xs">${t.vehiculo || 'Camioneta Blanca'}</td>
                        <td class="py-4 text-right">
                             <span class="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-2 py-1 rounded-md">EN LÍNEA</span>
                        </td>
                    </tr>`;
                }
            }
        });

        // Actualizar el contador visual "Unidades Activas"
        if (contador) {
            contador.innerText = activos;
        }
    });
}
