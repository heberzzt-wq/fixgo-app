// ======================================================
// FIXGO - GPS MOTOR CENTRAL
// Versión: Producción / Escalamiento
// Archivo único de rastreo en tiempo real
// Compatible con:
// - Cliente
// - Técnico
// - Admin
// ======================================================

import {
  auth,
  db,
  observarAuth,
  setDoc,
  doc,
  serverTimestamp
} from "./firebase.js";

// ======================================================
// CONFIGURACIÓN GLOBAL
// ======================================================

// Intervalo mínimo entre escrituras (ms)
// Protege Firestore en alta concurrencia
const GPS_WRITE_INTERVAL = 5000;

// Distancia mínima en metros para guardar nueva posición
const MIN_DISTANCE_METERS = 10;

// Radio de llegada (geofence) para check-in
const ARRIVAL_RADIUS_METERS = 100;

// ======================================================
// ESTADO INTERNO
// ======================================================

let usuario = null;
let watchId = null;

let ultimaLat = null;
let ultimaLng = null;
let ultimoEnvio = 0;

// ======================================================
// AUTH OBSERVER
// ======================================================

observarAuth((userData) => {
  if (!userData) {
    detenerGPS();
    return;
  }

  usuario = userData;
  iniciarGPS();
});

// ======================================================
// INICIAR GPS
// ======================================================

function iniciarGPS() {
  if (!navigator.geolocation) {
    console.error("GPS no soportado en este dispositivo");
    return;
  }

  if (watchId !== null) return;

  watchId = navigator.geolocation.watchPosition(
    procesarPosicion,
    manejarError,
    {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 15000
    }
  );

  console.log("GPS FixGo activo para:", usuario.rol);
}

// ======================================================
// DETENER GPS
// ======================================================

function detenerGPS() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  ultimaLat = null;
  ultimaLng = null;
  ultimoEnvio = 0;
}

// ======================================================
// PROCESAR POSICIÓN
// ======================================================

async function procesarPosicion(position) {
  const ahora = Date.now();

  if (ahora - ultimoEnvio < GPS_WRITE_INTERVAL) return;

  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const accuracy = position.coords.accuracy;

  if (ultimaLat !== null && ultimaLng !== null) {
    const distancia = calcularDistancia(
      ultimaLat,
      ultimaLng,
      lat,
      lng
    );

    if (distancia < MIN_DISTANCE_METERS) return;
  }

  ultimaLat = lat;
  ultimaLng = lng;
  ultimoEnvio = ahora;

  await guardarUbicacion(lat, lng, accuracy);
}

// ======================================================
// GUARDAR UBICACIÓN EN FIRESTORE
// ======================================================

async function guardarUbicacion(lat, lng, accuracy) {
  if (!usuario) return;

  try {
    await setDoc(
      doc(db, "ubicaciones", usuario.uid),
      {
        uid: usuario.uid,
        rol: usuario.rol, // cliente | tecnico | admin
        lat,
        lng,
        accuracy,
        activo: true,
        actualizado: serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Error GPS FixGo:", error);
  }
}

// ======================================================
// UTILIDADES
// ======================================================

// Distancia Haversine (metros)
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

// ======================================================
// CHECK-IN DE ARRIBO (USADO POR app-tecnico.js)
// ======================================================

export async function verificarArribo(latDestino, lngDestino) {
  if (ultimaLat === null || ultimaLng === null) return false;

  const distancia = calcularDistancia(
    ultimaLat,
    ultimaLng,
    latDestino,
    lngDestino
  );

  return distancia <= ARRIVAL_RADIUS_METERS;
}

// ======================================================
// DEBUG CONTROLADO (ADMIN)
// ======================================================

window.__FIXGO_GPS_STATUS__ = () => ({
  activo: watchId !== null,
  lat: ultimaLat,
  lng: ultimaLng,
  rol: usuario?.rol || null
});
