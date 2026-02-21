/**
 * ======================================================
 * FIXGO 2026 - MAIN CONTROLLER (ROUTER & GATEKEEPER)
 * Archivo: app-main.js
 * Versión: 5.12.9 (Reactivity Engine & Global Listener)
 * Autor: Heber (CEO & Lead Architect)
 * ======================================================
 */

console.log("🚦 [app-main.js] Iniciando Gatekeeper v5.12.9...");

import { observarAuth, auth, signOut } from "./firebase.js";
import { iniciarPanelAdmin, iniciarPanelTecnico, iniciarPanelCliente } from "./app-panel.js";

// 🛡️ GATEKEEPER FASE 1: BLINDAJE VISUAL (ANTI-FLICKER)
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
            window.location.replace("login.html");
            return;
        }
        document.body.style.display = 'block'; 
        return;
    }

    // 2. LOGGED IN USER (Usuario autenticado)
    console.log(`✅ Usuario: ${user.email} | Rol: ${user.rol}`);

    /**
     * 🛡️ GATEKEEPER FASE 2: INTERLOCK DE ROLES
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

    // 🔓 GATEKEEPER APROBADO
    document.body.style.display = 'block';

    // 3. CARGA DE LÓGICA SEGÚN PÁGINA
    try {
        if (user.rol === "admin" && archivoActual === RUTAS.admin) await iniciarPanelAdmin(user);
        else if (user.rol === "tecnico" && archivoActual === RUTAS.tecnico) await iniciarPanelTecnico(user);
        else if (user.rol === "cliente" && archivoActual === RUTAS.cliente) await iniciarPanelCliente(user);
        
        actualizarInterfazGlobal(user);
        iniciarEscuchaEventosDinamicos(); // <--- SOLUCIÓN AL BOTÓN MUERTO
    } catch (error) {
        console.error("❌ Error crítico en el arranque del sistema:", error);
    }
});

/**
 * ⚡ MOTOR DE REACTIVIDAD: DELEGACIÓN DE EVENTOS GLOBAL
 * Esta función asegura que botones inyectados después (como CREAR COTIZACIÓN) 
 * funcionen sin recargar la página.
 */
function iniciarEscuchaEventosDinamicos() {
    const panelAcciones = document.getElementById("panelAcciones");
    
    if (panelAcciones) {
        // Eliminamos listeners previos para evitar duplicados
        const nuevoPanel = panelAcciones.cloneNode(true);
        panelAcciones.parentNode.replaceChild(nuevoPanel, panelAcciones);

        nuevoPanel.addEventListener("click", (e) => {
            // Buscamos el botón de cotización por texto o ID contenido
            const btnCotizar = e.target.closest('button');
            
            if (btnCotizar && btnCotizar.innerText.includes("CREAR COTIZACIÓN")) {
                console.log("🛠️ FixGo: Detectado clic en Cotización. Ejecutando motor...");
                
                // Disparar evento personalizado o llamar a la función de app-panel.js
                window.dispatchEvent(new CustomEvent("abrirMotorCotizacion"));
            }
        });
        console.log("🔗 [Reactivity] Listener de Panel de Acciones vinculado.");
    }
}

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
                    document.body.style.display = 'none';
                    window.location.replace("login.html");
                } catch (error) {
                    console.error("Error al cerrar sesión:", error);
                }
            }
        });
    });
}
