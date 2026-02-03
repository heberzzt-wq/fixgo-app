import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    GoogleAuthProvider 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURACIÓN CON TU CLAVE CONFIRMADA ---
const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k", // Clave verificada
    authDomain: "fixgo-app-sf2l.firebaseapp.com",
    projectId: "fixgo-app-sf2l",
    storageBucket: "fixgo-app-sf2l.appspot.com",
    messagingSenderId: "331872151604",
    appId: "1:331872151604:web:86786a344933a763866444"
};

// Inicializar motores
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const registroForm = document.getElementById("registroForm");

if (registroForm) {
    registroForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("submitBtn");
        const formData = new FormData(registroForm);
        
        // Obtener datos del formulario
        const email = formData.get("correo");
        const pass = formData.get("contraseña");
        const nombre = formData.get("nombre");
        const cedula = formData.get("cedula");
        const vehiculo = formData.get("vehiculo");
        const placas = formData.get("placas");
        const rol = registroForm.getAttribute("data-rol") || "TECNICO"; 

        if (btn) {
            btn.innerText = "PROCESANDO ALTA...";
            btn.disabled = true;
        }

        try {
            // 1. Crear usuario en Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            // 2. Guardar en Firestore (Colección según rol)
            const coleccion = (rol === "TECNICO") ? "tecnicos" : "clientes";
            
            await setDoc(doc(db, coleccion, user.uid), {
                uid: user.uid,
                nombre: nombre,
                correo: email,
                cedula: cedula || "",
                vehiculo: vehiculo || "",
                placas: placas || "",
                rol: rol,
                estado: "DISPONIBLE",
                fechaRegistro: serverTimestamp()
            });

            alert("¡Usuario registrado con éxito en FixGo!");
            window.location.href = (rol === "TECNICO") ? "área-tecnico.html" : "índice.html";

        } catch (error) {
            console.error("Error detectado:", error);
            // Manejo de errores amigable
            if (error.message.includes("identity-toolkit")) {
                alert("ERROR CRÍTICO: Debes habilitar la API de Identity Toolkit en Google Cloud Console (Mira las instrucciones en el chat).");
            } else {
                alert("Error de registro: " + error.message);
            }
        } finally {
            if (btn) {
                btn.innerText = "ENVIAR SOLICITUD DE ALTA";
                btn.disabled = false;
            }
        }
    });
}
