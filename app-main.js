/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MAIN CONTROLLER (ROUTER & GATEKEEPER)
 * Archivo: app-main.js
 * Versión: 5.15.5 (Fix Tickets Fantasma Stripe + Link Webhook + Categorías Exactas)
 * Autor: Heber (CEO & Lead Architect)
 * ======================================================================================
 */

console.log("🚦 [app-main.js] Iniciando Gatekeeper v5.15.5...");

import { observarAuth, auth, signOut, db, collection, addDoc, serverTimestamp, getDoc, doc } from "./firebase.js";
import { iniciarPanelAdmin, iniciarPanelTecnico, iniciarPanelCliente } from "./app-panel.js";
import { iniciarMotorBI } from "./app-bi.js"; 

// 💳 MOTOR STRIPE
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

    userAuth.rol = userRol;
    userAuth.nombre = userData.nombre || userAuth.email;

    console.log(`✅ Usuario: ${userAuth.email} | Rol validado: ${userAuth.rol}`);

    if (userAuth.rol === "admin" && archivoActual !== RUTAS.admin) {
        window.location.replace(RUTAS.admin); return;
    }
    if (userAuth.rol === "tecnico" && archivoActual !== RUTAS.tecnico) {
        window.location.replace(RUTAS.tecnico); return;
    }
    if (userAuth.rol === "cliente" && archivoActual !== RUTAS.cliente) {
        window.location.replace(RUTAS.cliente); return;
    }

    document.body.style.display = 'block';

    try {
        if (userAuth.rol === "admin") {
            await iniciarPanelAdmin(userAuth);
            setTimeout(() => { iniciarMotorBI('dashboardAnalitico'); }, 500);
        }
        else if (userAuth.rol === "tecnico") {
            await iniciarPanelTecnico(userAuth);
        }
        else if (userAuth.rol === "cliente") {
            await iniciarPanelCliente(userAuth);
            const efectivoAutorizado = userData.permisoEspecialEfectivo === true;
            iniciarMotorStripe(userAuth, efectivoAutorizado); 
        }
        
        actualizarInterfazGlobal(userAuth);
        iniciarEscuchaEventosDinamicos(); 
    } catch (error) {
        console.error("❌ Error crítico en el arranque del sistema:", error);
    }
});

function iniciarMotorStripe(user, efectivoAutorizado = false) {
    const formularioSolicitud = document.getElementById('nuevaSolicitudForm');
    const contenedorEfectivo = document.getElementById('contenedorOpcionEfectivo');

    if (efectivoAutorizado && contenedorEfectivo) {
        contenedorEfectivo.classList.remove('hidden'); 
    }
    
    if (formularioSolicitud) {
        formularioSolicitud.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            const inputMetodo = document.querySelector('input[name="metodoPago"]:checked');
            const metodoPagoSeleccionado = inputMetodo ? inputMetodo.value : "stripe"; 
            
            const formData = new FormData(formularioSolicitud);
            const datosBase = Object.fromEntries(formData.entries());
            
            // 🔥 FIX: Formateo estricto de Categoría (Para evitar discrepancias visuales)
            const catOriginal = datosBase.categoria || "gral_gral";
            const partes = catOriginal.split('_');
            const catPrincipal = partes[0].toUpperCase();
            const subServicio = partes[1] ? partes[1].toUpperCase() : 'GENERAL';

            const datosServicio = {
                ...datosBase,
                categoria: catPrincipal,
                sub_servicio: subServicio,
                categoria_id: catOriginal,
                cliente_email: user.email,
                cliente_nombre: user.nombre || user.email,
                cliente_id: user.uid,
                estado: "pendiente",
                retencion_inicial: 550, // 🔒 GARANTÍA BASE REGISTRADA
                created_at: serverTimestamp(),
                metodo_pago: metodoPagoSeleccionado
            };

            try {
                const docRef = await addDoc(collection(db, "services"), datosServicio);
                console.log(`✅ Servicio creado con éxito en DB (ID: ${docRef.id}).`);

                if (metodoPagoSeleccionado === "stripe") {
                    const urlCobro = new URL(STRIPE_PAYMENT_LINK);
                    urlCobro.searchParams.append('prefilled_email', user.email);
                    // 🔗 FIX WEBHOOK: Le mandamos el ID exacto a Stripe para que no duplique.
                    urlCobro.searchParams.append('client_reference_id', docRef.id); 
                    window.location.href = urlCobro.toString();
                } else if (metodoPagoSeleccionado === "efectivo" && efectivoAutorizado) {
                    alert("✅ ¡Solicitud Exitosa! Tu pago en efectivo ha sido pre-aprobado. Un técnico va en camino.");
                    formularioSolicitud.reset();
                    window.location.reload(); 
                } else {
                    alert("Error: Método de pago no válido.");
                }
            } catch (error) {
                console.error("❌ Error al crear documento en Firebase:", error);
                alert("Hubo un error al generar la solicitud. Verifica tu conexión.");
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
