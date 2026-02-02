import { auth, db, onAuthStateChanged } from "./firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    onSnapshot, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const nombreTecnicoEl = document.getElementById("nombreTecnico");
const vehiculoTecnicoEl = document.getElementById("vehiculoTecnico");
const estadoTecnicoEl = document.getElementById("estadoTecnico");

let map, marker, userUID = null;

function initMap(lat = 21.1619, lng = -86.8515) {
    if (map) return;
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat, lng },
        zoom: 16,
        disableDefaultUI: true,
        styles: [
            { "elementType": "geometry", "stylers": [{ "color": "#212121" }] },
            { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] }
        ]
    });
    marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        icon: { url: "https://cdn-icons-png.flaticon.com/512/1048/1048329.png", scaledSize: new google.maps.Size(40, 40) }
    });
}

// LÓGICA DE SESIÓN SIN REBOTE AGRESIVO
onAuthStateChanged(auth, async (user) => {
    if (user) {
        userUID = user.uid;
        console.log("Sesión activa:", userUID);
        initMap(); // Cargamos el mapa de una vez
        
        try {
            // Intentamos verificar si es cliente, pero NO lo botamos si falla
            const docRef = doc(db, "clientes", userUID);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                if (estadoTecnicoEl) estadoTecnicoEl.innerText = "Buscando técnico...";
                buscarServicioActivo();
            } else {
                console.warn("UID no encontrado en colección 'clientes'.");
                if (estadoTecnicoEl) estadoTecnicoEl.innerText = "Perfil en revisión...";
                // Intentamos buscar servicio de todos modos por si las dudas
                buscarServicioActivo();
            }
        } catch (err) {
            console.error("Error en validación:", err);
        }
    } else {
        console.log("Sin sesión. Redirigiendo en 3 segundos...");
        if (estadoTecnicoEl) estadoTecnicoEl.innerText = "Inicia sesión...";
        // Damos un margen de 3 segundos antes de botar para evitar bucles falsos
        setTimeout(() => { if(!auth.currentUser) window.location.href = "login.html"; }, 3000);
    }
});

function buscarServicioActivo() {
    const q = query(
        collection(db, "solicitudes"), 
        where("clienteId", "==", userUID),
        where("estado", "in", ["EN CAMINO", "EN SERVICIO"])
    );

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) return;
        const servicio = snapshot.docs[0].data();
        if (servicio.tecnicoId) rastrearTecnico(servicio.tecnicoId);
    });
}

function rastrearTecnico(tecnicoId) {
    onSnapshot(doc(db, "tecnicos", tecnicoId), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        
        if (nombreTecnicoEl) nombreTecnicoEl.innerText = data.nombre || "Jonathan Catana";
        if (vehiculoTecnicoEl) vehiculoTecnicoEl.innerText = `${data.vehiculo || 'Unidad'} | ${data.placas || 'S/P'}`;
        if (estadoTecnicoEl) {
            estadoTecnicoEl.innerText = "Técnico en camino";
            estadoTecnicoEl.classList.add("text-emerald-400");
        }

        if (data.lat && data.lng) {
            const pos = { lat: data.lat, lng: data.lng };
            marker.setPosition(pos);
            map.panTo(pos);
        }
    });
}
