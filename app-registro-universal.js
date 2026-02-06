/**
 * FIXGO - APP-REGISTRO-UNIVERSAL.JS
 * Versión: 2.0 (Code-Ready)
 * Alineado con Blueprint 2026
 */

import {
    auth,
    db,
    registrarUsuario,
    loginGoogle,
    doc,
    setDoc,
    serverTimestamp
} from "./firebase.js";

/* ==========================================
   ELEMENTOS DEL DOM
   ========================================== */
const formRegistro = document.getElementById("registroForm");
const rolInput = document.getElementById("rol");
const googleBtn = document.getElementById("googleBtn");

/* ==========================================
   UTILIDADES DE NAVEGACIÓN Y FLUJO
   ========================================== */

/**
 * Obtiene el rol desde la URL (?rol=tecnico) o desde un input oculto.
 * Prioriza la URL para links de invitación/marketing.
 */
function obtenerRol() {
    const params = new URLSearchParams(window.location.search);
    const rolUrl = params.get("rol");
    if (rolUrl) return rolUrl;
    return rolInput ? rolInput.value : "cliente";
}

/**
 * Redirección inteligente post-registro según el Blueprint.
 */
function redirigirPorRol(rol) {
    console.log(`Redirigiendo usuario con rol: ${rol}`);
    switch (rol) {
        case "cliente":
            window.location.href = "index.html"; // Al mapa principal
            break;
        case "tecnico":
            window.location.href = "tecnico.html"; // Al dashboard de onboarding técnico
            break;
        case "admin":
            window.location.href = "admin.html"; // Torre de control
            break;
        default:
            window.location.href = "index.html";
    }
}

/* ==========================================
   LÓGICA DE REGISTRO POR EMAIL / PASSWORD
   ========================================== */

if (formRegistro) {
    formRegistro.addEventListener("submit", async (e) => {
        e.preventDefault();

        const rol = obtenerRol();
        const nombre = formRegistro.nombre ? formRegistro.nombre.value.trim() : "Usuario FixGo";
        const email = formRegistro.email.value.trim();
        const password = formRegistro.password.value.trim();

        // Validaciones básicas de seguridad
        if (!email || !password) {
            alert("⚠️ El email y la contraseña son obligatorios.");
            return;
        }

        if (password.length < 6) {
            alert("⚠️ La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        try {
            // 1. Crear Usuario en Firebase Auth y Colección 'usuarios' (Core)
            // Ya incluye nivel 'Bronce' si es técnico gracias a nuestro firebase.js
            const user = await registrarUsuario(email, password, rol, {
                nombre: nombre,
                telefono: formRegistro.telefono ? formRegistro.telefono.value.trim() : ""
            });

            // 2. Crear Perfil Específico según Vertical (Blueprint Punto 4)
            if (rol === "tecnico") {
                await setDoc(doc(db, "tecnicos", user.uid), {
                    uid: user.uid,
                    nombre: nombre,
                    email: email,
                    nivel: "Bronce",
                    serviciosCompletados: 0,
                    disponible: false,
                    // Punto 4.B: Validación Documental Bloqueante
                    documentacion: {
                        ine: { estado: "pendiente", url: "" },
                        csf: { estado: "pendiente", url: "" },
                        vehiculo: { estado: "pendiente", url: "" },
                        fotoPerfil: { estado: "pendiente", url: "" }
                    },
                    wallet: {
                        disponible: 0,
                        pendiente: 0,
                        congelado: 0
                    },
                    actualizadoEn: serverTimestamp()
                });
            }

            if (rol === "cliente") {
                await setDoc(doc(db, "clientes", user.uid), {
                    uid: user.uid,
                    nombre: nombre,
                    email: email,
                    metodoPago: {
                        registrado: false,
                        stripeId: ""
                    },
                    tipoPersona: "Fisica", // O 'Moral' según CSF
                    historialServicios: [],
                    creadoEn: serverTimestamp()
                });
            }

            alert("✅ Registro exitoso en FixGo.");
            redirigirPorRol(rol);

        } catch (error) {
            console.error("Error en flujo de registro:", error);
            alert(`❌ Error: ${error.message}`);
        }
    });
}

/* ==========================================
   LÓGICA DE REGISTRO / LOGIN CON GOOGLE
   ========================================== */

if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
        const rol = obtenerRol();

        try {
            // 1. Autenticación con Google (Core)
            const user = await loginGoogle(rol);

            // 2. Asegurar que existan los documentos en las subcolecciones
            // Usamos { merge: true } para no borrar datos si ya existía
            if (rol === "cliente") {
                await setDoc(doc(db, "clientes", user.uid), {
                    uid: user.uid,
                    nombre: user.displayName || "Usuario Google",
                    email: user.email,
                    actualizadoEn: serverTimestamp()
                }, { merge: true });
            }

            if (rol === "tecnico") {
                await setDoc(doc(db, "tecnicos", user.uid), {
                    uid: user.uid,
                    nombre: user.displayName || "Técnico Google",
                    email: user.email,
                    // Solo inicializamos si es nuevo
                    creadoEn: serverTimestamp() 
                }, { merge: true });
            }

            alert("✅ Ingreso con Google exitoso.");
            redirigirPorRol(rol);

        } catch (error) {
            console.error("Error Google Auth:", error);
            alert("❌ Hubo un problema al conectar con Google.");
        }
    });
}
