/**
 * ======================================================================================
 * GESTIAPREMIUM 2026 - MAIN CONTROLLER (ROUTER & GATEKEEPER)
 * Archivo: app-main.js
 * Versión: 5.16.0 (Módulo de Disputas y Soporte Técnico integrado)
 * Autor: Heber (CEO & Lead Architect)
 * ======================================================================================
 */

console.log("🚦 [app-main.js] Iniciando Gatekeeper v5.16.0...");

// ⚠️ IMPORTANTE: Añadí addDoc, collection, updateDoc, y serverTimestamp. 
// Asegúrate de que estén exportados en tu archivo firebase.js
import { observarAuth, auth, signOut, db, getDoc, doc, addDoc, collection, updateDoc, serverTimestamp } from "./firebase.js";
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

// ======================================================================================
// 🚨 SISTEMA DE DISPUTAS Y SOPORTE GESTIAPREMIUM (SOCIO PRO)
// ======================================================================================

window.abrirModalDisputa = function(serviceId, customerId) {
    document.getElementById('disputaServiceId').value = serviceId;
    document.getElementById('disputaCustomerId').value = customerId;
    document.getElementById('disputaDescripcion').value = '';
    
    const modal = document.getElementById('modalDisputaPago');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.cerrarModalDisputa = function() {
    const modal = document.getElementById('modalDisputaPago');
    modal.classList.add('hidden');
    modal.style.display = 'none';
};

window.enviarReportePago = async function() {
    const serviceId = document.getElementById('disputaServiceId').value;
    const customerId = document.getElementById('disputaCustomerId').value;
    const descripcion = document.getElementById('disputaDescripcion').value.trim();
    const btnEnviar = document.getElementById('btnEnviarDisputa');

    if (descripcion === '') {
        alert("Por favor, describe el problema para que Soporte GestiaPremium pueda ayudarte.");
        return;
    }

    try {
        btnEnviar.disabled = true;
        btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ENVIANDO...';

        const authUser = auth.currentUser;
        if (!authUser) throw new Error("No hay usuario autenticado.");

        console.log("🛡️ Iniciando protocolo de disputa para el servicio:", serviceId);

        // 1. Crear el ticket maestro en V2.0
        const ticketRef = await addDoc(collection(db, "support_tickets"), {
            serviceId: serviceId,
            reportedBy: authUser.uid,
            customerId: customerId,
            proId: authUser.uid,
            issueType: "payment_refusal",
            status: "open",
            createdAt: serverTimestamp(),
            resolvedAt: null
        });

        // 2. Insertar la queja como el primer mensaje del chat inmutable
        await addDoc(collection(db, `support_tickets/${ticketRef.id}/messages`), {
            senderId: authUser.uid,
            message: descripcion,
            timestamp: serverTimestamp()
        });

        // 3. Congelar el servicio (Split Billing se detiene)
        const serviceDocRef = doc(db, "services", serviceId);
        await updateDoc(serviceDocRef, {
            status: "disputed",
            disputeTicketId: ticketRef.id
        });

        alert("🚨 Reporte enviado a GestiaPremium. El servicio ha sido bloqueado por seguridad.");
        window.cerrarModalDisputa();

    } catch (error) {
        console.error("❌ Error al crear la disputa:", error);
        alert("Hubo un error al comunicar con el servidor de GestiaPremium. Intenta de nuevo.");
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> ENVIAR REPORTE';
    }
};

// ======================================================================================
// 🛡️ SISTEMA DE GARANTÍAS PARA EL CLIENTE
// ======================================================================================

window.abrirModalGarantia = function(serviceId, proId) {
    document.getElementById('garantiaServiceId').value = serviceId;
    document.getElementById('garantiaProId').value = proId;
    document.getElementById('garantiaDescripcion').value = '';
    
    const modal = document.getElementById('modalGarantiaCliente');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
};

window.cerrarModalGarantia = function() {
    const modal = document.getElementById('modalGarantiaCliente');
    modal.classList.add('hidden');
    modal.style.display = 'none';
};

window.enviarReporteGarantia = async function() {
    const serviceId = document.getElementById('garantiaServiceId').value;
    const proId = document.getElementById('garantiaProId').value;
    const descripcion = document.getElementById('garantiaDescripcion').value.trim();
    const btnEnviar = document.getElementById('btnEnviarGarantia');

    if (descripcion === '') {
        alert("Por favor, describe exactamente qué falló para validar la garantía.");
        return;
    }

    try {
        btnEnviar.disabled = true;
        btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ENVIANDO...';

        const authUser = auth.currentUser;
        if (!authUser) throw new Error("No hay usuario autenticado.");

        // 1. Crear el ticket de garantía
        const ticketRef = await addDoc(collection(db, "support_tickets"), {
            serviceId: serviceId,
            reportedBy: authUser.uid,
            customerId: authUser.uid,
            proId: proId,
            issueType: "warranty_claim",
            status: "open",
            createdAt: serverTimestamp(),
            resolvedAt: null
        });

        // 2. Insertar la queja como mensaje
        await addDoc(collection(db, `support_tickets/${ticketRef.id}/messages`), {
            senderId: authUser.uid,
            message: "SOLICITUD DE GARANTÍA: " + descripcion,
            timestamp: serverTimestamp()
        });

        // 3. Actualizar el servicio para alertar al Admin
        const serviceDocRef = doc(db, "services", serviceId);
        await updateDoc(serviceDocRef, {
            estado: "warranty_requested", 
            warrantyTicketId: ticketRef.id
        });

        alert("🛡️ Reporte de garantía enviado. El equipo de GestiaPremium revisará el caso y nos comunicaremos contigo pronto.");
        window.cerrarModalGarantia();

    } catch (error) {
        console.error("❌ Error al solicitar garantía:", error);
        alert("Hubo un error al comunicar con GestiaPremium. Intenta de nuevo.");
    } finally {
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = '<i class="fas fa-shield-alt"></i> EXIGIR GARANTÍA';
    }
};
