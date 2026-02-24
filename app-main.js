/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MAIN CONTROLLER (ROUTER & GATEKEEPER)
 * Archivo: app-main.js
 * Versión: 5.15.0 (Restauración de Privilegios Admin & Interlock)
 * Autor: Heber (CEO & Lead Architect)
 * ======================================================================================
 */

console.log("🚦 [app-main.js] Iniciando Gatekeeper v5.15.0...");

// 🚨 INYECCIÓN DE DEPENDENCIAS DE BASE DE DATOS PARA CREAR EL SERVICIO
import { observarAuth, auth, signOut, db, collection, addDoc, serverTimestamp } from "./firebase.js";
import { iniciarPanelAdmin, iniciarPanelTecnico, iniciarPanelCliente } from "./app-panel.js";
// 🔧 INYECCIÓN CDN PARA RECUPERACIÓN MAESTRA DE ROL
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"; 

// 💳 MOTOR STRIPE: INYECCIÓN DE LLAVE PÚBLICA (TEST MODE)
const STRIPE_PUBLIC_KEY = "pk_test_51SuznMFB3c4okYlKz7FZYdaftLAmuBWkO1cGlHDrzxbON37J8STqFtDsG6apf7zup4YJTmFbyVtmzdqIV0icjxeX00YVsW2OHU";
// URL de tu Payment Link de prueba creado en el Dashboard
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_8x2fZh5OR2WEek63oz1kA00"; 

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

observarAuth(async (userAuth) => {
    const pathActual = window.location.pathname;
    const archivoActual = pathActual.substring(pathActual.lastIndexOf('/') + 1) || "index.html";
    const esPublica = RUTAS.publicas.includes(archivoActual);

    // 1. GUEST (Visitante sin sesión)
    if (!userAuth) {
        if (!esPublica) {
            console.warn("⛔ Gatekeeper: Intruso detectado. Expulsando...");
            window.location.replace("login.html");
            return;
        }
        document.body.style.display = 'block'; 
        return;
    }

    // 🔧 CLONAMOS EL OBJETO USUARIO PARA INYECTARLE DATOS SEGUROS
    let user = userAuth;

    // 🛡️ REPARACIÓN DE EMERGENCIA (MODO DIOS): RECUPERAR ROL DIRECTO DE FIRESTORE
    if (!user.rol) {
        console.warn("⚠️ Gatekeeper: Rol 'undefined' detectado en memoria. Consultando Base de Datos Maestra...");
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userDocRef);
            
            if (userSnap.exists()) {
                // Fusionamos los datos de Auth con los de Firestore
                user = { ...userAuth, ...userSnap.data() };
            } else {
                // 👑 MODO DIOS: Fallback absoluto para el CEO
                if (user.email && user.email.toLowerCase() === "hebertoh-m@hotmail.com") {
                    user.rol = "admin";
                    console.log("👑 Gatekeeper: Modo Dios activado por correo maestro.");
                } else {
                    user.rol = "cliente"; // Fallback de seguridad para otros
                }
            }
        } catch (error) {
            console.error("❌ Error crítico leyendo perfil maestro:", error);
            // Blindaje final por si se cae la red
            if (user.email && user.email.toLowerCase() === "hebertoh-m@hotmail.com") {
                user.rol = "admin";
            }
        }
    }

    // 2. LOGGED IN USER (Usuario autenticado y rol validado)
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
 * 💳 MOTOR STRIPE: INTERCEPTOR DE SOLICITUDES (ACTUALIZADO PARA AUTO-INYECCIÓN)
 * Controla el formulario de cliente.html para crear la base de datos y desviar hacia Stripe.
 */
function iniciarMotorStripe(user) {
    const formularioSolicitud = document.getElementById('nuevaSolicitudForm');
    
    if (formularioSolicitud) {
        formularioSolicitud.addEventListener('submit', async (e) => {
            e.preventDefault(); // Detenemos el envío estándar

            const metodoPagoSeleccionado = document.querySelector('input[name="metodoPago"]:checked').value;
            console.log("💳 Método de pago seleccionado:", metodoPagoSeleccionado);

            // Recolectar datos del formulario para mandarlos a Firebase
            const formData = new FormData(formularioSolicitud);
            const datosServicio = Object.fromEntries(formData.entries());
            
            // 🚨 INYECCIÓN MAESTRA: Datos vitales para el Webhook y NOC
            datosServicio.cliente_email = user.email; // El campo clave que busca index.js
            datosServicio.cliente_nombre = user.nombre || user.email;
            datosServicio.cliente_id = user.uid; // Identificador único
            datosServicio.estado = "pendiente";  // Gatillo de seguridad
            datosServicio.created_at = serverTimestamp();
            datosServicio.metodo_pago = metodoPagoSeleccionado;

            try {
                console.log("💾 Escribiendo solicitud en la Base de Datos...");
                
                // 1. Guardamos la solicitud en Firestore antes de enviarlo a Stripe
                const docRef = await addDoc(collection(db, "services"), datosServicio);
                console.log(`✅ Servicio creado con éxito en DB (ID: ${docRef.id}). Esperando confirmación de pago...`);

                if (metodoPagoSeleccionado === "stripe") {
                    console.log("🚀 Redirigiendo a Pasarela Stripe segura...");
                    
                    // 2. Redirigir al Payment Link (Inyectando el correo del cliente)
                    const urlCobro = new URL(STRIPE_PAYMENT_LINK);
                    urlCobro.searchParams.append('prefilled_email', user.email);
                    
                    // Ejecutamos la redirección
                    window.location.href = urlCobro.toString();

                } else {
                    console.log("💵 Procesando pago en efectivo (Ruta Estándar)");
                    alert("Servicio solicitado correctamente. Pago contra entrega.");
                    formularioSolicitud.reset();
                    window.location.reload(); // Refrescamos la interfaz del cliente
                }
            } catch (error) {
                console.error("❌ Error al crear el documento en Firebase:", error);
                alert("Hubo un error al generar la solicitud. Verifica tu conexión.");
            }
        });
    }
}

/**
 * ⚡ MOTOR DE REACTIVIDAD: DELEGACIÓN DE EVENTOS GLOBAL
 */
function iniciarEscuchaEventosDinamicos() {
    const panelAcciones = document.getElementById("panelAcciones");
    
    if (panelAcciones) {
        // Eliminamos listeners previos para evitar duplicados
        const nuevoPanel = panelAcciones.cloneNode(true);
        panelAcciones.parentNode.replaceChild(nuevoPanel, panelAcciones);

        nuevoPanel.addEventListener("click", (e) => {
            const btnCotizar = e.target.closest('button');
            
            if (btnCotizar && btnCotizar.innerText.includes("CREAR COTIZACIÓN")) {
                console.log("🛠️ GestiaPremium: Detectado clic en Cotización. Ejecutando motor...");
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
