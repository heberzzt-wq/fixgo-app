/**
 * ======================================================
 * FIXGO 2026 - MAIN CONTROLLER (ROUTER & SECURITY)
 * Archivo: app-main.js
 * Versión: 4.1 (Role Blindaje & Interlock)
 * Base: V4.0
 * ======================================================
 */

console.log("🚦 [app-main.js] Iniciando Sistema de Enrutamiento v4.1...");

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

    // 1. GUEST (Visitante sin sesión)
    if (!user) {
        if (!esPublica) window.location.href = "login.html";
        return;
    }

    // 2. LOGGED IN USER (Usuario autenticado)
    console.log(`✅ Usuario: ${user.email} | Rol: ${user.rol}`);

    /**
     * ======================================================
     * 🛡️ INTERLOCK DE SEGURIDAD (BLINDAJE DE ACCESO)
     * Verifica que el usuario tenga permiso de estar en esta URL.
     * ======================================================
     */
    
    // Si un técnico está en la pantalla de cliente, lo expulsamos a su panel operativo
    if (user.rol === "tecnico" && archivoActual === RUTAS.cliente) {
        console.warn("⛔ Acceso Denegado: Redirigiendo técnico a su radar.");
        window.location.href = RUTAS.tecnico;
        return;
    }

    // Si un cliente intenta entrar al panel técnico o administrativo, lo regresamos a su zona
    if (user.rol === "cliente" && (archivoActual === RUTAS.tecnico || archivoActual === RUTAS.admin)) {
        console.warn("⛔ Acceso Denegado: Redirigiendo cliente a su zona de solicitudes.");
        window.location.href = RUTAS.cliente;
        return;
    }

    // Redirección desde zonas públicas (Login / Registro / Index) hacia el panel correspondiente
    if (esPublica) {
        if (user.rol === "admin") window.location.href = RUTAS.admin;
        else if (user.rol === "tecnico") window.location.href = RUTAS.tecnico;
        else window.location.href = RUTAS.cliente;
        return;
    }

    // 3. CARGA DE LÓGICA SEGÚN PÁGINA (Validación de carga real)
    try {
        if (user.rol === "admin" && archivoActual === RUTAS.admin) await iniciarPanelAdmin(user);
        else if (user.rol === "tecnico" && archivoActual === RUTAS.tecnico) await iniciarPanelTecnico(user);
        else if (user.rol === "cliente" && archivoActual === RUTAS.cliente) await iniciarPanelCliente(user);
        
        actualizarInterfazGlobal(user);
    } catch (error) {
        console.error("❌ Error crítico en el arranque del sistema:", error);
    }
});

/**
 * ACTUALIZADOR DE INTERFAZ GLOBAL
 * Gestiona el nombre de usuario y los botones de cierre de sesión en todos los paneles.
 */
function actualizarInterfazGlobal(user) {
    const userNameDisplay = document.getElementById("userName") || document.getElementById("userNameDisplay");
    if (userNameDisplay) userNameDisplay.innerText = (user.nombre || user.email).toUpperCase();

    document.querySelectorAll("#btnLogout, #logoutBtn").forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            if (confirm("¿Cerrar sesión de FixGo?")) {
                await signOut(auth);
                window.location.href = "login.html";
            }
        });
    });
}
