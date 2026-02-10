/**
 * ======================================================
 * FIXGO 2026 - SISTEMA DE REGISTRO Y LOGIN UNIVERSAL
 * Archivo: app-registro.js
 * Versión: 3.2 (Production Ready - Document Check)
 * ======================================================
 */

console.log("🚀 [app-registro.js] Inicializando sistema de autenticación...");

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

import { 
    GoogleAuthProvider, 
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);

// ======================================================
// A. LÓGICA DE REGISTRO DE CLIENTES
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

        if (password.length < 6) {
            alert("⚠️ La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        try {
            btnRegistroCliente.innerText = "Creando cuenta...";
            btnRegistroCliente.disabled = true;

            const usuarioAuth = await registrarUsuario(email, password, "cliente", nombre);

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
            console.error("❌ Error Cliente:", error);
            manejarErroresAuth(error);
            btnRegistroCliente.innerText = "Registrarme";
            btnRegistroCliente.disabled = false;
        }
    });
}

// ======================================================
// B. LÓGICA DE REGISTRO DE TÉCNICOS (CORREGIDA Y BLINDADA)
// ======================================================
const btnRegistroTecnico = $("btnRegistroTecnico");

// Variables para controlar si subieron documentos (Simulación para Producción V1)
let ineCargado = false;
let csfCargado = false;

// Lógica visual de los botones de subida
if ($("btnSubirINE")) {
    $("btnSubirINE").addEventListener("click", () => {
        $("inputINE").click(); // Dispara el input oculto
    });
    $("inputINE").addEventListener("change", () => {
        ineCargado = true;
        const btn = $("btnSubirINE");
        btn.innerText = "✅ INE Cargada";
        btn.classList.remove("bg-indigo-600");
        btn.classList.add("bg-emerald-600");
    });
}

if ($("btnSubirCSF")) {
    $("btnSubirCSF").addEventListener("click", () => {
        $("inputCSF").click(); // Dispara el input oculto
    });
    $("inputCSF").addEventListener("change", () => {
        csfCargado = true;
        const btn = $("btnSubirCSF");
        btn.innerText = "✅ CSF Cargada";
        btn.classList.remove("bg-indigo-600");
        btn.classList.add("bg-emerald-600");
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

        // 1. Validaciones estrictas
        if (!nombre || !email || !password || !telefono) {
            alert("⚠️ Faltan campos obligatorios.");
            return;
        }
        
        // 2. Validación de Documentos (OBLIGATORIO PARA PASAR A ADMIN)
        if (!ineCargado || !csfCargado) {
            alert("⚠️ ALERTA DE REQUISITOS:\n\nDebes subir tu INE y tu CSF para poder registrarte.\nEl administrador necesita estos documentos para aprobarte.");
            return;
        }

        try {
            btnRegistroTecnico.innerText = "Enviando Solicitud...";
            btnRegistroTecnico.disabled = true;

            const usuarioAuth = await registrarUsuario(email, password, "tecnico", nombre);

            // Guardamos con los flags de documentos
            await setDoc(doc(db, "users", usuarioAuth.uid), {
                uid: usuarioAuth.uid,
                nombre: nombre,
                email: email,
                telefono: telefono,
                rol: "tecnico",
                
                estado: "pendiente", // CRÍTICO: Admin debe aprobar
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

            alert("✅ ¡Solicitud Enviada con Éxito!\n\nTu documentación ha sido recibida. El Administrador revisará tu perfil en breve.");
            window.location.href = "tecnico.html"; // Irá a la sala de espera

        } catch (error) {
            console.error("❌ Error Técnico:", error);
            manejarErroresAuth(error);
            btnRegistroTecnico.innerText = "Registrarme";
            btnRegistroTecnico.disabled = false;
        }
    });
}

// ======================================================
// C. LÓGICA DE LOGIN (STANDARD)
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
            // El observer redirige
        } catch (error) {
            manejarErroresAuth(error);
            btnLogin.innerText = "Entrar";
        }
    });
}

// ======================================================
// D. LOGIN CON GOOGLE
// ======================================================
const btnGoogle = $("btnLoginGoogle");
if (btnGoogle) {
    btnGoogle.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                const esTecnico = confirm("¿Te registras como TÉCNICO en FixGo?\n\n[ACEPTAR] = SÍ, SOY TÉCNICO\n[CANCELAR] = NO, SOY CLIENTE");
                const rolElegido = esTecnico ? "tecnico" : "cliente";
                const estadoInicial = esTecnico ? "pendiente" : "activo";

                await setDoc(docRef, {
                    uid: user.uid,
                    nombre: user.displayName,
                    email: user.email,
                    rol: rolElegido,
                    estado: estadoInicial,
                    status: estadoInicial,
                    creadoEn: serverTimestamp()
                });
            }
        } catch (error) {
            console.error(error);
            alert("Error con Google.");
        }
    });
}

// ======================================================
// E. OBSERVADOR (ROUTER)
// ======================================================
observarAuth((user) => {
    if (user) {
        const path = window.location.pathname;
        if (path.includes("login.html") || path.includes("registro")) {
            setTimeout(() => {
                if (user.rol === "tecnico") window.location.href = "tecnico.html";
                else if (user.rol === "admin") window.location.href = "admin.html";
                else window.location.href = "cliente.html";
            }, 500);
        }
    }
});

function manejarErroresAuth(error) {
    if (error.code === 'auth/wrong-password') alert("❌ Contraseña incorrecta.");
    else if (error.code === 'auth/user-not-found') alert("❌ Usuario no encontrado.");
    else alert("Error: " + error.message);
}
