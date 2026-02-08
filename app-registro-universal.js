import { auth, registrarUsuario, signInWithEmailAndPassword, signOut, observarAuth } from "./firebase.js";
import { GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

console.log("✅ Sistema de Acceso Cargado");

// === LOGIN (Entrar) ===
const btnLogin = document.getElementById("btnLogin");
if (btnLogin) {
    document.getElementById("formLogin").addEventListener("submit", async (e) => {
        e.preventDefault(); // Evitar recarga
        
        const email = document.querySelector('input[name="email"]').value;
        const password = document.querySelector('input[name="password"]').value;

        if (!email || !password) return alert("Faltan datos");

        try {
            btnLogin.innerText = "Verificando...";
            btnLogin.disabled = true;
            
            // Intento de login
            await signInWithEmailAndPassword(auth, email, password);
            
            // NO redirigimos aquí. Dejamos que 'observarAuth' lo haga abajo.
            console.log("Login correcto.");
            
        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
            btnLogin.innerText = "Entrar";
            btnLogin.disabled = false;
        }
    });
}

// === LOGIN GOOGLE ===
const btnGoogle = document.getElementById("btnLoginGoogle");
if (btnGoogle) {
    btnGoogle.onclick = async (e) => {
        e.preventDefault();
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error(error);
            alert("Error con Google (Revisa dominios autorizados en Firebase Console).");
        }
    };
}

// === REDIRECCIONADOR AUTOMÁTICO ===
// Este es el "Portero" que decide a dónde vas
observarAuth((user) => {
    const path = window.location.pathname;
    
    // Si estamos en login.html y detectamos usuario, lo mandamos a su panel
    if (user && (path.includes("login.html") || path === "/")) {
        console.log("Usuario detectado, redirigiendo...", user.rol);
        
        if (user.rol === "tecnico") window.location.href = "tecnico.html";
        else if (user.rol === "cliente") window.location.href = "cliente.html";
        else if (user.rol === "admin") window.location.href = "admin.html";
        else window.location.href = "index.html"; // Rol desconocido
    }
});
