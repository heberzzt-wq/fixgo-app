import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// CONFIGURACIÓN CON TU CLAVE EXACTA
const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k", // <-- CLAVE ACTUALIZADA
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

// Función para inicializar el mapa en la vista general
window.initMap = function() {
    console.log("📍 Mapa General iniciado con API: ...H7k");
    const mapElement = document.getElementById("map");
    
    if (!mapElement) {
        console.error("No se encontró el elemento #map");
        return;
    }

    map = new google.maps.Map(mapElement, {
        center: { lat: 21.1619, lng: -86.8515 },
        zoom: 12,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] }
        ],
        disableDefaultUI: true,
        zoomControl: true
    });

    cargarTecnicosEnMapa();
};

function cargarTecnicosEnMapa() {
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            const lat = parseFloat(t.lat);
            const lng = parseFloat(t.lng);

            if (!isNaN(lat) && !isNaN(lng)) {
                // Si el marcador ya existe, moverlo; si no, crearlo
                if (markers[id]) {
                    markers[id].setPosition({ lat, lng });
                } else {
                    markers[id] = new google.maps.Marker({
                        position: { lat, lng },
                        map: map,
                        icon: {
                            url: "https://img.icons8.com/isometric/50/38bdf8/delivery-truck.png",
                            scaledSize: new google.maps.Size(40, 40)
                        },
                        title: t.nombre || "Técnico"
                    });
                }
            }
        });
    });
}
