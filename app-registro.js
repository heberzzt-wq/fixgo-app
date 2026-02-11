/**
 * ======================================================
 * FIXGO 2026 - SISTEMA DE REGISTRO Y LOGIN UNIVERSAL
 * Archivo: app-registro.js
 * Versión: 3.3 (ATOMIC REGISTRATION + FIX NULO)
 * ======================================================
 */

console.log("🚀 [app-registro.js] Inicializando sistema de autenticación V3.3...");

import { 
    auth, 
    db, 
    registrarUsuario, 
    signInWithEmailAndPassword, 
    signOut,
    doc,
    getDoc, 
    setDoc,
    serverTimestamp,
    observarAuth
} from "./firebase.js";

// Importamos deleteUser para la reversión atómica en caso de fallo
import { 
    GoogleAuthProvider, 
    signInWithPopup,
    deleteUser 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);

// ======================================================
// A. LÓGICA DE REGISTRO DE CLIENTES (REESCRITURA ATÓMICA)
// ======================================================
const btnRegistroCliente = $("btnRegistroCliente");

if (btnRegistroCliente) {
    btnRegistroCliente.addEventListener("click", async (e) => {
        e.preventDefault(); 
        
        const form = document.getElementById("formRegistroCliente");
        if (!form) return;

        const nombre = form.querySelector('[name="nombre"]')?.value.trim();
        const email = form.querySelector('[name="email"]')?.value.trim();
        const password = form.querySelector('[name="password"]')?.value.trim();
        const telefono = form.querySelector('[name="telefono"]')?.value.trim();

        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Por favor, completa todos los campos.");
            return;
        }

        let usuarioAuth = null;

        try {
            btnRegistroCliente.innerText = "Creando cuenta...";
            btnRegistroCliente.disabled = true;

            // 1. Intentamos crear en Auth
            usuarioAuth = await registrarUsuario(email, password, "cliente", nombre);

            // 2. Intentamos guardar en Firestore
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "cliente",
                creadoEn: serverTimestamp(),
                estado: "activo", 
                status: "activo"
            }, { merge: true });

            alert(`¡Bienvenido, ${nombre}!`);
            window.location.href = "cliente.html";
            
        } catch (error) {
            console.error("❌ Error Crítico en Registro Cliente:", error);

            // 🔥 FIX HEBER: Si el usuario se creó en Auth pero falló Firestore, lo borramos
            if (usuarioAuth && error.code !== 'auth/email-already-in-use') {
                console.warn("⚠️ Revirtiendo registro: Borrando usuario de Auth por fallo en DB.");
                await deleteUser(auth.currentUser).catch(e => console.error("Error borrando huérfano:", e));
            }

            manejarErroresAuth(error);
            btnRegistroCliente.innerText = "Registrarme";
            btnRegistroCliente.disabled = false;
        }
    });
}

// ======================================================
// B. LÓGICA DE TÉCNICOS (CON REVERSIÓN DE SEGURIDAD)
// ======================================================
const btnRegistroTecnico = $("btnRegistroTecnico");
let ineCargado = false;
let csfCargado = false;

if ($("btnSubirINE")) {
    $("btnSubirINE").addEventListener("click", () => $("inputINE").click());
    $("inputINE").addEventListener("change", () => {
        ineCargado = true;
        const btn = $("btnSubirINE");
        btn.innerText = "✅ INE Cargada";
        btn.classList.replace("bg-indigo-600", "bg-emerald-600");
    });
}

if ($("btnSubirCSF")) {
    $("btnSubirCSF").addEventListener("click", () => $("inputCSF").click());
    $("inputCSF").addEventListener("change", () => {
        csfCargado = true;
        const btn = $("btnSubirCSF");
        btn.innerText = "✅ CSF Cargada";
        btn.classList.replace("bg-indigo-600", "bg-emerald-600");
    });
}

if (btnRegistroTecnico) {
    btnRegistroTecnico.addEventListener("click", async (e) => {
        e.preventDefault();

        const form = document.getElementById("formRegistroTecnico");
        const nombre = form.querySelector('[name="nombre"]')?.value.trim();
        const email = form.querySelector('[name="email"]')?.value.trim();
        const password = form.querySelector('[name="password"]')?.value.trim();
        const telefono = form.querySelector('[name="telefono"]')?.value.trim();

        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Faltan campos obligatorios."); return;
        }
        
        if (!ineCargado || !csfCargado) {
            alert("⚠️ ALERTA: Sube INE y CSF para continuar."); return;
        }

        let usuarioAuth = null;

        try {
            btnRegistroTecnico.innerText = "Enviando Solicitud...";
            btnRegistroTecnico.disabled = true;

            // 1. Registro en Auth
            usuarioAuth = await registrarUsuario(email, password, "tecnico", nombre);

            // 2. Registro en DB (Con estado pendiente para Admin)
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "tecnico",
                estado: "pendiente",
                status: "pendiente",
                disponible: false,
                verificado: false,
                documentos: {
                    ine: true,
                    csf: true,
                    fecha_subida: serverTimestamp()
                },
                nivel: "Bronce",
                creadoEn: serverTimestamp()
            }, { merge: true });

            alert("✅ ¡Solicitud recibida! El Administrador revisará tu perfil.");
            window.location.href = "tecnico.html";

        } catch (error) {
            console.error("❌ Error Crítico en Registro Técnico:", error);

            // 🔥 FIX HEBER: Borrado de cuenta huérfana si falla Firestore
            if (usuarioAuth && error.code !== 'auth/email-already-in-use') {
                console.warn("⚠️ Fallo en DB: Limpiando Auth para permitir reintento.");
                await deleteUser(auth.currentUser).catch(e => console.error("Error limpieza:", e));
            }

            manejarErroresAuth(error);
            btnRegistroTecnico.innerText = "Registrarme";
            btnRegistroTecnico.disabled = false;
        }
    });
}

// ======================================================
// C. LOGIN Y D. GOOGLE (MANTENIDOS SEGÚN V3.2)
// ======================================================
const btnLogin = $("btnLogin");
if (btnLogin) {
    btnLogin.addEventListener("click", async (e) => {
        e.preventDefault();
        const form = document.getElementById("formLogin");
        const email = form.querySelector('[name="email"]')?.value.trim();
        const password = form.querySelector('[name="password"]')?.value.trim();

        if (!email || !password) {
            alert("⚠️ Ingresa datos completos."); return;
        }

        try {
            btnLogin.innerText = "Validando...";
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            manejarErroresAuth(error);
            btnLogin.innerText = "Entrar";
        }
    });
}

const btnGoogle = $("btnLoginGoogle");
if (btnGoogle) {
    btnGoogle.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            const docSnap = await getDoc(doc(db, "users", user.uid));

            if (!docSnap.exists()) {
                const esTecnico = confirm("¿Eres TÉCNICO? [ACEPTAR] = SÍ / [CANCELAR] = CLIENTE");
                await setDoc(doc(db, "users", user.uid), {
                    uid: user.uid,
                    nombre: user.displayName,
                    email: user.email,
                    rol: esTecnico ? "tecnico" : "cliente",
                    estado: esTecnico ? "pendiente" : "activo",
                    status: esTecnico ? "pendiente" : "activo",
                    creadoEn: serverTimestamp()
                });
            }
        } catch (error) {
            alert("Error con Google.");
        }
    });
}

// ======================================================
// E. OBSERVADOR Y MANEJO DE ERRORES (REFORZADO)
// ======================================================
observarAuth((user) => {
    if (user) {
        const path = window.location.pathname;
        if (path.includes("login.html") || path.includes("registro")) {
            // Obtenemos el rol desde el objeto user (inyectado por registrarUsuario)
            setTimeout(() => {
                if (user.rol === "tecnico") window.location.href = "tecnico.html";
                else if (user.rol === "admin") window.location.href = "admin.html";
                else window.location.href = "cliente.html";
            }, 600);
        }
    }
});

function manejarErroresAuth(error) {
    console.log("Código de error:", error.code);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        alert("❌ Credenciales incorrectas o cuenta mal configurada.");
    } else if (error.code === 'auth/email-already-in-use') {
        alert("⚠️ El correo ya está registrado. Intenta iniciar sesión.");
    } else if (error.code === 'auth/weak-password') {
        alert("⚠️ La contraseña es muy débil.");
    } else {
        alert("🚨 Error: " + error.message);
    }
}
