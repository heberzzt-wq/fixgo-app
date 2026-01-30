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
    console.log("🚀 Iniciando Mapa Forzado...");
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.1619, lng: -86.8515 },
        zoom: 12, // Un poco más lejos para ver todo
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] },
            { "elementType": "labels.text.fill", "stylers": [{ "color": "#94a3b8" }] },
            { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#0f172a" }] }
        ],
        disableDefaultUI: true,
        zoomControl: true
    });
    conectarFlota();
}

function conectarFlota() {
    const tablaTec = document.getElementById('tablaTecnicos');
    
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        console.log("📡 Datos recibidos de Firebase:", snapshot.size);
        if (tablaTec) tablaTec.innerHTML = "";
        
        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            // REGRESO A LO BÁSICO: Si tiene latitud, se dibuja SÍ O SÍ
            if (t.lat && t.lng) {
                console.log("📍 Dibujando a:", t.nombre, t.lat, t.lng);
                
                if (markers[id]) markers[id].setMap(null); 

                // Elegimos color, pero si falla algo, siempre será BLANCO
                let urlIcono = "https://img.icons8.com/isometric/50/ffffff/delivery-truck.png";
                
                const estadoLimpio = t.estado ? t.estado.toUpperCase() : "";
                
                if (estadoLimpio === "ACTIVO") urlIcono = "https://img.icons8.com/isometric/50/38bdf8/delivery-truck.png";
                if (estadoLimpio === "DISPONIBLE") urlIcono = "https://img.icons8.com/isometric/50/22c55e/delivery-truck.png";
                if (estadoLimpio === "EN SERVICIO") urlIcono = "https://img.icons8.com/isometric/50/f97316/delivery-truck.png";

                markers[id] = new google.maps.Marker({
                    position: { lat: parseFloat(t.lat), lng: parseFloat(t.lng) },
                    map: map,
                    icon: { url: urlIcono, scaledSize: new google.maps.Size(45, 45) },
                    title: t.nombre || "Técnico"
                });
            }

            if (tablaTec) {
                tablaTec.innerHTML += `
                <tr class="border-b border-white/5">
                    <td class="py-4">
                        <div class="font-bold text-white">${t.nombre || 'Sin nombre'}</div>
                        <div class="text-[10px] uppercase text-blue-400">${t.estado || 'SIN ESTADO'}</div>
                    </td>
                    <td class="py-4 text-slate-400 text-xs">${t.vehiculo || 'No asignado'}</td>
                    <td class="py-4 text-right">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="text-red-500/20 hover:text-red-500">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
            }
        });
    });
}

window.eliminarRegistro = async function(coleccion, id) {
    if (confirm("🚨 ¿Eliminar registro?")) {
        try {
            if (markers[id]) markers[id].setMap(null);
            await deleteDoc(doc(db, coleccion, id));
        } catch (e) { console.error(e); }
    }
}

// Cargador ultra-seguro
window.onload = () => {
    const loader = setInterval(() => {
        if (typeof google !== 'undefined') {
            initMap();
            clearInterval(loader);
        }
    }, 1000);
};
