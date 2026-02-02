// app-cliente.js
import { auth, db, onAuthStateChanged } from "./firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Elementos de la UI
const nombreTecnicoEl = document.getElementById("nombreTecnico");
const vehiculoTecnicoEl = document.getElementById("vehiculoTecnico");
const estadoTecnicoEl = document.getElementById("estadoTecnico");

let map;
let marker;
let userUID = null;

// 1. Inicializar el Mapa (Google Maps)
function initMap(lat = 21.1619, lng = -86.8515) {
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat, lng },
        zoom: 16,
        disableDefaultUI: true,
        styles: [ /* Estilo Dark Mode para Google Maps */
            { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
            { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
            { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }
        ]
    });

    marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        icon: {
            url: "https://cdn-icons-png.flaticon.com/512/1048/1048329.png", // Icono de camión/técnico
            scaledSize: new google.maps.Size(40, 40)
        }
    });
}

// 2. Verificar Sesión y buscar Servicio Activo
onAuthStateChanged(auth, (user) => {
    if (user) {
        userUID = user.uid;
        buscarServicioActivo();
    } else {
        window.location.href = "login.html";
    }
});

function buscarServicioActivo() {
    // Buscamos la solicitud del cliente que esté "EN CAMINO" o "EN SERVICIO"
    const q = query(
        collection(db, "solicitudes"), 
        where("clienteId", "==", userUID),
        where("estado", "in", ["EN CAMINO", "EN SERVICIO"])
    );

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            estadoTecnicoEl.innerText = "SIN SERVICIOS ACTIVOS";
            estadoTecnicoEl.classList.replace("text-emerald-400", "text-slate-500");
            return;
        }

        const servicio = snapshot.docs[0].data();
        if (servicio.tecnicoId) {
            rastrearTecnico(servicio.tecnicoId);
        }
    });
}

// 3. Escuchar Ubicación del Técnico en Tiempo Real
function rastrearTecnico(tecnicoId) {
    onSnapshot(doc(db, "tecnicos", tecnicoId), (docSnap) => {
        if (!docSnap.exists()) return;
        
        const data = docSnap.data();
        
        // Actualizar UI
        nombreTecnicoEl.innerText = data.nombre || "Técnico Asignado";
        vehiculoTecnicoEl.innerText = `${data.vehiculo || 'UNIDAD'} | ${data.placas || 'S/P'}`;
        estadoTecnicoEl.innerText = data.estado || "EN CAMINO";

        // Actualizar Mapa
        if (data.lat && data.lng) {
            const pos = { lat: data.lat, lng: data.lng };
            
            if (!map) {
                initMap(pos.lat, pos.lng);
            } else {
                marker.setPosition(pos);
                map.panTo(pos); // Suaviza el movimiento de la cámara
            }
        }
    });
}
