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

// 1. DEFINICIÓN GLOBAL INMEDIATA PARA EVITAR EL ERROR DE LA CAPTURA 198
window.initMap = function() {
    console.log("🛰️ Sistema de Rastreo FixGo Iniciado");
    
    const mapElement = document.getElementById("map");
    map = new google.maps.Map(mapElement, {
        center: { lat: 21.1619, lng: -86.8515 }, // Cancún
        zoom: 13,
        styles: [{ "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] }],
        disableDefaultUI: true
    });
    
    // Iniciar escucha de Firebase una vez el mapa esté listo
    escucharBaseDatos();
};

function escucharBaseDatos() {
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            // 2. TRATAMIENTO FLEXIBLE DE COORDENADAS (Captura 187)
            // Forzamos conversión a número sin importar si Firebase lo envía como String o Number
            const latitud = Number(t.lat);
            const longitud = Number(t.lng);

            if (!isNaN(latitud) && !isNaN(longitud)) {
                // Si el técnico ya tiene marcador, lo movemos en lugar de crear uno nuevo
                if (markers[id]) {
                    markers[id].setPosition({ lat: latitud, lng: longitud });
                } else {
                    markers[id] = new google.maps.Marker({
                        position: { lat: latitud, lng: longitud },
                        map: map,
                        title: t.nombre,
                        // 3. ICONO DE EMERGENCIA (Si el AdBlock bloquea el PNG, usaremos el marcador estándar)
                        icon: {
                            url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                            scaledSize: new google.maps.Size(40, 40)
                        }
                    });
                }
                console.log(`📍 Pedro (ID: ${id}) renderizado en: ${latitud}, ${longitud}`);
            }
        });
    });
}
