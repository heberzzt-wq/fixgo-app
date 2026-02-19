/**
 * ======================================================
 * FIXGO 2026 - SISTEMA DE REGISTRO Y LOGIN UNIVERSAL
 * Archivo: app-registro.js
 * Versión: 5.9.1 (VEHICLE TELEMETRY READY + SHARK MODE BLINDADO)
 * Base: V5.8 (STRIPE INTEGRATION + BANK DATA SECURE)
 * Autor: Heber (CEO & Lead Architect)
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR.
 * ======================================================
 */
console.log(" 🚀 [app-registro.js] Inicializando sistema V5.9.1 (Pagos + Telemetría de Vehículos + Seguridad Enterprise)...");

import { 
    auth, 
    db, 
    registrarUsuario, 
    signInWithEmailAndPassword, 
    signOut, 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp,
    observarAuth 
} from "./firebase.js";

import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    deleteUser 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

/**
 * 🦈 SANITIZADOR MAESTRO (PREVENCIÓN XSS)
 * Protege contra inyección de código en los inputs antes de ir a Firebase
 */
const escaparHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

/**
 * 🔐 VALIDACIÓN ENTERPRISE DE CONTRASEÑA
 * Mínimo 8 caracteres, al menos 1 mayúscula y 1 número.
 */
const validarPassword = (pwd) => {
    const re = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    return re.test(pwd);
};

// 🛡️ ESCUDO ANTI-BOT (RATE LIMITING FRONTEND)
let lastActionTime = 0;
const verificarRateLimit = () => {
    const now = Date.now();
    if (now - lastActionTime < 15000) {
        alert("⏳ SISTEMA ANTI-BOT: Por seguridad, espera 15 segundos antes de intentar nuevamente.");
        return false;
    }
    lastActionTime = now;
    return true;
};

// ======================================================
// 0. CONFIGURACIÓN DE STRIPE (TOKENIZACIÓN)
// ======================================================
// Clave Pública proporcionada por Heber (Modo Test)
const STRIPE_PUBLIC_KEY = 'pk_test_51SuznMFB3c4okYlKz7FZYdaftLAmuBWkO1cGlHDrzxbON37J8STqFtDsG6apf7zup4YJTmFbyVtmzdqIV0icjxeX00YVsW2OHU';
let stripe = null;
let elements = null;
let cardElement = null;

// Inicializamos Stripe solo si estamos en una página que lo requiera
async function iniciarStripe() {
    if (window.Stripe) {
        stripe = window.Stripe(STRIPE_PUBLIC_KEY);
        elements = stripe.elements();
        
        // Estilos base para el input de tarjeta (Dark Mode Friendly)
        const style = {
            base: {
                color: "#ffffff",
                fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
                fontSmoothing: "antialiased",
                fontSize: "16px",
                "::placeholder": {
                    color: "#aab7c4"
                }
            },
            invalid: {
                color: "#fa755a",
                iconColor: "#fa755a"
            }
        };

        // Montamos el elemento de tarjeta si existe el contenedor en el HTML
        if (document.getElementById("card-element")) {
            cardElement = elements.create("card", { style: style, hidePostalCode: true });
            cardElement.mount("#card-element");
            console.log(" 💳 Widget de Stripe montado correctamente.");
        }
    } else {
        console.warn(" ⚠️ Librería Stripe.js no detectada en el HTML. Asegúrate de incluir el script en el head.");
    }
}

// Intentamos iniciar Stripe al cargar el script
if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarStripe);
} else {
    iniciarStripe();
}

const $ = (id) => document.getElementById(id);

// ======================================================
// A. LÓGICA DE REGISTRO DE CLIENTES (CON METODO DE PAGO)
// ======================================================
const btnRegistroCliente = $("btnRegistroCliente");
if (btnRegistroCliente) {
    btnRegistroCliente.addEventListener("click", async (e) => {
        e.preventDefault();
        
        if (!verificarRateLimit()) return; // 🦈 Protección Anti-Bot
        
        const form = document.getElementById("formRegistroCliente");
        if (!form) return;

        // 🧹 Sanitización Inmediata
        const nombre = escaparHTML(form.querySelector('[name="nombre"]')?.value.trim());
        const email = form.querySelector('[name="email"]')?.value.trim().toLowerCase();
        const password = form.querySelector('[name="password"]')?.value.trim();
        const telefono = escaparHTML(form.querySelector('[name="telefono"]')?.value.trim());

        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Por favor, completa todos los campos personales.");
            return;
        }

        // 🔐 Validación Enterprise
        if (!validarPassword(password)) {
            alert("🔒 SEGURIDAD: La contraseña debe tener mínimo 8 caracteres, incluir al menos 1 mayúscula y 1 número.");
            return;
        }

        // VALIDACIÓN DE STRIPE (OBLIGATORIO PARA GARANTÍA)
        if (!stripe || !cardElement) {
            alert("⚠️ Error: El sistema de pagos no está cargado. Recarga la página.");
            return;
        }

        let usuarioAuth = null;
        const textoOriginal = btnRegistroCliente.innerHTML;

        try {
            btnRegistroCliente.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando con el Banco...';
            btnRegistroCliente.disabled = true;

            // 1. TOKENIZACIÓN DE TARJETA CON STRIPE
            const { token, error } = await stripe.createToken(cardElement);

            if (error) {
                throw new Error(error.message); // Error de tarjeta inválida, fecha exp, etc.
            }

            btnRegistroCliente.innerHTML = '<i class="fas fa-shield-alt"></i> Creando Bóveda...';

            // 2. Intentamos crear en Auth (Esto ya hace el respaldo básico en DB por firebase.js)
            usuarioAuth = await registrarUsuario(email, password, "cliente", nombre);

            // 3. RUTA MAESTRA: Guardamos los datos pesados y de pago SOLO en 'users'
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "cliente",
                creadoEn: serverTimestamp(),
                estado: "activo",
                status: "activo",
                metodo_pago_default: {
                    stripe_token: token.id, 
                    marca: token.card.brand,
                    last4: token.card.last4,
                    exp_month: token.card.exp_month,
                    exp_year: token.card.exp_year
                }
            }, { merge: true });

            alert(`¡Bienvenido, ${nombre}! Tu método de pago ha sido vinculado exitosamente.`);
            window.location.href = "cliente.html";

        } catch (error) {
            console.error("❌ Error Crítico en Registro Cliente:", error);
            
            // Reversión (Limpieza de huérfanos)
            if (usuarioAuth && error.code !== 'auth/email-already-in-use') {
                console.warn("⚠️ Revirtiendo registro: Borrando usuario de Auth por fallo.");
                await deleteUser(auth.currentUser).catch(e => console.error("Error borrando huérfano:", e));
            }
            
            manejarErroresAuth(error);
            btnRegistroCliente.innerHTML = textoOriginal;
            btnRegistroCliente.disabled = false;
        }
    });
}

// ======================================================
// B. LÓGICA DE TÉCNICOS (CON DATOS BANCARIOS + VEHÍCULO)
// ======================================================
const btnRegistroTecnico = $("btnRegistroTecnico");
let ineCargado = false;
let csfCargado = false;

if ($("btnSubirINE")) {
    $("btnSubirINE").addEventListener("click", () => $("inputINE").click());
    $("inputINE").addEventListener("change", () => {
        ineCargado = true;
        const btn = $("btnSubirINE");
        btn.innerHTML = '<i class="fas fa-check-circle"></i> INE Cargada';
        btn.classList.replace("bg-indigo-600", "bg-emerald-600");
    });
}
if ($("btnSubirCSF")) {
    $("btnSubirCSF").addEventListener("click", () => $("inputCSF").click());
    $("inputCSF").addEventListener("change", () => {
        csfCargado = true;
        const btn = $("btnSubirCSF");
        btn.innerHTML = '<i class="fas fa-check-circle"></i> CSF Cargada';
        btn.classList.replace("bg-indigo-600", "bg-emerald-600");
    });
}

if (btnRegistroTecnico) {
    btnRegistroTecnico.addEventListener("click", async (e) => {
        e.preventDefault();
        
        if (!verificarRateLimit()) return; // 🦈 Protección Anti-Bot
        
        const form = document.getElementById("formRegistroTecnico");
        
        // 🧹 Sanitización Inmediata
        const nombre = escaparHTML(form.querySelector('[name="nombre"]')?.value.trim());
        const email = form.querySelector('[name="email"]')?.value.trim().toLowerCase();
        const password = form.querySelector('[name="password"]')?.value.trim();
        const telefono = escaparHTML(form.querySelector('[name="telefono"]')?.value.trim());
        
        // --- NUEVOS CAMPOS: VEHÍCULO Y DATOS BANCARIOS ---
        const clabe = escaparHTML(form.querySelector('[name="clabe"]')?.value.trim());
        const banco = escaparHTML(form.querySelector('[name="banco"]')?.value.trim());
        const tipoVehiculo = escaparHTML(form.querySelector('[name="tipoVehiculo"]')?.value) || "auto"; // Default

        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Faltan campos obligatorios básicos."); return;
        }

        // 🔐 Validación Enterprise
        if (!validarPassword(password)) {
            alert("🔒 SEGURIDAD: La contraseña debe tener mínimo 8 caracteres, incluir al menos 1 mayúscula y 1 número.");
            return;
        }

        if (!clabe || clabe.length !== 18) {
            alert("⚠️ La CLABE Interbancaria es obligatoria y debe tener exactamente 18 dígitos."); return;
        }
        if (!banco) {
            alert("⚠️ Ingresa el nombre de tu Banco para recibir pagos."); return;
        }

        // 1. CAPTURA DE SKILLS (Habilidades)
        const skills = [];
        if(form.querySelector('[name="skill_road"]')?.checked) skills.push("road");
        if(form.querySelector('[name="skill_fix"]')?.checked) skills.push("fix");
        if(form.querySelector('[name="skill_tech"]')?.checked) skills.push("tech");

        if(skills.length === 0) {
            alert("⚠️ Debes seleccionar al menos una especialidad (Skill).");
            return;
        }

        if (!ineCargado || !csfCargado) {
            alert("⚠️ ALERTA: Por cumplimiento legal (KYC), debes subir tu INE y CSF para continuar."); return;
        }

        let usuarioAuth = null;
        const textoOriginal = btnRegistroTecnico.innerHTML;

        try {
            btnRegistroTecnico.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Encriptando Datos...';
            btnRegistroTecnico.disabled = true;

            // 1. Registro en Auth (Respaldo básico manejado por firebase.js)
            usuarioAuth = await registrarUsuario(email, password, "tecnico", nombre);

            // 2. RUTA MAESTRA: Registro en DB CON DATOS BANCARIOS Y VEHÍCULO SOLO EN 'users'
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "tecnico",
                skills: skills,
                tipoVehiculo: tipoVehiculo, // Maestro para el GPS Motor
                estado: "pendiente",
                status: "pendiente",
                disponible: false,
                verificado: false,
                documentos: {
                    ine: true,
                    csf: true,
                    fecha_subida: serverTimestamp()
                },
                datos_bancarios: {
                    banco: banco,
                    clabe: clabe,
                    titular: nombre
                },
                nivel: "Bronce",
                creadoEn: serverTimestamp()
            }, { merge: true });

            alert("✅ ¡Solicitud recibida! Tu vehículo y datos bancarios serán validados por nuestro equipo de compliance.");
            window.location.href = "tecnico.html";

        } catch (error) {
            console.error("❌ Error Crítico en Registro Técnico:", error);
            if (usuarioAuth && error.code !== 'auth/email-already-in-use') {
                console.warn("⚠️ Fallo en DB: Limpiando Auth para permitir reintento.");
                await deleteUser(auth.currentUser).catch(e => console.error("Error limpieza:", e));
            }
            manejarErroresAuth(error);
            btnRegistroTecnico.innerHTML = textoOriginal;
            btnRegistroTecnico.disabled = false;
        }
    });
}

// ======================================================
// C. LOGIN Y D. GOOGLE
// ======================================================
const btnLogin = $("btnLogin");
if (btnLogin) {
    btnLogin.addEventListener("click", async (e) => {
        e.preventDefault();
        
        if (!verificarRateLimit()) return; // 🦈 Protección Anti-Bot

        const form = document.getElementById("formLogin");
        const email = form.querySelector('[name="email"]')?.value.trim().toLowerCase();
        const password = form.querySelector('[name="password"]')?.value.trim();

        if (!email || !password) {
            alert("⚠️ Ingresa datos completos."); return;
        }
        
        const textoOriginal = btnLogin.innerHTML;
        try {
            btnLogin.innerHTML = '<i class="fas fa-fingerprint animate-pulse"></i> Autenticando...';
            btnLogin.disabled = true;
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            manejarErroresAuth(error);
            btnLogin.innerHTML = textoOriginal;
            btnLogin.disabled = false;
        }
    });
}

const btnGoogle = $("btnLoginGoogle");
if (btnGoogle) {
    btnGoogle.addEventListener("click", async (e) => {
        e.preventDefault();
        
        if (!verificarRateLimit()) return; // 🦈 Protección Anti-Bot
        
        const textoOriginal = btnGoogle.innerHTML;

        try {
            btnGoogle.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
            btnGoogle.disabled = true;

            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            const docSnap = await getDoc(doc(db, "users", user.uid));
            
            if (!docSnap.exists()) {
                const esTecnico = confirm("¿Eres TÉCNICO? [ACEPTAR] = SÍ / [CANCELAR] = CLIENTE");
                const rolSeleccionado = esTecnico ? "tecnico" : "cliente";
                
                // 🧹 Sanitizamos el nombre que viene de Google por seguridad
                const nombreSeguro = escaparHTML(user.displayName || "Usuario de Google");

                const perfilBase = {
                    uid: user.uid,
                    nombre: nombreSeguro,
                    email: user.email,
                    rol: rolSeleccionado,
                    tipoVehiculo: "auto", // Default
                    skills: esTecnico ? ["fix"] : [],
                    estado: esTecnico ? "pendiente" : "activo",
                    status: esTecnico ? "pendiente" : "activo",
                    creadoEn: serverTimestamp()
                };

                // Guardado en RUTA MAESTRA ('users')
                await setDoc(doc(db, "users", user.uid), perfilBase);

                // CORRECCIÓN SENIOR: Sincronización del respaldo para mantener coherencia con el registro manual
                if (rolSeleccionado === 'tecnico') {
                    await setDoc(doc(db, "tecnicos", user.uid), { ...perfilBase, disponible: false });
                } else {
                    await setDoc(doc(db, "clientes", user.uid), { ...perfilBase, pedidos: 0 });
                }
                
                if(esTecnico) {
                    alert("⚠️ Aviso: Por seguridad, deberás completar tu perfil bancario y vehículo en tu panel.");
                } else {
                    alert("⚠️ Aviso: Deberás agregar una tarjeta en tu panel para solicitar servicios (Garantía de Servicio).");
                }
            }
        } catch (error) {
            alert("Error con Google. Intenta nuevamente.");
            console.error(error);
            btnGoogle.innerHTML = textoOriginal;
            btnGoogle.disabled = false;
        }
    });
}

// ======================================================
// E. OBSERVADOR Y MANEJO DE ERRORES
// ======================================================
observarAuth((user) => {
    if (user) {
        const path = window.location.pathname;
        if (path.includes("login.html") || path.includes("registro")) {
            setTimeout(() => {
                if (user.rol === "tecnico") window.location.href = "tecnico.html";
                else if (user.rol === "admin") window.location.href = "admin.html";
                else window.location.href = "cliente.html";
            }, 600);
        }
    }
});

function manejarErroresAuth(error) {
    console.log("Código de error:", error.code);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        alert("❌ Credenciales incorrectas o cuenta mal configurada. Revisa tus datos.");
    } else if (error.code === 'auth/email-already-in-use') {
        alert("⚠️ El correo ya está registrado en nuestro sistema. Intenta iniciar sesión.");
    } else if (error.code === 'auth/weak-password') {
        alert("⚠️ La contraseña es muy débil. Usa al menos 8 caracteres, números y mayúsculas.");
    } else {
        alert("🚨 Error de autenticación: " + error.message);
    }
}
