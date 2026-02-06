// ===============================
// FIXGO - ADMIN
// ===============================

import {
  auth,
  db,
  observarAuth,
  collection,
  query,
  onSnapshot,
  updateDoc,
  doc
} from "./firebase.js";

// ===============================
const tablaSolicitudes = document.getElementById("tablaSolicitudes");
const tablaTecnicos = document.getElementById("tablaTecnicos");

// ===============================
let admin = null;

// ===============================
// AUTH
// ===============================
observarAuth((user) => {
  if (!user || user.rol !== "admin") return;
  admin = user;
  escucharTodo();
});

// ===============================
// ESCUCHAR SOLICITUDES
// ===============================
function escucharTodo() {
  onSnapshot(query(collection(db, "solicitudes")), (snap) => {
    tablaSolicitudes.innerHTML = "";
    snap.docs.forEach(d => {
      const s = d.data();
      const row = document.createElement("div");
      row.innerHTML = `
        ${s.servicio} | ${s.estado}
        <button data-id="${d.id}">Override</button>
      `;
      tablaSolicitudes.appendChild(row);

      row.querySelector("button").onclick = async () => {
        await updateDoc(doc(db, "solicitudes", d.id), {
          estado: "FORZADO_ADMIN"
        });
      };
    });
  });

  onSnapshot(query(collection(db, "usuarios")), (snap) => {
    tablaTecnicos.innerHTML = "";
    snap.docs.forEach(d => {
      if (d.data().rol !== "tecnico") return;
      tablaTecnicos.innerHTML += `<div>${d.data().email}</div>`;
    });
  });
}
