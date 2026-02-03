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

// --- CONFIGURACIÓN CON TU LLAVE REAL ---
const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k",
    authDomain: "fixgo-app-sf2l.firebaseapp.com",
    projectId: "fixgo-app-sf2l",
    storageBucket: "fixgo-app-sf2l.appspot.com",
    messagingSenderId: "331872151604", // ID estándar para este proyecto
    appId: "1:331872151604:web:86786a344933a763866444"
};

// Inicialización
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Selección del formulario
const registroForm = document.getElementById("registroForm");

if (registroForm) {
    registroForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("submitBtn");
        const formData = new FormData(registroForm);
        
        // Datos del formulario
        const email = formData.get("correo");
        const pass = formData.get("contraseña");
        const nombre = formData.get("nombre");
        const cedula = formData.get("cedula");
        const vehiculo = formData.get("vehiculo");
        const placas = formData.get("placas");
        const rol = registroForm.getAttribute("data-rol") || "TECNICO"; 

        if (btn) {
            btn.innerText = "CREANDO CUENTA...";
            btn.disabled = true;
        }

        try {
            // 1. Crear usuario en Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            // 2. Guardar en la colección correcta
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
                online: true,
                fechaRegistro: serverTimestamp()
            });

            console.log("Registro exitoso en Firestore");
            alert("¡Registro exitoso!");
            
            // 3. Redirección
            window.location.href = (rol === "TECNICO") ? "área-tecnico.html" : "índice.html";

        } catch (error) {
            console.error("Error en el proceso:", error);
            let mensajeError = "Error al registrar.";
            if (error.code === "auth/email-already-in-use") mensajeError = "Este correo ya está en uso.";
            if (error.code === "auth/weak-password") mensajeError = "La contraseña es muy corta.";
            alert(mensajeError);
        } finally {
            if (btn) {
                btn.innerText = "ENVIAR SOLICITUD DE ALTA";
                btn.disabled = false;
            }
        }
    });
}
