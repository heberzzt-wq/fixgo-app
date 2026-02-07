/*******************************************************
 * FIXGO GPS MOTOR 2026
 * Archivo: gps-motor.js
 * Rol: Técnico & Visor
 * Función: Geolocalización + Tracking en tiempo real
 * Integración: Firebase Firestore + Google Maps
 *******************************************************/

// 1. CORRECCIÓN DE IMPORTS: Usamos tu firebase.js centralizado
import { 
    db, 
    auth, 
    doc, 
    updateDoc, 
    serverTimestamp,
    setDoc // Necesario por si el documento no existe
} from "./firebase.js";

/* =========================
   VARIABLES GLOBALES
========================= */

let mapa = null;
let marcadorTecnico = null;
let watchId = null;
let ultimoUpdate = 0;

// Variables para control del marcador externo (cuando este archivo lo usa rastreo.html)
let marcadorCacheExterno = null;

/* ==========================================================
   NUEVA FUNCIÓN: EXPORTADA PARA RASTREO.HTML
   Esta es la función que tu archivo 'rastreo.html' está buscando.
========================================================== */
export function actualizarMapaGPS(mapReference, lat, lng) {
    if (!mapReference) return;

    const posicion = { lat, lng };

    // Si el marcador no existe en el mapa del cliente, lo creamos
    if (!marcadorCacheExterno) {
        marcadorCacheExterno = new google.maps.Marker({
            position: posicion,
            map: mapReference,
            title: "Técnico FixGo",
            animation: google.maps.Animation.DROP,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: "#10b981", // Color Emerald (FixGo)
                fillOpacity: 1,
                strokeWeight: 2,
                strokeColor: "#ffffff"
            }
        });
    } else {
        // Si ya existe, movemos el marcador suavemente
        marcadorCacheExterno.setPosition(posicion);
    }
    
    // Centrar mapa
    mapReference.panTo(posicion);
}


/* =========================
   INICIALIZAR MAPA (LADO TÉCNICO)
   Mantiene tu lógica de window.init para compatibilidad
========================= */

window.initMapaTecnico = function () {
  console.log("🗺️ Iniciando mapa del técnico...");
  
  if (!navigator.geolocation) {
    alert("Tu navegador no soporta GPS");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const ubicacionInicial = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };

      // Buscamos el div 'mapa' o 'map' por seguridad
      const mapElement = document.getElementById("mapa") || document.getElementById("map");

      if (mapElement) {
          mapa = new google.maps.Map(mapElement, {
            center: ubicacionInicial,
            zoom: 15,
            disableDefaultUI: true, // Interfaz limpia tipo Uber
            styles: [ // Estilo oscuro básico
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            ]
          });

          marcadorTecnico = new google.maps.Marker({
            position: ubicacionInicial,
            map: mapa,
            title: "Tu ubicación",
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#4f46e5", // Indigo
              fillOpacity: 1,
              strokeWeight: 2,
              strokeColor: "#ffffff"
            }
          });
      }

      // Iniciamos la transmisión de datos
      iniciarTracking();
    },
    (error) => {
      console.error("Error GPS Inicial:", error);
      alert("No se pudo obtener ubicación. Verifica permisos.");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000
    }
  );
};

/* =========================
   TRACKING EN TIEMPO REAL
========================= */

function iniciarTracking() {
  if (watchId !== null) return;
  
  console.log("📡 Tracking iniciado...");

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      // 1. Actualizar visualmente el mapa del técnico
      actualizarMapaPropio(lat, lng);

      // 2. Subir datos a la nube
      await actualizarFirebase(lat, lng);
    },
    (error) => {
      console.error("Error en watchPosition:", error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0, // No usar caché, queremos datos frescos
      timeout: 10000
    }
  );
}

/* =========================
   ACTUALIZAR MAPA (PROPIO)
========================= */

function actualizarMapaPropio(lat, lng) {
  if (!mapa || !marcadorTecnico) return;

  const nuevaPosicion = { lat, lng };

  marcadorTecnico.setPosition(nuevaPosicion);
  mapa.panTo(nuevaPosicion);
}

/* =========================
   FIREBASE UPDATE (CORREGIDO Y EXPANDIDO)
========================= */

async function actualizarFirebase(lat, lng) {
  const ahora = Date.now();

  // Evitar saturar Firestore (Mantenemos tu regla de 8s, es buena)
  if (ahora - ultimoUpdate < 8000) return;
  ultimoUpdate = ahora;

  const user = auth.currentUser;
  
  if (!user) {
      console.warn("⚠️ No hay usuario logueado, no se puede subir GPS.");
      return;
  }

  try {
    // A) Actualizamos tu colección original 'users'
    const refUsuario = doc(db, "users", user.uid);
    await updateDoc(refUsuario, {
      location: { lat, lng },
      locationUpdatedAt: serverTimestamp(),
      isOnline: true
    }).catch(async (e) => {
        // Si falla porque no existe, usamos setDoc con merge
        if(e.code === 'not-found') {
            await setDoc(refUsuario, {
                location: { lat, lng },
                locationUpdatedAt: serverTimestamp(),
                isOnline: true
            }, { merge: true });
        }
    });

    // B) Actualizamos 'rastreo/tecnicoActivo' para que rastreo.html funcione
    // Esto conecta el mapa del cliente con el técnico
    const refRastreo = doc(db, "rastreo", "tecnicoActivo");
    await setDoc(refRastreo, {
        uid: user.uid,
        nombre: user.displayName || "Técnico", // Nombre genérico si no hay display name
        lat: lat,
        lng: lng,
        estado: "En ruta",
        updatedAt: serverTimestamp()
    });
    
    console.log(`✅ GPS Update enviado: ${lat}, ${lng}`);

  } catch (err) {
    console.error("Error crítico actualizando GPS:", err);
  }
}

/* =========================
   CONTROL MANUAL
========================= */

window.detenerTracking = function () {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    console.log("🛑 Tracking detenido manualmente.");
  }
};

/* =========================
   AUTO-INICIO
========================= */

// También exportamos iniciarTracking para que app-tecnico.js pueda invocarlo si quiere
export { iniciarTracking };

window.addEventListener("load", () => {
  // Esperar a que Google Maps cargue
  setTimeout(() => {
    if (typeof google !== "undefined") {
        // Solo autoiniciar si estamos en la vista de técnico (si existe initMapaTecnico)
        if (typeof window.initMapaTecnico === 'function') {
            window.initMapaTecnico();
        }
    }
  }, 1000);
});
