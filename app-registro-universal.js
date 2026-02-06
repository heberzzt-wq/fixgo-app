/**
 * FixGo – app-registro-universal.js
 * Registro Universal
 * Roles: cliente | tecnico | admin
 * Flujo:
 *  - Crear usuario Auth
 *  - Crear perfil Firestore
 *  - Redirigir según rol
 */

import {
  auth,
  registrarUsuario,
  loginGoogle,
  db
} from "./firebase.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===============================
   ELEMENTOS DOM
================================ */

const formRegistro = document.getElementById("registroForm");
const rolInput = document.getElementById("rol");
const googleBtn = document.getElementById("googleBtn");

/* ===============================
   UTILIDADES
================================ */

function obtenerRol() {
  const params = new URLSearchParams(window.location.search);
  return params.get("rol") || rolInput?.value || "cliente";
}

function redirigirPorRol(rol) {
  if (rol === "cliente") {
    window.location.href = "index.html";
  } else if (rol === "tecnico") {
    window.location.href = "area-tecnico.html";
  } else if (rol === "admin") {
    window.location.href = "admin.html";
  } else {
    window.location.href = "index.html";
  }
}

/* ===============================
   REGISTRO EMAIL / PASSWORD
================================ */

if (formRegistro) {
  formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();

    const rol = obtenerRol();

    const nombre = formRegistro.nombre?.value.trim() || "";
    const email = formRegistro.email.value.trim();
    const password = formRegistro.password.value.trim();

    if (!email || !password) {
      alert("Email y contraseña son obligatorios");
      return;
    }

    try {
      const user = await registrarUsuario(
        email,
        password,
        rol,
        {
          nombre,
          nivel: rol === "tecnico" ? "bronce" : null,
          activo: true,
          validado: rol === "cliente",
          creado_en: serverTimestamp()
        }
      );

      // Datos específicos por rol
      if (rol === "tecnico") {
        await setDoc(
          doc(db, "tecnicos", user.uid),
          {
            uid: user.uid,
            nombre,
            email,
            nivel: "bronce",
            servicios_realizados: 0,
            disponible: false,
            documentos: {
              ine: false,
              csf: false,
              vehiculo: false,
              selfie: false
            },
            creado_en: serverTimestamp()
          }
        );
      }

      if (rol === "cliente") {
        await setDoc(
          doc(db, "clientes", user.uid),
          {
            uid: user.uid,
            nombre,
            email,
            tipo: "PF",
            tarjeta_registrada: false,
            creado_en: serverTimestamp()
          }
        );
      }

      alert("Registro exitoso");
      redirigirPorRol(rol);

    } catch (error) {
      console.error("Error registro:", error);
      alert(error.message || "Error al registrarse");
    }
  });
}

/* ===============================
   REGISTRO CON GOOGLE
================================ */

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    const rol = obtenerRol();

    try {
      const user = await loginGoogle(rol);

      // Validar existencia de subcolecciones
      if (rol === "cliente") {
        await setDoc(
          doc(db, "clientes", user.uid),
          {
            uid: user.uid,
            nombre: user.displayName || "",
            email: user.email,
            tipo: "PF",
            tarjeta_registrada: false,
            creado_en: serverTimestamp()
          },
          { merge: true }
        );
      }

      if (rol === "tecnico") {
        await setDoc(
          doc(db, "tecnicos", user.uid),
          {
            uid: user.uid,
            nombre: user.displayName || "",
            email: user.email,
            nivel: "bronce",
            servicios_realizados: 0,
            disponible: false,
            documentos: {
              ine: false,
              csf: false,
              vehiculo: false,
              selfie: false
            },
            creado_en: serverTimestamp()
          },
          { merge: true }
        );
      }

      alert("Ingreso exitoso");
      redirigirPorRol(rol);

    } catch (error) {
      console.error("Error Google:", error);
      alert("Error al ingresar con Google");
    }
  });
}
