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
    try {
        const [adminSnap, clienteSnap] = await Promise.all([
            getDoc(doc(db, "admins", user.uid)),
            getDoc(doc(db, "clientes", user.uid))
        ]);

        if (adminSnap.exists() || clienteSnap.exists()) {
            if (tecnicoId) iniciarSeguimiento(tecnicoId);
        } else {
            window.location.href = "index.html";
        }
    } catch (e) { console.error(e); }
});

function iniciarSeguimiento(id) {
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            actualizarTextoSeguro("nombreTecnico", data.nombre);
            actualizarTextoSeguro("vehiculoTecnico", `${data.vehiculo} | ${data.placas}`);
            actualizarTextoSeguro("estadoTecnico", data.estado);

            if (data.lat && data.lng) {
                const lat = parseFloat(data.lat);
                const lng = parseFloat(data.lng);
                if (!isNaN(lat) && !isNaN(lng)) renderizarMapa(lat, lng);
            }
        }
    });
}

function renderizarMapa(lat, lng) {
    const pos = { lat, lng };
    const mapDiv = document.getElementById("map");

    if (!map) {
        // CREACIÓN DEL MAPA CON PROTOCOLO DE ESPERA
        map = new google.maps.Map(mapDiv, {
            center: pos,
            zoom: 17,
            styles: darkStyle,
            disableDefaultUI: true,
            backgroundColor: 'transparent'
        });

        marker = new google.maps.Marker({
            position: pos,
            map: map,
            icon: {
                url: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png",
                scaledSize: new google.maps.Size(45, 45)
            }
        });

        // ESTO ES CLAVE: Forzar a Google Maps a recalcular su tamaño
        google.maps.event.addListenerOnce(map, 'idle', () => {
            google.maps.event.trigger(map, 'resize');
            map.setCenter(pos);
        });
    } else {
        marker.setPosition(pos);
        map.panTo(pos);
    }
}

function actualizarTextoSeguro(id, texto) {
    const el = document.getElementById(id);
    if (el && texto) el.innerText = texto;
}
