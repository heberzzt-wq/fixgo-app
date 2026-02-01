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

// 1. Verificación de permisos de usuario
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    
    try {
        const [adminSnap, clienteSnap] = await Promise.all([
            getDoc(doc(db, "admins", user.uid)),
            getDoc(doc(db, "clientes", user.uid))
        ]);

        if (adminSnap.exists() || clienteSnap.exists()) {
            if (tecnicoId) {
                iniciarSeguimiento(tecnicoId);
            } else {
                actualizarTextos("Selecciona Unidad", "ID no encontrado", "ERROR");
            }
        } else {
            alert("Acceso no autorizado");
            window.location.href = "index.html";
        }
    } catch (error) {
        console.error("Error en autenticación:", error);
    }
});

// 2. Escucha de Firebase (Datos en tiempo real)
function iniciarSeguimiento(id) {
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Actualizar interfaz visual
            actualizarTextos(
                data.nombre || "Técnico", 
                `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`, 
                data.estado || "EN RUTA"
            );

            // Procesar ubicación
            if (data.lat && data.lng) {
                const latitude = parseFloat(data.lat);
                const longitude = parseFloat(data.lng);
                
                if (!isNaN(latitude) && !isNaN(longitude)) {
                    renderizarMapa(latitude, longitude);
                }
            }
        }
    });
}

// 3. Inicialización y movimiento del mapa
function renderizarMapa(lat, lng) {
    const pos = { lat, lng };
    const mapDiv = document.getElementById("map");

    if (!map) {
        if (typeof google === 'undefined') return; // Espera a que la API cargue

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
    } else {
        // Actualización fluida del marcador
        marker.setPosition(pos);
        map.panTo(pos);
    }
}

// Función para evitar repetir document.getElementById
function actualizarTextos(nombre, vehiculo, estado) {
    const n = document.getElementById("nombreTecnico");
    const v = document.getElementById("vehiculoTecnico");
    const e = document.getElementById("estadoTecnico");

    if (n) n.innerText = nombre;
    if (v) v.innerText = vehiculo;
    if (e) e.innerText = estado;
}
