import { auth, db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let map, marker;
const urlParams = new URLSearchParams(window.location.search);
const tecnicoId = urlParams.get('id');

// Estilo de Mapa Oscuro (Mantenemos tu diseño Slate-900)
const darkStyle = [
    { "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
    { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
    { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
    { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020617" }] }
];

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        // 🛡️ REVISIÓN DE PERMISOS (Corregido para que tú como Admin entres)
        const adminSnap = await getDoc(doc(db, "admins", user.uid));
        const clienteSnap = await getDoc(doc(db, "clientes", user.uid));

        if (adminSnap.exists() || clienteSnap.exists()) {
            if (tecnicoId) {
                iniciarSeguimiento(tecnicoId);
            } else {
                const elNombre = document.getElementById("nombreTecnico");
                if (elNombre) elNombre.innerText = "Selecciona una unidad";
            }
        } else {
            alert("❌ Acceso no autorizado");
            window.location.href = "index.html";
        }
    } catch (error) {
        console.error("Error de permisos:", error);
    }
});

function iniciarSeguimiento(id) {
    // Escuchar cambios del técnico en tiempo real
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // ✅ ACTUALIZACIÓN SEGURA: Verificamos que el ID exista antes de escribir
            const txtNombre = document.getElementById("nombreTecnico");
            const txtVehiculo = document.getElementById("vehiculoTecnico");
            const txtEstado = document.getElementById("estadoTecnico");
            const btnLlamar = document.getElementById("btnLlamar");

            if(txtNombre) txtNombre.innerText = data.nombre || "Técnico";
            if(txtVehiculo) txtVehiculo.innerText = `${data.vehiculo || "Unidad"} | ${data.placas || "S/P"}`;
            if(txtEstado) txtEstado.innerText = data.estado || "SINCRONIZANDO...";
            
            // Si el técnico tiene teléfono en su perfil de Firebase, activamos el botón
            if(btnLlamar && data.telefono) {
                btnLlamar.href = `tel:${data.telefono}`;
            }

            // Actualizar posición en el mapa
            if (data.lat && data.lng) {
                moverIcono(data.lat, data.lng);
            }
        }
    });
}

function moverIcono(lat, lng) {
    // Forzamos que sean números para evitar errores de Google Maps
    const pos = { lat: parseFloat(lat), lng: parseFloat(lng) };

    if (!map) {
        const mapElement = document.getElementById("map");
        if (!mapElement) return; // Si no hay div 'map', no hacemos nada

        map = new google.maps.Map(mapElement, {
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
        marker.setPosition(pos);
        map.panTo(pos);
    }
}
