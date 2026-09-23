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
    verificarIdentidadB2C,
    signInWithEmailAndPassword, 
    signOut,
    onAuthStateChanged,
    doc, 
    getDoc, 
    setDoc, 
    updateDoc,
    serverTimestamp,
    observarAuth,

} from "./firebase.js";

import {
    TECHNICIAN_KYC_STATES,
    MEXICAN_CLABE_VERSION,
    buildTechnicianReviewPatch,
    createTechnicianRegistrationProfile,
    inspectMexicanClabe,
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

async function subirDocumentoExpedienteRecuperable(
    uid,
    kind,
    file,
    onConfirmed,
    { kycState = TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING } = {}
) {
    if (!file) return null;
    const storagePath = storagePathForTechnicianDocument(uid, kind, file.name);
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
        kyc: {
            estado: kycState,
            ultimo_error: null,
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
                estado: kycState,
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
const clienteIdentityResumeRequested =
    new URLSearchParams(window.location.search).get("resume") === "cliente-identity";
let clienteIdentityResumeProfile = null;

if (clienteIdentityResumeRequested) {
    onAuthStateChanged(auth, async (sessionUser) => {
        if (!sessionUser) {
            alert("🔐 Por seguridad necesitamos reautenticar esta cuenta antes de continuar la identidad.");
            window.location.replace("login.html?resume=cliente-identity");
            return;
        }

        const snapshot = await getDoc(doc(db, "users", sessionUser.uid));
        const profile = snapshot.exists() ? snapshot.data() || {} : {};
        if (profile.rol !== "cliente" || profile.tipo_cuenta !== "B2C") {
            alert("⚠️ Esta sesión no corresponde a un cliente B2C recuperable.");
            window.location.href = "index.html";
            return;
        }
        if (profile.kyc?.identity_verified === true &&
            profile.kyc?.identity_machine_status === "verified") {
            window.location.href = "cliente.html";
            return;
        }

        clienteIdentityResumeProfile = {
            uid: sessionUser.uid,
            email: String(sessionUser.email || profile.email || "").toLowerCase()
        };

        const form = document.getElementById("formRegistroCliente");
        const nombreInput = form?.querySelector('[name="nombre"]');
        const emailInput = form?.querySelector('[name="email"]');
        const passwordInput = form?.querySelector('[name="password"]');
        const telefonoInput = form?.querySelector('[name="telefono"]');
        if (nombreInput) nombreInput.value = profile.nombre || "";
        if (emailInput) {
            emailInput.value = clienteIdentityResumeProfile.email;
            emailInput.readOnly = true;
        }
        if (telefonoInput) telefonoInput.value = profile.telefono || "";
        if (passwordInput) {
            passwordInput.value = "";
            passwordInput.required = false;
            passwordInput.placeholder = "No requerida: sesión activa";
        }
        if (codigoB2BInput) {
            codigoB2BInput.value = "";
            codigoB2BInput.disabled = true;
        }
        document.getElementById("identityVerificationCardCliente")?.classList.remove("hidden");
        if (btnRegistroCliente) {
            btnRegistroCliente.innerHTML = '<i class="fas fa-user-shield"></i> REANUDAR IDENTIDAD EN ESTA CUENTA';
        }
    });
}
codigoB2BInput?.addEventListener("input", () => {
    const hasB2BCode = Boolean(codigoB2BInput.value.trim());
    const stripeSection = document.getElementById("stripeRegistroClienteB2B");
    stripeSection?.classList.toggle("hidden", !hasB2BCode);
    document.getElementById("identityVerificationCardCliente")?.classList.toggle("hidden", hasB2BCode);
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
        const resumeExistingCustomer = Boolean(
            clienteIdentityResumeRequested &&
            clienteIdentityResumeProfile?.uid &&
            auth.currentUser?.uid === clienteIdentityResumeProfile.uid &&
            email === clienteIdentityResumeProfile.email
        );

        if (!nombre || !email || !telefono || (!resumeExistingCustomer && !password)) {
            alert("⚠️ Por favor, completa todos los campos personales."); 
            return;
        }

        if (!resumeExistingCustomer && !validarPassword(password)) {
            alert("🔒 SEGURIDAD: La contraseña debe tener mínimo 8 caracteres, incluir al menos 1 mayúscula y 1 número."); 
            return;
        }
        if (resumeExistingCustomer && codigoB2B) {
            alert("🛡️ La recuperación de identidad B2C no permite convertir la cuenta a B2B.");
            return;
        }
        
        const termsAceptados = document.getElementById("chkTerminosCliente")?.checked;
        if (!termsAceptados) {
            alert("⚖️ Obligatorio: Debes marcar la casilla aceptando los Términos y Condiciones de Uso para Clientes."); 
            return;
        }

        const requiereIdentidadB2C = !codigoB2B;
        if (requiereIdentidadB2C && !$("chkBiometriaCliente")?.checked) {
            alert("🔐 Debes autorizar la verificación de identidad para crear una cuenta B2C.");
            return;
        }
        if (requiereIdentidadB2C && (!identityCaptureState.complete || identityCaptureState.target !== "cliente" ||
            !archivoFotoPerfil || !archivoINE || !archivoINEReverso || !archivoSelfieIzquierda || !archivoSelfieDerecha)) {
            alert("🪪 Completa INE frente/reverso y la prueba de vida antes de crear tu cuenta.");
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
                resumeExistingCustomer ? "__SESSION_REUSE_ONLY__" : password, 
                rolFinal, 
                nombre, 
                subtipoFinal, 
                null, // empresaId
                esAdminB2B ? {
                    clave: codigoB2B
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

            if (!esAdminB2B) {
                const uid = usuarioAuth.uid;
                const userRef = doc(db, "users", uid);
                const confirmarCampo = patch => async () => {
                    await setDoc(userRef, patch, { merge: true });
                };

                btnRegistroCliente.innerHTML = '<i class="fas fa-cloud-upload-alt animate-bounce"></i> Protegiendo identidad…';
                await subirDocumentoExpedienteRecuperable(uid, "foto_perfil", archivoFotoPerfil,
                    async (url) => confirmarCampo({ foto_perfil: url })(),
                    { kycState: "identidad_pendiente" });
                await subirDocumentoExpedienteRecuperable(uid, "ine", archivoINE,
                    async (url) => confirmarCampo({ documentos: { ine: url } })(),
                    { kycState: "identidad_pendiente" });
                await subirDocumentoExpedienteRecuperable(uid, "ine_reverso", archivoINEReverso,
                    async (url) => confirmarCampo({ documentos: { ine_reverso: url } })(),
                    { kycState: "identidad_pendiente" });
                await subirDocumentoExpedienteRecuperable(uid, "selfie_liveness_left", archivoSelfieIzquierda,
                    async (url) => confirmarCampo({ documentos: { selfie_liveness_left: url } })(),
                    { kycState: "identidad_pendiente" });
                await subirDocumentoExpedienteRecuperable(uid, "selfie_liveness_right", archivoSelfieDerecha,
                    async (url) => confirmarCampo({ documentos: { selfie_liveness_right: url } })(),
                    { kycState: "identidad_pendiente" });

                await setDoc(userRef, {
                    "kyc.identity_capture_status": "captured_pending_verification",
                    "kyc.identity_capture_completed_at": serverTimestamp(),
                    actualizadoEn: serverTimestamp()
                }, { merge: true });

                btnRegistroCliente.innerHTML = '<i class="fas fa-fingerprint fa-pulse"></i> Verificando identidad…';
                const identityResult = await verificarIdentidadB2C();
                if (identityResult?.status !== "verified") {
                    const duplicate = identityResult?.status === "duplicate_suspected";
                    alert(duplicate
                        ? "🛡️ Tu identidad requiere revisión porque existe una coincidencia con otro expediente. La cuenta no puede operar hasta que Administración la revise."
                        : "🛡️ La verificación automática requiere revisión humana. Tus datos quedaron guardados y la cuenta seguirá bloqueada hasta validación.");
                    window.location.href = "cliente.html";
                    return;
                }
            }

            alert(`✅ ¡Registro Exitoso, ${nombre}!\n\nBienvenido a GestiaPremium. Tu perfil de ${esAdminB2B ? 'Administrador B2B' : 'Cliente'} ha sido creado.`);
            
            // Redirección Inteligente: B2B → panel-b2b-admin.html | B2C → cliente.html
            const rutaDestino = esAdminB2B ? "panel-b2b-admin.html" : "cliente.html";
            window.location.href = rutaDestino;

        } catch (error) {
            console.error("❌ Error Crítico en Registro Cliente:", error);
            
            if (usuarioAuth) {
                alert("⚠️ Tu cuenta permanece registrada. Reanuda la identidad en esta misma sesión; no crees otra cuenta.");
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

const clabeTecnicoInput = $("clabeTecnico");
const bancoTecnicoInput = $("bancoTecnico");
const clabeBankCard = $("clabeBankCard");
const clabeBankIcon = $("clabeBankIcon");
const clabeBankName = $("clabeBankName");
const clabeTecnicoStatus = $("clabeTecnicoStatus");
const clabeBankCheck = $("clabeBankCheck");
const clabeTitularTecnico = $("clabeTitularTecnico");

function paintClabeBankState(state, info = {}) {
    if (!clabeBankCard || !clabeBankIcon || !clabeBankName || !clabeTecnicoStatus || !clabeBankCheck) return;
    const baseCard = "mt-3 rounded-2xl border bg-black/30 p-4 transition-all";
    const baseIcon = "w-10 h-10 rounded-xl flex items-center justify-center";
    const reset = () => {
        clabeBankCard.className = `${baseCard} border-zinc-800`;
        clabeBankIcon.className = `${baseIcon} bg-zinc-800 text-zinc-500`;
        clabeBankCheck.className = "fas fa-shield-halved text-zinc-600";
        clabeBankName.className = "font-black text-sm text-zinc-400";
        clabeTecnicoStatus.className = "text-[10px] text-zinc-500 mt-0.5";
    };
    reset();

    if (state === "empty") {
        clabeBankName.textContent = "Banco pendiente de detectar";
        clabeTecnicoStatus.textContent = "Ingresa los 18 dígitos de tu CLABE.";
        return;
    }
    if (state === "unknown") {
        clabeBankCard.className = `${baseCard} border-red-500/40`;
        clabeBankIcon.className = `${baseIcon} bg-red-500/10 text-red-400`;
        clabeBankCheck.className = "fas fa-circle-xmark text-red-400";
        clabeBankName.className = "font-black text-sm text-red-300";
        clabeTecnicoStatus.className = "text-[10px] text-red-400 mt-0.5";
        clabeBankName.textContent = "Institución no reconocida";
        clabeTecnicoStatus.textContent = "Revisa los primeros 3 dígitos de la CLABE.";
        return;
    }
    if (state === "partial") {
        clabeBankCard.className = `${baseCard} border-blue-500/30`;
        clabeBankIcon.className = `${baseIcon} bg-blue-500/10 text-blue-400`;
        clabeBankCheck.className = "fas fa-building-shield text-blue-400";
        clabeBankName.className = "font-black text-sm text-white";
        clabeTecnicoStatus.className = "text-[10px] text-blue-300 mt-0.5";
        clabeBankName.textContent = info.institutionName || "Institución detectada";
        clabeTecnicoStatus.textContent = `Banco detectado · faltan ${Math.max(0, 18 - (info.digits?.length || 0))} dígitos`;
        return;
    }
    if (state === "checksum_error") {
        clabeBankCard.className = `${baseCard} border-red-500/40`;
        clabeBankIcon.className = `${baseIcon} bg-red-500/10 text-red-400`;
        clabeBankCheck.className = "fas fa-triangle-exclamation text-red-400";
        clabeBankName.className = "font-black text-sm text-white";
        clabeTecnicoStatus.className = "text-[10px] text-red-400 mt-0.5";
        clabeBankName.textContent = info.institutionName || "Banco detectado";
        clabeTecnicoStatus.textContent = "CLABE inválida · el dígito verificador no coincide.";
        return;
    }
    if (state === "valid") {
        clabeBankCard.className = `${baseCard} border-emerald-500/40 shadow-[0_0_28px_rgba(16,185,129,0.08)]`;
        clabeBankIcon.className = `${baseIcon} bg-emerald-500/10 text-emerald-400`;
        clabeBankCheck.className = "fas fa-circle-check text-emerald-400";
        clabeBankName.className = "font-black text-sm text-white";
        clabeTecnicoStatus.className = "text-[10px] text-emerald-400 mt-0.5";
        clabeBankName.textContent = info.institutionName;
        clabeTecnicoStatus.textContent = `CLABE válida · institución ${info.institutionCode}`;
    }
}

function refreshTechnicianClabe() {
    if (!clabeTecnicoInput) return null;
    const digits = String(clabeTecnicoInput.value || "").replace(/\D/g, "").slice(0, 18);
    if (clabeTecnicoInput.value !== digits) clabeTecnicoInput.value = digits;
    const info = inspectMexicanClabe(digits);
    if (bancoTecnicoInput) bancoTecnicoInput.value = info.institutionName || "";

    if (!digits) paintClabeBankState("empty", info);
    else if (digits.length >= 3 && !info.institutionName) paintClabeBankState("unknown", info);
    else if (digits.length < 18) paintClabeBankState("partial", info);
    else if (!info.checksumValid) paintClabeBankState("checksum_error", info);
    else if (info.valid) paintClabeBankState("valid", info);
    else paintClabeBankState("unknown", info);
    return info;
}

clabeTecnicoInput?.addEventListener("input", refreshTechnicianClabe);
clabeTecnicoInput?.addEventListener("paste", () => queueMicrotask(refreshTechnicianClabe));
document.querySelector('#formRegistroTecnico [name="nombre"]')?.addEventListener("input", event => {
    if (clabeTitularTecnico) clabeTitularTecnico.textContent = event.target.value.trim() || "se tomará de tu identidad";
});
refreshTechnicianClabe();


const IDENTITY_CAPTURE_VERSION = "b2c-bank-identity-v1";
let archivoFotoPerfil = null;
let archivoINE = null;
let archivoINEReverso = null;
let archivoSelfieIzquierda = null;
let archivoSelfieDerecha = null;
let archivoCSF = null;
let archivoLicencia = null;
let archivosCertificados = [];

const identitySteps = [
    { key: "ine_front", title: "Captura tu INE por el frente", hint: "Coloca la credencial completa dentro del marco y evita reflejos.", tip: "Usa la cámara trasera. Las cuatro esquinas deben quedar visibles.", facing: "environment", frame: "document", fileName: "ine-frente.jpg" },
    { key: "ine_back", title: "Ahora captura el reverso", hint: "Voltea tu INE y vuelve a encuadrarla completa.", tip: "Evita sombras sobre códigos y texto. Mantén el teléfono paralelo a la credencial.", facing: "environment", frame: "document", fileName: "ine-reverso.jpg" },
    { key: "selfie_front", title: "Selfie de verificación", hint: "Mira de frente. Mantén el teléfono a una distancia cómoda: deben verse tu cabeza completa y parte de los hombros.", tip: "No pegues el teléfono a la cara. Retira gorra, lentes oscuros o cubrebocas y usa luz uniforme de frente.", facing: "user", frame: "face", fileName: "selfie-frente.jpg" },
    { key: "selfie_left", title: "Prueba de vida · gira a tu izquierda", hint: "Conserva la misma distancia y gira suavemente la cabeza hacia tu izquierda.", tip: "Mantén hombros de frente. No acerques el teléfono para llenar el óvalo.", facing: "user", frame: "face", fileName: "selfie-izquierda.jpg" },
    { key: "selfie_right", title: "Prueba de vida · gira a tu derecha", hint: "Conserva la misma distancia y gira suavemente la cabeza hacia tu derecha.", tip: "Último paso. Mantén buena iluminación, cabeza completa y parte de los hombros visibles.", facing: "user", frame: "face", fileName: "selfie-derecha.jpg" }
];

const identityCaptureState = {
    stepIndex: 0,
    stream: null,
    complete: false,
    files: {},
    target: null,
    retakeOnlyKey: null,
    previewUrls: {}
};

function stopIdentityCamera() {
    if (identityCaptureState.stream) {
        for (const track of identityCaptureState.stream.getTracks()) track.stop();
        identityCaptureState.stream = null;
    }
    const video = $("identityVideo");
    if (video) video.srcObject = null;
}

function renderIdentityProgress() {
    identitySteps.forEach((step, index) => {
        const card = $("identityStep" + index);
        const bar = $("identityBar" + index);
        if (card) {
            card.classList.toggle("is-done", Boolean(identityCaptureState.files[step.key]));
            card.classList.toggle("is-active", !identityCaptureState.complete && index === identityCaptureState.stepIndex);
        }
        if (bar) {
            const done = Boolean(identityCaptureState.files[step.key]);
            const active = !identityCaptureState.complete && index === identityCaptureState.stepIndex;
            bar.className = "h-1.5 rounded-full " + (done || active ? "bg-emerald-500" : "bg-zinc-800");
        }
    });
}

async function openIdentityCameraForStep() {
    const step = identitySteps[identityCaptureState.stepIndex];
    if (!step) return;
    const video = $("identityVideo");
    const captureButton = $("btnCapturarIdentidad");
    const cameraStatus = $("identityCameraStatus");
    const guide = $("identityGuide");
    const stage = video?.closest(".identity-camera-stage");

    stopIdentityCamera();
    captureButton.disabled = true;
    $("identityModalEyebrow").textContent = `Identidad ${identityCaptureState.stepIndex + 1} de ${identitySteps.length}`;
    $("identityModalTitle").textContent = step.title;
    $("identityModalHint").textContent = step.hint;
    $("identityTip").textContent = step.tip;
    guide.className = `identity-frame ${step.frame}`;
    if (stage) stage.dataset.frame = step.frame;
    video.dataset.frame = step.frame;
    video.dataset.facing = step.facing;
    cameraStatus.innerHTML = '<i class="fas fa-circle-notch fa-spin text-emerald-400 mr-2"></i>Activando cámara…';
    renderIdentityProgress();

    if (!navigator.mediaDevices?.getUserMedia) {
        cameraStatus.innerHTML = '<i class="fas fa-triangle-exclamation text-amber-400 mr-2"></i>Cámara no disponible';
        alert("Este dispositivo no permite captura segura con cámara. Continúa el registro desde un teléfono o equipo con cámara.");
        return;
    }

    try {
        const documentCapture = step.frame === "document";
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: step.facing },
                width: { ideal: documentCapture ? 1920 : 1280 },
                height: { ideal: documentCapture ? 1080 : 960 },
                aspectRatio: { ideal: documentCapture ? 16 / 9 : 4 / 3 }
            },
            audio: false
        });
        identityCaptureState.stream = stream;
        video.srcObject = stream;
        await video.play();
        cameraStatus.innerHTML = '<i class="fas fa-circle text-emerald-400 mr-2 text-[8px]"></i>Cámara lista';
        captureButton.disabled = false;
    } catch (error) {
        console.error("[B2C_IDENTITY_CAMERA]", error);
        cameraStatus.innerHTML = '<i class="fas fa-triangle-exclamation text-amber-400 mr-2"></i>Permiso de cámara requerido';
        alert("Necesitamos permiso de cámara para capturar INE y biometría de forma segura.");
    }
}

function mapIdentityFile(stepKey, file) {
    const previousPreview = identityCaptureState.previewUrls[stepKey];
    if (previousPreview) URL.revokeObjectURL(previousPreview);
    identityCaptureState.previewUrls[stepKey] = null;
    identityCaptureState.files[stepKey] = file;
    if (stepKey === "ine_front") archivoINE = file;
    if (stepKey === "ine_back") archivoINEReverso = file;
    if (stepKey === "selfie_front") archivoFotoPerfil = file;
    if (stepKey === "selfie_left") archivoSelfieIzquierda = file;
    if (stepKey === "selfie_right") archivoSelfieDerecha = file;
}

function clearIdentityFile(stepKey) {
    const preview = identityCaptureState.previewUrls[stepKey];
    if (preview) URL.revokeObjectURL(preview);
    identityCaptureState.previewUrls[stepKey] = null;
    delete identityCaptureState.files[stepKey];
    if (stepKey === "ine_front") archivoINE = null;
    if (stepKey === "ine_back") archivoINEReverso = null;
    if (stepKey === "selfie_front") archivoFotoPerfil = null;
    if (stepKey === "selfie_left") archivoSelfieIzquierda = null;
    if (stepKey === "selfie_right") archivoSelfieDerecha = null;
    identityCaptureState.complete = false;
}

function identityPreviewUrl(stepKey) {
    const file = identityCaptureState.files[stepKey];
    if (!file) return "";
    if (!identityCaptureState.previewUrls[stepKey]) {
        identityCaptureState.previewUrls[stepKey] = URL.createObjectURL(file);
    }
    return identityCaptureState.previewUrls[stepKey];
}

function identityReviewLabel(step) {
    return ({
        ine_front: "INE · frente",
        ine_back: "INE · reverso",
        selfie_front: "Selfie frontal",
        selfie_left: "Giro izquierda",
        selfie_right: "Giro derecha"
    })[step.key] || step.title;
}

function showIdentityCaptureView() {
    $("identityCaptureView")?.classList.remove("hidden");
    $("identityReviewView")?.classList.add("hidden");
}

function renderIdentityReview() {
    const grid = $("identityReviewGrid");
    const confirm = $("btnConfirmarIdentidad");
    const status = $("identityReviewStatus");
    if (!grid || !confirm) return;

    const allReady = identitySteps.every(step => Boolean(identityCaptureState.files[step.key]));
    grid.innerHTML = identitySteps.map(step => {
        const url = identityPreviewUrl(step.key);
        const ready = Boolean(url);
        return `
            <article class="rounded-2xl border ${ready ? "border-emerald-500/30" : "border-amber-500/35"} bg-zinc-950/80 overflow-hidden">
                <div class="aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
                    ${ready
                        ? `<img src="${url}" alt="${identityReviewLabel(step)}" class="w-full h-full object-contain">`
                        : '<div class="text-center text-zinc-600 text-xs px-3"><i class="fas fa-image text-2xl mb-2 block"></i>Sin captura</div>'}
                </div>
                <div class="p-3">
                    <p class="text-xs font-black text-white">${identityReviewLabel(step)}</p>
                    <p class="text-[9px] mt-1 ${ready ? "text-emerald-400" : "text-amber-300"}">${ready ? "Lista para revisión" : "Debes volver a capturarla"}</p>
                    <div class="mt-3 grid ${ready ? "grid-cols-2" : "grid-cols-1"} gap-2">
                        <button type="button" data-identity-retake="${step.key}" class="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-[10px] font-black text-emerald-200">
                            <i class="fas fa-camera-rotate mr-1"></i> ${ready ? "REPETIR" : "CAPTURAR"}
                        </button>
                        ${ready ? `<button type="button" data-identity-remove="${step.key}" class="rounded-xl border border-red-500/25 bg-red-500/10 px-2 py-2 text-[10px] font-black text-red-200">
                            <i class="fas fa-trash-can mr-1"></i> QUITAR
                        </button>` : ""}
                    </div>
                </div>
            </article>`;
    }).join("");

    grid.querySelectorAll("[data-identity-retake]").forEach(button => {
        button.addEventListener("click", async () => {
            const key = button.dataset.identityRetake;
            const index = identitySteps.findIndex(step => step.key === key);
            if (index < 0) return;
            identityCaptureState.retakeOnlyKey = key;
            identityCaptureState.stepIndex = index;
            identityCaptureState.complete = false;
            showIdentityCaptureView();
            await openIdentityCameraForStep();
        });
    });

    grid.querySelectorAll("[data-identity-remove]").forEach(button => {
        button.addEventListener("click", () => {
            clearIdentityFile(button.dataset.identityRemove);
            renderIdentityReview();
            renderIdentityProgress();
        });
    });

    confirm.disabled = !allReady;
    if (status) {
        status.textContent = allReady
            ? "Si todo se ve bien, confirma estas capturas. Todavía no se han enviado a validación."
            : "Falta al menos una evidencia. Captúrala antes de continuar.";
    }
}

function showIdentityReview() {
    stopIdentityCamera();
    $("identityCaptureView")?.classList.add("hidden");
    $("identityReviewView")?.classList.remove("hidden");
    $("identityModalEyebrow").textContent = "Revisión previa";
    $("identityModalTitle").textContent = "Revisa tu identidad";
    $("identityModalHint").textContent = "Puedes repetir o quitar cualquier foto antes de continuar.";
    renderIdentityReview();
}

async function captureIdentityFrame() {
    const step = identitySteps[identityCaptureState.stepIndex];
    const video = $("identityVideo");
    const canvas = $("identityCanvas");
    if (!step || !video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        alert("La cámara todavía no está lista. Espera un momento e intenta de nuevo.");
        return;
    }

    const width = Math.min(video.videoWidth, 1600);
    const scale = width / video.videoWidth;
    const height = Math.round(video.videoHeight * scale);
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob || blob.size < 16 * 1024) {
        alert("La captura salió incompleta. Mantén la cámara estable y repite.");
        return;
    }

    mapIdentityFile(step.key, new File([blob], step.fileName, { type: "image/jpeg", lastModified: Date.now() }));
    identityCaptureState.stepIndex += 1;
    renderIdentityProgress();

    if (identityCaptureState.retakeOnlyKey) {
        identityCaptureState.retakeOnlyKey = null;
        identityCaptureState.complete = identitySteps.every(item => Boolean(identityCaptureState.files[item.key]));
        stopIdentityCamera();
        showIdentityReview();
        renderIdentityProgress();
        return;
    }

    if (identityCaptureState.stepIndex >= identitySteps.length) {
        identityCaptureState.complete = identitySteps.every(item => Boolean(identityCaptureState.files[item.key]));
        stopIdentityCamera();
        showIdentityReview();
        renderIdentityProgress();
        return;
    }

    await openIdentityCameraForStep();
}

async function startIdentityFlow(target) {
    if (!["cliente", "tecnico"].includes(target)) throw new Error("IDENTITY_CAPTURE_TARGET_INVALID");
    const consent = $(target === "cliente" ? "chkBiometriaCliente" : "chkBiometriaTecnico");
    if (!consent?.checked) {
        alert("Antes de abrir la cámara, acepta la autorización de captura de identidad.");
        return;
    }
    identityCaptureState.target = target;
    identityCaptureState.stepIndex = 0;
    identityCaptureState.complete = false;
    identityCaptureState.retakeOnlyKey = null;
    for (const url of Object.values(identityCaptureState.previewUrls || {})) {
        if (url) URL.revokeObjectURL(url);
    }
    identityCaptureState.previewUrls = {};
    identityCaptureState.files = {};
    archivoFotoPerfil = null;
    archivoINE = null;
    archivoINEReverso = null;
    archivoSelfieIzquierda = null;
    archivoSelfieDerecha = null;
    $("modalIdentidadTecnico").classList.remove("hidden");
    showIdentityCaptureView();
    document.documentElement.classList.add("identity-modal-open");
    document.body.classList.add("identity-modal-open");
    await openIdentityCameraForStep();
}

function closeIdentityModal() {
    $("modalIdentidadTecnico")?.classList.add("hidden");
    document.documentElement.classList.remove("identity-modal-open");
    document.body.classList.remove("identity-modal-open");
}

function cancelIdentityFlow() {
    stopIdentityCamera();
    closeIdentityModal();
}

$("btnIniciarIdentidad")?.addEventListener("click", () => startIdentityFlow("tecnico"));
$("btnIniciarIdentidadCliente")?.addEventListener("click", () => startIdentityFlow("cliente"));
$("btnCapturarIdentidad")?.addEventListener("click", captureIdentityFrame);
$("btnCancelarIdentidad")?.addEventListener("click", cancelIdentityFlow);
$("btnConfirmarIdentidad")?.addEventListener("click", () => {
    const ready = identitySteps.every(step => Boolean(identityCaptureState.files[step.key]));
    if (!ready) {
        renderIdentityReview();
        return;
    }
    identityCaptureState.complete = true;
    closeIdentityModal();
    const isCustomerIdentity = identityCaptureState.target === "cliente";
    const summary = $(isCustomerIdentity ? "identitySummaryCliente" : "identitySummary");
    const restartButton = $(isCustomerIdentity ? "btnIniciarIdentidadCliente" : "btnIniciarIdentidad");
    if (summary) {
        summary.innerHTML = '<i class="fas fa-circle-check text-emerald-400 mr-2"></i><strong class="text-emerald-300">Capturas revisadas.</strong> Listas para validación segura.';
    }
    if (restartButton) restartButton.innerHTML = '<i class="fas fa-images mr-2"></i> REVISAR / REPETIR CAPTURAS';
    renderIdentityProgress();
});
window.addEventListener("beforeunload", stopIdentityCamera);

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
        
        const clabeInspection = inspectMexicanClabe(form.querySelector('[name="clabe"]')?.value);
        const clabe = clabeInspection.digits;
        const banco = clabeInspection.institutionName || "";
        
        const tipoVehiculo = escaparHTML(form.querySelector('[name="tipoVehiculo"]')?.value) || "auto"; 
        const placas = escaparHTML(form.querySelector('[name="placas"]')?.value.trim().toUpperCase());

        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Faltan campos obligatorios básicos."); return;
        }

        if (!validarPassword(password)) {
            alert("🔒 SEGURIDAD: La contraseña debe tener mínimo 8 caracteres, incluir al menos 1 mayúscula y 1 número."); return;
        }

        if (!clabeInspection.formatValid) {
            alert("🏦 La CLABE debe contener exactamente 18 dígitos."); return;
        }
        if (!clabeInspection.institutionName) {
            alert("🏦 No reconocimos la institución de esta CLABE. Revisa sus primeros 3 dígitos."); return;
        }
        if (!clabeInspection.checksumValid) {
            alert("🏦 La CLABE no supera la validación de dígito verificador. Revísala antes de continuar."); return;
        }
        if (!clabeInspection.valid || !banco) {
            alert("🏦 No pudimos validar esta CLABE con el catálogo bancario."); return;
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

        if (!$("chkBiometriaTecnico")?.checked) {
            alert("🔐 Debes autorizar la captura de identidad para continuar."); return;
        }
        if (!identityCaptureState.complete || identityCaptureState.target !== "tecnico" || !archivoFotoPerfil || !archivoINE || !archivoINEReverso || !archivoSelfieIzquierda || !archivoSelfieDerecha) {
            alert("🪪 Completa la verificación guiada: INE frente/reverso y prueba de vida facial."); return;
        }
        if (!archivoCSF) {
            alert("⚖️ Cumplimiento Legal: Es obligatorio subir tu CSF."); return;
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
                    banco,
                    clabe,
                    titular: nombre,
                    banking_version: MEXICAN_CLABE_VERSION,
                    institucion_clave: clabeInspection.institutionCode,
                    institucion_key: clabeInspection.institutionKey,
                    institucion_nombre: clabeInspection.institutionName,
                    catalog_source: clabeInspection.catalogSource,
                    clabe_checksum_valid: true,
                    clabe_validated_at: serverTimestamp()
                },
                nivel: "BRONCE",
                reputacion: 5.0,
                servicios_completados: 0,
                estado: kycState,
                status: TECHNICIAN_KYC_STATES.DOCUMENTS_PENDING,
                disponible: false,
                kyc: {
                    estado: kycState,
                    aprobado: false,
                    ultimo_error: null,
                    identity_required: true,
                    identity_verified: false,
                    identity_version: IDENTITY_CAPTURE_VERSION,
                    identity_capture_status: "captured_pending_review"
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
            await subirDocumentoExpedienteRecuperable(uid, "ine_reverso", archivoINEReverso,
                async (url) => confirmarCampo({ documentos: { ine_reverso: url } })());
            await subirDocumentoExpedienteRecuperable(uid, "selfie_liveness_left", archivoSelfieIzquierda,
                async (url) => confirmarCampo({ documentos: { selfie_liveness_left: url } })());
            await subirDocumentoExpedienteRecuperable(uid, "selfie_liveness_right", archivoSelfieDerecha,
                async (url) => confirmarCampo({ documentos: { selfie_liveness_right: url } })());
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

            await setDoc(userRef, {
                "kyc.identity_capture_status": "captured_pending_verification",
                "kyc.identity_capture_completed_at": serverTimestamp(),
                actualizadoEn: serverTimestamp()
            }, { merge: true });

            btnRegistroTecnico.innerHTML = '<i class="fas fa-fingerprint fa-pulse"></i> Verificando identidad…';
            const identityResult = await verificarIdentidadB2C();
            if (identityResult?.status !== "verified") {
                const duplicate = identityResult?.status === "duplicate_suspected";
                alert(duplicate
                    ? "🛡️ Detectamos una posible identidad duplicada. El expediente quedó bloqueado para revisión administrativa."
                    : "🛡️ La biometría requiere revisión humana. El expediente quedó guardado pero no puede operar todavía.");
                window.location.href = "tecnico.html";
                return;
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
                "kyc.identity_required": true,
                "kyc.identity_version": IDENTITY_CAPTURE_VERSION,
                "kyc.identity_capture_status": "machine_verified_pending_admin",
                "kyc.identity_capture_completed_at": serverTimestamp(),
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
                window.isRegisteringLocal = true;
                await signOut(auth);
                alert("🛡️ Las altas nuevas B2C requieren INE y biometría en vivo. Regístrate con el formulario seguro; después podrás vincular Google desde tu cuenta.");
                window.location.href = "registro.html";
                return;
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
