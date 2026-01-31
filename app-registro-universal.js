// app-registro-universal.js
import { app } from "./firebase-config.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Detectar el formulario en la página
const form = document.querySelector("form");
if (!form) throw new Error("❌ No se encontró ningún formulario en esta página.");

const rol = form.dataset.rol || "CLIENTE";

// Campos por rol
const camposTecnico = ["nombre", "cedula", "vehiculo", "placas", "correo", "contraseña", "confirmarContraseña"];
const camposCliente = ["nombre", "telefono", "direccion", "correo"];
const campos = rol === "TECNICO" ? camposTecnico : camposCliente;

const submitBtn = form.querySelector("#submitBtn");
const googleBtn = form.querySelector("#loginGoogle");

// ===== Registro por email + contraseña =====
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = "Registrando...";

    try {
        // Recolectar datos
        const data = {};
        campos.forEach(name => {
            const input = form.querySelector(`[name="${name}"]`);
            if (input) data[name] = input.value.trim();
        });

        // Validaciones técnicos
        if (rol === "TECNICO") {
            if (!data.contraseña || !data.confirmarContraseña) throw new Error("Las contraseñas son obligatorias.");
            if (data.contraseña !== data.confirmarContraseña) throw new Error("Las contraseñas no coinciden.");
        }

        // Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(
            auth, 
            data.correo, 
            data.contraseña || "TempPass123!"
        );
        const uid = userCredential.user.uid;

        // Guardar en Firestore
        const coleccion = rol === "TECNICO" ? "tecnicos" : "clientes";
        const docRef = doc(db, coleccion, uid);
        const firestoreData = { uid, rol, estado: "ACTIVO", creadoEn: new Date().toISOString(), ...data };

        // Técnicos con GPS
        if (rol === "TECNICO" && navigator.geolocation) {
            try {
                const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
                firestoreData.lat = pos.coords.latitude;
                firestoreData.lng = pos.coords.longitude;
            } catch {
                alert("⚠️ GPS no disponible, se guardará sin ubicación.");
            }
        }

        await setDoc(docRef, firestoreData, { merge: true });
        alert("✅ Registro completado correctamente.");
        window.location.href = rol === "TECNICO" ? "tecnico.html" : "index.html";

    } catch (error) {
        alert("❌ " + error.message);
        submitBtn.disabled = false;
        submitBtn.innerText = rol === "TECNICO" ? "ENVIAR SOLICITUD DE ALTA" : "CREAR MI CUENTA";
    }
});

// ===== Registro con Google =====
if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
        googleBtn.disabled = true;
        googleBtn.innerText = "Redirigiendo a Google...";

        try {
            const userCredential = await signInWithPopup(auth, googleProvider);
            const user = userCredential.user;
            const coleccion = rol === "TECNICO" ? "tecnicos" : "clientes";
            const docRef = doc(db, coleccion, user.uid);

            const firestoreData = {
                uid: user.uid,
                rol,
                estado: "ACTIVO",
                creadoEn: new Date().toISOString(),
                correo: user.email,
                nombre: user.displayName || ""
            };

            // Técnicos con GPS
            if (rol === "TECNICO" && navigator.geolocation) {
                try {
                    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
                    firestoreData.lat = pos.coords.latitude;
                    firestoreData.lng = pos.coords.longitude;
                } catch {
                    alert("⚠️ GPS no disponible, se guardará sin ubicación.");
                }
            }

            await setDoc(docRef, firestoreData, { merge: true });
            alert("✅ Registro completado con Google.");
            window.location.href = rol === "TECNICO" ? "tecnico.html" : "index.html";

        } catch (error) {
            alert("❌ " + error.message);
            googleBtn.disabled = false;
            googleBtn.innerText = "Registrarse con Google";
        }
    });
}
