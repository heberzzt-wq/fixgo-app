/**
 * ======================================================
 * GESTIAPREMIUM 2026 - SISTEMA DE REGISTRO Y LOGIN UNIVERSAL
 * Archivo: app-registro.js
 * Versión: 6.7 (STRIPE EXCISED + CANVAS COMPRESSION + RULES COMPLIANT)
 * Autor: Heber (CEO & Lead Architect)
 * REGLAS DE ARQUITECTURA: NO COMPACTAR. NO FRAGMENTAR.
 * ======================================================
 */
console.log(" 🚀 [app-registro.js] Inicializando sistema V6.7 (Clean Auth + Canvas Optimization)...");

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
    observarAuth 
} from "./firebase.js";

import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    deleteUser
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const $ = (id) => document.getElementById(id);

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
// 📸 MOTOR CLOUD STORAGE (COMPRESIÓN FRONTEND + UPLOAD)
// ======================================================
const comprimirImagen = (file) => {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.match(/image.*/)) { 
            resolve(file); 
            return; 
        }
        
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                
                if (width > height) { 
                    if (width > 1024) { height *= 1024 / width; width = 1024; } 
                } else { 
                    if (height > 1024) { width *= 1024 / height; height = 1024; } 
                }
                
                canvas.width = width; 
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                }, 'image/jpeg', 0.7);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
    });
};

const subirAStorage = async (file, path) => {
    if (!file) return null;
    const archivoOptimizado = await comprimirImagen(file); 
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, archivoOptimizado);
    return await getDownloadURL(storageRef);
};

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

if ($("linkTerminosCliente")) {
    $("linkTerminosCliente").addEventListener("click", (e) => {
        e.preventDefault();
        abrirModalLegal("modalTerminosCliente");
    });
}
if ($("btnCerrarTerminosCliente")) {
    $("btnCerrarTerminosCliente").addEventListener("click", () => cerrarModalLegal("modalTerminosCliente"));
}

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

        let usuarioAuth = null;
        const textoOriginal = btnRegistroCliente.innerHTML;

        try {
            window.isRegisteringLocal = true; 

            btnRegistroCliente.innerHTML = '<i class="fas fa-shield-alt"></i> Creando Perfil Seguro...';
            btnRegistroCliente.disabled = true;

            // firebase.js maneja la creación base (uid, email, rol)
            usuarioAuth = await registrarUsuario(email, password, "cliente", nombre);

            // Inyectamos el resto de datos sin disparar las reglas de seguridad
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                nombre: nombre,
                telefono: telefono,
                estado: "activo",
                status: "activo",
                metodo_pago_default: "efectivo" // PAGO EN EFECTIVO POR DEFECTO PARA EL FLUJO ACTUAL
            }, { merge: true });

            alert(`✅ ¡Registro Exitoso, ${nombre}!\n\nBienvenido a GestiaPremium. Ahora puedes solicitar tu servicio.`);
            
            window.location.href = "cliente.html";

        } catch (error) {
            console.error("❌ Error Crítico en Registro Cliente:", error);
            if (usuarioAuth && error.code !== 'auth/email-already-in-use') {
                await deleteUser(auth.currentUser).catch(e => console.error("Error borrando huérfano:", e));
                await db.collection('users').doc(usuarioAuth.uid).delete().catch(e => console.log("Limpieza de DB fallida:", e)); 
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

            usuarioAuth = await registrarUsuario(email, password, "tecnico", nombre);

            btnRegistroTecnico.innerHTML = '<i class="fas fa-cloud-upload-alt animate-bounce"></i> Subiendo Archivos a la Nube...';
            
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
                nombre: nombre,
                telefono: telefono,
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
                servicios_completados: 0
            }, { merge: true });

            alert(`✅ ¡Expediente Recibido!\n\nBienvenido, ${nombre}. Tu cuenta está en revisión. El Administrador validará tus documentos pronto.`);
            
            window.location.href = "tecnico.html";

        } catch (error) {
            console.error("❌ Error Crítico en Registro Técnico:", error);
            if (usuarioAuth && error.code !== 'auth/email-already-in-use') {
                await deleteUser(auth.currentUser).catch(e => console.error("Error limpieza Auth:", e));
                await db.collection('users').doc(usuarioAuth.uid).delete().catch(e => console.log("Limpieza DB:", e));
            }
            manejarErroresAuth(error);
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
                    perfilBase.metodo_pago_default = "efectivo"; // Flujo Efectivo
                }

                await setDoc(doc(db, "users", user.uid), perfilBase);
                
                if(esTecnico) {
                    alert("⚠️ Aviso: Tu perfil base fue creado con Google. Por seguridad y cumplimiento (KYC), deberás contactar al Administrador para subir tu INE, CSF, Licencia y Placas antes de ser aprobado.");
                } else {
                    alert("⚠️ Aviso: Tu perfil fue creado exitosamente. Ya puedes solicitar servicios.");
                }

                window.location.href = esTecnico ? "tecnico.html" : "cliente.html";
            } else {
                window.location.href = docSnap.data().rol === "tecnico" ? "tecnico.html" : "cliente.html";
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
    if (user && !window.isRegisteringLocal) {
        const path = window.location.pathname;
        if (path.includes("login.html") || path.includes("registro")) {
            setTimeout(() => {
                if (user.rol === "tecnico" || user.rol === "tecnico_gp") window.location.href = "tecnico.html";
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
