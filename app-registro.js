/**
 * ======================================================
 * FIXGO 2026 - SISTEMA DE REGISTRO Y LOGIN UNIVERSAL
 * Archivo: app-registro.js
 * Versión: 6.1 (LOGISTICS + SHARK MODE + EMAIL GATEKEEPER)
 * Autor: Heber (CEO & Lead Architect)
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR.
 * ======================================================
 */
console.log(" 🚀 [app-registro.js] Inicializando sistema V6.1 (Compliance, Logística y Gatekeeper de Correo)...");

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
    deleteUser,
    sendEmailVerification // 🔥 INYECCIÓN V6.1: EL VERDUGO DE CORREOS
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

/**
 * 🦈 SANITIZADOR MAESTRO (PREVENCIÓN XSS)
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
// 📸 UTILIDAD DE CONVERSIÓN DE IMÁGENES A BASE64
// ======================================================
const fileToBase64 = file => new Promise((resolve, reject) => {
    if (!file) {
        resolve(null);
        return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// ======================================================
// 0. CONFIGURACIÓN DE STRIPE (TOKENIZACIÓN)
// ======================================================
const STRIPE_PUBLIC_KEY = 'pk_test_51SuznMFB3c4okYlKz7FZYdaftLAmuBWkO1cGlHDrzxbON37J8STqFtDsG6apf7zup4YJTmFbyVtmzdqIV0icjxeX00YVsW2OHU';
let stripe = null;
let elements = null;
let cardElement = null;

async function iniciarStripe() {
    if (window.Stripe) {
        stripe = window.Stripe(STRIPE_PUBLIC_KEY);
        elements = stripe.elements();
        
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

        if (document.getElementById("card-element")) {
            cardElement = elements.create("card", { style: style, hidePostalCode: true });
            cardElement.mount("#card-element");
            console.log(" 💳 Widget de Stripe montado correctamente.");
        }
    } else {
        console.warn(" ⚠️ Librería Stripe.js no detectada en el HTML.");
    }
}

if(document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarStripe);
} else {
    iniciarStripe();
}

const $ = (id) => document.getElementById(id);

// ======================================================
// A. LÓGICA DE REGISTRO DE CLIENTES 
// ======================================================
const btnRegistroCliente = $("btnRegistroCliente");
if (btnRegistroCliente) {
    btnRegistroCliente.addEventListener("click", async (e) => {
        e.preventDefault();
        
        if (!verificarRateLimit()) return;
        
        const form = document.getElementById("formRegistroCliente");
        if (!form) return;

        const nombre = escaparHTML(form.querySelector('[name="nombre"]')?.value.trim());
        const email = form.querySelector('[name="email"]')?.value.trim().toLowerCase();
        const password = form.querySelector('[name="password"]')?.value.trim();
        const telefono = escaparHTML(form.querySelector('[name="telefono"]')?.value.trim());

        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Por favor, completa todos los campos personales."); return;
        }

        if (!validarPassword(password)) {
            alert("🔒 SEGURIDAD: La contraseña debe tener mínimo 8 caracteres, incluir al menos 1 mayúscula y 1 número."); return;
        }
        
        const termsAceptados = document.getElementById("chkTerminosCliente")?.checked;
        if (!termsAceptados) {
            alert("⚖️ Obligatorio: Debes marcar la casilla aceptando los Términos y Condiciones."); return;
        }

        if (!stripe || !cardElement) {
            alert("⚠️ Error: El sistema de pagos no está cargado. Recarga la página."); return;
        }

        let usuarioAuth = null;
        const textoOriginal = btnRegistroCliente.innerHTML;

        try {
            btnRegistroCliente.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando con el Banco...';
            btnRegistroCliente.disabled = true;

            const { token, error } = await stripe.createToken(cardElement);

            if (error) {
                throw new Error(error.message); 
            }

            btnRegistroCliente.innerHTML = '<i class="fas fa-shield-alt"></i> Creando Bóveda...';

            usuarioAuth = await registrarUsuario(email, password, "cliente", nombre);

            // 🔥 INYECCIÓN V6.1: ENVIAR CORREO DE VALIDACIÓN AL CLIENTE
            await sendEmailVerification(auth.currentUser);

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

            // 🔥 DESCONECTAMOS AL USUARIO HASTA QUE VALIDE SU CORREO
            await signOut(auth);

            alert(`✅ ¡Registro Exitoso, ${nombre}!\n\nTe hemos enviado un enlace al correo: ${email}.\n\n🛑 DEBES DARLE CLIC AL ENLACE PARA ACTIVAR TU CUENTA antes de poder iniciar sesión.`);
            window.location.href = "login.html";

        } catch (error) {
            console.error("❌ Error Crítico en Registro Cliente:", error);
            if (usuarioAuth && error.code !== 'auth/email-already-in-use') {
                await deleteUser(auth.currentUser).catch(e => console.error("Error borrando huérfano:", e));
            }
            manejarErroresAuth(error);
            btnRegistroCliente.innerHTML = textoOriginal;
            btnRegistroCliente.disabled = false;
        }
    });
}

// ======================================================
// B. LÓGICA DE TÉCNICOS
// ======================================================
const btnRegistroTecnico = $("btnRegistroTecnico");

let archivoFotoPerfil = null;
let archivoINE = null;
let archivoCSF = null;
let archivoLicencia = null;
let archivosCertificados = []; 

if ($("btnSubirFoto")) {
    $("btnSubirFoto").addEventListener("click", () => $("inputFoto").click());
    $("inputFoto").addEventListener("change", (e) => {
        archivoFotoPerfil = e.target.files[0];
        if(archivoFotoPerfil) {
            const btn = $("btnSubirFoto");
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Foto Lista';
            btn.classList.replace("bg-zinc-800", "bg-emerald-600");
        }
    });
}

if ($("btnSubirINE")) {
    $("btnSubirINE").addEventListener("click", () => $("inputINE").click());
    $("inputINE").addEventListener("change", (e) => {
        archivoINE = e.target.files[0];
        if(archivoINE) {
            const btn = $("btnSubirINE");
            btn.innerHTML = '<i class="fas fa-check-circle"></i> INE Cargada';
            btn.classList.replace("bg-indigo-600", "bg-emerald-600");
        }
    });
}

if ($("btnSubirCSF")) {
    $("btnSubirCSF").addEventListener("click", () => $("inputCSF").click());
    $("inputCSF").addEventListener("change", (e) => {
        archivoCSF = e.target.files[0];
        if(archivoCSF) {
            const btn = $("btnSubirCSF");
            btn.innerHTML = '<i class="fas fa-check-circle"></i> CSF Cargada';
            btn.classList.replace("bg-indigo-600", "bg-emerald-600");
        }
    });
}

if ($("btnSubirLicencia")) {
    $("btnSubirLicencia").addEventListener("click", () => $("inputLicencia").click());
    $("inputLicencia").addEventListener("change", (e) => {
        archivoLicencia = e.target.files[0];
        if(archivoLicencia) {
            const btn = $("btnSubirLicencia");
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Licencia Cargada';
            btn.classList.replace("bg-blue-600", "bg-emerald-600");
        }
    });
}

if ($("btnSubirCertificados")) {
    $("btnSubirCertificados").addEventListener("click", () => $("inputCertificados").click());
    $("inputCertificados").addEventListener("change", (e) => {
        archivosCertificados = Array.from(e.target.files);
        if(archivosCertificados.length > 0) {
            const btn = $("btnSubirCertificados");
            btn.innerHTML = `<i class="fas fa-check-circle"></i> ${archivosCertificados.length} Certificado(s)`;
            btn.classList.replace("bg-purple-600", "bg-emerald-600");
        }
    });
}

if (btnRegistroTecnico) {
    btnRegistroTecnico.addEventListener("click", async (e) => {
        e.preventDefault();
        
        if (!verificarRateLimit()) return;
        
        const form = document.getElementById("formRegistroTecnico");
        
        const nombre = escaparHTML(form.querySelector('[name="nombre"]')?.value.trim());
        const email = form.querySelector('[name="email"]')?.value.trim().toLowerCase();
        const password = form.querySelector('[name="password"]')?.value.trim();
        const telefono = escaparHTML(form.querySelector('[name="telefono"]')?.value.trim());
        
        const clabe = escaparHTML(form.querySelector('[name="clabe"]')?.value.trim());
        const banco = escaparHTML(form.querySelector('[name="banco"]')?.value.trim());
        
        const tipoVehiculo = escaparHTML(form.querySelector('[name="tipoVehiculo"]')?.value) || "auto"; 
        const placas = escaparHTML(form.querySelector('[name="placas"]')?.value.trim().toUpperCase());

        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Faltan campos obligatorios básicos."); return;
        }

        if (!validarPassword(password)) {
            alert("🔒 SEGURIDAD: La contraseña debe tener mínimo 8 caracteres, incluir al menos 1 mayúscula y 1 número."); return;
        }

        if (!clabe || clabe.length !== 18) {
            alert("⚠️ La CLABE Interbancaria debe tener exactamente 18 dígitos."); return;
        }
        if (!banco) {
            alert("⚠️ Ingresa el nombre de tu Banco."); return;
        }
        if (!placas && tipoVehiculo !== 'peaton') {
            alert("⚠️ Debes ingresar las placas de tu vehículo."); return;
        }
        
        const termsAceptados = document.getElementById("chkTerminosTecnico")?.checked;
        if (!termsAceptados) {
            alert("⚖️ Obligatorio: Acepta los Términos y el Aviso de Privacidad."); return;
        }

        const skills = [];
        if(form.querySelector('[name="skill_road"]')?.checked) skills.push("road");
        if(form.querySelector('[name="skill_fix"]')?.checked) skills.push("fix");
        if(form.querySelector('[name="skill_tech"]')?.checked) skills.push("tech");

        if(skills.length === 0) {
            alert("⚠️ Debes seleccionar al menos una especialidad (Skill)."); return;
        }

        if (!archivoFotoPerfil) {
            alert("📸 Faltante: Debes subir una fotografía de perfil."); return;
        }
        if (!archivoINE || !archivoCSF) {
            alert("⚖️ Cumplimiento Legal: Es obligatorio subir tu INE y tu CSF."); return;
        }
        if (tipoVehiculo !== 'peaton' && !archivoLicencia) {
             alert("🚗 Logística: Si operas un vehículo, es obligatorio subir tu Licencia de Conducir."); return;
        }

        let usuarioAuth = null;
        const textoOriginal = btnRegistroTecnico.innerHTML;

        try {
            btnRegistroTecnico.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Encriptando Datos...';
            btnRegistroTecnico.disabled = true;

            usuarioAuth = await registrarUsuario(email, password, "tecnico", nombre);

            // 🔥 INYECCIÓN V6.1: ENVIAR CORREO DE VALIDACIÓN AL TÉCNICO
            await sendEmailVerification(auth.currentUser);

            btnRegistroTecnico.innerHTML = '<i class="fas fa-file-upload animate-bounce"></i> Procesando Expediente...';
            
            const [b64Foto, b64INE, b64CSF, b64Licencia] = await Promise.all([
                fileToBase64(archivoFotoPerfil),
                fileToBase64(archivoINE),
                fileToBase64(archivoCSF),
                fileToBase64(archivoLicencia)
            ]);

            let b64Certificados = [];
            if(archivosCertificados.length > 0) {
                b64Certificados = await Promise.all(archivosCertificados.map(file => fileToBase64(file)));
            }

            btnRegistroTecnico.innerHTML = '<i class="fas fa-database animate-pulse"></i> Inyectando a Base de Datos...';

            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "tecnico",
                skills: skills,
                foto_perfil: b64Foto, 
                fotoPerfil: b64Foto,  
                estado: "pendiente",
                status: "pendiente",
                disponible: false,
                verificado: false,
                vehiculo: { tipo: tipoVehiculo, placas: placas },
                documentos: {
                    ine: b64INE,
                    csf: b64CSF,
                    licencia: b64Licencia || false,
                    certificados: b64Certificados,
                    fecha_subida: serverTimestamp()
                },
                datos_bancarios: {
                    banco: banco,
                    clabe: clabe,
                    titular: nombre
                },
                nivel: "BRONCE",
                reputacion: 5.0,
                servicios_completados: 0,
                creadoEn: serverTimestamp()
            }, { merge: true });

            // 🔥 DESCONECTAMOS AL USUARIO HASTA QUE VALIDE SU CORREO
            await signOut(auth);

            alert(`✅ ¡Expediente Recibido!\n\n1️⃣ Te hemos enviado un enlace al correo: ${email}. DEBES DARLE CLIC PARA ACTIVAR TU CUENTA.\n2️⃣ Después, el Administrador validará tus documentos.`);
            window.location.href = "login.html";

        } catch (error) {
            console.error("❌ Error Crítico en Registro Técnico:", error);
            if (usuarioAuth && error.code !== 'auth/email-already-in-use') {
                await deleteUser(auth.currentUser).catch(e => console.error("Error limpieza:", e));
            }
            manejarErroresAuth(error);
            btnRegistroTecnico.innerHTML = textoOriginal;
            btnRegistroTecnico.disabled = false;
        }
    });
}

// ======================================================
// C. LOGIN (GATEKEEPER DE CORREO ACTIVADO) Y D. GOOGLE
// ======================================================
const btnLogin = $("btnLogin");
if (btnLogin) {
    btnLogin.addEventListener("click", async (e) => {
        e.preventDefault();
        
        if (!verificarRateLimit()) return;

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
            
            // 1. Intentamos iniciar sesión con Firebase
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 🔥 INYECCIÓN V6.1: EL VERDUGO DE CORREOS
            // Si el correo no está verificado (y no es el super admin), lo pateamos fuera
            if (!user.emailVerified) {
                // Hacemos una excepción para ti (el CEO/Admin principal) para que no te quedes bloqueado
                if (email !== "hebertoh-m@hotmail.com") {
                    await signOut(auth); // Lo expulsamos inmediatamente
                    alert(`🚨 ACCESO DENEGADO\n\nAún no has verificado tu correo electrónico (${email}).\n\nPor favor, revisa tu bandeja de entrada o carpeta de Spam y haz clic en el enlace de activación para poder ingresar.`);
                    btnLogin.innerHTML = textoOriginal;
                    btnLogin.disabled = false;
                    return; // Detenemos la ejecución
                }
            }

            // Si llega aquí, su correo sí está verificado (o es el Admin). El observador lo redirigirá.

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
        
        if (!verificarRateLimit()) return;
        
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
                
                const nombreSeguro = escaparHTML(user.displayName || "Usuario de Google");
                const fotoGoogle = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(nombreSeguro)}&background=random`;

                const perfilBase = {
                    uid: user.uid,
                    nombre: nombreSeguro,
                    email: user.email,
                    rol: rolSeleccionado,
                    foto_perfil: fotoGoogle, 
                    creadoEn: serverTimestamp()
                };

                if (esTecnico) {
                    perfilBase.vehiculo = { tipo: "auto", placas: "" };
                    perfilBase.skills = ["fix"];
                    perfilBase.estado = "pendiente";
                    perfilBase.status = "pendiente";
                    perfilBase.disponible = false;
                    perfilBase.documentos = { ine: false, csf: false, licencia: false, certificados: [] };
                    perfilBase.datos_bancarios = { banco: "", clabe: "", titular: nombreSeguro };
                    perfilBase.nivel = "BRONCE";
                    perfilBase.reputacion = 5.0;
                    perfilBase.servicios_completados = 0;
                } else {
                    perfilBase.estado = "activo";
                    perfilBase.status = "activo";
                }

                await setDoc(doc(db, "users", user.uid), perfilBase);

                if (rolSeleccionado === 'tecnico') {
                    await setDoc(doc(db, "tecnicos", user.uid), { ...perfilBase });
                } else {
                    await setDoc(doc(db, "clientes", user.uid), { ...perfilBase, pedidos: 0 });
                }
                
                if(esTecnico) {
                    alert("⚠️ Aviso: Tu perfil base fue creado con Google. Por seguridad y cumplimiento (KYC), deberás contactar al Administrador para subir tu INE, CSF, Licencia y Placas antes de ser aprobado.");
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
    // Si hay un usuario logueado pero su correo NO está verificado, no lo redirigimos
    // (a menos que sea el Admin, que tiene un pase especial)
    if (user && (user.emailVerified || user.email === "hebertoh-m@hotmail.com")) {
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
