/*******************************************************
 * FIXGO GPS MOTOR 2026
 * Archivo: gps-motor.js
 * Rol: Técnico & Visor
 * Función: Geolocalización + Tracking en tiempo real
 * Integración: Firebase Firestore + Google Maps
 *******************************************************/

import { 
    db, 
    auth, 
    doc, 
    updateDoc, 
    serverTimestamp,
    setDoc 
} from "./firebase.js";

/* =========================
   VARIABLES GLOBALES
========================= */
let mapa = null;
let marcadorTecnico = null;
let watchId = null;
let ultimoUpdate = 0;
let marcadorCacheExterno = null;

/* ==========================================================
   FUNCIÓN PARA VISOR (RASTREO.HTML)
   Mueve el carrito en el mapa del cliente
========================================================== */
export function actualizarMapaGPS(mapReference, lat, lng) {
    if (!mapReference) return;

    const posicion = { lat, lng };

    if (!marcadorCacheExterno) {
        marcadorCacheExterno = new google.maps.Marker({
            position: posicion,
            map: mapReference,
            title: "Técnico FixGo",
            animation: google.maps.Animation.DROP,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: "#10b981", // Emerald
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "#ffffff"
            }
        });
    } else {
        marcadorCacheExterno.setPosition(posicion);
    }
    
    mapReference.panTo(posicion);
}

/* =========================
   TRACKING EN TIEMPO REAL (TÉCNICO)
========================= */
export function iniciarTracking() {
  if (watchId !== null) return;
  console.log("📡 GPS Motor: Iniciando transmisión...");

  if (!navigator.geolocation) {
      alert("Tu dispositivo no soporta GPS.");
      return;
  }

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // 1. Actualizar visualmente el mapa propio (si existe)
      actualizarMapaPropio(lat, lng);

      // 2. Subir a Firebase
      await actualizarFirebase(lat, lng);
    },
    (error) => {
      console.error("Error GPS:", error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  );
}

// CORRECCIÓN CLAVE: AHORA SÍ EXPORTAMOS ESTA FUNCIÓN
export function detenerTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    console.log("🛑 GPS Motor: Transmisión detenida.");
  }
}

/* =========================
   HELPERS INTERNOS
========================= */
function actualizarMapaPropio(lat, lng) {
  // Solo si el mapa del técnico está inicializado visualmente
  if (mapa && marcadorTecnico) {
      const nuevaPosicion = { lat, lng };
      marcadorTecnico.setPosition(nuevaPosicion);
      mapa.panTo(nuevaPosicion);
  }
}

async function actualizarFirebase(lat, lng) {
  const ahora = Date.now();
  if (ahora - ultimoUpdate < 5000) return; // Rate limit 5s
  ultimoUpdate = ahora;

  const user = auth.currentUser;
  if (!user) return;

  try {
    // A) Actualizamos perfil 'users'
    const refUsuario = doc(db, "users", user.uid);
    await setDoc(refUsuario, {
        location: { lat, lng },
        locationUpdatedAt: serverTimestamp(),
        isOnline: true
    }, { merge: true });

    // B) Actualizamos 'rastreo/tecnicoActivo' (Para demo)
    const refRastreo = doc(db, "rastreo", "tecnicoActivo");
    await setDoc(refRastreo, {
        uid: user.uid,
        nombre: user.displayName || "Técnico",
        lat: lat,
        lng: lng,
        estado: "En ruta",
        updatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`✅ GPS Update: ${lat}, ${lng}`);

  } catch (err) {
    console.error("Error subiendo GPS:", err);
  }
}

/* =========================
   AUTO-INICIO VISUAL (MAPA TÉCNICO)
   Mantiene compatibilidad con window.initMapaTecnico
========================= */
window.initMapaTecnico = function () {
    console.log("🗺️ Inicializando UI Mapa Técnico...");
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition((pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const mapElement = document.getElementById("mapa") || document.getElementById("map");

        if (mapElement) {
            mapa = new google.maps.Map(mapElement, {
                center: coords,
                zoom: 15,
                disableDefaultUI: true,
                styles: [
                    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                ]
            });

            marcadorTecnico = new google.maps.Marker({
                position: coords,
                map: mapa,
                title: "Tu ubicación",
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: "#4f46e5",
                    fillOpacity: 1,
                    strokeWeight: 2,
                    strokeColor: "#ffffff"
                }
            });
        }
        
        // Auto-arranque si se desea
        iniciarTracking();
    });
};

// Listener para carga de API Google Maps
window.addEventListener("load", () => {
  setTimeout(() => {
    if (typeof google !== "undefined" && typeof window.initMapaTecnico === 'function') {
        window.initMapaTecnico();
    }
  }, 1000);
});
