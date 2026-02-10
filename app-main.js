/**
 * ======================================================
 * FIXGO 2026 - MAIN CONTROLLER (ROUTER & SECURITY)
 * Archivo: app-main.js
 * Versión: 4.0 (Global Event Binding)
 * ======================================================
 */

console.log("🚦 [app-main.js] Iniciando Sistema de Enrutamiento v4.0...");

import { observarAuth, auth, signOut } from "./firebase.js";
import { iniciarPanelAdmin, iniciarPanelTecnico, iniciarPanelCliente } from "./app-panel.js";

const RUTAS = {
    publicas: ["index.html", "login.html", "registro.html", "/"],
    admin: "admin.html",
    tecnico: "tecnico.html",
    cliente: "cliente.html"
};

observarAuth(async (user) => {
    const pathActual = window.location.pathname;
    const archivoActual = pathActual.substring(pathActual.lastIndexOf('/') + 1) || "index.html";
    const esPublica = RUTAS.publicas.includes(archivoActual);

    // 1. GUEST
    if (!user) {
        if (!esPublica) window.location.href = "login.html";
        return;
    }

    // 2. LOGGED IN USER
    console.log(`✅ Usuario: ${user.email} | Rol: ${user.rol}`);

    // Redirección desde zonas públicas
    if (esPublica) {
        if (user.rol === "admin") window.location.href = "admin.html";
        else if (user.rol === "tecnico") window.location.href = "tecnico.html";
        else window.location.href = "cliente.html";
        return;
    }

    // 3. CARGA DE LÓGICA SEGÚN PÁGINA
    try {
        if (user.rol === "admin" && archivoActual === RUTAS.admin) await iniciarPanelAdmin(user);
        else if (user.rol === "tecnico" && archivoActual === RUTAS.tecnico) await iniciarPanelTecnico(user);
        else if (user.rol === "cliente" && archivoActual === RUTAS.cliente) await iniciarPanelCliente(user);
        
        actualizarInterfazGlobal(user);
    } catch (error) {
        console.error("❌ Error crítico:", error);
    }
});

function actualizarInterfazGlobal(user) {
    const userNameDisplay = document.getElementById("userName") || document.getElementById("userNameDisplay");
    if (userNameDisplay) userNameDisplay.innerText = (user.nombre || user.email).toUpperCase();

    document.querySelectorAll("#btnLogout, #logoutBtn").forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            if (confirm("¿Cerrar sesión?")) {
                await signOut(auth);
                window.location.href = "login.html";
            }
        });
    });
}
