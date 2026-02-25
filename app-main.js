/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MAIN CONTROLLER (ROUTER & GATEKEEPER)
 * Archivo: app-main.js
 * Versión: 5.15.6 (Delegación de lógica Stripe a panel-cliente.js)
 * Autor: Heber (CEO & Lead Architect)
 * ======================================================================================
 */

console.log("🚦 [app-main.js] Iniciando Gatekeeper v5.15.6...");

import { observarAuth, auth, signOut, db, getDoc, doc } from "./firebase.js";
import { iniciarPanelAdmin, iniciarPanelTecnico, iniciarPanelCliente } from "./app-panel.js";
import { iniciarMotorBI } from "./app-bi.js"; 

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
    // Pasa el permiso especial
    userAuth.efectivo_autorizado = userData.efectivo_autorizado || false; 

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
            // panel-cliente.js se encarga de crear el ticket y manejar a Stripe
            await iniciarPanelCliente(userAuth);
            
            // Mostrar la opción de efectivo si el cliente está autorizado
            const contenedorEfectivo = document.getElementById('contenedorOpcionEfectivo');
            if (userAuth.efectivo_autorizado && contenedorEfectivo) {
                 contenedorEfectivo.classList.remove('hidden'); 
            }
        }
        
        actualizarInterfazGlobal(userAuth);
        iniciarEscuchaEventosDinamicos(); 
    } catch (error) {
        console.error("❌ Error crítico en el arranque del sistema:", error);
    }
});

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
