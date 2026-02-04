import { auth, db, onAuthStateChanged } from "./firebase.js";
import { 
    doc, 
    onSnapshot, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let map, marker;

// 1. INICIALIZACIÓN DEL MAPA
function initMap() {
    const mapDiv = document.getElementById("map");
    if (!mapDiv) return;

    const defaultPos = { lat: 21.1619, lng: -86.8515 }; // Cancún por defecto

    map = new google.maps.Map(mapDiv, {
        center: defaultPos,
        zoom: 16,
        disableDefaultUI: true,
        styles: [ // Estilo Dark para que combine con tu UI
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] }
        ]
    });

    marker = new google.maps.Marker({
        position: defaultPos,
        map: map,
        icon: { 
            url: "https://cdn-icons-png.flaticon.com/512/1048/1048329.png", 
            scaledSize: new google.maps.Size(50, 50) 
        }
    });
}

window.onload = initMap;

// 2. BUSCAR SERVICIO ACTIVO DEL CLIENTE
async function buscarServicioActivo(uid) {
    const q = query(
        collection(db, "solicitudes"),
        where("clienteId", "==", uid),
        orderBy("fechaCreacion", "desc"),
        limit(1)
    );

    // Escuchar cambios en la solicitud (por si el admin asigna técnico mientras el cliente ve el mapa)
    onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const solicitud = snapshot.docs[0].data();
            actualizarPanelUI(solicitud);

            if (solicitud.tecnicoId) {
                rastrearTecnico(solicitud.tecnicoId);
            } else {
                document.getElementById("estadoTecnico").innerText = "BUSCANDO TÉCNICO...";
            }
        }
    });
}

// 3. RASTREO EN TIEMPO REAL DEL TÉCNICO
export function rastrearTecnico(tecnicoId) {
    onSnapshot(doc(db, "tecnicos", tecnicoId), (docSnap) => {
        if (!docSnap.exists()) return;

        const t = docSnap.data();
        const pos = { 
            lat: parseFloat(t.lat || t.ubicacion?.lat), 
            lng: parseFloat(t.lng || t.ubicacion?.lng) 
        };

        // Actualizar UI del técnico en el panel
        document.getElementById("nombreTecnico").innerText = t.nombre || "Técnico FixGo";
        document.getElementById("vehiculoTecnico").innerText = `${t.vehiculo || 'Unidad'} | ${t.placas || 'S/P'}`;
        
        if (t.telefono) {
            document.getElementById("btnLlamar").href = `tel:${t.telefono}`;
        }

        if (pos.lat && pos.lng) {
            marker.setPosition(pos);
            map.panTo(pos);
        }
    });
}

// 4. ACTUALIZAR ESTADOS EN EL PANEL
function actualizarPanelUI(solicitud) {
    const txtEstado = document.getElementById("estadoTecnico");
    const dot = document.getElementById("statusDot");
    const badge = document.getElementById("badgeCategoria");
    const iconBox = document.getElementById("iconContainer");

    txtEstado.innerText = solicitud.estado;
    badge.innerText = solicitud.categoria || "GRAL";

    // Cambiar colores según estado
    if (solicitud.estado === "EN_CAMINO") {
        txtEstado.classList.add("text-indigo-400");
        dot.className = "w-2 h-2 rounded-full bg-indigo-400 animate-ping";
        iconBox.classList.replace("bg-indigo-600", "bg-emerald-500");
    } else if (solicitud.estado === "FINALIZADO") {
        txtEstado.className = "text-emerald-400 font-black";
        dot.className = "w-2 h-2 rounded-full bg-emerald-400";
    }
}

// 5. OBSERVAR SESIÓN
onAuthStateChanged(auth, (user) => {
    if (user) {
        buscarServicioActivo(user.uid);
    } else {
        window.location.href = "login.html";
    }
});
