// app-registro-universal.js
import { app } from "./firebase-config.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    GoogleAuthProvider, 
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Detectar formulario presente
const form = document.querySelector("form[data-rol]");
if (!form) throw new Error("No se encontró un formulario con data-rol");

const rol = form.dataset.rol.toUpperCase(); // TECNICO o CLIENTE
const submitBtn = form.querySelector("#submitBtn");
const googleBtn = form.querySelector("#loginGoogle");

// Función de redirección según rol
const redirectByRol = (rol) => {
    if (rol === "TECNICO") return "tecnico.html";
    return "index.html"; // CLIENTE u otros
};

// ---------------- REGISTRO CON CORREO/CONTRASEÑA ----------------
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = rol === "TECNICO" ? "OBTENIENDO GPS..." : "REGISTRANDO...";

    const inputs = form.querySelectorAll("input");
    const datos = {};
    inputs.forEach(input => datos[input.name] = input.value.trim());

    // Validación de contraseña (solo si existe)
    if (datos.contraseña && datos.confirmarContraseña && datos.contraseña !== datos.confirmarContraseña) {
        alert("⚠️ Las contraseñas no coinciden");
        submitBtn.disabled = false;
        submitBtn.innerText = "ENVIAR SOLICITUD DE ALTA";
        return;
    }

    // Función para crear documento Firestore
    const crearFirestore = async (uid, extra = {}) => {
        const docData = {
            uid,
            rol,
            estado: "ACTIVO",
            creadoEn: new Date().toISOString(),
            ...datos,
            ...extra
        };
        await addDoc(collection(db, rol === "TECNICO" ? "tecnicos" : "clientes"), docData);
    };

    try {
        let extra = {};
        // GPS solo para TECNICO
        if (rol === "TECNICO") {
            if (!navigator.geolocation) throw new Error("Tu navegador no soporta GPS");
            const position = await new Promise((res, rej) => {
                navigator.geolocation.getCurrentPosition(res, rej);
            });
            extra.lat = position.coords.latitude;
            extra.lng = position.coords.longitude;
        }

        // Crear usuario en Auth
        const userCredential = await createUserWithEmailAndPassword(auth, datos.correo, datos.contraseña);
        const uid = userCredential.user.uid;

        await crearFirestore(uid, extra);

        alert("✅ Registro completado correctamente");
        window.location.href = redirectByRol(rol);

    } catch (error) {
        alert("❌ Error: " + error.message);
        submitBtn.disabled = false;
        submitBtn.innerText = "ENVIAR SOLICITUD DE ALTA";
    }
});

// ---------------- REGISTRO CON GOOGLE ----------------
googleBtn?.addEventListener("click", async () => {
    googleBtn.disabled = true;
    googleBtn.innerText = "CONECTANDO CON GOOGLE...";
    try {
        const userCredential = await signInWithPopup(auth, googleProvider);
        const user = userCredential.user;

        const extra = {};
        // GPS solo para técnicos
        if (rol === "TECNICO" && navigator.geolocation) {
            const position = await new Promise((res, rej) => {
                navigator.geolocation.getCurrentPosition(res, rej);
            });
            extra.lat = position.coords.latitude;
            extra.lng = position.coords.longitude;
        }

        // Guardar info en Firestore si no existe
        await addDoc(collection(db, rol === "TECNICO" ? "tecnicos" : "clientes"), {
            uid: user.uid,
            rol,
            correo: user.email,
            nombre: user.displayName || "",
            estado: "ACTIVO",
            creadoEn: new Date().toISOString(),
            ...extra
        });

        alert("✅ Registrado correctamente con Google");
        window.location.href = redirectByRol(rol);

    } catch (error) {
        alert("❌ Error: " + error.message);
        googleBtn.disabled = false;
        googleBtn.innerText = "Registrarse con Google";
    }
});
