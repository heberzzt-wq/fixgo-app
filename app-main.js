/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MAIN CONTROLLER (ROUTER & GATEKEEPER)
 * Archivo: app-main.js
 * Versión: 5.15.3 (Fix Colisiones Firebase + Preservación Auth + Modo Dios + Excepción Efectivo Cliente)
 * Autor: Heber (CEO & Lead Architect)
 * ======================================================================================
 */

console.log("🚦 [app-main.js] Iniciando Gatekeeper v5.15.3...");

// 🚨 FIX 1: Importamos doc y getDoc de NUESTRO firebase.js local. Cero colisiones.
import { observarAuth, auth, signOut, db, collection, addDoc, serverTimestamp, getDoc, doc } from "./firebase.js";
import { iniciarPanelAdmin, iniciarPanelTecnico, iniciarPanelCliente } from "./app-panel.js";

// 🚨 FIX 2: Traemos el inicializador del BI aquí para evitar carreras de tiempo.
import { iniciarMotorBI } from "./app-bi.js"; 

// 💳 MOTOR STRIPE: INYECCIÓN DE LLAVE PÚBLICA (TEST MODE)
const STRIPE_PUBLIC_KEY = "pk_test_51SuznMFB3c4okYlKz7FZYdaftLAmuBWkO1cGlHDrzxbON37J8STqFtDsG6apf7zup4YJTmFbyVtmzdqIV0icjxeX00YVsW2OHU";
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/test_8x2fZh5OR2WEek63oz1kA00"; 

let stripe;
if (window.Stripe) {
    stripe = Stripe(STRIPE_PUBLIC_KEY);
}

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

    if (!userAuth) {
        if (!esPublica) {
            console.warn("⛔ Gatekeeper: Intruso detectado. Expulsando...");
            window.location.replace("login.html");
            return;
        }
        document.body.style.display = 'block'; 
        return;
    }

    // 🚨 FIX 4: Mantenemos el objeto original (userAuth) vivo. No lo destruimos con Spread (...).
    let userRol = null;
    let userData = {};

    // 👑 MODO DIOS: REGLA DE ORO INQUEBRANTABLE
    if (userAuth.email && userAuth.email.toLowerCase() === "hebertoh-m@hotmail.com") {
        userRol = "admin";
        console.log("👑 Gatekeeper: Privilegios de CEO (Admin) FORZADOS por correo maestro.");
    } else {
        try {
            const userDocRef = doc(db, "users", userAuth.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
                userData = userSnap.data();
                userRol = userData.rol || "cliente";
            } else {
                userRol = "cliente";
            }
        } catch (error) {
            console.error("❌ Error leyendo perfil:", error);
            userRol = "cliente";
        }
    }

    // Inyectamos los datos seguros al objeto maestro
    userAuth.rol = userRol;
    userAuth.nombre = userData.nombre || userAuth.email;

    console.log(`✅ Usuario: ${userAuth.email} | Rol validado: ${userAuth.rol}`);

    if (userAuth.rol === "tecnico" && archivoActual === RUTAS.cliente) {
        window.location.replace(RUTAS.tecnico);
        return;
    }
    if (userAuth.rol === "cliente" && (archivoActual === RUTAS.tecnico || archivoActual === RUTAS.admin)) {
        window.location.replace(RUTAS.cliente);
        return;
    }
    if (esPublica) {
        if (userAuth.rol === "admin") window.location.replace(RUTAS.admin);
        else if (userAuth.rol === "tecnico") window.location.replace(RUTAS.tecnico);
        else window.location.replace(RUTAS.cliente);
        return;
    }

    document.body.style.display = 'block';

    try {
        if (userAuth.rol === "admin" && archivoActual === RUTAS.admin) {
            await iniciarPanelAdmin(userAuth);
            // Iniciamos el Cerebro BI de forma segura 500ms después para evitar bloqueos
            setTimeout(() => {
                iniciarMotorBI('dashboardAnalitico');
            }, 500);
        }
        else if (userAuth.rol === "tecnico" && archivoActual === RUTAS.tecnico) {
            await iniciarPanelTecnico(userAuth);
        }
        else if (userAuth.rol === "cliente" && archivoActual === RUTAS.cliente) {
            await iniciarPanelCliente(userAuth);
            
            // 🔥 LÓGICA DE EXCEPCIÓN: Verificar si el Admin autorizó efectivo para este usuario específico
            // Se busca el campo 'permisoEspecialEfectivo' en el documento del usuario en Firestore
            const efectivoAutorizado = userData.permisoEspecialEfectivo === true;
            if (efectivoAutorizado) {
                console.log("🌟 [MODO DIOS ADMIN] Excepción aplicada: Pago en efectivo HABILITADO para este cliente.");
            }
            iniciarMotorStripe(userAuth, efectivoAutorizado); 
        }
        
        actualizarInterfazGlobal(userAuth);
        iniciarEscuchaEventosDinamicos(); 
    } catch (error) {
        console.error("❌ Error crítico en el arranque del sistema:", error);
    }
});

// Se modifica la función para aceptar el parámetro de autorización de efectivo
function iniciarMotorStripe(user, efectivoAutorizado = false) {
    const formularioSolicitud = document.getElementById('nuevaSolicitudForm');
    const contenedorEfectivo = document.getElementById('contenedorOpcionEfectivo'); // Referencia al contenedor oculto en HTML

    // 🔥 Si el Admin dio el permiso especial, mostramos el botón de efectivo
    if (efectivoAutorizado && contenedorEfectivo) {
        contenedorEfectivo.classList.remove('hidden'); // Quitamos la clase que lo oculta
    }
    
    if (formularioSolicitud) {
        formularioSolicitud.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            // Obtenemos el método seleccionado. Si efectivo estaba oculto, el navegador enviará el que estaba visible y marcado (Stripe)
            const inputMetodo = document.querySelector('input[name="metodoPago"]:checked');
            const metodoPagoSeleccionado = inputMetodo ? inputMetodo.value : "stripe"; 
            
            const formData = new FormData(formularioSolicitud);
            const datosServicio = Object.fromEntries(formData.entries());
            
            datosServicio.cliente_email = user.email; 
            datosServicio.cliente_nombre = user.nombre || user.email;
            datosServicio.cliente_id = user.uid; 
            datosServicio.estado = "pendiente";  
            datosServicio.created_at = serverTimestamp();
            datosServicio.metodo_pago = metodoPagoSeleccionado;

            console.log("🚀 Procesando solicitud con método de pago:", metodoPagoSeleccionado);

            try {
                // Guardamos primero la intención en la base de datos
                const docRef = await addDoc(collection(db, "services"), datosServicio);
                console.log(`✅ Servicio creado con éxito en DB (ID: ${docRef.id}).`);

                if (metodoPagoSeleccionado === "stripe") {
                    // Flujo normal digital
                    const urlCobro = new URL(STRIPE_PAYMENT_LINK);
                    urlCobro.searchParams.append('prefilled_email', user.email);
                    // Opcional: Podríamos pasar el ID del servicio a Stripe para conciliación futura
                    // urlCobro.searchParams.append('client_reference_id', docRef.id);
                    window.location.href = urlCobro.toString();
                } else if (metodoPagoSeleccionado === "efectivo" && efectivoAutorizado) {
                    // Flujo de excepción autorizado por Admin
                    alert("✅ ¡Solicitud Exitosa! Tu pago en efectivo ha sido pre-aprobado por la administración. Un técnico se pondrá en contacto.");
                    formularioSolicitud.reset();
                    window.location.reload(); 
                } else {
                    // Seguridad extra: Alguien intentó forzar efectivo sin permiso
                    console.error("⛔ Intento de pago en efectivo no autorizado.");
                    alert("Error: Método de pago no válido.");
                }
            } catch (error) {
                console.error("❌ Error al crear documento en Firebase:", error);
                alert("Hubo un error al generar la solicitud. Verifica tu conexión y reintenta.");
            }
        });
    }
}

function iniciarEscuchaEventosDinamicos() {
    const panelAcciones = document.getElementById("panelAcciones");
    if (panelAcciones) {
        const nuevoPanel = panelAcciones.cloneNode(true);
        panelAcciones.parentNode.replaceChild(nuevoPanel, panelAcciones);

        nuevoPanel.addEventListener("click", (e) => {
            const btnCotizar = e.target.closest('button');
            if (btnCotizar && btnCotizar.innerText.includes("CREAR COTIZACIÓN")) {
                window.dispatchEvent(new CustomEvent("abrirMotorCotizacion"));
            }
        });
    }
}

function actualizarInterfazGlobal(user) {
    const userNameDisplay = document.getElementById("userName") || document.getElementById("userNameDisplay");
    if (userNameDisplay) userNameDisplay.innerText = (user.nombre || user.email).toUpperCase();

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
