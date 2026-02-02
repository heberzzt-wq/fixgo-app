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
const loaderPantalla = document.querySelector(".fa-circle-notch")?.parentElement;

let map;
let marker;
let userUID = null;

// 1. Inicializar el Mapa (Google Maps)
function initMap(lat = 21.1619, lng = -86.8515) {
    if (map) return; 

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

    const mapElement = document.getElementById("map");
    if (mapElement) {
        map = new google.maps.Map(mapElement, mapOptions);
        marker = new google.maps.Marker({
            position: { lat, lng },
            map: map,
            icon: {
                url: "https://cdn-icons-png.flaticon.com/512/1048/1048329.png", 
                scaledSize: new google.maps.Size(40, 40)
            }
        });
    }
}

// 2. Verificar Sesión con validación de "No Rebote"
onAuthStateChanged(auth, async (user) => {
    if (user) {
        userUID = user.uid;
        console.log("Usuario detectado:", userUID);
        
        // Verificamos si existe en la colección clientes antes de actuar
        const clienteDoc = await getDoc(doc(db, "clientes", userUID));
        
        if (clienteDoc.exists()) {
            initMap(); 
            buscarServicioActivo();
        } else {
            console.warn("El UID no está en la colección 'clientes'. Revisa Firebase.");
            // En lugar de botarte, mostramos el mapa por defecto para que no se vea roto
            initMap();
            if (estadoTecnicoEl) estadoTecnicoEl.innerText = "ERROR: PERFIL NO REGISTRADO";
        }
    } else {
        // Solo enviamos al login si realmente no hay una sesión de Firebase activa
        console.log("No hay sesión activa, redirigiendo...");
        window.location.href = "login.html";
    }
});

// 3. Buscar Solicitud activa
function buscarServicioActivo() {
    const q = query(
        collection(db, "solicitudes"), 
        where("clienteId", "==", userUID),
        where("estado", "in", ["EN CAMINO", "EN SERVICIO"])
    );

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            if (estadoTecnicoEl) {
                estadoTecnicoEl.innerText = "BUSCANDO TÉCNICOS CERCANOS...";
                estadoTecnicoEl.className = "text-amber-400 font-bold animate-pulse";
            }
            return;
        }

        const servicio = snapshot.docs[0].data();
        if (servicio.tecnicoId) {
            rastrearTecnico(servicio.tecnicoId);
            if (loaderPantalla) loaderPantalla.style.display = "none";
        }
    });
}

// 4. Escuchar Ubicación del Técnico
function rastrearTecnico(tecnicoId) {
    onSnapshot(doc(db, "tecnicos", tecnicoId), (docSnap) => {
        if (!docSnap.exists()) return;
        
        const data = docSnap.data();
        
        if (nombreTecnicoEl) nombreTecnicoEl.innerText = data.nombre || "Jonathan Catana";
        if (vehiculoTecnicoEl) vehiculoTecnicoEl.innerText = `${data.vehiculo || 'UNIDAD'} | ${data.placas || 'S/P'}`;
        if (estadoTecnicoEl) {
            estadoTecnicoEl.innerText = "TÉCNICO EN RUTA";
            estadoTecnicoEl.className = "text-emerald-400 font-black";
        }

        if (data.lat && data.lng) {
            const pos = { lat: data.lat, lng: data.lng };
            if (!map) {
                initMap(pos.lat, pos.lng);
            } else {
                marker.setPosition(pos);
                map.panTo(pos); 
            }
        }
    });
}
