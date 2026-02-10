/**
 * ======================================================
 * FIXGO 2026 - SISTEMA DE REGISTRO Y LOGIN UNIVERSAL
 * Archivo: app-registro.js
 * Versión: 2.2 (Corrección: Sincronización con Admin Panel)
 * Autor: FixGo Dev Team
 * * DESCRIPCIÓN:
 * - Se asegura de escribir en la colección maestra 'users'.
 * - Agrega campos críticos: 'creadoEn', 'email', 'disponible'.
 * - Maneja redundancia de estado (estado/status) para compatibilidad.
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

            // 1. Crear usuario en Auth
            const usuarioAuth = await registrarUsuario(email, password, "cliente", nombre);

            // 2. CORRECCIÓN CRÍTICA: Guardar en colección 'users' para el Admin
            // Usamos merge: true para no sobrescribir si registrarUsuario ya creó algo
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email, // Vital para que no salga "undefined"
                telefono: telefono,
                rol: "cliente",
                
                // Campos de Fecha para el Admin (Ordenamiento)
                creadoEn: serverTimestamp(), // EL ADMIN USA ESTO PARA ORDENAR
                fechaRegistro: serverTimestamp(), // Legacy
                
                estado: "activo", // Clientes nacen activos
                status: "activo",
                
                pedidosTotales: 0,
                ultimaConexion: serverTimestamp()
            }, { merge: true });

            console.log("✅ [Registro] Cliente creado exitosamente en DB (users).");
            alert(`¡Bienvenido, ${nombre}! Tu cuenta ha sido creada.`);
            
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

        try {
            // Feedback Visual
            const textoOriginal = btnRegistroTecnico.innerText;
            btnRegistroTecnico.innerText = "Procesando solicitud...";
            btnRegistroTecnico.disabled = true;
            btnRegistroTecnico.classList.add("opacity-50");

            console.log(`⏳ Iniciando alta de técnico: ${email}`);

            // 1. Crear usuario en Auth
            const usuarioAuth = await registrarUsuario(email, password, "tecnico", nombre);

            // 2. CORRECCIÓN CRÍTICA: Guardar en 'users' para que aparezca en el Admin Panel
            // Esto asegura que tenga 'creadoEn', 'email' y 'disponible'
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email, // Vital para el Admin
                telefono: telefono,
                rol: "tecnico",
                
                // Estados del Negocio (Compatibilidad Dual)
                estado: "pendiente", // Español (App)
                status: "pendiente", // Inglés (Legacy)
                
                disponible: false,   // Para el contador de ONLINE (Nace apagado)
                verificado: false,   // Documentos validados por Admin
                
                // Métricas Visuales
                nivel: "Bronce",
                calificacion: 5.0,
                vehiculo: "Por registrar",
                
                // Fechas (Vitales para ordenamiento)
                creadoEn: serverTimestamp(), // EL ADMIN ORDENA POR ESTO
                fechaRegistro: serverTimestamp(),
                ultimaConexion: serverTimestamp()
            }, { merge: true });

            console.log("✅ [Registro] Perfil de Técnico creado en 'users'. Estado: PENDIENTE.");
            alert("¡Solicitud Enviada!\n\nTu cuenta ha sido creada, pero requiere validación de documentos por un Administrador para recibir servicios.\n\nTe redirigiremos a tu panel.");
            
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
            
            // Actualizar última conexión en 'users'
            try {
                const userRef = doc(db, "users", userCredential.user.uid);
                await setDoc(userRef, { ultimaConexion: serverTimestamp() }, { merge: true });
            } catch (err) {
                console.warn("No se pudo actualizar last_seen", err);
            }

            // El observadorAuth en app-main.js se encargará de la redirección.
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
