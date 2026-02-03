import { auth, db, onAuthStateChanged, getDoc, doc } from "./firebase.js";

// --- REFERENCIAS DE UI ---
const getEl = (id) => document.getElementById(id);

// --- 1. DETECCIÓN AUTOMÁTICA DE PERFIL (AUTO-LOGIN) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Usuario detectado, verificando rol...");
        
        // Buscamos primero en la colección de técnicos
        const tecRef = doc(db, "tecnicos", user.uid);
        const tecSnap = await getDoc(tecRef);

        if (tecSnap.exists()) {
            console.log("Es Técnico. Redirigiendo...");
            // Si quieres que entre directo al panel:
            // window.location.href = "área-tecnico.html"; 
            actualizarInterfazHome("tecnico", tecSnap.data().nombre);
        } else {
            // Si no es técnico, buscamos en clientes
            const cliRef = doc(db, "clientes", user.uid);
            const cliSnap = await getDoc(cliRef);
            
            if (cliSnap.exists()) {
                console.log("Es Cliente. Redirigiendo...");
                actualizarInterfazHome("cliente", cliSnap.data().nombre);
            }
        }
    } else {
        console.log("No hay sesión activa.");
        actualizarInterfazHome("visitante");
    }
});

// --- 2. DINÁMICA DE LA LANDING PAGE ---
function actualizarInterfazHome(rol, nombre = "") {
    const btnPrincipal = getEl("btnAccionPrincipal");
    const saludoUser = getEl("saludoUsuario");

    if (saludoUser) {
        saludoUser.innerText = nombre ? `¡Hola, ${nombre}!` : "Tu servicio técnico, a un clic.";
    }

    // Si ya sabemos quién es, el botón principal lo lleva a su área de trabajo
    if (btnPrincipal) {
        if (rol === "tecnico") {
            btnPrincipal.innerText = "IR A MI PANEL DE TRABAJO";
            btnPrincipal.onclick = () => window.location.href = "área-tecnico.html";
        } else if (rol === "cliente") {
            btnPrincipal.innerText = "SOLICITAR TÉCNICO AHORA";
            btnPrincipal.onclick = () => window.location.href = "index.html";
        } else {
            btnPrincipal.innerText = "EMPEZAR AHORA";
            btnPrincipal.onclick = () => window.location.href = "login.html";
        }
    }
}

// --- 3. EFECTOS VISUALES (Scroll y Navegación) ---
window.addEventListener("scroll", () => {
    const header = document.querySelector("header");
    if (header) {
        header.classList.toggle("bg-black/80", window.scrollY > 50);
        header.classList.toggle("backdrop-blur-md", window.scrollY > 50);
    }
});
