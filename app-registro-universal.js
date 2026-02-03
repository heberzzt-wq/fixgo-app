// Usamos importaciones directas desde la CDN para asegurar que siempre carguen
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    GoogleAuthProvider, 
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- 1. CONFIGURACIÓN (Asegúrate de que estos datos sean los tuyos) ---
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_PROYECTO.firebaseapp.com",
    projectId: "TU_PROYECTO",
    storageBucket: "TU_PROYECTO.appspot.com",
    messagingSenderId: "TU_ID",
    appId: "TU_APP_ID"
};

// Inicializar
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- 2. LÓGICA DE REGISTRO ---
const registroForm = document.getElementById("registroForm");

if (registroForm) {
    registroForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("submitBtn");
        const formData = new FormData(registroForm);
        
        const email = formData.get("correo");
        const pass = formData.get("contraseña");
        const rol = registroForm.getAttribute("data-rol") || "CLIENTE";

        btn.innerText = "REGISTRANDO...";
        btn.disabled = true;

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            await setDoc(doc(db, rol === "TECNICO" ? "tecnicos" : "clientes", user.uid), {
                uid: user.uid,
                nombre: formData.get("nombre"),
                correo: email,
                rol: rol,
                vehiculo: formData.get("vehiculo") || "",
                placas: formData.get("placas") || "",
                fechaRegistro: serverTimestamp()
            });

            alert("¡Registro exitoso!");
            window.location.href = rol === "TECNICO" ? "área-tecnico.html" : "índice.html";

        } catch (error) {
            console.error(error);
            alert("Error: " + error.message);
        } finally {
            btn.innerText = "ENVIAR SOLICITUD DE ALTA";
            btn.disabled = false;
        }
    });
}
