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
// Asegúrate de que el contenedor de carga tenga este ID o clase en tu HTML
const loaderPantalla = document.querySelector(".fa-circle-notch")?.parentElement;

let map;
let marker;
let userUID = null;

// 1. Inicializar el Mapa (Google Maps)
function initMap(lat = 21.1619, lng = -86.8515) {
    if (map) return; // Evita duplicar el mapa si ya existe

    const mapOptions = {
        center: { lat, lng },
        zoom: 16,
        disableDefaultUI: true,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
            { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
            { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }
        ]
    };

    map = new google.maps.Map(document.getElementById("map"), mapOptions);

    marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        icon: {
            url: "https://cdn-icons-png.flaticon.com/512/1048/1048329.png", 
            scaledSize: new google.maps.Size(40, 40)
        }
    });
}

// 2. Verificar Sesión
onAuthStateChanged(auth, (user) => {
    if (user) {
        userUID = user.uid;
        // Lanzamos el mapa de inmediato con una ubicación base
        initMap(); 
        buscarServicioActivo();
    } else {
        window.location.href = "login.html";
    }
});

// 3. Buscar Solicitud que ya fue aceptada por Jonathan (u otro técnico)
function buscarServicioActivo() {
    const q = query(
        collection(db, "solicitudes"), 
        where("clienteId", "==", userUID),
        where("estado", "in", ["EN CAMINO", "EN SERVICIO"])
    );

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            if (estadoTecnicoEl) {
                estadoTecnicoEl.innerText = "ESPERANDO QUE UN TÉCNICO ACEPTE...";
                estadoTecnicoEl.className = "text-amber-400 font-bold animate-pulse";
            }
            return;
        }

        const servicio = snapshot.docs[0].data();
        if (servicio.tecnicoId) {
            // Si hay técnico, empezamos a rastrearlo
            rastrearTecnico(servicio.tecnicoId);
            
            // Quitamos el mensaje de "Sincronizando" de la pantalla
            if (loaderPantalla) {
                loaderPantalla.style.display = "none";
            }
        }
    });
}

// 4. Escuchar Ubicación del Técnico en Tiempo Real
function rastrearTecnico(tecnicoId) {
    onSnapshot(doc(db, "tecnicos", tecnicoId), (docSnap) => {
        if (!docSnap.exists()) return;
        
        const data = docSnap.data();
        
        // Actualizar Textos en la UI
        if (nombreTecnicoEl) nombreTecnicoEl.innerText = data.nombre || "Técnico en camino";
        if (vehiculoTecnicoEl) vehiculoTecnicoEl.innerText = `${data.vehiculo || 'UNIDAD'} | ${data.placas || 'S/P'}`;
        if (estadoTecnicoEl) {
            estadoTecnicoEl.innerText = "TÉCNICO LOCALIZADO";
            estadoTecnicoEl.className = "text-emerald-400 font-black";
        }

        // Actualizar Posición en el Mapa
        if (data.lat && data.lng) {
            const pos = { lat: data.lat, lng: data.lng };
            
            // Si el mapa no se había creado por alguna razón, se crea ahora
            if (!map) {
                initMap(pos.lat, pos.lng);
            } else {
                marker.setPosition(pos);
                map.panTo(pos); 
            }
        }
    });
}
