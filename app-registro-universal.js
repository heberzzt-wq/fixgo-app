// ===============================
// FIXGO - APP REGISTRO UNIVERSAL 2026
// ===============================

import { 
    auth, 
    registrarUsuario, 
    loginUsuario, 
    loginGoogle, 
    cerrarSesion, 
    db, 
    setDoc, 
    doc, 
    onSnapshot, 
    collection, 
    addDoc, 
    serverTimestamp,
    actualizarUbicacion
} from "./firebase.js";

import { initGPSMotor } from "./gps-motor.js";

console.log("app-registro-universal.js cargado");

// ===============================
// BOTONES DE REGISTRO
// ===============================

// Cliente
const btnRegistroCliente = document.getElementById("btnRegistroCliente");
const formRegistroCliente = document.getElementById("formRegistroCliente");

if (btnRegistroCliente && formRegistroCliente) {
    btnRegistroCliente.addEventListener("click", async (e) => {
        e.preventDefault();

        const nombre = formRegistroCliente.nombre.value;
        const email = formRegistroCliente.email.value;
        const password = formRegistroCliente.password.value;
        const telefono = formRegistroCliente.telefono.value;

        if (!nombre || !email || !password || !telefono) {
            alert("Completa todos los campos");
            return;
        }

        try {
            const user = await registrarUsuario(email, password, "cliente", { 
                nombre,
                telefono 
            });

            alert("Registro exitoso como cliente: " + nombre);
            window.location.href = "index.html";
        } catch (err) {
            console.error("Error registro cliente:", err);
            alert("Error al registrar cliente: " + err.message);
        }
    });
}

// Técnico
const btnRegistroTecnico = document.getElementById("btnRegistroTecnico");
const formRegistroTecnico = document.getElementById("formRegistroTecnico");

if (btnRegistroTecnico && formRegistroTecnico) {
    btnRegistroTecnico.addEventListener("click", async (e) => {
        e.preventDefault();

        const nombre = formRegistroTecnico.nombre.value;
        const email = formRegistroTecnico.email.value;
        const password = formRegistroTecnico.password.value;
        const telefono = formRegistroTecnico.telefono.value;

        if (!nombre || !email || !password || !telefono) {
            alert("Completa todos los campos");
            return;
        }

        try {
            const user = await registrarUsuario(email, password, "tecnico", {
                nombre,
                telefono,
                nivel: "Bronce", // inicial
                documentos: {},
                activo: false // pendiente validación admin
            });

            alert("Registro exitoso como técnico: " + nombre);
            window.location.href = "login.html";
        } catch (err) {
            console.error("Error registro técnico:", err);
            alert("Error al registrar técnico: " + err.message);
        }
    });
}

// ===============================
// BOTÓN LOGIN
// ===============================
const btnLogin = document.getElementById("btnLogin");
const formLogin = document.getElementById("formLogin");

if (btnLogin && formLogin) {
    btnLogin.addEventListener("click", async (e) => {
        e.preventDefault();

        const email = formLogin.email.value;
        const password = formLogin.password.value;

        if (!email || !password) {
            alert("Ingresa tus credenciales");
            return;
        }

        try {
            const user = await loginUsuario(email, password);
            alert("Bienvenido " + email);
            window.location.href = "index.html";
        } catch (err) {
            console.error("Error login:", err);
            alert("Error al iniciar sesión: " + err.message);
        }
    });
}

// ===============================
// LOGIN GOOGLE
// ===============================
const btnLoginGoogle = document.getElementById("btnLoginGoogle");
if (btnLoginGoogle) {
    btnLoginGoogle.addEventListener("click", async () => {
        try {
            const user = await loginGoogle("cliente"); // Default cliente
            alert("Sesión iniciada con Google: " + user.email);
            window.location.href = "index.html";
        } catch (err) {
            console.error("Error Google login:", err);
            alert("Error al iniciar sesión con Google: " + err.message);
        }
    });
}

// ===============================
// SUBIDA DE DOCUMENTOS TECNICO
// ===============================
const subirINE = document.getElementById("btnSubirINE");
const subirCSF = document.getElementById("btnSubirCSF");
const inputINE = document.getElementById("inputINE");
const inputCSF = document.getElementById("inputCSF");

if (subirINE && inputINE) {
    subirINE.addEventListener("click", () => inputINE.click());
    inputINE.addEventListener("change", async () => {
        const file = inputINE.files[0];
        if (!file) return;
        try {
            const storageRef = firebase.storage().ref(`tecnicos/${auth.currentUser.uid}/INE/${file.name}`);
            await storageRef.put(file);
            const url = await storageRef.getDownloadURL();
            await setDoc(doc(db, "tecnicos", auth.currentUser.uid), {
                "documentos.ine": url
            }, { merge: true });
            alert("INE subido correctamente");
        } catch (err) {
            console.error("Error subiendo INE:", err);
            alert("Error al subir INE: " + err.message);
        }
    });
}

if (subirCSF && inputCSF) {
    subirCSF.addEventListener("click", () => inputCSF.click());
    inputCSF.addEventListener("change", async () => {
        const file = inputCSF.files[0];
        if (!file) return;
        try {
            const storageRef = firebase.storage().ref(`tecnicos/${auth.currentUser.uid}/CSF/${file.name}`);
            await storageRef.put(file);
            const url = await storageRef.getDownloadURL();
            await setDoc(doc(db, "tecnicos", auth.currentUser.uid), {
                "documentos.csf": url
            }, { merge: true });
            alert("CSF subido correctamente");
        } catch (err) {
            console.error("Error subiendo CSF:", err);
            alert("Error al subir CSF: " + err.message);
        }
    });
}

// ===============================
// INICIALIZACIÓN GPS TECNICO
// ===============================
initGPSMotor(); // Función que arranca seguimiento GPS para técnico

