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
let infoWindow; 

function initMap() {
    console.log("🛰️ Central FixGo: Unidades de Alta Visibilidad Activas");
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
    
    infoWindow = new google.maps.InfoWindow();
    conectarFlota();
}

function conectarFlota() {
    const tablaTec = document.getElementById('tablaTecnicos');
    const listaCli = document.getElementById('listaClientes');

    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        tablaTec.innerHTML = "";
        document.getElementById('countTec').innerText = snapshot.size;

        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;

            if (t.lat && t.lng) {
                if (markers[id]) markers[id].setMap(null); 
                
                // USAMOS UN ICONO DE CAMIONETA BLANCA/AMARILLA PARA ALTO CONTRASTE
                const marker = new google.maps.Marker({
                    position: { lat: Number(t.lat), lng: Number(t.lng) },
                    map: map,
                    title: t.nombre,
                    icon: {
                        // Icono de camioneta de servicio blanca (resalta en fondo oscuro)
                        url: "https://cdn-icons-png.flaticon.com/512/3202/3202926.png", 
                        scaledSize: new google.maps.Size(45, 45),
                        anchor: new google.maps.Point(22, 22)
                    },
                    animation: google.maps.Animation.DROP
                });

                marker.addListener("click", () => {
                    const contenido = `
                        <div style="color:#0f172a; padding:12px; font-family:sans-serif; min-width:150px;">
                            <b style="font-size:14px; color:#2563eb;">${t.nombre.toUpperCase()}</b><br>
                            <div style="margin-top:5px; font-size:12px;">
                                🚐 <b>Vehículo:</b> ${t.vehiculo}<br>
                                🆔 <b>ID:</b> ${t.cedula || 'N/A'}<br>
                                📍 <b>Estado:</b> <span style="color:green">EN LINEA</span>
                            </div>
                        </div>`;
                    infoWindow.setContent(contenido);
                    infoWindow.open(map, marker);
                });

                markers[id] = marker;
            }

            tablaTec.innerHTML += `
                <tr class="border-b border-white/5 hover:bg-white/5 transition">
                    <td class="py-5 pl-2">
                        <div class="font-bold text-blue-300 text-base">${t.nombre}</div>
                        <div class="text-[10px] text-slate-500 uppercase tracking-tighter">Técnico Certificado</div>
                    </td>
                    <td class="py-5">
                        <div class="text-white font-medium text-xs">${t.vehiculo}</div>
                        <div class="text-[10px] text-blue-500/70 font-black">${t.placas || '---'}</div>
                    </td>
                    <td class="py-5 text-right pr-2">
                        <button onclick="eliminarRegistro('tecnicos', '${id}')" class="bg-red-500/10 p-2 rounded-xl text-red-500 hover:bg-red-600 hover:text-white transition shadow-lg shadow-red-500/10">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
        });
    });

    onSnapshot(collection(db, "clientes"), (snapshot) => {
        listaCli.innerHTML = "";
        document.getElementById('countCli').innerText = snapshot.size;
        
        snapshot.forEach((docSnap) => {
            const c = docSnap.data();
            const id = docSnap.id;
            listaCli.innerHTML += `
                <div class="bg-white/5 p-5 rounded-2xl flex justify-between items-center border border-white/5 shadow-inner">
                    <div class="flex items-center gap-4">
                        <div class="bg-indigo-500/20 w-10 h-10 rounded-full flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                            <i class="fas fa-user-check text-xs"></i>
                        </div>
                        <div>
                            <p class="font-bold text-sm text-indigo-100">${c.nombre}</p>
                            <p class="text-[10px] text-slate-400 font-mono">${c.telefono} • ${c.direccion}</p>
                        </div>
                    </div>
                    <button onclick="eliminarRegistro('clientes', '${id}')" class="text-slate-600 hover:text-red-500 transition-colors">
                        <i class="fas fa-times-circle text-xl"></i>
                    </button>
                </div>`;
        });
    });
}

window.eliminarRegistro = async function(coleccion, id) {
    if (confirm("⚠️ ¿ELIMINAR ESTE REGISTRO? Esta acción no se puede deshacer.")) {
        try {
            if (markers[id]) {
                markers[id].setMap(null);
                delete markers[id];
            }
            await deleteDoc(doc(db, coleccion, id));
        } catch (e) { console.error("Error al borrar:", e); }
    }
}

window.addEventListener('load', () => {
    const loader = setInterval(() => {
        if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
            initMap();
            clearInterval(loader);
        }
    }, 1000);
});
