/*******************************************************
 * FIXGO GPS MOTOR 2026
 * Rol: Técnico
 * Función: Geolocalización + Tracking en tiempo real
 * Integración: Firebase Firestore + Google Maps
 *******************************************************/

import {
  getFirestore,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { auth } from "./firebase.js";

/* =========================
   VARIABLES GLOBALES
========================= */

let mapa = null;
let marcadorTecnico = null;
let watchId = null;

const db = getFirestore();

/* =========================
   INICIALIZAR MAPA
========================= */

window.initMapaTecnico = function () {
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

      mapa = new google.maps.Map(document.getElementById("mapa"), {
        center: ubicacionInicial,
        zoom: 15,
        disableDefaultUI: true,
      });

      marcadorTecnico = new google.maps.Marker({
        position: ubicacionInicial,
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

      iniciarTracking();
    },
    (error) => {
      console.error("Error GPS:", error);
      alert("No se pudo obtener ubicación");
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

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      actualizarMapa(lat, lng);
      await actualizarFirebase(lat, lng);
    },
    (error) => {
      console.error("Error tracking:", error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000
    }
  );
}

/* =========================
   ACTUALIZAR MAPA
========================= */

function actualizarMapa(lat, lng) {
  if (!mapa || !marcadorTecnico) return;

  const nuevaPosicion = { lat, lng };

  marcadorTecnico.setPosition(nuevaPosicion);
  mapa.panTo(nuevaPosicion);
}

/* =========================
   FIREBASE UPDATE (OPTIMIZADO)
========================= */

let ultimoUpdate = 0;

async function actualizarFirebase(lat, lng) {
  const ahora = Date.now();

  // Evitar saturar Firestore (1 update cada 8s)
  if (ahora - ultimoUpdate < 8000) return;
  ultimoUpdate = ahora;

  const user = auth.currentUser;
  if (!user) return;

  try {
    const ref = doc(db, "users", user.uid);

    await updateDoc(ref, {
      location: {
        lat,
        lng
      },
      locationUpdatedAt: serverTimestamp(),
      isOnline: true
    });
  } catch (err) {
    console.error("Error actualizando GPS:", err);
  }
}

/* =========================
   CONTROL MANUAL
========================= */

window.detenerTracking = function () {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
};

/* =========================
   AUTO-INICIO
========================= */

window.addEventListener("load", () => {
  // Esperar a que Google Maps cargue
  setTimeout(() => {
    if (typeof google !== "undefined") {
      initMapaTecnico();
    }
  }, 1000);
});
