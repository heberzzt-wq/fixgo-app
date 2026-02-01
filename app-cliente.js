import { auth, db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let map, marker;
const urlParams = new URLSearchParams(window.location.search);
const tecnicoId = urlParams.get('id');

const darkMapStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020617" }] }
];

// 1. Iniciar sesión y validar ID
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    if (tecnicoId) {
        console.log("Rastreando a:", tecnicoId);
        iniciarSeguimiento(tecnicoId);
    } else {
        console.warn("No se proporcionó un ID de técnico en la URL.");
    }
});

// 2. Conexión Real-Time con Firestore
function iniciarSeguimiento(id) {
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Actualizar interfaz
            document.getElementById("nombreTecnico").innerText = data.nombre || "Técnico";
            document.getElementById("vehiculoTecnico").innerText = `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`;
            document.getElementById("estadoTecnico").innerText = data.estado || "EN RUTA";

            // LIMPIEZA Y VALIDACIÓN DE COORDENADAS
            // Usamos data.lat y data.lng (asegúrate que coincidan con Firebase)
            const latRaw = data.lat || data.lta; // Soporte por si sigue el error de dedo
            const lngRaw = data.lng || data.Lng;

            if (latRaw && lngRaw) {
                const latFinal = parseFloat(String(latRaw).trim());
                const lngFinal = parseFloat(String(lngRaw).trim());
                
                if (!isNaN(latFinal) && !isNaN(lngFinal)) {
                    dibujarMapa(latFinal, lngFinal);
                }
            }
        } else {
            console.error("El técnico no existe en la base de datos.");
        }
    });
}

// 3. Renderizado del Mapa
function dibujarMapa(lat, lng) {
    const posicion = { lat, lng };

    if (!map) {
        const contenedor = document.getElementById("map");
        if (!contenedor || typeof google === 'undefined') return;

        map = new google.maps.Map(contenedor, {
            center: posicion,
            zoom: 17,
            styles: darkMapStyle,
            disableDefaultUI: true,
            gestureHandling: "greedy"
        });

        marker = new google.maps.Marker({
            position: posicion,
            map: map,
            icon: {
                url: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png",
                scaledSize: new google.maps.Size(45, 45),
                anchor: new google.maps.Point(22, 22)
            }
        });
    } else {
        // Actualización de posición en tiempo real
        marker.setPosition(posicion);
        map.panTo(posicion); // Movimiento suave de cámara
    }
}
