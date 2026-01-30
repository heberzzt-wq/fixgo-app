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
    console.log("🛠️ Reiniciando Mapa: Modo Rescate");
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.1619, lng: -86.8515 },
        zoom: 13,
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
        if (tablaTec) tablaTec.innerHTML = "";
        
        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            // REGLA DE ORO: Si hay coordenadas, hay marcador. Sin excusas.
            if (t.lat && t.lng) {
                // Limpiamos marcador previo si existe
                if (markers[id]) markers[id].setMap(null); 

                // Forzamos el uso de una camioneta blanca básica para asegurar visibilidad
                const iconoFinal = "https://img.icons8.com/isometric/50/ffffff/delivery-truck.png";

                markers[id] = new google.maps.Marker({
                    position: { lat: Number(t.lat), lng: Number(t.lng) },
                    map: map,
                    icon: { 
                        url: iconoFinal, 
                        scaledSize: new google.maps.Size(45, 45) 
                    },
                    title: t.nombre || "Técnico FixGo"
                });
            }

            // Actualizamos la tabla lateral
            if (tablaTec) {
                tablaTec.innerHTML += `
                <tr class="border-b border-white/5">
                    <td class="py-4">
                        <div class="font-bold text-blue-300">${t.nombre || 'Pedro'}</div>
                        <div class="text-[10px] uppercase text-slate-500">${t.estado || 'ACTIVO'}</div>
                    </td>
                    <td class="py-4 text-slate-400 text-xs">${t.vehiculo || 'Unidad'}</td>
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
    if (confirm("🚨 ¿Eliminar este registro?")) {
        try {
            if (markers[id]) markers[id].setMap(null);
            await deleteDoc(doc(db, coleccion, id));
        } catch (e) { console.error(e); }
    }
}

// Inicialización limpia
window.addEventListener('load', () => {
    const checkGoogle = setInterval(() => {
        if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
            initMap();
            clearInterval(checkGoogle);
        }
    }, 1000);
});
