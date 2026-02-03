import { 
    auth, db, onAuthStateChanged, 
    collection, addDoc, doc, onSnapshot, 
    serverTimestamp, query, where, orderBy, limit 
} from "./firebase.js";

// --- REFERENCIAS DE INTERFAZ ---
const getEl = (id) => document.getElementById(id);
let map, marker;

// --- 1. GESTIÓN DE SESIÓN ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("Cliente autenticado:", user.uid);
        // Si estamos en la página de rastreo, iniciamos el mapa
        if (getEl("map")) {
            initMap();
            // Buscamos si este cliente tiene un servicio activo para rastrear
            buscarServicioActivo(user.uid);
        }
    } else {
        console.log("Sin sesión de cliente");
    }
});

// --- 2. CREACIÓN DE SOLICITUD (ALTA CONCURRENCIA) ---
const btnSolicitar = getEl("confirmarSolicitud");
if (btnSolicitar) {
    btnSolicitar.onclick = async () => {
        const direccion = getEl("inputDireccion")?.value;
        const user = auth.currentUser;

        if (!direccion) return alert("Por favor, ingresa una dirección.");
        if (!user) return alert("Debes iniciar sesión para solicitar un servicio.");

        try {
            btnSolicitar.disabled = true;
            btnSolicitar.innerText = "ENVIANDO...";

            // Guardamos la solicitud con estructura optimizada para el técnico
            const nuevaSolicitud = await addDoc(collection(db, "solicitudes"), {
                clienteId: user.uid,
                clienteNombre: user.displayName || "Cliente FixGo",
                direccion: direccion,
                estado: "PENDIENTE", // El técnico busca este estado
                fechaCreacion: serverTimestamp(),
                ubicacionCliente: { lat: 21.1619, lng: -86.8515 } // Coordenadas base (Cancún)
            });

            console.log("Solicitud creada con ID:", nuevaSolicitud.id);
            alert("¡Solicitud enviada con éxito! Esperando a un técnico.");
            
            // Redirigir a la pantalla de rastreo
            window.location.href = "rastreo.html";
        } catch (error) {
            console.error("Error al crear solicitud:", error);
            btnSolicitar.disabled = false;
            btnSolicitar.innerText = "CONFIRMAR SOLICITUD";
        }
    };
}

// --- 3. MOTOR DE MAPA Y RASTREO REAL-TIME ---
function initMap() {
    map = new google.maps.Map(getEl("map"), {
        center: { lat: 21.1619, lng: -86.8515 },
        zoom: 15,
        disableDefaultUI: true,
        styles: [
            { "featureType": "all", "elementType": "labels.text.fill", "stylers": [{ "color": "#ffffff" }] },
            { "featureType": "all", "elementType": "labels.text.stroke", "stylers": [{ "color": "#000000" }, { "lightness": 13 }] },
            { "featureType": "landscape", "stylers": [{ "color": "#202022" }] },
            { "featureType": "road", "stylers": [{ "color": "#2c2c2e" }] }
        ]
    });

    marker = new google.maps.Marker({
        map: map,
        title: "Tu Técnico",
        icon: {
            url: "https://cdn-icons-png.flaticon.com/512/1048/1048329.png", // Ícono de camioneta
            scaledSize: new google.maps.Size(45, 45)
        }
    });
}

// --- 4. VINCULACIÓN CLIENTE-TÉCNICO (ENTRELAZADO) ---
function buscarServicioActivo(clienteId) {
    // Buscamos la última solicitud de este cliente que ya fue aceptada (EN CAMINO)
    const q = query(
        collection(db, "solicitudes"),
        where("clienteId", "==", clienteId),
        where("estado", "==", "EN CAMINO"),
        orderBy("fechaCreacion", "desc"),
        limit(1)
    );

    onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
            const solicitudData = snapshot.docs[0].data();
            const tecnicoId = solicitudData.tecnicoId;
            if (tecnicoId) {
                console.log("Rastreando técnico:", tecnicoId);
                iniciarRastreoTecnico(tecnicoId);
            }
        } else {
            if (getEl("estadoTecnico")) getEl("estadoTecnico").innerText = "BUSCANDO TÉCNICO DISPONIBLE...";
        }
    });
}

function iniciarRastreoTecnico(tecnicoId) {
    // Escuchamos los cambios en el documento del técnico
    onSnapshot(doc(db, "tecnicos", tecnicoId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Actualizamos UI
            if (getEl("nombreTecnico")) getEl("nombreTecnico").innerText = data.nombre || "Jonathan Catana";
            if (getEl("vehiculoTecnico")) getEl("vehiculoTecnico").innerText = `${data.vehiculo} | ${data.placas}`;
            if (getEl("estadoTecnico")) {
                getEl("estadoTecnico").innerText = "TÉCNICO EN CAMINO";
                getEl("estadoTecnico").className = "text-emerald-400 font-bold animate-pulse";
            }

            // Movemos el marcador en el mapa
            // El técnico ahora guarda en 'ubicacion', pero verificamos lat/lng por si acaso
            const pos = data.ubicacion ? { lat: data.ubicacion.lat, lng: data.ubicacion.lng } : { lat: data.lat, lng: data.lng };

            if (pos && pos.lat && pos.lng) {
                const newPos = new google.maps.LatLng(pos.lat, pos.lng);
                marker.setPosition(newPos);
                map.panTo(newPos);
            }
        }
    });
}
