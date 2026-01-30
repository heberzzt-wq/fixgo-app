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

function initMap() {
    console.log("🛰️ Mapa sincronizado. Buscando a Pedro...");
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.1619, lng: -86.8515 }, // Cancún
        zoom: 13,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] }
        ],
        disableDefaultUI: true,
        zoomControl: true
    });
    
    escucharFlota();
}

// Hacemos que la función sea visible para la API de Google
window.initMap = initMap;

function escucharFlota() {
    const tabla = document.getElementById('tablaTecnicos');

    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        if (tabla) tabla.innerHTML = "";
        
        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            // Validación ultra-segura de coordenadas
            const lat = parseFloat(t.lat);
            const lng = parseFloat(t.lng);

            if (!isNaN(lat) && !isNaN(lng)) {
                // Borrar marcador viejo si existe
                if (markers[id]) markers[id].setMap(null);

                // Crear marcador nuevo
                markers[id] = new google.maps.Marker({
                    position: { lat: lat, lng: lng },
                    map: map,
                    title: t.nombre || "Técnico",
                    icon: {
                        url: "https://img.icons8.com/isometric/50/38bdf8/delivery-truck.png",
                        scaledSize: new google.maps.Size(40, 40)
                    }
                });
                
                console.log("✅ Pedro ubicado en el mapa");
            }

            if (tabla) {
                tabla.innerHTML += `
                <tr class="border-b border-white/5">
                    <td class="py-4 font-bold text-blue-400 text-sm">${t.nombre || 'Pedro'}</td>
                    <td class="py-4 text-slate-400 text-xs">${t.vehiculo || 'Unidad'}</td>
                </tr>`;
            }
        });
    });
}
