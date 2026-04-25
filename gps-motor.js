/*******************************************************
 * FIXGO GPS MOTOR 2026
 * Archivo: gps-motor.js
 * Versión: 5.16 (RESILIENCE UPDATE & CROSS-OVER SHIELD)
 * Rol: Técnico (Transmisor) & Visor Cliente (Receptor)
 * Función: Geolocalización + Tracking + Telemetría
 *******************************************************/

import { 
    db, 
    auth, 
    doc, 
    getDoc,
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
let tipoVehiculoLocal = "auto"; // Default de seguridad

/* ==========================================================
    FUNCIÓN PARA VISOR (RASTREO.HTML)
    Mueve el carrito en el mapa del cliente (Solo Receptor)
========================================================== */
export function actualizarMapaGPS(mapReference, lat, lng) {
    if (!mapReference) return;

    const posicion = { lat, lng };

    if (!marcadorCacheExterno) {
        if (typeof google === "undefined") return;
        

        marcadorCacheExterno = new google.maps.Marker({
            position: posicion,
            map: mapReference,
            title: "Técnico FixGo",
            animation: google.maps.Animation.DROP,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: "#10b981", 
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
    TRACKING EN TIEMPO REAL (TÉCNICO - TRANSMISOR)
========================= */
export function iniciarTracking() {
  if (watchId !== null) return;
  console.log("📡 GPS Motor: Iniciando transmisión continua con Telemetría...");

  if (!navigator.geolocation) {
      alert("Tu dispositivo no soporta GPS.");
      return;
  }

  // 🔥 CANDADOS ANTI-CACHÉ ACTIVADOS
  const opcionesTracking = {
      enableHighAccuracy: true, // Usa el chip GPS real, no la red Wi-Fi
      maximumAge: 0,            // PROHIBIDO USAR CACHÉ. Siempre datos en vivo.
      timeout: 15000            // 15 segundos máximo o tira error
  };

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const precision = pos.coords.accuracy;
      
      // Capturamos Telemetría adicional del sensor
      const velocidad = pos.coords.speed || 0; // m/s
      const rumbo = pos.coords.heading || 0;    // grados 0-360

      console.log(`📍 Tracking [${tipoVehiculoLocal.toUpperCase()}]: ${lat}, ${lng} | Precisión: ${precision}m`);

      actualizarMapaPropio(lat, lng);
      
      // Pasamos la telemetría a Firebase
      await actualizarFirebase(lat, lng, velocidad, rumbo);
    },
    (error) => {
      // SILENCIADOR DE ERRORES CRÍTICOS
      if (error.code === error.TIMEOUT) {
          console.warn("⏳ GPS Motor: Tiempo de espera agotado. Reintentando en segundo plano...");
      } else if (error.code === error.PERMISSION_DENIED) {
          console.error("🚫 GPS Motor: El usuario denegó el acceso al GPS.");
      } else {
          console.error("❌ Error en Tracking GPS:", error.message);
      }
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
  if (mapa && marcadorTecnico) {
      const nuevaPosicion = { lat, lng };
      marcadorTecnico.setPosition(nuevaPosicion);
      mapa.panTo(nuevaPosicion);
  }
}

async function actualizarFirebase(lat, lng, velocidad, rumbo) {
  const ahora = Date.now();
  if (ahora - ultimoUpdate < 5000) return; // Limita subidas a 1 cada 5 seg para ahorrar cuota
  ultimoUpdate = ahora;

  const user = auth.currentUser;
  if (!user) return;

  try {
    // A) Actualizamos perfil 'users' (Ubicación maestra para el God View)
    const refUsuario = doc(db, "users", user.uid);
    await setDoc(refUsuario, {
        location: { lat, lng },
        telemetria: {
            velocidad: velocidad,
            rumbo: rumbo,
            vehiculo: tipoVehiculoLocal
        },
        locationUpdatedAt: serverTimestamp(),
        isOnline: true
    }, { merge: true });

    // B) Actualizamos 'rastreo/{uid}' (Data puramente para el Cliente y su mapa)
    const refRastreo = doc(db, "rastreo", user.uid);
    await setDoc(refRastreo, {
        uid: user.uid,
        nombre: user.displayName || "Técnico",
        lat: lat,
        lng: lng,
        velocidad: velocidad,
        rumbo: rumbo,
        vehiculo: tipoVehiculoLocal,
        estado: "En ruta",
        updatedAt: serverTimestamp()
    }, { merge: true });

    console.log(`✅ Telemetría Enviada: ${tipoVehiculoLocal} a ${velocidad}m/s`);

  } catch (err) {
    console.error("Error subiendo telemetría a Firebase:", err);
  }
}

/* ==========================================================
    AUTO-INICIO VISUAL (MAPA TÉCNICO)
========================================================== */
window.initMapaTecnico = async function () {
    console.log("🗺️ GPS Motor: Cargando perfil y solicitando ubicación...");

    // 1. OBTENER TIPO DE VEHÍCULO DEL PERFIL ANTES DE INICIAR
    const user = auth.currentUser;
    if (user) {
        try {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists() && docSnap.data().tipoVehiculo) {
                tipoVehiculoLocal = docSnap.data().tipoVehiculo;
                console.log("🚗 Vehículo detectado en perfil:", tipoVehiculoLocal);
            }
        } catch (e) {
            console.warn("No se pudo leer tipo de vehículo, usando default.");
        }
    }

    if (!navigator.geolocation) {
        alert("❌ Error Crítico: Tu navegador no soporta geolocalización.");
        return;
    }

    const opcionesGPS = {
        enableHighAccuracy: true, 
        timeout: 10000,            
        maximumAge: 0              
    };

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            console.log("✅ Ubicación inicial detectada.");
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            
            if (typeof google !== "undefined") {
                inicializarMapaGoogle(coords);
            }
            iniciarTracking(); 
        },
        (err) => {
            console.warn("⚠️ GPS Inicial falló o dio Timeout. Activando modo resiliencia.");
            
            // Coordenadas céntricas de Cancún como punto de partida seguro
            const coordsDefault = { lat: 21.1619, lng: -86.8515 }; 
            
            if (typeof google !== "undefined") {
                inicializarMapaGoogle(coordsDefault);
            }
            
            // Intentamos iniciar el tracking de todas formas, el watchPosition es más persistente
            iniciarTracking();
        },
        opcionesGPS 
    );
};

function inicializarMapaGoogle(coords) {
    const mapElement = document.getElementById("mapa") || document.getElementById("mapTecnico");
    if (typeof google === "undefined" || !mapElement) return;

    mapa = new google.maps.Map(mapElement, {
        center: coords,
        zoom: 18, 
        disableDefaultUI: true, 
        styles: [ 
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
            { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
            { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
        ]
    });

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

// 🔥 SEGURO ANTI-CHOQUES: Solo arranca si NO estamos en la pantalla del cliente (rastreo.html)
window.addEventListener("load", () => {
    const isClientViewer = window.location.pathname.includes("rastreo.html");
    if (!isClientViewer) {
        // Verifica si existe el contenedor del mapa para el técnico
        if (document.getElementById("mapa") || document.getElementById("mapTecnico")) {
            window.initMapaTecnico();
        }
    }
});
