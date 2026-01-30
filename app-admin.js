import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, doc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k", // Nueva API Key aplicada
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
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.1619, lng: -86.8515 },
        zoom: 12,
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
            const lat = parseFloat(t.lat);
            const lng = parseFloat(t.lng);

            if (!isNaN(lat) && !isNaN(lng)) {
                if (markers[id]) markers[id].setMap(null); 

                // Icono por estado. Azul para "ACTIVO" (como está Pedro ahora)
                let urlIcono = "https://img.icons8.com/isometric/50/ffffff/delivery-truck.png"; 
                if (t.estado === "ACTIVO") urlIcono = "https://img.icons8.com/isometric/50/38bdf8/delivery-truck.png";
                if (t.estado === "DISPONIBLE") urlIcono = "https://img.icons8.com/isometric/50/22c55e/delivery-truck.png";
                if (t.estado === "EN SERVICIO") urlIcono = "https://img.icons8.com/isometric/50/f97316/delivery-truck.png";

                markers[id] = new google.maps.Marker({
                    position: { lat, lng },
                    map: map,
                    icon: { url: urlIcono, scaledSize: new google.maps.Size(45, 45) },
                    title: t.nombre
                });
            }
            if (tablaTec) {
                tablaTec.innerHTML += `
                <tr class="border-b border-white/5">
                    <td class="py-4 font-bold text-blue-400">${t.nombre || 'Técnico'}</td>
                    <td class="py-4 text-slate-400 text-xs">${t.vehiculo || 'Unidad'} <br> <span class="text-blue-500 text-[9px]">${t.estado || ''}</span></td>
                    <td class="py-4 text-right">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="text-red-500/20 hover:text-red-500"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>`;
            }
        });
    });
}

window.addEventListener('load', () => {
    const loader = setInterval(() => {
        if (typeof google !== 'undefined') { initMap(); clearInterval(loader); }
    }, 1000);
});
