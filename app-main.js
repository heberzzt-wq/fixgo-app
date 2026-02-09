/**
 * ======================================================
 * FIXGO 2026 - MAIN CONTROLLER (ROUTER & SECURITY)
 * Archivo: app-main.js
 * Versión: 2.1 (Full Logic)
 * Autor: FixGo Dev Team
 * * DESCRIPCIÓN:
 * - Detecta usuario logueado usando el 'observarAuth' de firebase.js.
 * - Protege rutas (Bloquea acceso a /admin si no eres admin).
 * - Redirecciona desde el Login/Registro al panel correcto.
 * - Carga dinámicamente la lógica del panel (desde app-panel.js).
 * ======================================================
 */

console.log("🚦 [app-main.js] Iniciando Sistema de Enrutamiento...");

// 1. IMPORTACIONES
import { 
    observarAuth, 
    auth, 
    signOut 
} from "./firebase.js";

import { 
    iniciarPanelAdmin, 
    iniciarPanelTecnico, 
    iniciarPanelCliente 
} from "./app-panel.js";


// 2. CONFIGURACIÓN DE RUTAS SEGURAS
// Define qué archivo HTML corresponde a cada rol
const RUTAS = {
    // Páginas accesibles sin login
    publicas: ["index.html", "login.html", "registro.html", "/"],
    
    // Páginas exclusivas por rol
    admin: "admin.html",
    tecnico: "tecnico.html",
    cliente: "cliente.html"
};


// ======================================================
// 3. LÓGICA PRINCIPAL (EL GUARDIA DE SEGURIDAD)
// ======================================================
observarAuth(async (user) => {
    
    // Obtener la ruta actual (ej: "/admin.html")
    const pathActual = window.location.pathname;
    const archivoActual = pathActual.substring(pathActual.lastIndexOf('/') + 1) || "index.html";
    const esPublica = RUTAS.publicas.includes(archivoActual);

    console.log(`📍 Ubicación actual: ${archivoActual} | Es pública: ${esPublica}`);

    // --------------------------------------------------
    // CASO A: NO HAY USUARIO (GUEST)
    // --------------------------------------------------
    if (!user) {
        console.log("👻 Estado: Visitante (Sin sesión)");
        
        // Si intenta entrar a una privada, lo sacamos
        if (!esPublica) {
            console.warn("⛔ Acceso denegado. Redirigiendo al Login.");
            window.location.href = "login.html";
        }
        return; // Fin del proceso para guests
    }

    // --------------------------------------------------
    // CASO B: USUARIO LOGUEADO -> VALIDAR PERMISOS
    // --------------------------------------------------
    console.log(`✅ Usuario Activo: ${user.email} | Rol: ${user.rol || 'Sin Rol'}`);

    // B.1: Si está en una página pública (Login/Registro/Index), mandarlo a su panel
    if (esPublica) {
        console.log("🔀 Usuario en zona pública -> Redirigiendo a su panel...");
        redirigirSegunRol(user.rol);
        return;
    }

    // B.2: Protección Cruzada (Firewall de Roles)
    // Evita que un Cliente entre a /admin.html modificando la URL
    if (archivoActual === RUTAS.admin && user.rol !== "admin") {
        alert("⛔ ACCESO DENEGADO: Área restringida para Administradores.");
        redirigirSegunRol(user.rol);
        return;
    }

    if (archivoActual === RUTAS.tecnico && user.rol !== "tecnico") {
        alert("⛔ ACCESO DENEGADO: Área exclusiva para Técnicos.");
        redirigirSegunRol(user.rol);
        return;
    }

    if (archivoActual === RUTAS.cliente && user.rol !== "cliente") {
        // Los admin a veces pueden ver el panel de cliente, pero por norma estricta:
        if(user.rol !== "admin") { 
            redirigirSegunRol(user.rol);
            return;
        }
    }

    // --------------------------------------------------
    // 4. INICIALIZACIÓN DE LÓGICA (INYECCIÓN DE CEREBRO)
    // --------------------------------------------------
    // Aquí es donde conectamos 'app-main.js' con 'app-panel.js'
    // Solo cargamos la lógica si estamos en el archivo correcto.

    try {
        if (user.rol === "admin" && archivoActual === RUTAS.admin) {
            console.log("🚀 Cargando módulo Admin...");
            await iniciarPanelAdmin(user);
        } 
        else if (user.rol === "tecnico" && archivoActual === RUTAS.tecnico) {
            console.log("🚀 Cargando módulo Técnico...");
            await iniciarPanelTecnico(user);
        } 
        else if (user.rol === "cliente" && archivoActual === RUTAS.cliente) {
            console.log("🚀 Cargando módulo Cliente...");
            await iniciarPanelCliente(user);
        }
        
        // Configurar elementos comunes de la UI (Header, Logout)
        actualizarInterfazGlobal(user);

    } catch (error) {
        console.error("❌ Error crítico inicializando el panel:", error);
        alert("Hubo un error cargando tus datos. Por favor recarga la página.");
    }
});


// ======================================================
// 5. FUNCIONES AUXILIARES (HELPERS)
// ======================================================

/**
 * Redirecciona al usuario a su HTML correspondiente según su rol.
 * Evita bucles infinitos verificando dónde está primero.
 */
function redirigirSegunRol(rol) {
    const path = window.location.pathname;
    
    if (rol === "admin") {
        if (!path.includes("admin.html")) window.location.href = "admin.html";
    } else if (rol === "tecnico") {
        if (!path.includes("tecnico.html")) window.location.href = "tecnico.html";
    } else {
        // Por defecto Cliente (o si el rol está mal definido, lo mandamos a cliente para que no se rompa)
        if (!path.includes("cliente.html")) window.location.href = "cliente.html";
    }
}

/**
 * Actualiza nombre de usuario y configura el botón de salir.
 * Funciona en todos los HTMLs siempre que tengan los IDs correctos.
 */
function actualizarInterfazGlobal(user) {
    // 1. Mostrar Nombre
    const userNameDisplay = document.getElementById("userName") || document.getElementById("userNameDisplay");
    
    if (userNameDisplay) {
        // Usamos nombre, o email cortado, o "Usuario"
        const nombreMostrar = user.nombre || user.email.split('@')[0] || "Usuario";
        userNameDisplay.innerText = nombreMostrar.toUpperCase();
    }

    // 2. Configurar Botón Logout
    // Buscamos por varios IDs comunes para asegurar compatibilidad
    const logoutBtns = document.querySelectorAll("#btnLogout, #logoutBtn, #btnLogoutIndex");

    logoutBtns.forEach(btn => {
        // Clonamos el nodo para eliminar listeners viejos (evita doble click)
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            if (confirm("¿Cerrar sesión de FixGo?")) {
                try {
                    console.log("👋 Saliendo del sistema...");
                    await signOut(auth);
                    window.location.href = "login.html";
                } catch (error) {
                    console.error("Error al salir:", error);
                    alert("No se pudo cerrar sesión. Intenta de nuevo.");
                }
            }
        });
    });
}
