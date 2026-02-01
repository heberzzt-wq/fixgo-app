// app-cliente.js - Versión Final (Admin + Cliente)
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
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const adminSnap = await getDoc(doc(db, "admins", user.uid));
        const clienteSnap = await getDoc(doc(db, "clientes", user.uid));

        if (adminSnap.exists() || clienteSnap.exists()) {
            if (tecnicoId) {
                iniciarSeguimiento(tecnicoId);
            } else {
                actualizarTextoSeguro("nombreTecnico", "Selecciona una unidad");
            }
        } else {
            alert("❌ Acceso no autorizado");
            window.location.href = "index.html";
        }
    } catch (error) {
        console.error("Error en permisos:", error);
    }
});

function iniciarSeguimiento(id) {
    onSnapshot(doc(db, "tecnicos", id), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            actualizarTextoSeguro("nombreTecnico", data.nombre || "Técnico");
            actualizarTextoSeguro("vehiculoTecnico", `${data.vehiculo || "Unidad"} | ${data.placas || "S/P"}`);
            actualizarTextoSeguro("estadoTecnico", data.estado || "EN RUTA");

            const btnLlamar = document.getElementById("btnLlamar");
            if (btnLlamar && data.telefono) {
                btnLlamar.href = `tel:${data.telefono}`;
            }

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

function renderizarMapa(lat, lng) {
    const pos = { lat, lng };

    try {
        if (!map) {
            const mapDiv = document.getElementById("map");
            if (!mapDiv) return;

            // El delay ayuda a que el mapa no se quede negro en la carga inicial
            setTimeout(() => {
                map = new google.maps.Map(mapDiv, {
                    center: pos,
                    zoom: 17,
                    styles: darkStyle,
                    disableDefaultUI: true,
                    gestureHandling: "greedy"
                });

                marker = new google.maps.Marker({
                    position: pos,
                    map: map,
                    icon: {
                        url: "https://cdn-icons-png.flaticon.com/512/3063/3063822.png",
                        scaledSize: new google.maps.Size(45, 45)
                    }
                });
            }, 100);
        } else {
            marker.setPosition(pos);
            map.panTo(pos);
        }
    } catch (err) {
        console.error("Error cargando Google Maps:", err);
    }
}

function actualizarTextoSeguro(id, texto) {
    const elemento = document.getElementById(id);
    if (elemento) {
        elemento.innerText = texto;
    }
}
