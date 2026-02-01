// app-admin.js
import { auth, signOut } from "./firebase-auth.js";
import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 🔹 ALERT para prueba de que el JS se carga
alert("¡El Admin JS está cargado!");

// Función para cargar técnicos (ejemplo)
async function cargarTecnicos() {
    const cont = document.getElementById("sectionTecnicos");
    if (cont) cont.textContent = "Lista de técnicos cargada...";
}

// Función para cargar clientes (ejemplo)
async function cargarClientes() {
    const cont = document.getElementById("sectionClientes");
    if (cont) cont.textContent = "Lista de clientes cargada...";
}

// 🔹 Verificar sesión y mostrar admin
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (adminSnap.exists() && adminSnap.data().rol === "ADMIN") {
            const data = adminSnap.data();

            // ✅ Solo escribimos si existe el elemento
            const elementoNombre = document.getElementById("nombreAdmin");
            if (elementoNombre) {
                elementoNombre.textContent = data.nombre || "Administrador";
            }

            // Cargar contenido de las secciones
            cargarTecnicos();
            cargarClientes();
        } else {
            alert("❌ Acceso denegado.");
            await signOut(auth);
            window.location.href = "login.html";
        }
    } catch (error) {
        console.error("Error al cargar admin:", error);
    }
});

// Botón salir
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        await signOut(auth);
        window.location.href = "login.html";
    });
}
