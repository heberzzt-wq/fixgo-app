import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDyplCp33LneGhqr6yd1VsIYBMdsLDK7gA",
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "54271811634",
    appId: "1:54271811634:web:53a6f4e1f727774e74e64f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let map;
let markers = {}; 

function initMap() {
    // Centro inicial en Cancún
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.1619, lng: -86.8515 },
        zoom: 12,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#020617" }] }
        ],
        disableDefaultUI: true,
        zoomControl: true
    });
    conectarFlota();
}

function conectarFlota() {
    const tablaTec = document.getElementById('tablaTecnicos');
    
    // Escucha directa sin filtros de estado
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        if (tablaTec) tablaTec.innerHTML = "";
        
        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            // VALIDACIÓN ÚNICA: ¿Tiene coordenadas válidas?
            const lat = parseFloat(t.lat);
            const lng = parseFloat(t.lng);

            if (!isNaN(lat) && !isNaN(lng)) {
                // Borrar marcador viejo si existe para evitar duplicados
                if (markers[id]) {
                    markers[id].setMap(null);
                }

                // Creamos el marcador SIEMPRE (Color blanco para máxima visibilidad)
                markers[id] = new google.maps.Marker({
                    position: { lat: lat, lng: lng },
                    map: map,
                    icon: { 
                        url: "https://img.icons8.com/isometric/50/ffffff/delivery-truck.png", 
                        scaledSize: new google.maps.Size(40, 40) 
                    },
                    title: t.nombre || "Técnico"
                });
            }

            // Llenado de tabla (Inmune a errores de campo)
            if (tablaTec) {
                tablaTec.innerHTML += `
                <tr class="border-b border-white/5 hover:bg-white/5 transition">
                    <td class="py-4 font-bold text-blue-400 text-sm">
                        ${t.nombre || 'Sin nombre'}
                    </td>
                    <td class="py-4 text-slate-400 text-xs">
                        ${t.vehiculo || 'Unidad'} <br>
                        <span class="text-[10px] text-emerald-500">${t.estado || 'En línea'}</span>
                    </td>
                    <td class="py-4 text-right">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="text-red-500/20 hover:text-red-500 p-2">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
            }
        });
    });
}

// Función global de borrado
window.eliminarRegistro = async function(coleccion, id) {
    if (confirm("¿Eliminar registro del mapa y la base de datos?")) {
        try {
            if (markers[id]) markers[id].setMap(null);
            await deleteDoc(doc(db, coleccion, id));
        } catch (e) { console.error("Error al eliminar:", e); }
    }
}

// Inicialización por evento de carga
window.addEventListener('load', () => {
    const timer = setInterval(() => {
        if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
            initMap();
            clearInterval(timer);
        }
    }, 1000);
});
