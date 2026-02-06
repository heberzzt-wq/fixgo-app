// =======================================
// FIXGO 2026 – REGISTRO & LOGIN UNIVERSAL
// app-registro-universal.js
// =======================================

console.log("✅ app-registro-universal.js cargado");

// ===============================
// IMPORTS
// ===============================
import {
  registrarUsuario,
  loginUsuario,
  loginGoogle,
  cerrarSesion,
  observarAuth,
  db,
  doc,
  setDoc,
  serverTimestamp
} from "./firebase.js";

// ===============================
// HELPERS
// ===============================
function $(id) {
  return document.getElementById(id);
}

function redirigirPorRol(rol) {
  if (rol === "cliente") window.location.href = "index.html";
  if (rol === "tecnico") window.location.href = "area-tecnico.html";
  if (rol === "admin") window.location.href = "admin.html";
}

// ===============================
// REGISTRO CLIENTE
// ===============================
const btnRegistroCliente = $("btnRegistroCliente");

if (btnRegistroCliente) {
  btnRegistroCliente.addEventListener("click", async () => {
    console.log("🟢 Click registro cliente");

    const email = $("emailCliente").value;
    const password = $("passwordCliente").value;
    const nombre = $("nombreCliente").value;
    const telefono = $("telefonoCliente").value;

    if (!email || !password || !nombre) {
      alert("Completa todos los campos");
      return;
    }

    try {
      await registrarUsuario(email, password, "cliente", {
        nombre,
        telefono,
        tipo: "cliente"
      });

      alert("Cliente registrado correctamente");
      window.location.href = "login.html";
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  });
}

// ===============================
// REGISTRO TECNICO
// ===============================
const btnRegistroTecnico = $("btnRegistroTecnico");

if (btnRegistroTecnico) {
  btnRegistroTecnico.addEventListener("click", async () => {
    console.log("🟢 Click registro técnico");

    const email = $("emailTecnico").value;
    const password = $("passwordTecnico").value;
    const nombre = $("nombreTecnico").value;
    const especialidad = $("especialidadTecnico").value;

    if (!email || !password || !nombre || !especialidad) {
      alert("Completa todos los campos");
      return;
    }

    try {
      const user = await registrarUsuario(email, password, "tecnico", {
        nombre,
        especialidad,
        tipo: "tecnico",
        verificado: false,
        online: false
      });

      await setDoc(
        doc(db, "tecnicos", user.uid),
        {
          uid: user.uid,
          nombre,
          especialidad,
          estado: "pendiente",
          creado: serverTimestamp()
        }
      );

      alert("Técnico registrado. En espera de validación.");
      window.location.href = "login.html";
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  });
}

// ===============================
// LOGIN EMAIL / PASSWORD
// ===============================
const btnLogin = $("btnLogin");

if (btnLogin) {
  btnLogin.addEventListener("click", async () => {
    console.log("🟢 Click login");

    const email = $("loginEmail").value;
    const password = $("loginPassword").value;

    if (!email || !password) {
      alert("Ingresa correo y contraseña");
      return;
    }

    try {
      await loginUsuario(email, password);
    } catch (err) {
      console.error(err);
      alert("Credenciales incorrectas");
    }
  });
}

// ===============================
// LOGIN GOOGLE
// ===============================
const btnGoogle = $("btnGoogleLogin");

if (btnGoogle) {
  btnGoogle.addEventListener("click", async () => {
    console.log("🟢 Login Google");

    try {
      await loginGoogle("cliente");
    } catch (err) {
      console.error(err);
      alert("Error con Google");
    }
  });
}

// ===============================
// LOGOUT
// ===============================
const btnLogout = $("logoutBtn");

if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    await cerrarSesion();
    window.location.href = "login.html";
  });
}

// ===============================
// OBSERVADOR GLOBAL AUTH
// ===============================
observarAuth((userData) => {
  if (!userData) {
    console.log("🔴 No autenticado");
    return;
  }

  console.log("🟢 Usuario autenticado:", userData.rol);
  redirigirPorRol(userData.rol);
});
