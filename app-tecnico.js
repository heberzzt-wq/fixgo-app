// ======================================================
// FIXGO - APP TÉCNICO
// Control total del técnico:
// - Estado
// - GPS en vivo
// - Órdenes activas
// - Check-in por geocerca
// ======================================================

import {
  auth,
  db,
  observarAuth,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "./firebase.js";

import { verificarArribo } from "./gps-motor.js";

// ======================================================
// ESTADO GLOBAL
// ======================================================

let tecnico = null;
let ordenActiva = null;
let listenerOrden = null;

// ======================================================
// AUTH
// ======================================================

observarAuth(async (userData) => {
  if (!userData || userData.rol !== "tecnico") {
    window.location.href = "login.html";
    return;
  }

  tecnico = userData;

  await registrarTecnico();
  escucharOrdenActiva();
});

// ======================================================
// REGISTRAR / ACTUALIZAR TÉCNICO
// ======================================================

async function registrarTecnico() {
  try {
    await setDoc(
      doc(db, "tecnicos", tecnico.uid),
      {
        uid: tecnico.uid,
        nombre: tecnico.nombre || "Técnico FixGo",
        email: tecnico.email,
        disponible: true,
        enServicio: false,
        actualizado: serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Error registrando técnico:", error);
  }
}

// ======================================================
// ESCUCHAR ORDEN ACTIVA
// ======================================================

function escucharOrdenActiva() {
  if (listenerOrden) listenerOrden();

  const ref = doc(db, "ordenes", tecnico.uid);

  listenerOrden = onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      ordenActiva = null;
      renderEstadoLibre();
      return;
    }

    ordenActiva = snap.data();
    procesarEstadoOrden();
  });
}

// ======================================================
// PROCESAR ESTADO DE ORDEN
// ======================================================

function procesarEstadoOrden() {
  if (!ordenActiva) return;

  switch (ordenActiva.estado) {
    case "asignada":
      renderOrdenAsignada();
      break;

    case "en_camino":
      renderEnCamino();
      break;

    case "en_sitio":
      renderEnSitio();
      break;

    case "finalizada":
      cerrarOrden();
      break;
  }
}

// ======================================================
// ACCIONES DE ESTADO
// ======================================================

window.marcarEnCamino = async () => {
  if (!ordenActiva) return;

  await actualizarEstadoOrden("en_camino");
};

window.marcarEnSitio = async () => {
  if (!ordenActiva) return;

  const llego = await verificarArribo(
    ordenActiva.lat,
    ordenActiva.lng
  );

  if (!llego) {
    alert("Aún no estás en la ubicación del cliente");
    return;
  }

  await actualizarEstadoOrden("en_sitio");
};

window.finalizarOrden = async () => {
  if (!ordenActiva) return;

  await actualizarEstadoOrden("finalizada");
};

// ======================================================
// ACTUALIZAR ESTADO EN FIRESTORE
// ======================================================

async function actualizarEstadoOrden(nuevoEstado) {
  try {
    await updateDoc(
      doc(db, "ordenes", tecnico.uid),
      {
        estado: nuevoEstado,
        actualizado: serverTimestamp()
      }
    );

    await updateDoc(
      doc(db, "tecnicos", tecnico.uid),
      {
        disponible: nuevoEstado === "finalizada",
        enServicio: nuevoEstado !== "finalizada",
        actualizado: serverTimestamp()
      }
    );
  } catch (error) {
    console.error("Error actualizando orden:", error);
  }
}

// ======================================================
// FINALIZAR ORDEN
// ======================================================

async function cerrarOrden() {
  try {
    await updateDoc(
      doc(db, "tecnicos", tecnico.uid),
      {
        disponible: true,
        enServicio: false,
        actualizado: serverTimestamp()
      }
    );

    ordenActiva = null;
    renderEstadoLibre();
  } catch (error) {
    console.error("Error cerrando orden:", error);
  }
}

// ======================================================
// RENDER (LÓGICA BASE, HTML YA EXISTE)
// ======================================================

function renderEstadoLibre() {
  console.log("Técnico disponible, esperando servicio");
}

function renderOrdenAsignada() {
  console.log("Orden asignada:", ordenActiva);
}

function renderEnCamino() {
  console.log("Técnico en camino");
}

function renderEnSitio() {
  console.log("Técnico en sitio");
}

// ======================================================
// DEBUG CONTROLADO
// ======================================================

window.__FIXGO_TECNICO_STATUS__ = () => ({
  tecnico: tecnico?.uid || null,
  orden: ordenActiva?.estado || null
});
