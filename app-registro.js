/**
 * ======================================================
 * FIXGO 2026 - SISTEMA DE REGISTRO Y LOGIN UNIVERSAL
 * Archivo: app-registro.js
 * Versión: 2.1 (Extendido & Robusto)
 * Autor: FixGo Dev Team
 * * DESCRIPCIÓN:
 * Este módulo maneja toda la lógica de autenticación y alta de usuarios.
 * - Detecta el formulario activo (Login, Registro Cliente, Registro Técnico).
 * - Valida campos obligatorios antes de enviar a Firebase.
 * - Crea el usuario en Authentication.
 * - Crea el documento maestro en Firestore (colección 'usuarios').
 * - Crea el documento específico (colección 'tecnicos' o 'clientes').
 * - Maneja errores comunes (correo duplicado, contraseña débil).
 * ======================================================
 */

console.log("🚀 [app-registro.js] Inicializando sistema de autenticación...");

// 1. IMPORTACIONES
import { 
    auth, 
    db, 
    registrarUsuario, // Función helper del firebase.js
    signInWithEmailAndPassword, 
    signOut,
    doc,
    setDoc,
    serverTimestamp,
    observarAuth
} from "./firebase.js";

import { 
    GoogleAuthProvider, 
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";


// 2. UTILIDADES DEL DOM
const $ = (id) => document.getElementById(id);


// ======================================================
// A. LÓGICA DE REGISTRO DE CLIENTES (USUARIOS FINAL)
// ======================================================
const btnRegistroCliente = $("btnRegistroCliente");

if (btnRegistroCliente) {
    console.log("👤 [Registro] Detectado formulario de Cliente.");
    
    btnRegistroCliente.addEventListener("click", async (e) => {
        e.preventDefault(); // Detener recarga del form
        
        // Referencia al formulario padre
        const form = document.getElementById("formRegistroCliente");
        if (!form) {
            console.error("❌ Error Crítico: No se encontró el formulario 'formRegistroCliente'");
            return;
        }

        // Extracción de datos (Soporte para name="" o id="")
        const nombre = form.querySelector('[name="nombre"]')?.value.trim();
        const email = form.querySelector('[name="email"]')?.value.trim();
        const password = form.querySelector('[name="password"]')?.value.trim();
        const telefono = form.querySelector('[name="telefono"]')?.value.trim();

        // Validaciones
        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Por favor, completa todos los campos obligatorios.");
            return;
        }

        if (password.length < 6) {
            alert("⚠️ La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        // Inicio del Proceso
        try {
            // Feedback Visual
            const textoOriginal = btnRegistroCliente.innerText;
            btnRegistroCliente.innerText = "Creando cuenta...";
            btnRegistroCliente.disabled = true;
            btnRegistroCliente.classList.add("opacity-50", "cursor-not-allowed");

            console.log(`⏳ Creando cliente: ${email}`);

            // 1. Crear usuario en Auth y Firestore Base (usando helper)
            // Esto crea el doc en 'usuarios/{uid}'
            const usuarioAuth = await registrarUsuario(email, password, "cliente", nombre);

            // 2. Crear documento específico en 'clientes/{uid}'
            // Esto es vital para el panel de cliente (historial, métodos de pago)
            await setDoc(doc(db, "clientes", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "cliente",
                fechaRegistro: serverTimestamp(),
                pedidosTotales: 0,
                ultimaConexion: serverTimestamp()
            }, { merge: true });

            console.log("✅ [Registro] Cliente creado exitosamente en DB.");
            alert(`¡Bienvenido, ${nombre}! Tu cuenta ha sido creada.`);
            
            // La redirección la maneja el observadorAuth automáticamente
            
        } catch (error) {
            console.error("❌ Error en Registro Cliente:", error);
            manejarErroresAuth(error);
            
            // Restaurar botón
            btnRegistroCliente.innerText = "Registrarme";
            btnRegistroCliente.disabled = false;
            btnRegistroCliente.classList.remove("opacity-50", "cursor-not-allowed");
        }
    });
}


// ======================================================
// B. LÓGICA DE REGISTRO DE TÉCNICOS (SOCIOS)
// ======================================================
const btnRegistroTecnico = $("btnRegistroTecnico");

if (btnRegistroTecnico) {
    console.log("🔧 [Registro] Detectado formulario de Técnico.");

    btnRegistroTecnico.addEventListener("click", async (e) => {
        e.preventDefault();

        const form = document.getElementById("formRegistroTecnico");
        if (!form) {
            console.error("❌ Error Crítico: No se encontró el formulario 'formRegistroTecnico'");
            return;
        }
        
        // Extracción de datos
        const nombre = form.querySelector('[name="nombre"]')?.value.trim();
        const email = form.querySelector('[name="email"]')?.value.trim();
        const password = form.querySelector('[name="password"]')?.value.trim();
        const telefono = form.querySelector('[name="telefono"]')?.value.trim();

        // Validaciones Técnicas
        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Faltan campos obligatorios. Necesitamos tus datos para validarte.");
            return;
        }

        // Aquí podríamos validar si subió archivos (INE/CSF), pero por ahora lo dejamos opcional 
        // para el registro inicial y obligatorio para la activación.

        try {
            // Feedback Visual
            const textoOriginal = btnRegistroTecnico.innerText;
            btnRegistroTecnico.innerText = "Procesando solicitud...";
            btnRegistroTecnico.disabled = true;
            btnRegistroTecnico.classList.add("opacity-50");

            console.log(`⏳ Iniciando alta de técnico: ${email}`);

            // 1. Crear usuario en Auth y Firestore Base
            // Nota: El rol es 'tecnico'.
            const usuarioAuth = await registrarUsuario(email, password, "tecnico", nombre);

            // 2. Crear Perfil Extendido en 'tecnicos/{uid}'
            // ESTE PASO ES CRÍTICO: Aquí definimos el estado 'pendiente'
            await setDoc(doc(db, "tecnicos", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "tecnico",
                
                // Estados del Negocio
                estado: "pendiente", // pendiente | activo | suspendido
                disponible: false,   // Switch ON/OFF
                verificado: false,   // Documentos validados por Admin
                
                // Métricas
                nivel: "Bronce",
                calificacion: 5.0,
                serviciosCompletados: 0,
                wallet: 0.00,
                
                // Fechas
                fechaRegistro: serverTimestamp(),
                ultimaConexion: serverTimestamp()
            }, { merge: true });

            console.log("✅ [Registro] Perfil de Técnico creado. Estado: PENDIENTE.");
            alert("¡Solicitud Enviada!\n\nTu cuenta ha sido creada, pero requiere validación de documentos por un Administrador para recibir servicios.\n\nTe redirigiremos a tu panel para que subas tu INE y CSF.");
            
            // Forzamos la redirección por seguridad visual
            window.location.href = "tecnico.html";

        } catch (error) {
            console.error("❌ Error en Registro Técnico:", error);
            manejarErroresAuth(error);

            // Restaurar botón
            btnRegistroTecnico.innerText = "Registrarme";
            btnRegistroTecnico.disabled = false;
            btnRegistroTecnico.classList.remove("opacity-50");
        }
    });
}


// ======================================================
// C. LÓGICA DE INICIO DE SESIÓN (LOGIN)
// ======================================================
const btnLogin = $("btnLogin");

if (btnLogin) {
    console.log("🔑 [Login] Detectado formulario de acceso.");

    btnLogin.addEventListener("click", async (e) => {
        e.preventDefault();

        const form = document.getElementById("formLogin");
        if(!form) return;

        const email = form.querySelector('[name="email"]')?.value.trim();
        const password = form.querySelector('[name="password"]')?.value.trim();

        if (!email || !password) {
            alert("⚠️ Ingresa tu correo y contraseña.");
            return;
        }

        try {
            btnLogin.innerText = "Verificando...";
            btnLogin.disabled = true;
            
            console.log(`⏳ Intentando login: ${email}`);
            
            // Autenticación Nativa de Firebase
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("✅ Login correcto en Firebase Auth:", userCredential.user.uid);
            
            // El observadorAuth en app-main.js se encargará de la redirección.
            // Solo mostramos un estado visual.
            btnLogin.innerText = "¡Éxito! Entrando...";

        } catch (error) {
            console.error("❌ Error en Login:", error);
            
            // Mensajes amigables
            let mensaje = "Error al iniciar sesión.";
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                mensaje = "❌ Correo o contraseña incorrectos.";
            } else if (error.code === 'auth/too-many-requests') {
                mensaje = "⚠️ Demasiados intentos fallidos. Espera unos minutos.";
            }

            alert(mensaje);
            
            btnLogin.innerText = "Entrar";
            btnLogin.disabled = false;
        }
    });
}


// ======================================================
// D. LOGIN CON GOOGLE (OPCIONAL)
// ======================================================
const btnGoogle = $("btnLoginGoogle");

if (btnGoogle) {
    btnGoogle.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            console.log("🌍 Iniciando popup de Google...");
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            // El observer maneja el resto
        } catch (error) {
            console.error("❌ Error Google:", error);
            alert("No se pudo iniciar sesión con Google.");
        }
    });
}


// ======================================================
// E. SISTEMA DE LOGOUT GLOBAL
// ======================================================
// Soporta múltiples IDs por si cambia el diseño
const btnLogout = $("logoutBtn") || $("btnLogout");

if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        if(confirm("¿Estás seguro que deseas cerrar sesión?")) {
            try {
                console.log("👋 Cerrando sesión...");
                await signOut(auth);
                window.location.href = "login.html";
            } catch (error) {
                console.error("Error al salir", error);
            }
        }
    });
}


// ======================================================
// F. OBSERVADOR DE ESTADO (ROUTER SIMPLE PARA LOGIN/REGISTRO)
// ======================================================
// Este observador solo se preocupa de sacar al usuario de las páginas públicas
// si ya tiene sesión. La lógica "pesada" de redirección de roles está en app-main.js
observarAuth((user) => {
    if (user) {
        const path = window.location.pathname;
        const esPaginaPublica = path.includes("login.html") || path.includes("registro");
        
        if (esPaginaPublica) {
            console.log("🔀 Usuario autenticado en página pública. Redirigiendo a su panel...");
            
            // Pequeño delay para asegurar que los datos del rol se cargaron
            setTimeout(() => {
                if (user.rol === "tecnico") window.location.href = "tecnico.html";
                else if (user.rol === "admin") window.location.href = "admin.html";
                else window.location.href = "cliente.html"; // Default
            }, 500);
        }
    }
});


// ======================================================
// G. MANEJO DE ERRORES COMUNES (HELPER)
// ======================================================
function manejarErroresAuth(error) {
    if (error.code === 'auth/email-already-in-use') {
        alert("⚠️ Este correo ya está registrado. Intenta iniciar sesión.");
    } else if (error.code === 'auth/weak-password') {
        alert("⚠️ La contraseña es muy débil. Usa al menos 6 caracteres.");
    } else if (error.code === 'auth/invalid-email') {
        alert("⚠️ El formato del correo no es válido.");
    } else {
        alert("Error: " + error.message);
    }
}
