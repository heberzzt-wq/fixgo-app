import { auth, db } from "./firebase-config.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

let map, marker;
const urlParams = new URLSearchParams(window.location.search);
const tecnicoId = urlParams.get('id');

// Estilo de Mapa Oscuro (para que combine con tu diseño Slate-900)
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
        // 🛡️ REVISIÓN DE PERMISOS (Admin o Cliente pueden ver)
        const adminSnap = await getDoc(doc(db, "admins", user.uid));
        const clienteSnap = await getDoc(doc(db, "clientes", user.uid));

        if (adminSnap.exists() || clienteSnap.exists()) {
            if (tecnicoId) {
                iniciarSeguimiento(tecnicoId);
            } else {
                document.getElementById("nombreTecnico").innerText = "Selecciona una unidad";
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
            
            // Actualizar Interfaz (IDs de tu HTML)
            if(document.getElementById("nombreTecnico")) 
                document.getElementById("nombreTecnico").innerText = data.nombre || "Técnico";
            if(document.getElementById("vehiculoTecnico")) 
                document.getElementById("vehiculoTecnico").innerText = `${data.vehiculo || "Unidad"} | ${data.placas || "S/P"}`;
            if(document.getElementById("estadoTecnico")) 
                document.getElementById("estadoTecnico").innerText = data.estado || "SINCRONIZANDO...";

            // Actualizar posición en el mapa
            if (data.lat && data.lng) {
                moverIcono(data.lat, data.lng);
            }
        }
    });
}

function moverIcono(lat, lng) {
    const pos = { lat: Number(lat), lng: Number(lng) };

    if (!map) {
        map = new google.maps.Map(document.getElementById("map"), {
            center: pos,
            zoom: 17,
            styles: darkStyle,
            disableDefaultUI: true
        });

        marker = new google.maps.Marker({
            position: pos,
            map: map,
            icon: {
                url: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png", // Icono de camioneta
                scaledSize: new google.maps.Size(45, 45)
            }
        });
    } else {
        marker.setPosition(pos);
        map.panTo(pos);
    }
}
