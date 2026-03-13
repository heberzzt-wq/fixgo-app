/**
 * ======================================================
 * FIXGO 2026 - SISTEMA DE REGISTRO Y LOGIN UNIVERSAL
 * Archivo: app-registro.js
 * Versión: 6.5 (STORAGE UPLOAD + ANTI-RACE CONDITION)
 * Autor: Heber (CEO & Lead Architect)
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR.
 * ======================================================
 */
console.log(" 🚀 [app-registro.js] Inicializando sistema V6.5 (Storage Direct Upload + Anti-Redirect)...");

import { 
    auth, 
    db, 
    storage, 
    registrarUsuario, 
    signInWithEmailAndPassword, 
    signOut, 
    doc, 
    getDoc, 
    setDoc, 
    serverTimestamp,
    observarAuth,
    validarClaveB2B // 🔥 INYECCIÓN: Importamos el validador de llaves
} from "./firebase.js";

import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 🔥 INYECCIÓN: Importamos la librería para subir archivos pesados directo a la nube
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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
// 📸 MOTOR CLOUD STORAGE (REEMPLAZA AL BASE64 PESADO)
// ======================================================
const subirAStorage = async (file, path) => {
    if (!file) return null;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
};

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
// ⚖️ GESTIÓN DE TÉRMINOS Y CONDICIONES SEPARADOS
// ======================================================
const abrirModalLegal = (idModal) => {
    const modal = $(idModal);
    if (modal) modal.classList.remove("hidden");
};

const cerrarModalLegal = (idModal) => {
    const modal = $(idModal);
    if (modal) modal.classList.add("hidden");
};

// Controladores para Modal de CLIENTES
if ($("linkTerminosCliente")) {
    $("linkTerminosCliente").addEventListener("click", (e) => {
        e.preventDefault();
        abrirModalLegal("modalTerminosCliente");
    });
}
if ($("btnCerrarTerminosCliente")) {
    $("btnCerrarTerminosCliente").addEventListener("click", () => cerrarModalLegal("modalTerminosCliente"));
}

// Controladores para Modal de TÉCNICOS
if ($("linkTerminosTecnico")) {
    $("linkTerminosTecnico").addEventListener("click", (e) => {
        e.preventDefault();
        abrirModalLegal("modalTerminosTecnico");
    });
}
if ($("btnCerrarTerminosTecnico")) {
    $("btnCerrarTerminosTecnico").addEventListener("click", () => cerrarModalLegal("modalTerminosTecnico"));
}

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
        const codigoB2B = escaparHTML(form.querySelector('[name="codigoB2B"]')?.value.trim().toUpperCase()) || null;

        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Por favor, completa todos los campos personales."); return;
        }

        if (!validarPassword(password)) {
            alert("🔒 SEGURIDAD: La contraseña debe tener mínimo 8 caracteres, incluir al menos 1 mayúscula y 1 número."); return;
        }
        
        const termsAceptados = document.getElementById("chkTerminosCliente")?.checked;
        if (!termsAceptados) {
            alert("⚖️ Obligatorio: Debes marcar la casilla aceptando los Términos y Condiciones de Uso para Clientes."); return;
        }

        if (!stripe || !cardElement) {
            alert("⚠️ Error: El sistema de pagos no está cargado. Recarga la página."); return;
        }

        let usuarioAuth = null;
        const textoOriginal = btnRegistroCliente.innerHTML;

        try {
            // 🔥 BANDERA DE SEGURIDAD: Impide que el sistema redirija antes de terminar
            window.isRegisteringLocal = true; 

            // 🚀 NUEVA LÓGICA B2B: Validar la clave ANTES de cobrar y crear usuarios
            let esAdminB2B = false;
            let datosLlave = null;

            if (codigoB2B && codigoB2B.length > 0) {
                btnRegistroCliente.innerHTML = '<i class="fas fa-key"></i> Verificando Clave B2B...';
                btnRegistroCliente.disabled = true;

                datosLlave = await validarClaveB2B(codigoB2B);

                if (!datosLlave) {
                    alert("❌ La Clave B2B ingresada es incorrecta o no existe. Verifica con tu corporativo.");
                    btnRegistroCliente.innerHTML = textoOriginal;
                    btnRegistroCliente.disabled = false;
                    window.isRegisteringLocal = false;
                    return; // Detiene el registro si la clave es falsa
                }
                
                esAdminB2B = true;
            }

            btnRegistroCliente.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando con el Banco...';
            btnRegistroCliente.disabled = true;

            const { token, error } = await stripe.createToken(cardElement);

            if (error) {
                throw new Error(error.message); 
            }

            btnRegistroCliente.innerHTML = '<i class="fas fa-shield-alt"></i> Creando Bóveda...';

            // 🌍 DETERMINACIÓN DE ROL Y SUBTIPO BASADO EN LA CLAVE B2B
            const rolFinal = esAdminB2B ? "admin_b2b" : "cliente";
            const subtipoFinal = esAdminB2B ? "saas" : "marketplace";

            // Pasamos los parámetros exactos a Firebase
            usuarioAuth = await registrarUsuario(email, password, rolFinal, nombre, subtipoFinal);

            // 🌍 DETERMINACIÓN DE EDIFICIO BASADO EN LA LLAVE B2B
            let tipoCuenta = esAdminB2B ? "B2B" : "B2C";
            let edificioID = esAdminB2B ? (datosLlave.edificioId || codigoB2B.toLowerCase()) : null;
            let edificioNombreFinal = esAdminB2B ? (datosLlave.edificioNombre || "Edificio B2B") : null;

            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: rolFinal, // Ahora sí se guarda como "admin_b2b"
                tipo_cuenta: tipoCuenta, // "B2B"
                edificioId: edificioID, // "uxmal39"
                edificioNombre: edificioNombreFinal, // "Uxmal 39"
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

            alert(`✅ ¡Registro Exitoso, ${nombre}!\n\nBienvenido a GestiaPremium. Tu perfil de ${esAdminB2B ? 'Administrador B2B' : 'Cliente'} ha sido creado.`);
            
            // Redirección Inteligente: B2B → panel-b2b-admin.html | B2C → cliente.html
            const rutaDestino = esAdminB2B ? "panel-b2b-admin.html" : "cliente.html";
            window.location.href = rutaDestino;

        } catch (error) {
            console.error("❌ Error Crítico en Registro Cliente:", error);
            if (usuarioAuth && error.code !== 'auth/email-already-in-use') {
                await deleteUser(auth.currentUser).catch(e => console.error("Error borrando huérfano:", e));
            }
            manejarErroresAuth(error);
            btnRegistroCliente.innerHTML = textoOriginal;
            btnRegistroCliente.disabled = false;
            window.isRegisteringLocal = false;
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
            btn.classList.replace("bg-zinc-800", "bg-emerald-600");
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
            btn.classList.replace("bg-zinc-800", "bg-emerald-600");
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
            btn.classList.replace("bg-zinc-800", "bg-emerald-600");
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
            btn.classList.replace("bg-zinc-800", "bg-emerald-600");
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
            alert("⚖️ Obligatorio: Acepta el Contrato de Prestación de Servicios, Términos y Aviso de Privacidad para Técnicos."); return;
        }

        const skills = [];
        if(form.querySelector('[name="skill_road"]')?.checked) skills.push("road");
        if(form.querySelector('[name="skill_fix"]')?.checked) skills.push("fix");
        if(form.querySelector('[name="skill_tech"]')?.checked) skills.push("tech");
        if(form.querySelector('[name="skill_maint"]')?.checked) skills.push("maint");

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
            // 🔥 BANDERA DE SEGURIDAD: Frena el redireccionamiento para darnos tiempo de subir los documentos a la Nube.
            window.isRegisteringLocal = true; 

            btnRegistroTecnico.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Encriptando Datos...';
            btnRegistroTecnico.disabled = true;

            usuarioAuth = await registrarUsuario(email, password, "tecnico", nombre);

            btnRegistroTecnico.innerHTML = '<i class="fas fa-cloud-upload-alt animate-bounce"></i> Subiendo Archivos Pesados a Google Cloud... (No cierres)';
            
            // Subida real a Google Storage (URLs ligeras en lugar de Base64 pesados)
            const uid = usuarioAuth.uid;
            const [urlFoto, urlINE, urlCSF, urlLicencia] = await Promise.all([
                subirAStorage(archivoFotoPerfil, `expedientes/${uid}/perfil_${Date.now()}`),
                subirAStorage(archivoINE, `expedientes/${uid}/ine_${Date.now()}`),
                subirAStorage(archivoCSF, `expedientes/${uid}/csf_${Date.now()}`),
                subirAStorage(archivoLicencia, `expedientes/${uid}/licencia_${Date.now()}`)
            ]);

            let urlsCertificados = [];
            if(archivosCertificados.length > 0) {
                urlsCertificados = await Promise.all(archivosCertificados.map((file, idx) => subirAStorage(file, `expedientes/${uid}/cert_${idx}_${Date.now()}`)));
            }

            btnRegistroTecnico.innerHTML = '<i class="fas fa-database animate-pulse"></i> Inyectando a Base de Datos...';

            await setDoc(doc(db, "users", uid), {
                uid: uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "tecnico",
                skills: skills,
                foto_perfil: urlFoto, 
                fotoPerfil: urlFoto,  
                estado: "pendiente",
                status: "pendiente",
                disponible: false,
                verificado: false,
                vehiculo: { tipo: tipoVehiculo, placas: placas },
                documentos: {
                    ine: urlINE,
                    csf: urlCSF,
                    licencia: urlLicencia || false,
                    certificados: urlsCertificados,
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

            alert(`✅ ¡Expediente Recibido!\n\nBienvenido, ${nombre}. Tu cuenta está en revisión. El Administrador validará tus documentos pronto.`);
            
            // Redirección Manual Segura una vez que terminó 100% de inyectar datos
            window.location.href = "tecnico.html";

        } catch (error) {
            console.error("❌ Error Crítico en Registro Técnico:", error);
            if (usuarioAuth && error.code !== 'auth/email-already-in-use') {
                await deleteUser(auth.currentUser).catch(e => console.error("Error limpieza:", e));
            }
            manejarErroresAuth(error);
            btnRegistroTecnico.innerHTML = textoOriginal;
            btnRegistroTecnico.disabled = false;
            window.isRegisteringLocal = false; // Liberamos la bandera en caso de error
        }
    });
}

// ======================================================
// C. LOGIN Y D. GOOGLE (GATEKEEPER LIBERADO)
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
            
            // 1. Iniciamos sesión. Firebase validará usuario y contraseña correctos.
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
                window.isRegisteringLocal = true; // Bloquea redirección prematura
                const esTecnico = confirm("¿Eres TÉCNICO? [ACEPTAR] = SÍ / [CANCELAR] = CLIENTE");
                const rolSeleccionado = esTecnico ? "tecnico" : "cliente";
                
                const nombreSeguro = escaparHTML(user.displayName || "Usuario de Google");
                const fotoGoogle = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(nombreSeguro)}&background=random`;

                const perfilBase = {
                    uid: user.uid,
                    nombre: nombreSeguro,
                    email: user.email,
                  // 🛡️ LIMPIEZA DE REGISTRO: Convertimos a minúsculas para evitar duplicados
                    email: email.toLowerCase(),

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
                
                if(esTecnico) {
                    alert("⚠️ Aviso: Tu perfil base fue creado con Google. Por seguridad y cumplimiento (KYC), deberás contactar al Administrador para subir tu INE, CSF, Licencia y Placas antes de ser aprobado.");
                } else {
                    alert("⚠️ Aviso: Deberás agregar una tarjeta en tu panel para solicitar servicios (Garantía de Servicio).");
                }

                window.location.href = esTecnico ? "tecnico.html" : "cliente.html";
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
    // 🔥 ESCUDO: Solo redirecciona automáticamente SI NO ESTAMOS en pleno proceso de registro
    if (user && !window.isRegisteringLocal) {
        const path = window.location.pathname;
        if (path.includes("login.html") || path.includes("registro")) {
            setTimeout(() => {
                // 🚀 REDIRECCIÓN MAESTRA CORREGIDA: Separamos los cables de Admin
                if (user.rol === "tecnico") {
                    window.location.href = "tecnico.html";
                } else if (user.rol === "admin_b2b") {
                    window.location.href = "panel-b2b-admin.html"; // Jorge va a su panel B2B
                } else if (user.rol === "admin") {
                    window.location.href = "admin.html"; // Heberto va a su Panel Maestro
                } else {
                    window.location.href = "cliente.html";
                }
            }, 600);
        }
    }
});
