import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// CONFIGURACIÓN CON TU CLAVE NUEVA REVISADA
const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k", // <-- CLAVE CORREGIDA AQUÍ
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

// Función de inicio del mapa (Llamada por el script de Google en el HTML)
window.initMap = function() {
    console.log("🚚 Conectando con API: AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k");
    const mapElement = document.getElementById("map");
    
    map = new google.maps.Map(mapElement, {
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
    
    conectarFlota();
}

function conectarFlota() {
    const tablaTec = document.getElementById('tablaTecnicos');

    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        if (tablaTec) tablaTec.innerHTML = "";

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            // Forzamos que lat y lng sean números para que Google no los ignore
            const lat = parseFloat(t.lat);
            const lng = parseFloat(t.lng);

            if (!isNaN(lat) && !isNaN(lng)) {
                // Borrar marcador viejo si existe
                if (markers[id]) markers[id].setMap(null); 
                
                // Icono azul para Pedro/Heberto (Visibilidad máxima)
                markers[id] = new google.maps.Marker({
                    position: { lat: lat, lng: lng },
                    map: map,
                    icon: {
                        url: "https://img.icons8.com/isometric/50/38bdf8/delivery-truck.png",
                        scaledSize: new google.maps.Size(45, 45)
                    },
                    title: t.nombre
                });
            }

            if (tablaTec) {
                tablaTec.innerHTML += `
                <tr class="border-b border-white/5">
                    <td class="py-4 font-bold text-blue-400 text-sm">${t.nombre || 'Técnico'}</td>
                    <td class="py-4 text-slate-400 text-xs">${t.vehiculo || 'Unidad'}</td>
                    <td class="py-4 text-right">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="text-red-500/20 hover:text-red-500 transition">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
            }
        });
    });
}

// Función para borrar registros
window.eliminarRegistro = async function(coleccion, id) {
    if (confirm("⚠️ ¿Eliminar unidad del mapa?")) {
        try {
            if (markers[id]) markers[id].setMap(null);
            await deleteDoc(doc(db, coleccion, id));
        } catch (e) { console.error("Error:", e); }
    }
}
