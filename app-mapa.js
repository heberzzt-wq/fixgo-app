import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// Coordenadas base de Cancún
const centroCancun = { lat: 21.1619, lng: -86.8515 };

async function initMap() {
    const map = new google.maps.Map(document.getElementById("map"), {
        zoom: 12,
        center: centroCancun,
        styles: [ /* Tu estilo oscuro aquí */ ]
    });

    console.log("📍 Mapa iniciado, buscando técnicos...");

    try {
        const querySnapshot = await getDocs(collection(db, "tecnicos"));
        querySnapshot.forEach((doc) => {
            const t = doc.data();
            
            // Si el técnico no tiene coordenadas aún, le asignamos una cerca del centro para la demo
            const lat = t.lat || (21.14 + Math.random() * 0.04);
            const lng = t.lng || (-86.82 - Math.random() * 0.04);

            new google.maps.Marker({
                position: { lat, lng },
                map,
                title: t.nombre,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: "#60A5FA",
                    fillOpacity: 0.8,
                    strokeWeight: 2,
                    strokeColor: "#FFFFFF",
                }
            });
        });
    } catch (e) {
        console.error("Error cargando puntos en mapa:", e);
    }
}

// Hacer la función disponible para Google Maps
window.initMap = initMap;
