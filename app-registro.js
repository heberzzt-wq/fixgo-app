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

import { initializePlatformRelease } from "./platform-release.js";

initializePlatformRelease().catch(error => console.error("[GESTIA_RELEASE_AUTHORITY_FAILED]", error));

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
    updateDoc,
    serverTimestamp,
    observarAuth,
    validarClaveB2B // 🔥 INYECCIÓN: Importamos el validador de llaves
} from "./firebase.js";

import {
    TECHNICIAN_KYC_STATES,
    buildTechnicianReviewPatch,
    createTechnicianRegistrationProfile,
    storagePathForTechnicianDocument
} from "./b2c-technician-profile.js";

import { 
    GoogleAuthProvider, 
    signInWithPopup
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

async function subirDocumentoExpedienteRecuperable(uid, kind, file, onConfirmed) {
    if (!file) return null;
    const storagePath = storagePathForTechnicianDocument(uid, kind, file.name);
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
        kyc: {
            estado: TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING,
            upload_actual: kind,
            uploads: {
                [kind]: {
                    estado: "subiendo",
                    storage_path: storagePath,
                    actualizado_at: serverTimestamp()
                }
            }
        }
    }, { merge: true });

    try {
        const url = await subirAStorage(file, storagePath);
        await onConfirmed(url, storagePath);
        await setDoc(userRef, {
            kyc: {
                upload_actual: null,
                uploads: {
                    [kind]: {
                        estado: "confirmado",
                        storage_path: storagePath,
                        url,
                        actualizado_at: serverTimestamp()
                    }
                }
            }
        }, { merge: true });
        return { url, storagePath };
    } catch (error) {
        await setDoc(userRef, {
            disponible: false,
            kyc: {
                estado: TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING,
                upload_actual: null,
                ultimo_error: {
                    documento: kind,
                    codigo: String(error?.code || "UPLOAD_FAILED").slice(0, 120),
                    actualizado_at: serverTimestamp()
                },
                uploads: {
                    [kind]: {
                        estado: "upload_failed",
                        storage_path: storagePath,
                        actualizado_at: serverTimestamp()
                    }
                }
            }
        }, { merge: true });
        throw error;
    }
}

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
const codigoB2BInput = document.querySelector('#formRegistroCliente [name="codigoB2B"]');
codigoB2BInput?.addEventListener("input", () => {
    const stripeSection = document.getElementById("stripeRegistroClienteB2B");
    stripeSection?.classList.toggle("hidden", !codigoB2BInput.value.trim());
});

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
            alert("⚠️ Por favor, completa todos los campos personales."); 
            return;
        }

        if (!validarPassword(password)) {
            alert("🔒 SEGURIDAD: La contraseña debe tener mínimo 8 caracteres, incluir al menos 1 mayúscula y 1 número."); 
            return;
        }
        
        const termsAceptados = document.getElementById("chkTerminosCliente")?.checked;
        if (!termsAceptados) {
            alert("⚖️ Obligatorio: Debes marcar la casilla aceptando los Términos y Condiciones de Uso para Clientes."); 
            return;
        }

        let usuarioAuth = null;
        const textoOriginal = btnRegistroCliente.innerHTML;

        try {
            // 🔥 BANDERA DE SEGURIDAD: Impide que el sistema redirija antes de terminar
            window.isRegisteringLocal = true; 

            let esAdminB2B = false;
            let datosLlave = null;

            // 🚀 VALIDACIÓN PREVIA DE LLAVE
            if (codigoB2B && codigoB2B.length > 0) {
                btnRegistroCliente.innerHTML = '<i class="fas fa-key"></i> Verificando Clave B2B...';
                btnRegistroCliente.disabled = true;

                datosLlave = await validarClaveB2B(codigoB2B);

                if (!datosLlave) {
                    alert("❌ La Clave B2B ingresada es incorrecta o no existe. Verifica con tu corporativo.");
                    btnRegistroCliente.innerHTML = textoOriginal;
                    btnRegistroCliente.disabled = false;
                    window.isRegisteringLocal = false;
                    return; 
                }
                
                esAdminB2B = true;
            }

            let token = null;
            if (esAdminB2B) {
                if (!stripe || !cardElement) {
                    throw new Error("La pasarela contractual B2B no está disponible.");
                }
                btnRegistroCliente.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando con el Banco...';
                btnRegistroCliente.disabled = true;
                const tokenResult = await stripe.createToken(cardElement);
                if (tokenResult.error) throw new Error(tokenResult.error.message);
                token = tokenResult.token;
                btnRegistroCliente.innerHTML = '<i class="fas fa-shield-alt"></i> Creando Bóveda...';
            }

            const rolFinal = esAdminB2B ? "admin_b2b" : "cliente";
            const subtipoFinal = esAdminB2B ? "saas" : "marketplace";

            // 🚀 REGISTRO ATÓMICO: Inyectamos edificioId desde el nacimiento del usuario
            usuarioAuth = await registrarUsuario(
                email, 
                password, 
                rolFinal, 
                nombre, 
                subtipoFinal, 
                null, // empresaId
                esAdminB2B ? {
                    edificioId: datosLlave.edificioId,
                    edificioNombre: datosLlave.edificioNombre
                } : null
            );

            // 💳 ACTUALIZACIÓN DE MÉTODO DE PAGO Y AUDITORÍA
            // Los campos rol, tipo_cuenta, edificioId y edificioNombre ya están en el perfil por registrarUsuario
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                telefono: telefono,
                ...(token ? {
                    metodo_pago_default: {
                        stripe_token: token.id,
                        marca: token.card.brand,
                        last4: token.card.last4,
                        exp_month: token.card.exp_month,
                        exp_year: token.card.exp_year
                    }
                } : {}),
                actualizadoEn: serverTimestamp()
            }, { merge: true });

            alert(`✅ ¡Registro Exitoso, ${nombre}!\n\nBienvenido a GestiaPremium. Tu perfil de ${esAdminB2B ? 'Administrador B2B' : 'Cliente'} ha sido creado.`);
            
            // Redirección Inteligente: B2B → panel-b2b-admin.html | B2C → cliente.html
            const rutaDestino = esAdminB2B ? "panel-b2b-admin.html" : "cliente.html";
            window.location.href = rutaDestino;

        } catch (error) {
            console.error("❌ Error Crítico en Registro Cliente:", error);
            
            if (usuarioAuth) {
                alert("⚠️ Tu identidad ya quedó registrada. Inicia sesión para completar los datos pendientes sin crear otra cuenta.");
            } else {
                manejarErroresAuth(error);
            }
            btnRegistroCliente.innerHTML = textoOriginal;
            btnRegistroCliente.disabled = false;
            window.isRegisteringLocal = false;
        }
    });
}
// ======================================================
// B. LÓGICA DE TÉCNICOS (SOCIOS PRO)
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
            window.isRegisteringLocal = true; 

            btnRegistroTecnico.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Encriptando Datos...';
            btnRegistroTecnico.disabled = true;

            // Registro en Firebase Auth (Marketplace por defecto para técnicos)
            usuarioAuth = await registrarUsuario(email, password, "tecnico", nombre, "marketplace");

            btnRegistroTecnico.innerHTML = '<i class="fas fa-cloud-upload-alt animate-bounce"></i> Subiendo Archivos Pesados...';
            
            const uid = usuarioAuth.uid;
            const userRef = doc(db, "users", uid);
            await setDoc(userRef, {
                telefono: telefono,
                skills: skills,
                vehiculo: { tipo: tipoVehiculo, placas: placas },
                datos_bancarios: {
                    banco: banco,
                    clabe: clabe,
                    titular: nombre
                },
                nivel: "BRONCE",
                reputacion: 5.0,
                servicios_completados: 0,
                estado: TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING,
                status: TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING,
                disponible: false,
                kyc: {
                    estado: TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING,
                    aprobado: false,
                    ultimo_error: null
                },
                actualizadoEn: serverTimestamp()
            }, { merge: true });

            const confirmarCampo = patch => async () => {
                await setDoc(userRef, patch, { merge: true });
            };

            await subirDocumentoExpedienteRecuperable(uid, "foto_perfil", archivoFotoPerfil,
                async (url) => confirmarCampo({ foto_perfil: url })());
            await subirDocumentoExpedienteRecuperable(uid, "ine", archivoINE,
                async (url) => confirmarCampo({ documentos: { ine: url } })());
            await subirDocumentoExpedienteRecuperable(uid, "csf", archivoCSF,
                async (url) => confirmarCampo({ documentos: { csf: url } })());
            if (archivoLicencia) {
                await subirDocumentoExpedienteRecuperable(uid, "licencia", archivoLicencia,
                    async (url) => confirmarCampo({ documentos: { licencia: url } })());
            }

            const urlsCertificados = [];
            for (let index = 0; index < archivosCertificados.length; index += 1) {
                await subirDocumentoExpedienteRecuperable(uid, `certificado_${index}`, archivosCertificados[index],
                    async (url) => {
                        urlsCertificados.push(url);
                        await setDoc(userRef, {
                            documentos: { certificados: [...urlsCertificados] }
                        }, { merge: true });
                    });
            }

            const currentProfile = (await getDoc(userRef)).data() || {};
            const reviewPatch = buildTechnicianReviewPatch({
                ...currentProfile,
                documentos: {
                    ...(currentProfile.documentos || {}),
                    certificados: urlsCertificados
                }
            });
            await updateDoc(userRef, {
                ...reviewPatch,
                "documentos.certificados": urlsCertificados,
                "documentos.fecha_subida": serverTimestamp(),
                "documentos.fecha_actualizacion": serverTimestamp(),
                "kyc.ultimo_error": null,
                actualizadoEn: serverTimestamp()
            });

            alert(`✅ ¡Expediente Recibido!\n\nBienvenido, ${nombre}. Tu cuenta está en revisión.`);
            window.location.href = "tecnico.html";

        } catch (error) {
            console.error("❌ Error Crítico en Registro Técnico:", error);
            if (usuarioAuth) {
                alert("⚠️ Tu cuenta y los documentos ya confirmados quedaron guardados. Inicia sesión para reanudar únicamente lo faltante.");
            } else {
                manejarErroresAuth(error);
            }
            btnRegistroTecnico.innerHTML = textoOriginal;
            btnRegistroTecnico.disabled = false;
            window.isRegisteringLocal = false;
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

                const emailSeguro = String(user.email || "").trim().toLowerCase();
                const perfilBase = esTecnico
                    ? {
                        ...createTechnicianRegistrationProfile({
                            uid: user.uid,
                            email: emailSeguro,
                            nombre: nombreSeguro,
                            provider: "google"
                        }),
                        foto_perfil: fotoGoogle,
                        creadoEn: serverTimestamp(),
                        actualizadoEn: serverTimestamp()
                    }
                    : {
                        uid: user.uid,
                        nombre: nombreSeguro,
                        email: emailSeguro,
                        rol: rolSeleccionado,
                        sub_type: "marketplace",
                        tipo_cuenta: "B2C",
                        foto_perfil: fotoGoogle,
                        estado: "activo",
                        status: "activo",
                        wallet: 0,
                        currency: "MXN",
                        creadoEn: serverTimestamp(),
                        actualizadoEn: serverTimestamp()
                    };

                if (esTecnico) {
                    perfilBase.skills = [];
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
/* ======================================================
   MÓDULO: DICCIONARIO DE ERRORES (V6.5)
   ====================================================== */
/**
 * Traduce los códigos técnicos de Firebase Auth a mensajes amigables.
 * Soluciona el ReferenceError detectado en la línea 522.
 */
function manejarErroresAuth(error) {
    console.error(" 🚨 [Firebase Auth Error]:", error.code);
    let mensaje = "Ocurrió un error inesperado al procesar tu solicitud. Intenta de nuevo.";

    switch (error.code) {
        case 'auth/email-already-in-use':
            mensaje = "Este correo electrónico ya está registrado en el sistema. Intenta iniciar sesión.";
            break;
        case 'auth/invalid-email':
            mensaje = "El formato del correo electrónico ingresado no es válido.";
            break;
        case 'auth/weak-password':
            mensaje = "La contraseña es muy débil. Usa al menos 8 caracteres, incluyendo mayúsculas y números.";
            break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            mensaje = "Correo o contraseña incorrectos. Verifica tus credenciales.";
            break;
        case 'auth/network-request-failed':
            mensaje = "Error de red. Revisa tu conexión a internet e intenta nuevamente.";
            break;
        case 'auth/too-many-requests':
            mensaje = "Demasiados intentos fallidos. El acceso ha sido bloqueada temporalmente por seguridad.";
            break;
        case 'auth/internal-error':
            mensaje = "Error interno del servidor. Por favor, recarga la página.";
            break;
    }

    // Usamos alert para mantener consistencia con el estilo de app-registro.js
    alert("🚨 GESTIA PREMIUM:\n\n" + mensaje);
}
// ======================================================
// E. OBSERVADOR Y MANEJO DE ERRORES
// ======================================================

/*
observarAuth((user) => {

    // 🔥 ESCUDO: Solo redirecciona automáticamente SI NO ESTAMOS en pleno proceso de registro
    if (user && !window.isRegisteringLocal) {

        const path = window.location.pathname;

        if (
            path.includes("login.html") ||
            path.includes("registro")
        ) {

            setTimeout(() => {

                // 🚀 REDIRECCIÓN MAESTRA CORREGIDA: Separamos los cables de Admin
                if (user.rol === "tecnico") {

                    window.location.href =
                        "tecnico.html";

                } else if (
                    user.rol === "admin_b2b"
                ) {

                    window.location.href =
                        "panel-b2b-admin.html";

                } else if (
                    user.rol === "admin"
                ) {

                    window.location.href =
                        "admin.html";

                } else {

                    window.location.href =
                        "cliente.html";
                }

            }, 600);
        }
    }
});
*/
