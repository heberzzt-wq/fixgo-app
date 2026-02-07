/**
 * ======================================================
 * FIXGO 2026 – REGISTRO & LOGIN UNIVERSAL v2.1
 * ======================================================
 */
import { 
    auth, 
    registrarUsuario, 
    signInWithEmailAndPassword, 
    signOut,
    observarAuth
} from "./firebase.js";

import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);

// --- LÓGICA DE REGISTRO CLIENTE ---
const btnRegistroCliente = $("btnRegistroCliente");
if (btnRegistroCliente) {
    btnRegistroCliente.addEventListener("click", async (e) => {
        e.preventDefault();
        const form = document.getElementById('formRegistroCliente');
        
        // Obtener valores (soporta inputs por name)
        const nombre = form.querySelector('[name="nombre"]').value;
        const email = form.querySelector('[name="email"]').value;
        const password = form.querySelector('[name="password"]').value;
        const telefono = form.querySelector('[name="telefono"]').value;

        if (!email || !password || !nombre) {
            return alert("Completa nombre, correo y contraseña.");
        }

        try {
            btnRegistroCliente.innerText = "Creando...";
            btnRegistroCliente.disabled = true;

            await registrarUsuario(email, password, "cliente", {
                nombre: nombre,
                telefono: telefono
            });

            alert("¡Cuenta creada! Redirigiendo...");
            window.location.href = "index.html"; // O cliente.html
        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
            btnRegistroCliente.innerText = "Registrarme";
            btnRegistroCliente.disabled = false;
        }
    });
}

// --- LÓGICA DE REGISTRO TÉCNICO ---
const btnRegistroTecnico = $("btnRegistroTecnico");
if (btnRegistroTecnico) {
    btnRegistroTecnico.addEventListener("click", async (e) => {
        e.preventDefault();
        const form = document.getElementById('formRegistroTecnico');

        const nombre = form.querySelector('[name="nombre"]').value;
        const email = form.querySelector('[name="email"]').value;
        const password = form.querySelector('[name="password"]').value;
        const telefono = form.querySelector('[name="telefono"]').value;

        if (!email || !password || !nombre) {
            return alert("Completa todos los campos obligatorios.");
        }

        try {
            btnRegistroTecnico.innerText = "Procesando...";
            btnRegistroTecnico.disabled = true;

            // Enviamos todo en un solo paso gracias al nuevo firebase.js
            await registrarUsuario(email, password, "tecnico", {
                nombre: nombre,
                telefono: telefono,
                verificado: false // Requiere validación manual de admin
            });

            alert("Solicitud recibida. Bienvenido al equipo FixGo.");
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

// --- LÓGICA DE LOGIN ---
const btnLogin = $("btnLogin");
if (btnLogin) {
    btnLogin.addEventListener("click", async (e) => {
        e.preventDefault();
        const form = document.getElementById("formLogin");
        const email = form.querySelector('[name="email"]').value;
        const password = form.querySelector('[name="password"]').value;

        if (!email || !password) return alert("Ingresa datos completos.");

        try {
            btnLogin.innerText = "Verificando...";
            btnLogin.disabled = true;
            await signInWithEmailAndPassword(auth, email, password);
            // El observarAuth global se encargará de redirigir
        } catch (error) {
            console.error(error);
            btnLogin.innerText = "Entrar";
            btnLogin.disabled = false;
            alert("Credenciales incorrectas.");
        }
    });
}

// --- LOGIN GOOGLE ---
const btnGoogle = $("btnLoginGoogle");
if (btnGoogle) {
    btnGoogle.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            alert("Error con Google.");
        }
    });
}

// --- REDIRECCIÓN AUTOMÁTICA ---
observarAuth((user) => {
    // Si estamos en login/registro y detectamos usuario, redirigir
    const path = window.location.pathname;
    const esPaginaAuth = path.includes("login") || path.includes("registro");

    if (user && esPaginaAuth) {
        if (user.rol === "tecnico") window.location.href = "tecnico.html";
        else if (user.rol === "admin") window.location.href = "admin.html";
        else window.location.href = "index.html";
    }
});
