import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k", // Nueva API Key
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    appId: "1:54271811634:web:53a6f4e1f727774e74e64f"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const urlParams = new URLSearchParams(window.location.search);
const tecId = urlParams.get('id');

function initRastreo() {
    const map = new google.maps.Map(document.getElementById("map"), {
        zoom: 15, center: { lat: 21.1619, lng: -86.8515 },
        styles: [{ "elementType": "geometry", "stylers": [{ "color": "#1e293b" }] }],
        disableDefaultUI: true
    });
    let marker;
    if (tecId) {
        onSnapshot(doc(db, "tecnicos", tecId), (docSnap) => {
            if (docSnap.exists()) {
                const d = docSnap.data();
                const pos = { lat: parseFloat(d.lat), lng: parseFloat(d.lng) };
                if (marker) marker.setPosition(pos);
                else marker = new google.maps.Marker({ position: pos, map, icon: { url: "https://img.icons8.com/isometric/50/ffffff/delivery-truck.png", scaledSize: new google.maps.Size(50, 50) }});
                map.panTo(pos);
                document.getElementById('nombreTecnico').innerText = d.nombre;
            }
        });
    }
}
window.onload = initRastreo;
