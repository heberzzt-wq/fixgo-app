import { auth, db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let map, marker;
const urlParams = new URLSearchParams(window.location.search);
const tecnicoId = urlParams.get('id');

const mapStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020617" }] }
];

// Iniciar proceso al detectar usuario
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    if (tecnicoId) {
        console.log("Rastreando técnico:", tecnicoId);
        escucharUbicacion(tecnicoId);
    }
});

function escucharUbicacion(id) {
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Actualizar Interfaz
            document.getElementById("nombreTecnico").innerText = data.nombre || "Heberto";
            document.getElementById("vehiculoTecnico").innerText = `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`;
            document.getElementById("estadoTecnico").innerText = data.estado || "EN RUTA";

            // Ubicación
            if (data.lat && data.lng) {
                const lat = parseFloat(data.lat);
                const lng = parseFloat(data.lng);
                if (!isNaN(lat) && !isNaN(lng)) {
                    initMap(lat, lng);
                }
            }
        }
    });
}

function initMap(lat, lng) {
    const coords = { lat, lng };

    if (!map) {
        const mapDiv = document.getElementById("map");
        if (!mapDiv || typeof google === 'undefined') return;

        map = new google.maps.Map(mapDiv, {
            center: coords,
            zoom: 17,
            styles: mapStyle,
            disableDefaultUI: true
        });

        marker = new google.maps.Marker({
            position: coords,
            map: map,
            icon: {
                url: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png",
                scaledSize: new google.maps.Size(45, 45)
            }
        });
    } else {
        marker.setPosition(coords);
        map.panTo(coords);
    }
}
