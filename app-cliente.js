import { auth, db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let map, marker;
const urlParams = new URLSearchParams(window.location.search);
const tecnicoId = urlParams.get('id');

// Estilo de Mapa Oscuro (Profesional)
const darkStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020617" }] }
];

// 1. Verificación de Usuario
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
            alert("Acceso denegado");
            window.location.href = "index.html";
        }
    } catch (e) { console.error("Error de auth:", e); }
});

// 2. Escucha de Firebase en tiempo real
function iniciarSeguimiento(id) {
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Actualizar interfaz
            actualizarTexto("nombreTecnico", data.nombre || "Heberto");
            actualizarTexto("vehiculoTecnico", `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`);
            actualizarTexto("estadoTecnico", data.estado || "EN RUTA");

            // Validar y convertir coordenadas
            if (data.lat && data.lng) {
                const lat = parseFloat(data.lat);
                const lng = parseFloat(data.lng);
                if (!isNaN(lat) && !isNaN(lng)) {
                    renderizarMapa(lat, lng);
                }
            }
        }
    });
}

// 3. Motor del Mapa
function renderizarMapa(lat, lng) {
    const pos = { lat, lng };

    try {
        if (!map) {
            const mapDiv = document.getElementById("map");
            if (!mapDiv) return;

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

            // Quitar el color rojo de fondo una vez que el mapa cargue
            google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
                mapDiv.style.background = "transparent";
            });

        } else {
            marker.setPosition(pos);
            map.panTo(pos);
        }
    } catch (error) {
        console.log("Esperando a Google Maps API...");
    }
}

function actualizarTexto(id, texto) {
    const el = document.getElementById(id);
    if (el) el.innerText = texto;
}import { auth, db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let map, marker;
const urlParams = new URLSearchParams(window.location.search);
const tecnicoId = urlParams.get('id');

// Estilo de Mapa Oscuro (Profesional)
const darkStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020617" }] }
];

// 1. Verificación de Usuario
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
            alert("Acceso denegado");
            window.location.href = "index.html";
        }
    } catch (e) { console.error("Error de auth:", e); }
});

// 2. Escucha de Firebase en tiempo real
function iniciarSeguimiento(id) {
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Actualizar interfaz
            actualizarTexto("nombreTecnico", data.nombre || "Heberto");
            actualizarTexto("vehiculoTecnico", `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`);
            actualizarTexto("estadoTecnico", data.estado || "EN RUTA");

            // Validar y convertir coordenadas
            if (data.lat && data.lng) {
                const lat = parseFloat(data.lat);
                const lng = parseFloat(data.lng);
                if (!isNaN(lat) && !isNaN(lng)) {
                    renderizarMapa(lat, lng);
                }
            }
        }
    });
}

// 3. Motor del Mapa
function renderizarMapa(lat, lng) {
    const pos = { lat, lng };

    try {
        if (!map) {
            const mapDiv = document.getElementById("map");
            if (!mapDiv) return;

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

            // Quitar el color rojo de fondo una vez que el mapa cargue
            google.maps.event.addListenerOnce(map, 'tilesloaded', () => {
                mapDiv.style.background = "transparent";
            });

        } else {
            marker.setPosition(pos);
            map.panTo(pos);
        }
    } catch (error) {
        console.log("Esperando a Google Maps API...");
    }
}

function actualizarTexto(id, texto) {
    const el = document.getElementById(id);
    if (el) el.innerText = texto;
}
