// app-registro-universal.js
import { auth, db, googleProvider } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Detectar formulario
const form = document.querySelector("form");
if (!form) throw new Error("Formulario no encontrado");

const rol = form.dataset.rol || "CLIENTE";

// Campos
const camposTecnico = ["nombre", "cedula", "vehiculo", "placas", "correo", "contraseña", "confirmarContraseña"];
const camposCliente = ["nombre", "telefono", "direccion", "correo"];
const campos = rol === "TECNICO" ? camposTecnico : camposCliente;

const submitBtn = document.getElementById("submitBtn");
const googleBtn = document.getElementById("loginGoogle");

// Registro normal
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = "Registrando...";

  try {
    const data = {};
    campos.forEach(c => {
      const i = form.querySelector(`[name="${c}"]`);
      if (i) data[c] = i.value.trim();
    });

    if (rol === "TECNICO" && data.contraseña !== data.confirmarContraseña) {
      throw new Error("Las contraseñas no coinciden");
    }

    const cred = await createUserWithEmailAndPassword(
      auth,
      data.correo,
      data.contraseña || "TempPass123!"
    );

    const user = cred.user;
    const firestoreData = {
      uid: user.uid,
      rol,
      estado: "ACTIVO",
      creadoEn: new Date().toISOString(),
      nombre: data.nombre || "",
      correo: data.correo || ""
    };

    if (rol === "TECNICO" && navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej)
        );
        firestoreData.lat = pos.coords.latitude;
        firestoreData.lng = pos.coords.longitude;
      } catch {}
    }

    const col = rol === "TECNICO" ? "tecnicos" : "clientes";
    await setDoc(doc(db, col, user.uid), firestoreData);

    alert("✅ Registro exitoso");
    window.location.href = rol === "TECNICO" ? "tecnico.html" : "index.html";

  } catch (e) {
    alert("❌ " + e.message);
    submitBtn.disabled = false;
    submitBtn.textContent = "ENVIAR";
  }
});

// Registro Google
if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const user = res.user;

      const col = rol === "TECNICO" ? "tecnicos" : "clientes";
      await setDoc(doc(db, col, user.uid), {
        uid: user.uid,
        rol,
        estado: "ACTIVO",
        creadoEn: new Date().toISOString(),
        nombre: user.displayName || "",
        correo: user.email || ""
      }, { merge: true });

      window.location.href = rol === "TECNICO" ? "tecnico.html" : "index.html";
    } catch (e) {
      alert("❌ " + e.message);
    }
  });
}
