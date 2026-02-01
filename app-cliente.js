import { auth, db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let map, marker;
const urlParams = new URLSearchParams(window.location.search);
const tecnicoId = urlParams.get('id');

// Estilo modo noche profesional
const darkStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020617" }] }
];

// 1. Control de Acceso y Seguridad
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
                actualizarUI("ERROR", "ID de técnico no encontrado", "SIN ID");
            }
        } else {
            alert("Acceso denegado: No eres cliente ni admin");
            window.location.href = "index.html";
        }
    } catch (error) {
        console.error("Error de autenticación:", error);
    }
});

// 2. Escucha en tiempo real de Firebase
function iniciarSeguimiento(id) {
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Actualización de textos en pantalla
            actualizarUI(data.nombre, `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`, data.estado);

            // Gestión de Coordenadas
            if (data.lat && data.lng) {
                const latitude = parseFloat(data.lat);
                const longitude = parseFloat(data.lng);
                
                if (!isNaN(latitude) && !isNaN(longitude)) {
                    renderizarMapa(latitude, longitude);
                }
            }
        } else {
            actualizarUI("No disponible", "Buscando técnico...", "DESCONECTADO");
        }
    });
}

// 3. Renderizado del Mapa (Con el ajuste de API habilitada)
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
                disableDefaultUI: true,
                gestureHandling: "greedy" // Mejora el uso en móviles
            });

            marker = new google.maps.Marker({
                position: pos,
                map: map,
                icon: {
                    url: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png",
                    scaledSize: new google.maps.Size(45, 45),
                    anchor: new google.maps.Point(22, 22)
                },
                title: "Ubicación del Técnico"
            });

            // Forzar actualización visual tras carga inicial
            google.maps.event.addListenerOnce(map, 'idle', () => {
                google.maps.event.trigger(map, 'resize');
            });

        } else {
            // Movimiento suave del marcador
            marker.setPosition(pos);
            map.panTo(pos);
        }
    } catch (e) {
        console.warn("Google Maps aún se está configurando. Reintentando...");
    }
}

// 4. Función Auxiliar para limpiar el código
function actualizarUI(nombre, info, estado) {
    const elNombre = document.getElementById("nombreTecnico");
    const elInfo = document.getElementById("vehiculoTecnico");
    const elEstado = document.getElementById("estadoTecnico");

    if (elNombre) elNombre.innerText = nombre || "Heberto";
    if (elInfo) elInfo.innerText = info || "Cargando...";
    if (elEstado) elEstado.innerText = estado || "EN RUTA";
}
