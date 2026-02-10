/**
 * ======================================================
 * FIXGO 2026 - SISTEMA DE REGISTRO Y LOGIN UNIVERSAL
 * Archivo: app-registro.js
 * Versión: 3.0 (Google Interceptor + Admin Sync)
 * Autor: FixGo Dev Team
 * * DESCRIPCIÓN:
 * - Lógica de Registro Cliente/Técnico manual.
 * - Lógica de Login manual.
 * - NUEVO: Lógica de Google con selector de ROL (Técnico vs Cliente).
 * - Sincronización total con la colección 'users' para el Admin.
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
    getDoc, // <--- NECESARIO PARA VERIFICAR SI EXISTE
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
// A. LÓGICA DE REGISTRO DE CLIENTES (MANUAL)
// ======================================================
const btnRegistroCliente = $("btnRegistroCliente");

if (btnRegistroCliente) {
    console.log("👤 [Registro] Detectado formulario de Cliente.");
    
    btnRegistroCliente.addEventListener("click", async (e) => {
        e.preventDefault(); 
        
        const form = document.getElementById("formRegistroCliente");
        if (!form) return;

        const nombre = form.querySelector('[name="nombre"]')?.value.trim();
        const email = form.querySelector('[name="email"]')?.value.trim();
        const password = form.querySelector('[name="password"]')?.value.trim();
        const telefono = form.querySelector('[name="telefono"]')?.value.trim();

        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Por favor, completa todos los campos obligatorios.");
            return;
        }

        if (password.length < 6) {
            alert("⚠️ La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        try {
            const textoOriginal = btnRegistroCliente.innerText;
            btnRegistroCliente.innerText = "Creando cuenta...";
            btnRegistroCliente.disabled = true;
            btnRegistroCliente.classList.add("opacity-50");

            // 1. Crear usuario en Auth
            const usuarioAuth = await registrarUsuario(email, password, "cliente", nombre);

            // 2. Guardar en 'users' para el Admin
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "cliente",
                creadoEn: serverTimestamp(), // Vital para ordenamiento Admin
                estado: "activo",
                status: "activo", // Compatibilidad
                pedidosTotales: 0,
                ultimaConexion: serverTimestamp()
            }, { merge: true });

            console.log("✅ [Registro] Cliente creado exitosamente.");
            alert(`¡Bienvenido, ${nombre}! Tu cuenta ha sido creada.`);
            
        } catch (error) {
            console.error("❌ Error en Registro Cliente:", error);
            manejarErroresAuth(error);
            btnRegistroCliente.innerText = "Registrarme";
            btnRegistroCliente.disabled = false;
            btnRegistroCliente.classList.remove("opacity-50");
        }
    });
}


// ======================================================
// B. LÓGICA DE REGISTRO DE TÉCNICOS (MANUAL)
// ======================================================
const btnRegistroTecnico = $("btnRegistroTecnico");

if (btnRegistroTecnico) {
    console.log("🔧 [Registro] Detectado formulario de Técnico.");

    btnRegistroTecnico.addEventListener("click", async (e) => {
        e.preventDefault();

        const form = document.getElementById("formRegistroTecnico");
        if (!form) return;
        
        const nombre = form.querySelector('[name="nombre"]')?.value.trim();
        const email = form.querySelector('[name="email"]')?.value.trim();
        const password = form.querySelector('[name="password"]')?.value.trim();
        const telefono = form.querySelector('[name="telefono"]')?.value.trim();

        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Faltan campos obligatorios.");
            return;
        }

        try {
            btnRegistroTecnico.innerText = "Procesando...";
            btnRegistroTecnico.disabled = true;
            btnRegistroTecnico.classList.add("opacity-50");

            // 1. Crear usuario en Auth
            const usuarioAuth = await registrarUsuario(email, password, "tecnico", nombre);

            // 2. Guardar en 'users' para el Admin
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "tecnico",
                
                estado: "pendiente", // Nace pendiente de aprobación
                status: "pendiente",
                disponible: false,   // Nace Offline
                verificado: false,
                
                nivel: "Bronce",
                creadoEn: serverTimestamp(),
                ultimaConexion: serverTimestamp()
            }, { merge: true });

            console.log("✅ [Registro] Técnico creado. Estado: PENDIENTE.");
            alert("¡Solicitud Enviada!\n\nTu cuenta requiere aprobación del Administrador.");
            window.location.href = "tecnico.html";

        } catch (error) {
            console.error("❌ Error en Registro Técnico:", error);
            manejarErroresAuth(error);
            btnRegistroTecnico.innerText = "Registrarme";
            btnRegistroTecnico.disabled = false;
            btnRegistroTecnico.classList.remove("opacity-50");
        }
    });
}


// ======================================================
// C. LÓGICA DE LOGIN MANUAL
// ======================================================
const btnLogin = $("btnLogin");

if (btnLogin) {
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
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            console.log("✅ Login correcto:", userCredential.user.uid);
            btnLogin.innerText = "¡Éxito! Entrando...";
        } catch (error) {
            console.error("❌ Error en Login:", error);
            manejarErroresAuth(error);
            btnLogin.innerText = "Entrar";
            btnLogin.disabled = false;
        }
    });
}


// ======================================================
// D. LOGIN CON GOOGLE (INTERCEPTOR DE ROL) - NUEVO 🧠
// ======================================================
const btnGoogle = $("btnLoginGoogle");

if (btnGoogle) {
    btnGoogle.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            console.log("🌍 Iniciando Google Auth...");
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            // 1. VERIFICAR SI YA EXISTE EN LA BASE DE DATOS
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                // === USUARIO NUEVO: PREGUNTAR ROL ===
                console.log("🆕 Usuario nuevo de Google. Preguntando rol...");

                // Pregunta simple y efectiva
                const esTecnico = confirm("Estás registrándote por primera vez en FixGo.\n\n¿Quieres registrarte como TÉCNICO para ofrecer servicios?\n\n[Aceptar] = SÍ, SOY TÉCNICO\n[Cancelar] = NO, SOY CLIENTE");
                
                const rolElegido = esTecnico ? "tecnico" : "cliente";
                const estadoInicial = esTecnico ? "pendiente" : "activo"; // Técnicos nacen pendientes

                // Crear documento con los datos de Google + Rol elegido
                await setDoc(docRef, {
                    uid: user.uid,
                    nombre: user.displayName || "Usuario Google",
                    email: user.email,
                    rol: rolElegido,
                    
                    estado: estadoInicial,
                    status: estadoInicial,
                    
                    // Si es técnico, campos extra
                    disponible: false,
                    verificado: false,
                    nivel: esTecnico ? "Bronce" : null,
                    
                    creadoEn: serverTimestamp(),
                    fechaRegistro: serverTimestamp(),
                    ultimaConexion: serverTimestamp(),
                    foto: user.photoURL || ""
                });

                alert(`✅ Registro completado como ${rolElegido.toUpperCase()}.`);
                
                // Redirección forzada inmediata
                if (esTecnico) window.location.href = "tecnico.html";
                else window.location.href = "cliente.html";

            } else {
                // === USUARIO YA EXISTENTE ===
                console.log("✅ Usuario conocido. El observer manejará la redirección.");
            }

        } catch (error) {
            console.error("❌ Error Google:", error);
            alert("No se pudo iniciar sesión con Google.");
        }
    });
}


// ======================================================
// E. LOGOUT
// ======================================================
const btnLogout = $("logoutBtn") || $("btnLogout");
if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        if(confirm("¿Cerrar sesión?")) {
            await signOut(auth);
            window.location.href = "login.html";
        }
    });
}


// ======================================================
// F. OBSERVADOR (SOLO PARA LOGIN AUTOMÁTICO DE EXISTENTES)
// ======================================================
observarAuth((user) => {
    if (user) {
        // Solo redirigimos si estamos en login/registro
        const path = window.location.pathname;
        if (path.includes("login.html") || path.includes("registro")) {
            console.log("🔀 Redirigiendo usuario autenticado...");
            setTimeout(() => {
                if (user.rol === "tecnico") window.location.href = "tecnico.html";
                else if (user.rol === "admin") window.location.href = "admin.html";
                else window.location.href = "cliente.html";
            }, 500);
        }
    }
});


// ======================================================
// G. HELPER ERRORES
// ======================================================
function manejarErroresAuth(error) {
    if (error.code === 'auth/email-already-in-use') alert("⚠️ Este correo ya está registrado.");
    else if (error.code === 'auth/weak-password') alert("⚠️ Contraseña débil (mínimo 6 caracteres).");
    else if (error.code === 'auth/invalid-credential') alert("❌ Datos incorrectos.");
    else alert("Error: " + error.message);
}
