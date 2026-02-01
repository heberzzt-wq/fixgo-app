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
        comenzarRastreo(tecnicoId);
    }
});

// 2. Conexión Real-Time con Firestore
function iniciarSeguimiento(id) {
    console.log("Iniciando rastreo para el ID:", id);
    
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log("Datos recibidos de Firebase:", data);

            // Actualizar interfaz
            document.getElementById("nombreTecnico").innerText = data.nombre || "Técnico";
            document.getElementById("vehiculoTecnico").innerText = `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`;
            document.getElementById("estadoTecnico").innerText = data.estado || "EN RUTA";

            // FORZAR LIMPIEZA DE COORDENADAS (El truco para Heberto)
            if (data.lat && data.lng) {
                // Convertimos a string y luego a float para quitar caracteres raros o espacios
                const latFinal = parseFloat(String(data.lat).trim());
                const lngFinal = parseFloat(String(data.lng).trim());
                
                if (!isNaN(latFinal) && !isNaN(lngFinal)) {
                    console.log("Coordenadas válidas para mapa:", latFinal, lngFinal);
                    renderizarMapa(latFinal, lngFinal);
                } else {
                    console.error("Heberto tiene coordenadas inválidas en Firebase:", data.lat, data.lng);
                }
            }
        } else {
            console.error("No se encontró al técnico con ID:", id);
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
        // Mover marcador y centrar mapa suavemente
        marker.setPosition(posicion);
        map.panTo(posicion);
    }
}
