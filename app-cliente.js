import { auth, db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let map, marker;
const urlParams = new URLSearchParams(window.location.search);
const tecnicoId = urlParams.get('id');

// Estilo de Mapa Oscuro "Premium"
const darkStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "elementType": "labels.text.stroke", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "administrative", "elementType": "geometry", "stylers": [{ "color": "#334155" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#334155" }] },
    { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] }
];

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    // 🛡️ VALIDACIÓN DUAL: Permite pasar si es ADMIN o CLIENTE
    const adminSnap = await getDoc(doc(db, "admins", user.uid));
    const clienteSnap = await getDoc(doc(db, "clientes", user.uid));

    if (adminSnap.exists() || clienteSnap.exists()) {
        console.log("Acceso autorizado para rastreo");
        if (tecnicoId) {
            conectarRastreoRealTime(tecnicoId);
        } else {
            alert("No se encontró ID de técnico en la URL.");
        }
    } else {
        alert("❌ No tienes permisos para ver este rastreo.");
        window.location.href = "index.html";
    }
});

function conectarRastreoRealTime(id) {
    // Escucha la posición del técnico en tiempo real
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            actualizarInterfaz(data);
            actualizarMapa(data.lat, data.lng);
        } else {
            document.getElementById("nombreTecnico").innerText = "Unidad no encontrada";
        }
    });
}

function actualizarInterfaz(data) {
    document.getElementById("nombreTecnico").innerText = data.nombre || "Técnico";
    document.getElementById("vehiculoTecnico").innerText = `${data.vehiculo || "Unidad"} | ${data.placas || "S/P"}`;
    document.getElementById("estadoTecnico").innerText = data.estado || "EN RUTA";
    
    // Si tiene teléfono, actualizamos el botón de llamar
    if (data.telefono) {
        document.getElementById("btnLlamar").href = `tel:${data.telefono}`;
    }
}

function actualizarMapa(lat, lng) {
    const pos = { lat: Number(lat), lng: Number(lng) };

    if (!map) {
        // Primera carga del mapa
        map = new google.maps.Map(document.getElementById("map"), {
            center: pos,
            zoom: 17,
            styles: darkStyle,
            disableDefaultUI: true
        });

        // Crear marcador (Camioneta Blanca)
        marker = new google.maps.Marker({
            position: pos,
            map: map,
            icon: {
                url: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png", // Icono profesional
                scaledSize: new google.maps.Size(50, 50)
            }
        });
    } else {
        // Actualización suave de posición
        marker.setPosition(pos);
        map.panTo(pos);
    }
}
