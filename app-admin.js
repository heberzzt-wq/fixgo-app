import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k",
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    appId: "1:54271811634:web:53a6f4e1f727774e74e64f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let map;
let markers = {}; 

window.initMap = function() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 21.1619, lng: -86.8515 },
        zoom: 12,
        styles: [{ "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] }],
        disableDefaultUI: true
    });
    escucharFlota();
};

function escucharFlota() {
    onSnapshot(collection(db, "tecnicos"), (snapshot) => {
        snapshot.forEach((docSnap) => {
            const t = docSnap.data();
            const id = docSnap.id;
            const lat = Number(t.lat);
            const lng = Number(t.lng);

            if (!isNaN(lat) && !isNaN(lng)) {
                // Si el técnico ya tiene marcador, lo actualizamos; si no, lo creamos
                if (markers[id]) {
                    markers[id].setPosition({ lat, lng });
                } else {
                    markers[id] = new google.maps.Marker({
                        position: { lat, lng },
                        map: map,
                        title: t.nombre,
                        icon: {
                            // ICONO: Camioneta Blanca (Estilo Isometric)
                            url: "https://img.icons8.com/isometric/50/ffffff/delivery-truck.png", 
                            scaledSize: new google.maps.Size(45, 45),
                            anchor: new google.maps.Point(22, 22)
                        }
                    });
                }
            }
        });
    });
}
