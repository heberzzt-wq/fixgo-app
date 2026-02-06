import { auth, db, onAuthStateChanged } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* =========================
   FIXGO · CLIENTE APP
========================= */

const formSolicitud = document.getElementById("nuevaSolicitudForm");
const listaHistorial = document.getElementById("solicitudesCliente");

/* ---------- CREAR SOLICITUD ---------- */
if (formSolicitud) {
  formSolicitud.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) return alert("Debes iniciar sesión");

    const categoria = document.getElementById("categoriaSeleccionada")?.value || "GENERAL";
    const data = new FormData(formSolicitud);

    try {
      await addDoc(collection(db, "solicitudes"), {
        clienteId: user.uid,
        clienteNombre: user.displayName || "Cliente FixGo",
        clienteTelefono: "PENDIENTE",
        direccion: data.get("direccion"),
        descripcion: data.get("descripcion"),
        categoria,
        estado: "SOLICITADO",
        tecnicoId: null,
        lat: null,
        lng: null,
        fechaCreacion: serverTimestamp()
      });

      formSolicitud.reset();
      alert("🚀 Servicio solicitado. Buscando técnico...");
    } catch (err) {
      console.error(err);
      alert("Error al crear la solicitud");
    }
  });
}

/* ---------- HISTORIAL + SERVICIO ACTIVO ---------- */
onAuthStateChanged(auth, (user) => {
  if (!user || !listaHistorial) return;

  const q = query(
    collection(db, "solicitudes"),
    where("clienteId", "==", user.uid),
    orderBy("fechaCreacion", "desc")
  );

  onSnapshot(q, (snap) => {
    listaHistorial.innerHTML = "";

    const activo = snap.docs.find(d =>
      ["SOLICITADO", "EN_CAMINO", "EN_SITIO"].includes(d.data().estado)
    );

    if (activo) renderServicioActivo(activo.data());

    snap.forEach(doc => {
      const s = doc.data();
      listaHistorial.innerHTML += `
        <div class="bg-white p-4 rounded-xl shadow mb-3">
          <div class="flex justify-between">
            <span class="text-[10px] font-black">${s.categoria}</span>
            <span class="text-[10px] font-bold">${s.estado}</span>
          </div>
          <p class="text-xs font-bold">${s.direccion}</p>
        </div>
      `;
    });
  });
});

function renderServicioActivo(s) {
  const panel = document.getElementById("panelStatusActivo");
  if (!panel) return;

  panel.innerHTML = `
    <div class="bg-indigo-600 text-white p-6 rounded-2xl shadow-xl">
      <p class="text-xs uppercase opacity-70">Servicio activo</p>
      <h2 class="text-2xl font-black">${s.estado.replace("_", " ")}</h2>
      <p class="text-sm mt-2">Técnico en proceso</p>
    </div>
  `;
}
