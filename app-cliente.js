// app-cliente.js - REESCRITO PARA ESTABILIDAD
import { auth, db, onAuthStateChanged } from "./firebase.js";
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    doc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const nombreTecnicoEl = document.getElementById("nombreTecnico");
const vehiculoTecnicoEl = document.getElementById("vehiculoTecnico");
const estadoTecnicoEl = document.getElementById("estadoTecnico");

let map, marker, userUID = null;
// ID de respaldo para la demo si no hay servicio activo (Jonathan)
const DEFAULT_TECNICO_ID = "ID_DE_JONATHAN_AQUI"; 

function initMap(lat = 21.1619, lng = -86.8515) {
    if (map) return;
    const mapDiv = document.getElementById("map");
    if (!mapDiv) return;

    map = new google.maps.Map(mapDiv, {
        center: { lat, lng },
        zoom: 16,
        disableDefaultUI: true,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
            { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }
        ]
    });

    marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        icon: { 
            url: "https://cdn-icons-png.flaticon.com/512/1048/1048329.png", 
            scaledSize: new google.maps.Size(40, 40) 
        }
    });
}

onAuthStateChanged(auth, async (user) => {
    initMap();
    if (user) {
        userUID = user.uid;
        if (estadoTecnicoEl) estadoTecnicoEl.innerText = "Sincronizando...";
        buscarServicioActivo();
    } else {
        console.warn("Modo visualización: Usando técnico de prueba.");
        rastrearTecnico(DEFAULT_TECNICO_ID); // CORREGIDO: Pasamos ID siempre
    }
});

function buscarServicioActivo() {
    if (!userUID) return;
    const q = query(
        collection(db, "solicitudes"), 
        where("clienteId", "==", userUID), 
        where("estado", "in", ["EN CAMINO", "EN SERVICIO"])
    );

    onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const servicio = snapshot.docs[0].data();
            if (servicio.tecnicoId) {
                rastrearTecnico(servicio.tecnicoId);
            }
        } else {
            // Si no hay servicio, rastreamos al técnico de prueba
            rastrearTecnico(DEFAULT_TECNICO_ID); 
        }
    });
}

function rastrearTecnico(tecnicoId) {
    // PROTECCIÓN: Si tecnicoId no es válido, no ejecutamos Firestore
    if (!tecnicoId || typeof tecnicoId !== "string") {
        console.error("Error: ID de técnico no válido para rastreo.");
        return;
    }

    onSnapshot(doc(db, "tecnicos", tecnicoId), (docSnap) => {
        if (!docSnap.exists()) {
            console.warn("El documento del técnico no existe en la DB.");
            return;
        }
        const data = docSnap.data();

        if (nombreTecnicoEl) nombreTecnicoEl.innerText = data.nombre || "Técnico";
        if (vehiculoTecnicoEl) vehiculoTecnicoEl.innerText = `${data.vehiculo || 'S/V'} | ${data.placas || 'S/P'}`;

        if (estadoTecnicoEl) {
            estadoTecnicoEl.innerText = data.estado === "DISPONIBLE" ? "ESPERANDO SOLICITUD" : "TÉCNICO EN RUTA";
            estadoTecnicoEl.className = data.estado === "DISPONIBLE" ? "text-blue-400 font-black" : "text-emerald-400 font-black animate-pulse";
        }

        const lat = data.ubicacion?.lat || data.lat;
        const lng = data.ubicacion?.lng || data.lng;

        if (lat && lng) {
            const pos = { lat: Number(lat), lng: Number(lng) };
            marker.setPosition(pos);
            map.panTo(pos);
        }
    }, (error) => {
        console.error("Error en tiempo real:", error);
    });
}
