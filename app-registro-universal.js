/**
 * ======================================================
 * FIXGO 2026 – REGISTRO & LOGIN UNIVERSAL
 * Archivo: app-registro-universal.js
 * Estado: CORREGIDO PARA SINCRONIZACIÓN
 * ======================================================
 */
console.log("✅ app-registro-universal.js cargado correctamente");

// 1. IMPORTACIONES CORRECTAS (Adaptadas a tu firebase.js real)
import { 
    auth, 
    db, 
    registrarUsuario, // Tu función personalizada en firebase.js
    signInWithEmailAndPassword, // Función nativa para Login
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

// 2. HELPERS (Selectores inteligentes)
const $ = (id) => document.getElementById(id);

// Función para redirigir según el rol guardado en Firestore
function redirigirPorRol(rol) {
    console.log(`🔀 Redirigiendo rol: ${rol}`);
    if (rol === "tecnico") {
        window.location.href = "tecnico.html";
    } else if (rol === "admin") {
        window.location.href = "admin.html";
    } else {
        // Por defecto cliente o cualquier otro rol va al index
        window.location.href = "index.html"; 
    }
}

// ======================================================
// LÓGICA DE REGISTRO DE CLIENTES
// ======================================================
const btnRegistroCliente = $("btnRegistroCliente");

if (btnRegistroCliente) {
    btnRegistroCliente.addEventListener("click", async (e) => {
        e.preventDefault(); // Evita recarga si está dentro de un form
        console.log("🟢 Intentando registrar cliente...");

        // Buscamos los inputs dentro del formulario o por ID si existen
        // Esto soporta tu HTML actual que usa 'name' o 'id'
        const form = document.querySelector('form'); 
        const nombre = form.querySelector('[name="nombre"]')?.value || $("nombreCliente")?.value;
        const email = form.querySelector('[name="email"]')?.value || $("emailCliente")?.value;
        const password = form.querySelector('[name="password"]')?.value || $("passwordCliente")?.value;
        const telefono = form.querySelector('[name="telefono"]')?.value || $("telefonoCliente")?.value;

        if (!email || !password || !nombre) {
            alert("Por favor, completa todos los campos obligatorios.");
            return;
        }

        try {
            btnRegistroCliente.innerText = "Creando cuenta...";
            btnRegistroCliente.disabled = true;

            // Usamos tu función maestra 'registrarUsuario' de firebase.js
            await registrarUsuario(email, password, "cliente", {
                nombre: nombre,
                telefono: telefono || "",
                tipo: "cliente"
            });

            alert("¡Registro exitoso! Redirigiendo...");
            // La redirección la hará el observadorAuth automáticamente
        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
            btnRegistroCliente.innerText = "Registrarme";
            btnRegistroCliente.disabled = false;
        }
    });
}

// ======================================================
// LÓGICA DE REGISTRO DE TÉCNICOS
// ======================================================
const btnRegistroTecnico = $("btnRegistroTecnico");

if (btnRegistroTecnico) {
    btnRegistroTecnico.addEventListener("click", async (e) => {
        e.preventDefault();
        console.log("🟢 Intentando registrar técnico...");

        const form = document.getElementById('formRegistroTecnico') || document.querySelector('form');
        
        // Extracción robusta de datos
        const nombre = form.querySelector('[name="nombre"]')?.value;
        const email = form.querySelector('[name="email"]')?.value;
        const password = form.querySelector('[name="password"]')?.value;
        const telefono = form.querySelector('[name="telefono"]')?.value;

        if (!email || !password || !nombre) {
            alert("Faltan campos obligatorios.");
            return;
        }

        try {
            btnRegistroTecnico.innerText = "Procesando...";
            btnRegistroTecnico.disabled = true;

            // 1. Registro en Auth y Usuario Base
            const user = await registrarUsuario(email, password, "tecnico", {
                nombre: nombre,
                telefono: telefono || "",
                tipo: "tecnico",
                verificado: false
            });

            // 2. Crear documento extendido en colección 'tecnicos'
            // Esto asegura que app-tecnico.js encuentre los datos
            await setDoc(doc(db, "tecnicos", user.uid), {
                uid: user.uid,
                nombre: nombre,
                email: email,
                telefono: telefono || "",
                estado: "pendiente", // Importante para el dashboard
                nivel: "Bronce",
                wallet: 0,
                creado: serverTimestamp()
            }, { merge: true });

            alert("Solicitud recibida. Bienvenido al equipo FixGo.");
            // Redirección forzada por seguridad
            window.location.href = "tecnico.html";

        } catch (error) {
            console.error(error);
            if (error.code === 'auth/email-already-in-use') {
                alert("Este correo ya está registrado.");
            } else {
                alert("Error: " + error.message);
            }
            btnRegistroTecnico.innerText = "Registrarme";
            btnRegistroTecnico.disabled = false;
        }
    });
}

// ======================================================
// LÓGICA DE LOGIN (Compatibilidad con login.html)
// ======================================================
const btnLogin = $("btnLogin");

if (btnLogin) {
    btnLogin.addEventListener("click", async (e) => {
        e.preventDefault();
        console.log("🟢 Click en Login");

        // Adaptado a tu login.html que no tiene IDs en los inputs
        const form = document.getElementById("formLogin");
        const email = form.querySelector('input[name="email"]').value;
        const password = form.querySelector('input[name="password"]').value;

        if (!email || !password) {
            alert("Ingresa tu correo y contraseña.");
            return;
        }

        try {
            btnLogin.innerText = "Verificando...";
            btnLogin.disabled = true;
            
            // Login nativo directo
            await signInWithEmailAndPassword(auth, email, password);
            console.log("Login correcto, esperando redirección del observer...");
            
        } catch (error) {
            console.error("Error Login:", error);
            btnLogin.innerText = "Entrar";
            btnLogin.disabled = false;
            alert("Credenciales incorrectas o usuario no encontrado.");
        }
    });
}

// ======================================================
// LOGIN CON GOOGLE
// ======================================================
const btnGoogle = $("btnLoginGoogle");

if (btnGoogle) {
    btnGoogle.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error(error);
            alert("Error iniciando con Google.");
        }
    });
}

// ======================================================
// LOGOUT GLOBAL
// ======================================================
const btnLogout = $("logoutBtn") || $("btnLogout"); // Soporta ambos IDs posibles

if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
        try {
            await signOut(auth);
            window.location.href = "login.html";
        } catch (error) {
            console.error("Error al salir", error);
        }
    });
}

// ======================================================
// OBSERVADOR DE ESTADO (El Portero)
// ======================================================
observarAuth((user) => {
    // Solo redirigimos automáticamente si estamos en Login o Registro
    const path = window.location.pathname;
    const esPaginaAuth = path.includes("login.html") || path.includes("registro") || path.endsWith("/");

    if (user && esPaginaAuth) {
        console.log("Usuario detectado en página pública. Redirigiendo...");
        redirigirPorRol(user.rol);
    }
});
