/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MAIN CONTROLLER (ROUTER & GATEKEEPER)
 * Archivo: app-main.js
 * Versión: 7.0.0 Fortress AI Kernel
 * ======================================================================================
 */

console.log("🚦 [app-main.js] Fortress AI Kernel v7.0.0 ONLINE");

// =====================================================
// 🔥 IMPORTS
// =====================================================
import {
  observarAuth,
  auth,
  signOut,
  db,
  getDoc,
  doc,
  addDoc,
  collection,
  updateDoc,
  serverTimestamp
} from "./firebase.js";

import {
  query,
  getDocs,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
  iniciarPanelAdmin,
  iniciarPanelTecnico,
  iniciarPanelCliente
} from "./app-panel.js";

import { iniciarMotorBI } from "./app-bi.js";

import { runJarvis } from "./gestia-core/jarvis/jarvis.orchestrator.js";
import { analyzeIntent } from "./gestia-core/jarvis/jarvis.vision.engine.js";

// =====================================================
// 🧠 FORTRESS KERNEL + AUTOHEAL V7.1
// =====================================================
const V7 = {
  version: "7.1.0",
  start: performance.now(),
  errors: [],
  modules: [],
  health: "BOOTING",

  autoheal: {
    enabled: true,
    retries: 0,
    maxRetries: 3,
    repaired: []
  },

  monitor: {
    firebase: false,
    auth: false,
    ui: false,
    network: navigator.onLine
  }
};

window.V7 = V7;

// =====================================================
// 🔥 CONSTANTES CORE
// =====================================================
const MASTER_EMAIL = "hebertoh-m@hotmail.com";

const RUTAS = {
  publicas: ["index.html", "login.html", "registro.html", "/"],
  admin: "admin.html",
  tecnico: "tecnico.html",
  cliente: "cliente.html",
  residencial: "residencial.html"
};

// =====================================================
// 🎬 LOADER PREMIUM
// =====================================================
function showLoader(msg = "INICIANDO SISTEMA...") {
  const old = document.getElementById("fortressLoader");
  if (old) old.remove();

  const div = document.createElement("div");
  div.id = "fortressLoader";

  div.innerHTML = `
    <div style="
      position:fixed;
      inset:0;
      background:#050505;
      color:#00ffd0;
      z-index:999999;
      display:flex;
      align-items:center;
      justify-content:center;
      flex-direction:column;
      font-family:Arial;
      letter-spacing:2px;
    ">
      <h1>GESTIA V7</h1>
      <p>${msg}</p>
    </div>
  `;

  document.body.appendChild(div);
}

function hideLoader() {
  const el = document.getElementById("fortressLoader");
  if (el) el.remove();
}

// =====================================================
// 🔥 HELPERS
// =====================================================
function revealUI() {
  document.body.style.display = "block";
}

function hideUI() {
  document.body.style.display = "none";
}

function go(url) {
  window.location.replace(url);
}

function isMaster(user) {
  return (
    user?.email &&
    user.email.toLowerCase() === MASTER_EMAIL
  );
}

// =====================================================
// 🛡️ WATCHDOG GLOBAL + AUTOHEAL
// =====================================================
window.addEventListener("error", (e) => {
  console.error("💥 JS ERROR:", e.message);

  V7.errors.push({
    type: "error",
    msg: e.message,
    time: Date.now()
  });

  intentarAutoHeal("js_runtime");
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("💥 PROMISE ERROR:", e.reason);

  V7.errors.push({
    type: "promise",
    msg: String(e.reason),
    time: Date.now()
  });

  intentarAutoHeal("promise_failure");
});

// =====================================================
// ♻️ AUTOHEAL ENGINE
// =====================================================
function intentarAutoHeal(origen = "unknown") {
  if (!V7.autoheal.enabled) return;

  if (V7.autoheal.retries >= V7.autoheal.maxRetries) {
    console.warn("🛑 AUTOHEAL LIMIT REACHED");
    return;
  }

  V7.autoheal.retries++;

  console.warn(
    `♻️ AUTOHEAL ACTIVADO | causa=${origen} | intento=${V7.autoheal.retries}`
  );

  // Recuperación básica inmediata
  if (typeof revealUI === "function") {
    revealUI();
  }

  if (typeof hideLoader === "function") {
    hideLoader();
  }

  V7.health = "RECOVERING";

  setTimeout(() => {
    V7.health = "ONLINE";

    V7.autoheal.repaired.push({
      source: origen,
      repairedAt: Date.now()
    });

    console.log("✅ AUTOHEAL COMPLETADO");
  }, 1200);
}

// =====================================================
// 🔍 AUDITORÍA AUTO
// =====================================================
function auditStartup() {
  console.table({
    online: navigator.onLine,
    idioma: navigator.language,
    memoria: navigator.deviceMemory || "N/A",
    nucleos: navigator.hardwareConcurrency || "N/A",
    screen: `${screen.width}x${screen.height}`
  });
}

// =====================================================
// ⚡ PRECARGA INTELIGENTE
// =====================================================
async function smartPreload() {
  const mods = [
    "./gestia-core/jarvis/jarvis.orchestrator.js",
    "./gestia-core/jarvis/jarvis.vision.engine.js",
    "./app-panel.js",
    "./app-bi.js"
  ];

  for (const mod of mods) {
    try {
      await import(mod);
      V7.modules.push(mod);
    } catch (e) {
      console.warn("⚠️ No cargó:", mod, e);
    }
  }
}

// =====================================================
// 🚀 ANTI BLACK SCREEN
// =====================================================
hideUI();
showLoader("VERIFICANDO SISTEMA...");

setTimeout(() => {
  if (document.body.style.display === "none") {
    revealUI();
    hideLoader();
  }
}, 5000);

// =====================================================
// 🚀 BOOT SEQUENCE + HEALTH MONITOR
// =====================================================
(async () => {
  auditStartup();

  showLoader("PRECARGANDO MÓDULOS...");
  await smartPreload();

  showLoader("VALIDANDO NÚCLEO...");
  await new Promise(r => setTimeout(r, 600));

  // Validaciones base
  V7.monitor.firebase =
    typeof db !== "undefined";

  V7.monitor.auth =
    typeof auth !== "undefined";

  V7.monitor.ui =
    typeof document !== "undefined";

  if (
    !V7.monitor.firebase ||
    !V7.monitor.auth
  ) {
    intentarAutoHeal("boot_validation");
  }

  showLoader("ACTIVANDO FORTRESS...");
  await new Promise(r => setTimeout(r, 900));

  V7.health = "ONLINE";

  const total = Math.round(
    performance.now() - V7.start
  );

  console.log(
  `🚀 Boot completado en ${total}ms`
);

if (typeof hideLoader === "function") {
  hideLoader();
}

if (typeof revealUI === "function") {
  revealUI();
}
  // Heartbeat continuo
  setInterval(() => {
    V7.monitor.network =
      navigator.onLine;

    if (!navigator.onLine) {
      V7.health = "OFFLINE";
    } else if (
      V7.health === "OFFLINE"
    ) {
      V7.health = "ONLINE";
    }

  }, 5000);

})();

// =====================================================
// 🔥 AUTH CORE
// =====================================================
observarAuth(async (userAuth) => {
  const pathActual = window.location.pathname;

  const archivoActual =
    pathActual.substring(
      pathActual.lastIndexOf("/") + 1
    ) || "index.html";

  const esPublica =
    RUTAS.publicas.includes(archivoActual);

  if (!userAuth) {
    if (!esPublica) {
      console.warn("⛔ Intruso detectado.");
      return go("login.html");
    }

    revealUI();
    hideLoader();
    return;
  }

  let userRol = "cliente";
  let userData = {};

  if (isMaster(userAuth)) {
    userRol = "admin";
    console.log("👑 MASTER MODE ACTIVE");
  } else {
    try {
      const ref = doc(db, "users", userAuth.uid);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        userData = snap.data();
        userRol = userData.rol || "cliente";
      }

    } catch (err) {
      console.error("❌ Perfil error:", err);
    }
  }

  let rolBase = userRol;

  if (userRol === "b2c")
    rolBase = "cliente";

  if (
    userRol === "tecnico_gp" ||
    userRol === "tecnico_interno"
  ) rolBase = "tecnico";

  userAuth.rol_real = userRol;
  userAuth.rol = rolBase;
  userAuth.nombre =
    userData.nombre || userAuth.email;

  userAuth.efectivo_autorizado =
    userData.efectivo_autorizado || false;

  console.log(
    `✅ ${userAuth.email} | ${userAuth.rol}`
  );

  if (userAuth.rol === "admin") {
    window.runJarvis = runJarvis;
    window.analyzeIntent = analyzeIntent;
  } else {
    delete window.runJarvis;
    delete window.analyzeIntent;
  }

  if (
    userAuth.rol === "admin" &&
    !pathActual.includes("admin")
  ) return go(RUTAS.admin);

  if (
    userAuth.rol === "tecnico" &&
    !pathActual.includes("tecnico")
  ) return go(RUTAS.tecnico);

  if (
    userAuth.rol === "cliente" &&
    !pathActual.includes("cliente")
  ) return go(RUTAS.cliente);

  if (
    userAuth.rol_real === "b2b_admin" &&
    !pathActual.includes("residencial")
  ) return go(RUTAS.residencial);

  revealUI();
  hideLoader();

  try {
    if (userAuth.rol === "admin") {
      await iniciarPanelAdmin(userAuth);

      setTimeout(() => {
        iniciarMotorBI("dashboardAnalitico");
      }, 500);
    }

    else if (userAuth.rol === "tecnico") {
      await iniciarPanelTecnico(userAuth);
    }

    else if (userAuth.rol === "cliente") {
      await iniciarPanelCliente(userAuth);

      const contenedor =
        document.getElementById(
          "contenedorOpcionEfectivo"
        );

      if (
        userAuth.efectivo_autorizado &&
        contenedor
      ) {
        contenedor.classList.remove("hidden");
      }
    }

  } catch (error) {
    console.error(
      "❌ Error de arranque:",
      error
    );
  }
});

// =====================================================
// 🧠 EVENTOS DINÁMICOS V7
// =====================================================
function iniciarEscuchaEventosDinamicos() {
  const panelAcciones =
    document.getElementById("panelAcciones");

  if (!panelAcciones) return;

  const nuevoPanel =
    panelAcciones.cloneNode(true);

  panelAcciones.parentNode.replaceChild(
    nuevoPanel,
    panelAcciones
  );

  nuevoPanel.addEventListener(
    "click",
    (e) => {
      const btn =
        e.target.closest("button");

      if (!btn) return;

      const texto =
        btn.innerText.trim();

      if (
        texto.includes(
          "CREAR COTIZACIÓN"
        )
      ) {
        console.log(
          "📄 Motor Cotización lanzado"
        );

        window.dispatchEvent(
          new CustomEvent(
            "abrirMotorCotizacion"
          )
        );
      }
    }
  );
}

// =====================================================
// 🧠 UI GLOBAL V7
// =====================================================
function actualizarInterfazGlobal(user) {
  const userNameDisplay =
    document.getElementById("userName") ||
    document.getElementById(
      "userNameDisplay"
    );

  if (userNameDisplay) {
    userNameDisplay.innerText =
      (
        user.nombre ||
        user.email
      ).toUpperCase();
  }

  document
    .querySelectorAll(
      "#btnLogout, #logoutBtn"
    )
    .forEach((btn) => {
      const nuevo =
        btn.cloneNode(true);

      btn.parentNode.replaceChild(
        nuevo,
        btn
      );

      nuevo.addEventListener(
        "click",
        async (e) => {
          e.preventDefault();

          const ok = confirm(
            "¿Cerrar sesión de GestiaPremium?"
          );

          if (!ok) return;

          try {
            showLoader(
              "CERRANDO SESIÓN..."
            );

            await signOut(auth);

            document.body.style.display =
              "none";

            window.location.replace(
              "login.html"
            );

          } catch (error) {
            console.error(
              "Logout error:",
              error
            );

          } finally {
            hideLoader();
          }
        }
      );
    });
}

// ======================================================================================
// 🚨 SISTEMA DE DISPUTAS V7
// ======================================================================================
window.abrirModalDisputa =
function(serviceId, customerId) {

  document.getElementById(
    "disputaServiceId"
  ).value = serviceId;

  document.getElementById(
    "disputaCustomerId"
  ).value = customerId;

  document.getElementById(
    "disputaDescripcion"
  ).value = "";

  const modal =
    document.getElementById(
      "modalDisputaPago"
    );

  modal.classList.remove("hidden");
  modal.style.display = "flex";
};

window.cerrarModalDisputa =
function() {
  const modal =
    document.getElementById(
      "modalDisputaPago"
    );

  modal.classList.add("hidden");
  modal.style.display = "none";
};

window.enviarReportePago =
async function() {

  const serviceId =
    document.getElementById(
      "disputaServiceId"
    ).value;

  const customerId =
    document.getElementById(
      "disputaCustomerId"
    ).value;

  const descripcion =
    document.getElementById(
      "disputaDescripcion"
    ).value.trim();

  const btn =
    document.getElementById(
      "btnEnviarDisputa"
    );

  if (!descripcion) {
    alert(
      "Por favor, describe el problema."
    );
    return;
  }

  try {
    btn.disabled = true;

    btn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> ENVIANDO...';

    const authUser =
      auth.currentUser;

    if (!authUser)
      throw new Error(
        "No autenticado"
      );

    const ticketRef =
      await addDoc(
        collection(
          db,
          "support_tickets"
        ),
        {
          serviceId,
          reportedBy:
            authUser.uid,
          customerId,
          proId:
            authUser.uid,
          issueType:
            "payment_refusal",
          status: "open",
          createdAt:
            serverTimestamp(),
          resolvedAt: null
        }
      );

    await addDoc(
      collection(
        db,
        `support_tickets/${ticketRef.id}/messages`
      ),
      {
        senderId:
          authUser.uid,
        message:
          descripcion,
        timestamp:
          serverTimestamp()
      }
    );

    await updateDoc(
      doc(
        db,
        "services",
        serviceId
      ),
      {
        status:
          "disputed",
        disputeTicketId:
          ticketRef.id
      }
    );

    alert(
      "🚨 Reporte enviado correctamente."
    );

    window.cerrarModalDisputa();

  } catch (error) {
    console.error(
      "Disputa error:",
      error
    );

  } finally {
    btn.disabled = false;

    btn.innerHTML =
      '<i class="fas fa-paper-plane"></i> ENVIAR REPORTE';
  }
};

// ======================================================================================
// 🛡️ GARANTÍAS V7
// ======================================================================================
window.abrirModalGarantia =
function(serviceId, proId) {

  document.getElementById(
    "garantiaServiceId"
  ).value = serviceId;

  document.getElementById(
    "garantiaProId"
  ).value = proId;

  document.getElementById(
    "garantiaDescripcion"
  ).value = "";

  const modal =
    document.getElementById(
      "modalGarantiaCliente"
    );

  modal.classList.remove("hidden");
  modal.style.display = "flex";
};

window.cerrarModalGarantia =
function() {

  const modal =
    document.getElementById(
      "modalGarantiaCliente"
    );

  modal.classList.add("hidden");
  modal.style.display = "none";
};

window.enviarReporteGarantia =
async function() {

  const serviceId =
    document.getElementById(
      "garantiaServiceId"
    ).value;

  const proId =
    document.getElementById(
      "garantiaProId"
    ).value;

  const descripcion =
    document.getElementById(
      "garantiaDescripcion"
    ).value.trim();

  const btn =
    document.getElementById(
      "btnEnviarGarantia"
    );

  if (!descripcion) {
    alert(
      "Por favor describe el fallo."
    );
    return;
  }

  try {
    btn.disabled = true;

    btn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> ENVIANDO...';

    const authUser =
      auth.currentUser;

    if (!authUser)
      throw new Error(
        "No autenticado"
      );

    const ticketRef =
      await addDoc(
        collection(
          db,
          "support_tickets"
        ),
        {
          serviceId,
          reportedBy:
            authUser.uid,
          customerId:
            authUser.uid,
          proId,
          issueType:
            "warranty_claim",
          status: "open",
          createdAt:
            serverTimestamp(),
          resolvedAt: null
        }
      );

    await addDoc(
      collection(
        db,
        `support_tickets/${ticketRef.id}/messages`
      ),
      {
        senderId:
          authUser.uid,
        message:
          descripcion,
        timestamp:
          serverTimestamp()
      }
    );

    await updateDoc(
      doc(
        db,
        "services",
        serviceId
      ),
      {
        estado:
          "warranty_requested",
        warrantyTicketId:
          ticketRef.id
      }
    );

    alert(
      "🛡️ Garantía enviada."
    );

    window.cerrarModalGarantia();

  } catch (error) {
    console.error(
      "Garantía error:",
      error
    );

  } finally {
    btn.disabled = false;

    btn.innerHTML =
      '<i class="fas fa-shield-alt"></i> EXIGIR GARANTÍA';
  }
};

// ======================================================================================
// ⚖️ TRIBUNAL ADMIN V7
// ======================================================================================
window.resolverGarantia =
async (
  serviceId,
  ticketId,
  aprobar
) => {

  const ok = confirm(
    aprobar
      ? "¿Aprobar garantía?"
      : "¿Rechazar garantía?"
  );

  if (!ok) return;

  try {

    if (aprobar) {

      const qMessages =
        query(
          collection(
            db,
            `support_tickets/${ticketId}/messages`
          ),
          orderBy(
            "timestamp",
            "asc"
          ),
          limit(1)
        );

      const msgSnap =
        await getDocs(
          qMessages
        );

      const reporteFalla =
        !msgSnap.empty
          ? msgSnap.docs[0]
              .data()
              .message
          : "Falla reportada.";

      await updateDoc(
        doc(
          db,
          "services",
          serviceId
        ),
        {
          estado:
            "trabajando",
          es_garantia: true,
          motivo_garantia:
            reporteFalla
        }
      );

    } else {

      await updateDoc(
        doc(
          db,
          "services",
          serviceId
        ),
        {
          estado:
            "finalizado"
        }
      );
    }

    await updateDoc(
      doc(
        db,
        "support_tickets",
        ticketId
      ),
      {
        status:
          "resolved",
        resolvedAt:
          serverTimestamp()
      }
    );

    const modal =
      document.getElementById(
        "modalJuezAdmin"
      );

    if (modal)
      modal.remove();

    alert(
      "✅ Sentencia aplicada."
    );

  } catch (e) {
    console.error(
      "Tribunal error:",
      e
    );
  }
};

