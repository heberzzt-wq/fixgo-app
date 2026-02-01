import { auth, db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let map, marker;
const urlParams = new URLSearchParams(window.location.search);
const tecnicoId = urlParams.get('id');

const darkStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020617" }] }
];

onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    
    // Verificación de acceso
    const [adminSnap, clienteSnap] = await Promise.all([
        getDoc(doc(db, "admins", user.uid)),
        getDoc(doc(db, "clientes", user.uid))
    ]);

    if (adminSnap.exists() || clienteSnap.exists()) {
        if (tecnicoId) iniciarSeguimiento(tecnicoId);
    } else {
        window.location.href = "index.html";
    }
});

function iniciarSeguimiento(id) {
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Actualización de UI
            document.getElementById("nombreTecnico").innerText = data.nombre || "Técnico";
            document.getElementById("vehiculoTecnico").innerText = `${data.vehiculo || 'Unidad'} | ${data.placas || '---'}`;
            document.getElementById("estadoTecnico").innerText = data.estado || "EN RUTA";

            if (data.lat && data.lng) {
                const lat = parseFloat(data.lat);
                const lng = parseFloat(data.lng);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    dibujarMapa(lat, lng);
                }
            }
        }
    });
}

function dibujarMapa(lat, lng) {
    const pos = { lat, lng };

    if (!map) {
        const mapDiv = document.getElementById("map");
        
        // Creamos el mapa
        map = new google.maps.Map(mapDiv, {
            center: pos,
            zoom: 17,
            styles: darkStyle,
            disableDefaultUI: true
        });

        marker = new google.maps.Marker({
            position: pos,
            map: map,
            icon: {
                url: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png",
                scaledSize: new google.maps.Size(45, 45)
            }
        });

        // Forzar a Google a re-dibujar por si el div estaba oculto
        google.maps.event.trigger(map, "resize");
    } else {
        marker.setPosition(pos);
        map.panTo(pos);
    }
}
