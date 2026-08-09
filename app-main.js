/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MAIN CONTROLLER (ROUTER & GATEKEEPER)
 * Archivo: app-main.js
 * Versión: 7.0.0 Fortress AI Kernel
 * ======================================================================================
 */

console.log(
  "🚦 [app-main.js] Fortress AI Kernel v7.0.0 ONLINE"
);

/* =====================================================
   🔥 IMPORTS
===================================================== */

/* =====================================================
   FIREBASE CORE
===================================================== */

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
  resolveGestiaRole,
  resolveGestiaRouteDecision
} from "./gestia-core/auth/role-authority.js?v=role-authority-v3-single-navigation-20260713";

/* =====================================================
   FIRESTORE EXTENSIONS
===================================================== */

import {

  query,
  getDocs,
  orderBy,
  limit

} from
"https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* =====================================================
   UI PANELS
===================================================== */

import {

  iniciarPanelAdmin,
  iniciarPanelTecnico,
  iniciarPanelCliente

} from "./app-panel.js";

/* =====================================================
   BUSINESS INTELLIGENCE
===================================================== */

import {

  iniciarMotorBI

} from "./app-bi.js";

/* =====================================================
   COGNITIVE RUNTIME BOOTSTRAP
===================================================== */

import "./gestia-core/gestia.runtime.v7.js?v=role-authority-v3-single-navigation-20260713";


/* =====================================================
   GESTIA SOVEREIGN KERNEL
===================================================== */

import "./gestia-core/jarvis.kernel.js";

/* =====================================================
   JARVIS EXECUTION FABRIC
===================================================== */

import "./gestia-core/operations-executor.engine.js";

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
  publicas: ["index.html", "login.html", "registro.html", "/"]
};

function isCurrentSurfacePublic() {
  const pathname =
    window.location.pathname;

  const currentFile =
    pathname.substring(
      pathname.lastIndexOf("/") + 1
    ) || "/";

  return RUTAS.publicas.includes(
    currentFile
  );
}
/* =====================================================
   🧠 SIA7 SURFACE REGISTRATION
===================================================== */

if (

  window.GestiaRuntime &&

  typeof window.GestiaRuntime
    .registerSurface === "function"

) {

  window.GestiaRuntime
    .registerSurface({

      id:
        "admin",

      runtime:
        "ADMIN_RUNTIME",

      owner:
        "panel-admin.js",

      routes: [

        "admin.html",

        "ceo.html",

        "noc.html"

      ],

      protected:
        true
    });

  window.GestiaRuntime
    .registerSurface({

      id:
        "cliente",

      runtime:
        "CLIENT_RUNTIME",

      owner:
        "panel-cliente.js",

      routes: [

        "cliente.html"

      ],

      protected:
        true
    });

  window.GestiaRuntime
    .registerSurface({

      id:
        "tecnico",

      runtime:
        "TECH_RUNTIME",

      owner:
        "panel-tecnico.js",

      routes: [

        "tecnico.html"

      ],

      protected:
        true
    });

  window.GestiaRuntime
    .registerSurface({

      id:
        "b2b",

      runtime:
        "B2B_RUNTIME",

      owner:
        "modulo-b2b.js",

      routes: [

        "gestia-modulo.html",

        "residencial.html"

      ],

      protected:
        true
    });

  console.log(
    "🧠 [SURFACE_GOVERNANCE_READY]"
  );
}
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

  if (!document.body) return;

  document.documentElement
    .classList
    .remove("gestia-auth-pending");

  document.body.style.visibility =
    "visible";

  document.body.style.opacity =
    "1";

  document.body.style.pointerEvents =
    "auto";
}

function hideUI() {

  if (!document.body) return;

  document.documentElement
    .classList
    .add("gestia-auth-pending");

}
function go(url) {
  window.location.replace(url);
}

/* =====================================================
   🧠 ACTIVE SURFACE DETECTOR
===================================================== */

function resolveCurrentSurface() {

  try {

    const path =
      window.location.pathname
        .toLowerCase();

    if (

      path.includes("admin") ||

      path.includes("ceo") ||

      path.includes("noc")

    ) {

      return "admin";
    }

    if (

      path.includes("tecnico")

    ) {

      return "tecnico";
    }

    if (

      path.includes("cliente")

    ) {

      return "cliente";
    }

    if (

      path.includes("gestia-modulo") ||

      path.includes("residencial")

    ) {

      return "b2b";
    }

    return "public";

  }

  catch(error) {

    console.error(
      "🚨 [SURFACE_RESOLVE_FAIL]",
      error
    );

    return "unknown";
  }
}

/* =====================================================
   SURFACE ACTIVATION
===================================================== */

const activeSurface =

  resolveCurrentSurface();

/* ==========================================
   ACTIVE SURFACE OWNERSHIP
========================================== */

window.__ACTIVE_SURFACE__ =
  activeSurface;


  /* =====================================================
   SIA7 COGNITIVE ATTACHMENT MAP V1
===================================================== */

window.__SURFACE_RUNTIME_MAP__ ||= {};

window.__SURFACE_RUNTIME_MAP__[activeSurface] = {

  surface:
    activeSurface,

  routerKernel:
    "app-main.js",

  cognitiveRuntime:

    typeof window
      .restoreRuntimeSnapshot ===
      "function",

  snapshotAuthority:

    typeof window
      .createRuntimeSnapshot ===
      "function",

  governanceRuntime:

    !!window.GestiaRuntime,

  timestamp:
    Date.now()
};

console.log(
  "🧠 [SURFACE_RUNTIME_MAP]",
  window.__SURFACE_RUNTIME_MAP__[
    activeSurface
  ]
);

if (

  window.GestiaRuntime &&

  typeof window.GestiaRuntime
    .setSurface === "function"

) {

  window.GestiaRuntime
    .setSurface(
      activeSurface
    );

  console.log(
    `🧠 [SURFACE_ACTIVE]: ${activeSurface}`
  );
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

  /* =====================================================
   🧠 SURFACE ISOLATION GUARD
===================================================== */

const activeSurface =

  window.GestiaRuntime
    ?.surfaces
    ?.current;

const protectedSurface =

  [

    "admin",

    "b2b"

  ].includes(
    activeSurface
  );

if (

  protectedSurface &&

  origen ===
    "js_runtime"

) {

  console.warn(

    "🛡️ [SURFACE_HEAL_BLOCKED]",

    {

      surface:
        activeSurface,

      origen
    }
  );

  return false;
}

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

window.addEventListener(

  "DOMContentLoaded",

  () => {

    hideUI();

    showLoader(
      "VERIFICANDO SISTEMA..."
    );

    setTimeout(() => {

      if (!document.body) return;

      const pending =
        document.documentElement
          .classList
          .contains("gestia-auth-pending");

      if (
        pending &&
        isCurrentSurfacePublic()
      ) {

        revealUI();

        hideLoader();
      }

      else if (pending) {
        showLoader(
          "VALIDANDO SESIÃ“N Y ROL..."
        );
      }

    }, 5000);

  }
);
// =====================================================
// 🚀 BOOT SEQUENCE + HEALTH MONITOR
// =====================================================
(async () => {

  auditStartup();

  /* =====================================================
     PRELOAD
  ===================================================== */

  showLoader("PRECARGANDO MÓDULOS...");
  await smartPreload();

  /* =====================================================
     VALIDACIÓN NÚCLEO
  ===================================================== */

  showLoader("VALIDANDO NÚCLEO...");
  await new Promise(r =>
    setTimeout(r, 600)
  );

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
    intentarAutoHeal(
      "boot_validation"
    );
  }

 /* =====================================================
   ACTIVACIÓN FORTRESS
===================================================== */

showLoader("ACTIVANDO FORTRESS...");

await new Promise(r =>
    setTimeout(r, 900)
);

V7.health = "ONLINE";

const total = Math.round(
    performance.now() - V7.start
);

console.log(
    `🚀 Boot completado en ${total}ms`
);


const fortressBoot =

    document.getElementById(
        "fortressBootScreen"
    );

if (fortressBoot) {

    fortressBoot.remove();
}
if (isCurrentSurfacePublic()) {
  hideLoader();
  revealUI();
}
else {
  showLoader(
    "VALIDANDO PERFIL..."
  );
}

/* ==========================================
   SIA7 SURFACE REVEAL
========================================== */

  /* =====================================================
     JARVIS INTELLIGENT BRIEFING
  ===================================================== */

  setTimeout(() => {

    try {

      let briefing =
`Sistema Fortress online.

Boot: ${total}ms
Red: ${navigator.onLine ? "Activa" : "Caída"}
RAM: ${navigator.deviceMemory || "N/D"} GB`;

      if (
        window.JarvisMemory &&
        typeof window
          .JarvisMemory
          .getBriefing ===
          "function"
      ) {

        const intel =
          window.JarvisMemory
            .getBriefing();

        briefing += `

Módulo débil:
${intel.weakestModule}

Score:
${intel.weakestScore}

Éxitos:
${intel.successes}

Fallos:
${intel.failures}`;
      }

      if (
        window.renderJarvisResponse
      ) {
        window.renderJarvisResponse(
          "Jarvis Briefing",
          briefing,
          "success"
        );
      }

      if (
        window.hablarJarvis
      ) {
        window.hablarJarvis(
          "Buenos días Arquitecto. Núcleo estable. Briefing disponible."
        );
      }

    } catch (err) {
      console.warn(
        "Briefing fail",
        err
      );
    }

  }, 1400);

  /* =====================================================
     SUPERVISED UI AUDIT
  ===================================================== */

  setTimeout(() => {

    try {

      const mobile =
        window.innerWidth <= 768;

      const header =
        document.querySelector(
          "header"
        );

      if (
        mobile &&
        header &&
        header.offsetHeight >
          95
      ) {

        const proposal =
`Detecté saturación visual móvil en encabezado.

Propongo:
• Compactar header
• Reducir iconos
• Mejorar espacio útil

Esperando autorización.`;

        if (
          window.renderJarvisResponse
        ) {
          window.renderJarvisResponse(
            "Jarvis Auditor UI",
            proposal,
            "warning"
          );
        }

        if (
          window.JarvisContextMemory &&
          typeof window
            .JarvisContextMemory
            .rememberIssue ===
            "function"
        ) {
          window
            .JarvisContextMemory
            .rememberIssue({
              type:
                "MOBILE_UI",
              detail:
                "Header saturado detectado"
            });
        }
      }

    } catch (err) {}

  }, 2600);

  /* =====================================================
     HEARTBEAT CONTINUO
  ===================================================== */

  setInterval(() => {

    V7.monitor.network =
      navigator.onLine;

    if (
      !navigator.onLine
    ) {
      V7.health =
        "OFFLINE";
    }

    else if (
      V7.health ===
      "OFFLINE"
    ) {
      V7.health =
        "ONLINE";
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

  let userRol = null;
  const userData = {
    ...userAuth
  };

  if (isMaster(userAuth)) {
    userRol = "admin";
    console.log("👑 MASTER MODE ACTIVE");
  } else {
    userRol = userData.rol || userData.role || null;
  }

  if (!userRol) {
    console.warn("⏳ Perfil sin rol confirmado. Manteniendo loader activo.");
    hideUI();
    showLoader("VALIDANDO PERFIL...");
    return;
  }

  const roleResolution =
    resolveGestiaRole(
      userAuth,
      {
        ...userData,
        rol: userRol
      }
    );

  const rolBase =
    roleResolution.role;

  userAuth.rol_real =
    roleResolution.roleReal ||
    userRol;
  userAuth.rol = rolBase;
  userAuth.nombre =
    userData.nombre || userAuth.email;

  userAuth.efectivo_autorizado =
    userData.efectivo_autorizado || false;

  console.log(
    `✅ ${userAuth.email} | ${userAuth.rol}`
  );

  window.cerrarSesionGlobal = async () => {

  try {

    await auth.signOut();

    window.location.replace(
      "login.html"
    );

  } catch (error) {

    console.error(
      "❌ Logout error:",
      error
    );
  }
};

  if (userAuth.rol === "admin") {
    window.runJarvis = runJarvis;
    window.analyzeIntent = analyzeIntent;
  } else {
    delete window.runJarvis;
    delete window.analyzeIntent;
  }

  const routeDecision =
    resolveGestiaRouteDecision({
      user: userAuth,
      metadata: {
        ...userData,
        rol: userAuth.rol,
        role: userAuth.rol,
        roleReal: userAuth.rol_real
      },
      pathname: pathActual,
      search: window.location.search
    });

  if (routeDecision.redirect && routeDecision.target) {
    hideUI();
    showLoader("ABRIENDO PANEL AUTORIZADO...");

    console.log("[APP_MAIN_ROLE_AUTHORITY_REDIRECT]", {
      role: routeDecision.role,
      from: routeDecision.page,
      to: routeDecision.target,
      reason: routeDecision.reason
    });

    return go(routeDecision.target);
  }

  if (routeDecision.reason === "role_without_registered_route") {
    hideUI();
    showLoader("ROL SIN SUPERFICIE AUTORIZADA");
    console.error("[APP_MAIN_ROLE_AUTHORITY_DENY]", routeDecision);
    return;
  }

  revealUI();
  hideLoader();

  try {
    if (userAuth.rol === "admin") {
      await iniciarPanelAdmin(userAuth);

      setTimeout(() => {

    const dashboard =

        document.getElementById(
            "dashboardAnalitico"
        );

    if (!dashboard) {

        console.warn(
            "⚠️ Dashboard BI aún no disponible"
        );

        return;
    }

    iniciarMotorBI(
        "dashboardAnalitico"
    );

}, 500);
    }

   else if (userAuth.rol === "tecnico") {

    await iniciarPanelTecnico(userAuth);

}

else if (

    userAuth.rol === "cliente" &&

    userAuth.rol !== "admin"

) {

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

/**
 * =====================================================
 * 🧠 UI GLOBAL V7 - GESTIA PREMIUM
 * REVISIÓN: 5.94 (Anti-Duplicate Listener Logic)
 * Lead Architect: Heberto Mendoza
 * =====================================================
 */
function actualizarInterfazGlobal(user) {
  // 1. Actualización del nombre de usuario en el Dashboard
  const userNameDisplay =
    document.getElementById("userName") ||
    document.getElementById("userNameDisplay");

  if (userNameDisplay && user) {
    userNameDisplay.innerText = (user.nombre || user.email || "ADMIN").toUpperCase();
  }

  // 2. Control de Salida Segura (Logout)
  // Usamos el flag __logoutBound para evitar duplicidad sin romper el nodo
  document.querySelectorAll("#btnLogout, #logoutBtn").forEach((btn) => {
    
    if (btn.__logoutBound) return; // Evita bindeos duplicados si la función se rellama
    btn.__logoutBound = true;

    btn.addEventListener("click", async (e) => {
      e.preventDefault();

      const ok = confirm("¿Cerrar sesión de GestiaPremium?");
      if (!ok) return;

      try {
        if (typeof showLoader === "function") {
          showLoader("CERRANDO SESIÓN...");
        }

        // Validación de seguridad para la instancia de Firebase
        if (typeof signOut === "function" && auth) {
          await signOut(auth);
          console.log("✅ Sesión finalizada en Firebase");
        } else {
          console.warn("⚠️ Firebase signOut no detectado o auth inválido");
        }

        // Limpieza de UI y Redirección
        document.body.style.opacity = "0";
        window.location.replace("login.html");

      } catch (error) {
        console.error("❌ Logout error:", error);
        alert("Error al cerrar sesión. Revisa la consola.");
      } finally {
        if (typeof hideLoader === "function") {
          hideLoader();
        }
      }
    });
  });
  
  console.log("🛠️ Interfaz Global V7 sincronizada con éxito.");
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

/* =====================================================
   🚀 CENTINELA DE SALIDA SEGURA (DELEGACIÓN GLOBAL)
   Ubicación: app-main.js (Raíz del archivo)
   Versión: 5.66 - GestiaPremium
   ===================================================== */

document.addEventListener("click", async (e) => {
    // Detectamos si el clic fue en el botón de logout o en algo dentro de él (como el icono)
    const btn = e.target.closest("#logoutBtn, #btnLogout");

    if (btn) {
        e.preventDefault();
        console.log("📡 Señal de salida detectada por el Centinela Global...");

        // Validación táctica: Confirmación del usuario
        const ok = confirm("¿Deseas cerrar tu sesión en la Cabina de Mando?");
        if (!ok) {
            console.log("❌ Operación de salida cancelada por el usuario.");
            return;
        }

        try {
            // 1. Feedback visual (Jessica Mode)
            if (typeof showLoader === "function") {
                showLoader("DESCONECTANDO SISTEMAS...");
            }

            // 2. Ejecución en Firebase (Bypass de visto)
            if (typeof signOut === "function" && auth) {
                await signOut(auth);
                console.log("✅ Firebase Auth: Sesión terminada con éxito.");
            } else {
                throw new Error("Referencia a Firebase (auth/signOut) no encontrada.");
            }

            // 3. Limpieza de rastro y redirección
            document.body.style.opacity = "0";
            window.location.replace("login.html");

        } catch (error) {
            console.error("🚨 Error crítico en el cierre de sesión:", error);
            alert("Error al cerrar sesión. Revisa la consola (F12).");
        } finally {
            if (typeof hideLoader === "function") {
                hideLoader();
            }
        }
    }
});

console.log("🛠️ Centinela Global V5.66 activo y escuchando...");
