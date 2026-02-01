// app-admin.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "./firebase-auth.js";
import {
  doc,
  getDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const nombreAdmin = document.getElementById("nombreAdmin");

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const snap = await getDoc(doc(db, "admins", user.uid));
  if (!snap.exists() || snap.data().rol !== "ADMIN") {
    alert("Acceso denegado");
    await signOut(auth);
    window.location.href = "login.html";
    return;
  }

  nombreAdmin.textContent = snap.data().nombre || "Administrador";
});

// Botones
window.verTecnicos = async () => {
  const s = await getDocs(collection(db, "tecnicos"));
  alert(`Técnicos: ${s.size}`);
};

window.verClientes = async () => {
  const s = await getDocs(collection(db, "clientes"));
  alert(`Clientes: ${s.size}`);
};

window.verServicios = () => alert("Servicios pendiente");

window.cerrarSesion = async () => {
  await signOut(auth);
  window.location.href = "login.html";
};
