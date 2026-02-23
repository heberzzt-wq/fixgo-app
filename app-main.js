/**
 * ======================================================
 * GESTIAPREMIUM 2026 - MAIN CONTROLLER (ROUTER & GATEKEEPER)
 * Archivo: app-main.js
 * Versión: 5.13.0 (Integración Stripe Payment Links)
 * Autor: Heber (CEO & Lead Architect)
 * ======================================================
 */

console.log("🚦 [app-main.js] Iniciando Gatekeeper v5.13.0...");

import { observarAuth, auth, signOut } from "./firebase.js";
import { iniciarPanelAdmin, iniciarPanelTecnico, iniciarPanelCliente } from "./app-panel.js";

// 💳 MOTOR STRIPE: INYECCIÓN DE LLAVE PÚBLICA (TEST MODE)
const STRIPE_PUBLIC_KEY = "pk_test_51SuznMFB3c4okYlKz7FZYdaftLAmuBWkO1cGlHDrzxbON37J8STqFtDsG6apf7zup4YJTmFbyVtmzdqIV0icjxeX00YVsW2OHU";
// URL de tu Payment Link de prueba creado en el Dashboard
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_8x2fZh5OR2WEek63oz1kA00"; // <-- REEMPLAZA ESTO CON LA URL EXACTA QUE TE DIO STRIPE

// Inicializar objeto Stripe (la librería se cargó en el HTML)
let stripe;
if (window.Stripe) {
    stripe = Stripe(STRIPE_PUBLIC_KEY);
}

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
        else if (user.rol === "cliente" && archivoActual === RUTAS.cliente) {
            await iniciarPanelCliente(user);
            iniciarMotorStripe(user); // <--- INYECCIÓN DEL INTERCEPTOR DE PAGOS
        }
        
        actualizarInterfazGlobal(user);
        iniciarEscuchaEventosDinamicos(); // <--- SOLUCIÓN AL BOTÓN MUERTO
    } catch (error) {
        console.error("❌ Error crítico en el arranque del sistema:", error);
    }
});

/**
 * 💳 MOTOR STRIPE: INTERCEPTOR DE SOLICITUDES
 * Controla el formulario de cliente.html para desviar hacia Stripe si elige Tarjeta.
 */
function iniciarMotorStripe(user) {
    const formularioSolicitud = document.getElementById('nuevaSolicitudForm');
    
    if (formularioSolicitud) {
        formularioSolicitud.addEventListener('submit', async (e) => {
            e.preventDefault(); // Detenemos el envío estándar para analizar el método de pago

            const metodoPagoSeleccionado = document.querySelector('input[name="metodoPago"]:checked').value;
            console.log("💳 Método de pago seleccionado:", metodoPagoSeleccionado);

            // Recolectar datos del formulario para mandarlos a Firebase
            const formData = new FormData(formularioSolicitud);
            const datosServicio = Object.fromEntries(formData.entries());
            datosServicio.clienteEmail = user.email;
            datosServicio.estadoPago = "pendiente";

            if (metodoPagoSeleccionado === "stripe") {
                console.log("🚀 Redirigiendo a Pasarela Stripe segura...");
                
                // 1. (Opcional) Aquí guardarías 'datosServicio' en Firestore con estado "pendiente"
                // await guardarSolicitudEnFirebase(datosServicio);

                // 2. Redirigir al Payment Link (Inyectando el correo del cliente para que no lo tenga que teclear)
                const urlCobro = new URL(STRIPE_PAYMENT_LINK);
                urlCobro.searchParams.append('prefilled_email', user.email);
                
                // Ejecutamos la redirección (El cliente sale temporalmente de la app hacia Stripe)
                window.location.href = urlCobro.toString();

            } else {
                console.log("💵 Procesando pago en efectivo (Ruta Estándar)");
                // Aquí ejecutas la función normal de app-panel.js para guardar en Firebase
                // Ej: await registrarServicio(datosServicio);
                alert("Servicio solicitado correctamente. Pago contra entrega.");
                formularioSolicitud.reset();
            }
        });
    }
}

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
                console.log("🛠️ GestiaPremium: Detectado clic en Cotización. Ejecutando motor...");
                
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

    // Actualizamos textos de FixGo a GestiaPremium en alertas
    document.querySelectorAll("#btnLogout, #logoutBtn").forEach(btn => {
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            if (confirm("¿Cerrar sesión de GestiaPremium?")) {
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
