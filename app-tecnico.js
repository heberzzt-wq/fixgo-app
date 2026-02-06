// ===============================
// FIXGO - APP TECNICO
// ===============================

import {
  auth,
  db,
  observarAuth,
  escucharSolicitudesPorTecnico,
  actualizarEstadoSolicitud,
  actualizarUbicacion
} from "./firebase.js";

// ===============================
// UI
// ===============================
const estadoSwitch = document.getElementById("estadoSwitch");
const listaSolicitudes = document.getElementById("listaSolicitudes");

// ===============================
let tecnico = null;
let online = false;

// ===============================
// AUTH
// ===============================
observarAuth((user) => {
  if (!user || user.rol !== "tecnico") return;

  tecnico = user;
  iniciarEscucha();
});

// ===============================
// ON / OFF
// ===============================
estadoSwitch.addEventListener("change", () => {
  online = estadoSwitch.checked;
  console.log("Tecnico online:", online);
});

// ===============================
// ESCUCHAR SOLICITUDES
// ===============================
function iniciarEscucha() {
  escucharSolicitudesPorTecnico(tecnico.uid, (solicitudes) => {
    listaSolicitudes.innerHTML = "";

    solicitudes.forEach(s => {
      const div = document.createElement("div");
      div.className = "uber-card p-4 rounded-xl";
      div.innerHTML = `
        <strong>${s.servicio}</strong><br>
        ${s.direccion}<br>
        Estado: ${s.estado}
        <button data-id="${s.id}" class="aceptar">Aceptar</button>
      `;
      listaSolicitudes.appendChild(div);

      div.querySelector(".aceptar").onclick = async () => {
        await actualizarEstadoSolicitud(s.id, "ACEPTADO");
      };
    });
  });
}

// ===============================
// GPS SIMPLE
// ===============================
navigator.geolocation.watchPosition((pos) => {
  if (!tecnico) return;

  actualizarUbicacion(
    tecnico.uid,
    "tecnico",
    pos.coords.latitude,
    pos.coords.longitude
  );
});
