// app-cliente.js - VERSIÓN DE EMERGENCIA (ANTI-REBOTE)
import { auth, db, onAuthStateChanged } from "./firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const nombreTecnicoEl = document.getElementById("nombreTecnico");
const vehiculoTecnicoEl = document.getElementById("vehiculoTecnico");
const estadoTecnicoEl = document.getElementById("estadoTecnico");

let map, marker, userUID = null;

// 1. Inicialización Inmediata del Mapa
function initMap(lat = 21.1619, lng = -86.8515) {
    if (map) return;
    const mapDiv = document.getElementById("map");
    if (!mapDiv) return;

    map = new google.maps.Map(mapDiv, {
        center: { lat, lng },
        zoom: 16,
        disableDefaultUI: true,
        styles: [{ "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
                 { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }]
    });

    marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        icon: { url: "https://cdn-icons-png.flaticon.com/512/1048/1048329.png", scaledSize: new google.maps.Size(40, 40) }
    });
}

// 2. Control de Sesión (SIN REDIRECCIÓN AGRESIVA)
onAuthStateChanged(auth, async (user) => {
    // Forzamos la carga del mapa sin importar quién sea el usuario
    initMap(); 

    if (user) {
        userUID = user.uid;
        console.log("Sesión activa para UID:", userUID);
        if (estadoTecnicoEl) estadoTecnicoEl.innerText = "Sincronizando con la red...";
        
        // Buscamos cualquier servicio activo, sin importar si el UID está en 'clientes'
        buscarServicioActivo();
    } else {
        console.warn("No hay usuario logueado, pero mantenemos la vista de mapa.");
        if (estadoTecnicoEl) estadoTecnicoEl.innerText = "Modo Visualización Activo";
        // Si tienes una ID de técnico específica para la prueba (Jonathan), la forzamos aquí:
        rastrearTecnico("JFQnmY9b1GWy9rnE7VaXIICj0pF3"); 
    }
});

// 3. Búsqueda de Servicio
function buscarServicioActivo() {
    // Buscamos cualquier solicitud vinculada a este usuario
    const q = query(
        collection(db, "solicitudes"), 
        where("clienteId", "==", userUID),
        where("estado", "in", ["EN CAMINO", "EN SERVICIO"])
    );

    onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const servicio = snapshot.docs[0].data();
            if (servicio.tecnicoId) rastrearTecnico(servicio.tecnicoId);
        } else {
            // SI NO HAY SOLICITUD, FORZAMOS EL RASTREO DE JONATHAN PARA LA PRUEBA
            console.log("No tienes solicitudes, pero rastrearemos a Jonathan para la demo.");
            rastrearTecnico("JFQnmY9b1GWy9rnE7VaXIICj0pF3");
        }
    });
}

// 4. Rastreo en Tiempo Real (Jonathan) - CORREGIDO
function rastrearTecnico(tecnicoId) {
    onSnapshot(doc(db, "tecnicos", tecnicoId), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        
        if (nombreTecnicoEl) nombreTecnicoEl.innerText = data.nombre || "Jonathan Catana";
        if (vehiculoTecnicoEl) vehiculoTecnicoEl.innerText = `${data.vehiculo || 'Thida'} | ${data.placas || '123456'}`;
        
        if (estadoTecnicoEl) {
            estadoTecnicoEl.innerText = data.estado === "DISPONIBLE" ? "ESPERANDO SOLICITUD" : "TECNICO EN RUTA";
            estadoTecnicoEl.className = data.estado === "DISPONIBLE" ? "text-blue-400 font-black" : "text-emerald-400 font-black animate-pulse";
        }

        // CORRECCIÓN AQUÍ: Leemos desde 'ubicacion' o directamente desde lat/lng
        const lat = data.ubicacion?.lat || data.lat;
        const lng = data.ubicacion?.lng || data.lng;

        if (lat && lng) {
            const pos = { lat: lat, lng: lng };
            marker.setPosition(pos);
            map.panTo(pos);
            console.log("Mapa actualizado en:", pos);
        } else {
            console.warn("El técnico no está enviando coordenadas aún.");
        }
    });
}
