// ===============================
// FIXGO - APP CLIENTE
// ===============================

import {
  auth,
  db,
  observarAuth,
  crearSolicitud,
  collection,
  query,
  where,
  onSnapshot
} from "./firebase.js";

// ===============================
// ELEMENTOS UI
// ===============================
const hero = document.getElementById("hero");
const clientePanel = document.getElementById("clientePanel");
const nombreCliente = document.getElementById("nombreCliente");

const cards = document.querySelectorAll(".service-card");
const servicioInput = document.getElementById("servicioSeleccionado");
const form = document.getElementById("solicitudForm");

// ===============================
// AUTH STATE
// ===============================
let usuarioActual = null;

observarAuth((user) => {
  usuarioActual = user;

  if (!user || user.rol !== "cliente") {
    hero.classList.remove("hidden");
    clientePanel.classList.add("hidden");
    return;
  }

  hero.classList.add("hidden");
  clientePanel.classList.remove("hidden");

  nombreCliente.textContent = user.email.split("@")[0].toUpperCase();
  escucharHistorial();
});

// ===============================
// SELECCIÓN SERVICIO
// ===============================
cards.forEach(card => {
  card.addEventListener("click", () => {
    if (card.classList.contains("cursor-not-allowed")) return;

    cards.forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");

    servicioInput.value = card.dataset.service;
  });
});

// ===============================
// CREAR SOLICITUD
// ===============================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!servicioInput.value) {
    alert("Selecciona un servicio");
    return;
  }

  const direccion = form.querySelector("input").value;
  const descripcion = form.querySelector("textarea").value;

  await crearSolicitud({
    clienteUid: usuarioActual.uid,
    servicio: servicioInput.value,
    direccion,
    descripcion,
    modelo: "DIRECTO",
    ciudad: "CANCUN"
  });

  alert("Solicitud enviada. Buscando técnico...");
  form.reset();
  servicioInput.value = "";
});

// ===============================
// HISTORIAL
// ===============================
function escucharHistorial() {
  const q = query(
    collection(db, "solicitudes"),
    where("clienteUid", "==", usuarioActual.uid)
  );

  onSnapshot(q, (snap) => {
    console.log("Historial cliente:", snap.docs.map(d => d.data()));
  });
}
