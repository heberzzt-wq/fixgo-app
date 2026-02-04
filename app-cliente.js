import { auth, db, onAuthStateChanged } from "./firebase.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let map, marker;

// 1. FORZAR INICIALIZACIÓN (Independiente de Firebase)
function initMap() {
    const mapDiv = document.getElementById("map");
    if (!mapDiv) return console.error("No se encontró el div #map");

    // Coordenadas por defecto (Cancún)
    const defaultPos = { lat: 21.1619, lng: -86.8515 };

    map = new google.maps.Map(mapDiv, {
        center: defaultPos,
        zoom: 15,
        disableDefaultUI: true,
        mapId: "YOUR_MAP_ID" // Opcional, pero ayuda con AdvancedMarkers
    });

    marker = new google.maps.Marker({
        position: defaultPos,
        map: map,
        title: "Buscando técnico...",
        icon: { 
            url: "https://cdn-icons-png.flaticon.com/512/1048/1048329.png", 
            scaledSize: new google.maps.Size(40, 40) 
        }
    });
    console.log("Mapa cargado correctamente.");
}

// Asegurar que el mapa cargue apenas abra la página
window.onload = initMap;

// 2. ESCUCHA DE DATOS (Solo si existen)
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Usuario detectado, buscando servicios...");
        // Aquí llamas a tu función de buscarServicioActivo()
    } else {
        console.warn("Sin sesión. Mapa en modo espera.");
    }
});

// Función de rastreo protegida contra errores de datos vacíos
export function rastrearTecnico(tecnicoId) {
    if (!tecnicoId) return;

    onSnapshot(doc(db, "tecnicos", tecnicoId), (docSnap) => {
        if (!docSnap.exists()) {
            console.error("El técnico no existe en la base de datos.");
            return;
        }

        const data = docSnap.data();
        const pos = { 
            lat: parseFloat(data.lat || data.ubicacion?.lat), 
            lng: parseFloat(data.lng || data.ubicacion?.lng) 
        };

        if (pos.lat && pos.lng) {
            marker.setPosition(pos);
            map.panTo(pos);
        }
    });
}
