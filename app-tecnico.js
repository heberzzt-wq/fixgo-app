// ======================================================
// FIXGO - APP TÉCNICO
// Panel operativo del técnico
// - Autenticación
// - Registro técnico
// - Escucha de solicitudes
// - Control de estados
// - GPS / Geocerca
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
let solicitudActiva = null;
let unsubscribeSolicitud = null;

// ======================================================
// AUTH CENTRAL (ÚNICO)
// ======================================================

console.log("app-tecnico.js cargado");

 observarAuth((user) => {
  if (!userData) {
    window.location.href = "login.html";
    return;
  }

  if (userData.rol !== "tecnico") {
    window.location.href = "index.html";
    return;
  }

  tecnico = userData;

  await registrarOActualizarTecnico();
  escucharSolicitudActiva();
  conectarBotones();
});

// ======================================================
// REGISTRO / UPDATE TÉCNICO
// ======================================================

async function registrarOActualizarTecnico() {
  try {
    await setDoc(
      doc(db, "tecnicos", tecnico.uid),
      {
        uid: tecnico.uid,
        nombre: tecnico.nombre || "Técnico FixGo",
        email: tecnico.email || "",
        rol: "tecnico",
        disponible: true,
        enServicio: false,
        actualizado: serverTimestamp()
      },
      { merge: true }
    );

    console.log("Técnico sincronizado");
  } catch (error) {
    console.error("Error registrando técnico:", error);
  }
}

// ======================================================
// ESCUCHAR SOLICITUD ACTIVA (COLECCIÓN CORRECTA)
// ======================================================

function escucharSolicitudActiva() {
  if (unsubscribeSolicitud) unsubscribeSolicitud();

  const ref = doc(db, "solicitudes", tecnico.uid);

  unsubscribeSolicitud = onSnapshot(ref, (snapshot) => {
    if (!snapshot.exists()) {
      solicitudActiva = null;
      renderEstadoLibre();
      return;
    }

    solicitudActiva = snapshot.data();
    procesarEstadoSolicitud();
  });
}

// ======================================================
// PROCESAR ESTADO
// ======================================================

function procesarEstadoSolicitud() {
  if (!solicitudActiva || !solicitudActiva.estado) return;

  switch (solicitudActiva.estado) {
    case "asignada":
      renderAsignada();
      break;

    case "en_camino":
      renderEnCamino();
      break;

    case "en_sitio":
      renderEnSitio();
      break;

    case "finalizada":
      finalizarServicio();
      break;

    default:
      console.warn("Estado desconocido:", solicitudActiva.estado);
  }
}

// ======================================================
// ACCIONES (BOTONES)
// ======================================================

async function marcarEnCamino() {
  if (!solicitudActiva) return;

  await actualizarEstadoSolicitud("en_camino");
}

async function marcarEnSitio() {
  if (!solicitudActiva) return;

  const llego = await verificarArribo(
    solicitudActiva.lat,
    solicitudActiva.lng
  );

  if (!llego) {
    alert("Aún no estás dentro del perímetro del cliente");
    return;
  }

  await actualizarEstadoSolicitud("en_sitio");
}

async function marcarFinalizado() {
  if (!solicitudActiva) return;

  await actualizarEstadoSolicitud("finalizada");
}

// ======================================================
// ACTUALIZAR FIRESTORE
// ======================================================

async function actualizarEstadoSolicitud(nuevoEstado) {
  try {
    await updateDoc(
      doc(db, "solicitudes", tecnico.uid),
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

    console.log("Estado actualizado:", nuevoEstado);
  } catch (error) {
    console.error("Error actualizando estado:", error);
  }
}

// ======================================================
// CIERRE
// ======================================================

async function finalizarServicio() {
  try {
    await updateDoc(
      doc(db, "tecnicos", tecnico.uid),
      {
        disponible: true,
        enServicio: false,
        actualizado: serverTimestamp()
      }
    );

    solicitudActiva = null;
    renderEstadoLibre();
  } catch (error) {
    console.error("Error cerrando servicio:", error);
  }
}

// ======================================================
// RENDER BASE (HTML YA EXISTE)
// ======================================================

function renderEstadoLibre() {
  console.log("Técnico disponible");
}

function renderAsignada() {
  console.log("Servicio asignado:", solicitudActiva);
}

function renderEnCamino() {
  console.log("En camino al cliente");
}

function renderEnSitio() {
  console.log("Técnico en sitio");
}

// ======================================================
// BOTONES CON CEREBRO
// ======================================================

function conectarBotones() {
  const btnEnCamino = document.getElementById("btnEnCamino");
  const btnEnSitio = document.getElementById("btnEnSitio");
  const btnFinalizar = document.getElementById("btnFinalizar");

  if (btnEnCamino) {
    btnEnCamino.addEventListener("click", marcarEnCamino);
  }

  if (btnEnSitio) {
    btnEnSitio.addEventListener("click", marcarEnSitio);
  }

  if (btnFinalizar) {
    btnFinalizar.addEventListener("click", marcarFinalizado);
  }
}

// ======================================================
// DEBUG CONTROLADO
// ======================================================

window.__FIXGO_TECNICO_DEBUG__ = () => ({
  tecnico: tecnico?.uid || null,
  solicitud: solicitudActiva?.estado || null
});
