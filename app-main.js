/**
 * FixGo – app-main.js
 * Rol: CLIENTE
 * Función: 
 *  - Cargar perfil del cliente
 *  - Mostrar servicios disponibles
 *  - Crear solicitudes
 *  - Escuchar cambios de estado
 */

import {
  auth,
  db,
  observarAuth,
  cerrarSesion
} from "./firebase.js";

import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===============================
   VARIABLES DE UI
================================ */

const heroSection = document.getElementById("heroSection");
const solicitudContainer = document.getElementById("solicitudContainer");
const logoutBtn = document.getElementById("logoutBtn");
const nombreClienteSpan = document.getElementById("nombreCliente");

const gridServicios = document.getElementById("gridServicios");
const formulario = document.getElementById("nuevaSolicitudForm");
const solicitudesCliente = document.getElementById("solicitudesCliente");

/* ===============================
   ESTADO GLOBAL
================================ */

let usuarioActual = null;
let servicioSeleccionado = null;

/* ===============================
   AUTENTICACIÓN
================================ */

observarAuth(async (user) => {
  if (!user) {
    heroSection.classList.remove("hidden");
    solicitudContainer.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    return;
  }

  usuarioActual = user;
  logoutBtn.classList.remove("hidden");
  heroSection.classList.add("hidden");
  solicitudContainer.classList.remove("hidden");

  await cargarPerfilCliente();
  escucharSolicitudesCliente();
});

/* ===============================
   PERFIL CLIENTE
================================ */

async function cargarPerfilCliente() {
  try {
    const ref = doc(db, "users", usuarioActual.uid);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      nombreClienteSpan.textContent =
        data.nombre
          ? data.nombre.split(" ")[0].toUpperCase()
          : "CLIENTE";
    } else {
      nombreClienteSpan.textContent = "CLIENTE";
    }
  } catch (error) {
    console.error("Error cargando perfil:", error);
    nombreClienteSpan.textContent = "CLIENTE";
  }
}

/* ===============================
   SELECCIÓN DE SERVICIO
================================ */

const tarjetasServicio = document.querySelectorAll(".service-card");
const inputCategoria = document.getElementById("categoriaSeleccionada");
const btnLabel = document.getElementById("btnLabel");

tarjetasServicio.forEach((card) => {
  card.addEventListener("click", () => {
    tarjetasServicio.forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");

    servicioSeleccionado = card.getAttribute("data-category");
    inputCategoria.value = servicioSeleccionado;
    btnLabel.textContent = servicioSeleccionado;
  });
});

/* ===============================
   CREAR SOLICITUD
================================ */

formulario.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!servicioSeleccionado) {
    alert("Selecciona un servicio");
    return;
  }

  const direccion = formulario.direccion.value.trim();
  const descripcion = formulario.descripcion.value.trim();

  if (!direccion || !descripcion) {
    alert("Completa todos los campos");
    return;
  }

  try {
    await addDoc(collection(db, "services"), {
      cliente_id: usuarioActual.uid,
      categoria: servicioSeleccionado,
      direccion,
      descripcion,
      estado: "pendiente",
      tecnico_id: null,
      eta: null,
      created_at: serverTimestamp(),
      zona: "auto",
      pago_estado: "preautorizado"
    });

    formulario.reset();
    tarjetasServicio.forEach(c => c.classList.remove("selected"));
    btnLabel.textContent = "Servicio";
    servicioSeleccionado = null;

    alert("Solicitud enviada. Buscando técnico...");
  } catch (error) {
    console.error("Error creando solicitud:", error);
    alert("Error al crear la solicitud");
  }
});

/* ===============================
   ESCUCHAR SOLICITUDES CLIENTE
================================ */

function escucharSolicitudesCliente() {
  const q = query(
    collection(db, "services"),
    where("cliente_id", "==", usuarioActual.uid),
    orderBy("created_at", "desc")
  );

  onSnapshot(q, (snapshot) => {
    solicitudesCliente.innerHTML = "";

    if (snapshot.empty) {
      solicitudesCliente.innerHTML = `
        <p class="text-slate-500 text-sm italic">
          Aún no tienes servicios registrados.
        </p>
      `;
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      const card = document.createElement("div");
      card.className =
        "bg-zinc-900 border border-white/10 p-5 rounded-2xl";

      card.innerHTML = `
        <div class="flex justify-between items-center mb-2">
          <h4 class="font-black text-sm uppercase">
            ${data.categoria}
          </h4>
          <span class="text-xs px-3 py-1 rounded-full ${
            data.estado === "pendiente"
              ? "bg-yellow-500/20 text-yellow-400"
              : data.estado === "asignado"
              ? "bg-blue-500/20 text-blue-400"
              : data.estado === "finalizado"
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-red-500/20 text-red-400"
          }">
            ${data.estado}
          </span>
        </div>

        <p class="text-xs text-slate-400 mb-1">
          ${data.direccion}
        </p>

        <p class="text-xs text-slate-500">
          ${data.descripcion}
        </p>
      `;

      solicitudesCliente.appendChild(card);
    });
  });
}

/* ===============================
   LOGOUT
================================ */

logoutBtn.addEventListener("click", async () => {
  const salir = confirm("¿Deseas cerrar sesión?");
  if (!salir) return;

  try {
    await cerrarSesion();
    location.href = "login.html";
  } catch (error) {
    console.error("Error al salir:", error);
  }
});
