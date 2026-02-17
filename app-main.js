/**
 * ======================================================
 * FIXGO 2026 - MAIN CONTROLLER (ROUTER & GATEKEEPER)
 * Archivo: app-main.js
 * Versión: 5.12.8 (Unicorn Gatekeeper & Anti-Flicker)
 * Autor: Heber (CEO & Lead Architect)
 * ======================================================
 */

console.log("🚦 [app-main.js] Iniciando Gatekeeper v5.12.8...");

import { observarAuth, auth, signOut } from "./firebase.js";
import { iniciarPanelAdmin, iniciarPanelTecnico, iniciarPanelCliente } from "./app-panel.js";

// 🛡️ GATEKEEPER FASE 1: BLINDAJE VISUAL (ANTI-FLICKER)
// Ocultamos la página entera hasta que Firebase confirme el token.
document.body.style.display = 'none';

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
        if (!esPublica) {
            console.warn("⛔ Gatekeeper: Intruso detectado. Expulsando...");
            window.location.replace("login.html"); // 'replace' evita que usen el botón "Atrás"
            return;
        }
        // Si es pública y no hay sesión, le permitimos ver la página
        document.body.style.display = 'block'; 
        return;
    }

    // 2. LOGGED IN USER (Usuario autenticado)
    console.log(`✅ Usuario: ${user.email} | Rol: ${user.rol}`);

    /**
     * ======================================================
     * 🛡️ GATEKEEPER FASE 2: INTERLOCK DE ROLES
     * Verifica que el usuario tenga permiso de estar en esta URL.
     * ======================================================
     */
    
    if (user.rol === "tecnico" && archivoActual === RUTAS.cliente) {
        window.location.replace(RUTAS.tecnico);
        return;
    }

    if (user.rol === "cliente" && (archivoActual === RUTAS.tecnico || archivoActual === RUTAS.admin)) {
        window.location.replace(RUTAS.cliente);
        return;
    }

    if (esPublica) {
        if (user.rol === "admin") window.location.replace(RUTAS.admin);
        else if (user.rol === "tecnico") window.location.replace(RUTAS.tecnico);
        else window.location.replace(RUTAS.cliente);
        return;
    }

    // 🔓 GATEKEEPER APROBADO: El usuario es legítimo y está en su panel correcto.
    document.body.style.display = 'block';

    // 3. CARGA DE LÓGICA SEGÚN PÁGINA
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
                try {
                    await signOut(auth);
                    // PWA Fix: Aseguramos limpieza visual antes del redirect
                    document.body.style.display = 'none';
                    window.location.replace("login.html");
                } catch (error) {
                    console.error("Error al cerrar sesión:", error);
                    alert("Hubo un problema cerrando sesión. Intenta de nuevo.");
                }
            }
        });
    });
}
