/*******************************************************
 * FIXGO GPS MOTOR 2026
 * Archivo: gps-motor.js
 * Versión: 5.12 (HIGH ACCURACY FORCED) - FIX: Sincronía Google
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
        // Validación preventiva antes de usar el constructor de Google
        if (typeof google === "undefined") return;

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
  console.log("📡 GPS Motor: Iniciando transmisión continua...");

  if (!navigator.geolocation) {
      alert("Tu dispositivo no soporta GPS.");
      return;
  }

  // Opciones estrictas también para el rastreo continuo
  const opcionesTracking = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000 // Ajuste de Timeout para evitar "Timeout Expired" prematuro
  };

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const precision = pos.coords.accuracy;

      console.log(`📍 Tracking Activo: ${lat}, ${lng} (~${precision}m)`);

      // 1. Actualizar visualmente el mapa propio (si existe)
      actualizarMapaPropio(lat, lng);

      // 2. Subir a Firebase
      await actualizarFirebase(lat, lng);
    },
    (error) => {
      console.error("❌ Error en Tracking GPS:", error.message);
    },
    opcionesTracking
  );
}

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
  // Rate limit: Solo subimos a la nube cada 5 segundos para ahorrar costos
  if (ahora - ultimoUpdate < 5000) return; 
  ultimoUpdate = ahora;

  const user = auth.currentUser;
  if (!user) return;

  try {
    // A) Actualizamos perfil 'users' (Ubicación maestra)
    const refUsuario = doc(db, "users", user.uid);
    await setDoc(refUsuario, {
        location: { lat, lng },
        locationUpdatedAt: serverTimestamp(),
        isOnline: true
    }, { merge: true });

    // B) Actualizamos 'rastreo/tecnicoActivo' (Para demos o administración)
    const refRastreo = doc(db, "rastreo", "tecnicoActivo");
    await setDoc(refRastreo, {
        uid: user.uid,
        nombre: user.displayName || "Técnico",
        lat: lat,
        lng: lng,
        estado: "En ruta",
        updatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`✅ GPS Update Firebase: ${lat}, ${lng}`);

  } catch (err) {
    console.error("Error subiendo GPS a Firebase:", err);
  }
}

/* ==========================================================
   AUTO-INICIO VISUAL (MAPA TÉCNICO) - LÓGICA V5.12
   VALIDACIÓN PREVENTIVA DE GOOGLE MAPS API
========================================================== */
window.initMapaTecnico = function () {
    // 1. VALIDACIÓN PREVENTIVA: Si Google no ha cargado, esperamos y reintentamos
    if (typeof google === "undefined") {
        console.warn("⏳ Esperando que Google Maps API esté disponible...");
        setTimeout(window.initMapaTecnico, 1000); // Reintento silencioso cada 1s
        return;
    }

    console.log("🗺️ GPS Motor: Solicitando ubicación de ALTA PRECISIÓN...");

    if (!navigator.geolocation) {
        alert("❌ Error Crítico: Tu navegador no soporta geolocalización.");
        return;
    }

    // CONFIGURACIÓN ESTRICTA DE GPS
    const opcionesGPS = {
        enableHighAccuracy: true, 
        timeout: 15000,           // Ajustado a 15s para dar margen a la API
        maximumAge: 0             
    };

    navigator.geolocation.getCurrentPosition(
        // 1. ÉXITO (Ubicación Real Encontrada)
        (pos) => {
            console.log("✅ Ubicación exacta detectada. Inicializando Mapa...");
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            
            inicializarMapaGoogle(coords); 
            iniciarTracking(); 
        },
        // 2. ERROR (Fallo de GPS o Permiso denegado)
        (err) => {
            console.warn("⚠️ No se pudo obtener ubicación exacta. Usando Default.", err);
            
            // Coordenadas de seguridad (Cancún Centro) para no romper la UI
            const coordsDefault = { lat: 21.1619, lng: -86.8515 }; 
            inicializarMapaGoogle(coordsDefault);
        },
        opcionesGPS 
    );
};

// Función auxiliar para pintar el mapa (Separada para limpieza y orden)
function inicializarMapaGoogle(coords) {
    const mapElement = document.getElementById("mapa") || document.getElementById("map");
    
    // Verificación final de seguridad
    if (typeof google === "undefined") {
        console.error("❌ Error fatal: Google Maps no cargó al intentar pintar.");
        return;
    }

    if (mapElement) {
        mapa = new google.maps.Map(mapElement, {
            center: coords,
            zoom: 18, 
            disableDefaultUI: true, 
            styles: [ 
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
                { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
                { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
                { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
                { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
                { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
                { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
                { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
                { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
                { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
                { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
                { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
                { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
            ]
        });

        // Marcador del Técnico (Punto Azul Brillante)
        marcadorTecnico = new google.maps.Marker({
            position: coords,
            map: mapa,
            title: "Tu ubicación",
            animation: google.maps.Animation.DROP,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 12,
                fillColor: "#4f46e5", 
                fillOpacity: 1,
                strokeWeight: 3,
                strokeColor: "#ffffff" 
            }
        });
    }
}

// Listener de arranque optimizado (Sin retrasos fijos innecesarios)
window.addEventListener("load", () => {
    // Llamada directa: la función window.initMapaTecnico ahora es inteligente
    // y sabe esperar por sí misma si la API de Google Maps no está lista.
    window.initMapaTecnico();
});
