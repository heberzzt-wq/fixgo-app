// app-registro-universal.js
import { app } from "./firebase-config.js";
import { getAuth, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Detectar qué formulario está en la página
const form = document.querySelector("form");
if (!form) throw new Error("❌ No se encontró ningún formulario en esta página.");

const rol = form.dataset.rol || "CLIENTE"; // Default cliente si no existe data-rol

// Campos por rol
const camposTecnico = ["nombre", "cedula", "vehiculo", "placas", "correo", "contraseña", "confirmarContraseña"];
const camposCliente = ["nombre", "telefono", "direccion", "correo"];

const campos = rol === "TECNICO" ? camposTecnico : camposCliente;

const submitBtn = form.querySelector("#submitBtn");
const googleBtn = form.querySelector("#loginGoogle");

// ===== Registro por correo + contraseña =====
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.innerText = "Registrando...";

    try {
        // Recolectar datos del formulario
        const data = {};
        campos.forEach((name) => {
            const input = form.querySelector(`[name="${name}"]`);
            if (input) data[name] = input.value.trim();
        });

        // Validaciones para técnico
        if (rol === "TECNICO") {
            if (!data.contraseña || !data.confirmarContraseña) throw new Error("Las contraseñas son obligatorias.");
            if (data.contraseña !== data.confirmarContraseña) throw new Error("Las contraseñas no coinciden.");
        }

        // Crear usuario en Auth
        const userCredential = await createUserWithEmailAndPassword(auth, data.correo, data.contraseña || "TempPass123!");
        const uid = userCredential.user.uid;

        // Guardar en Firestore
        const coleccion = rol === "TECNICO" ? "tecnicos" : "clientes";
        const docRef = doc(db, coleccion, uid);

        const firestoreData = { uid, rol, estado: "ACTIVO", creadoEn: new Date().toISOString(), ...data };

        // Para técnicos añadimos ubicación si está disponible
        if (rol === "TECNICO" && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                firestoreData.lat = pos.coords.latitude;
                firestoreData.lng = pos.coords.longitude;
                setDoc(docRef, firestoreData)
                    .then(() => {
                        alert("✅ Registrado correctamente con ubicación.");
                        window.location.href = "index.html";
                    })
                    .catch((err) => {
                        alert("❌ Error guardando en Firestore: " + err.message);
                        submitBtn.disabled = false;
                        submitBtn.innerText = "ENVIAR SOLICITUD DE ALTA";
                    });
            }, () => {
                alert("⚠️ Activa el GPS para registrar ubicación. Se guardará sin GPS.");
                setDoc(docRef, firestoreData).then(() => {
                    window.location.href = "index.html";
                });
            });
        } else {
            await setDoc(docRef, firestoreData);
            alert("✅ Registro completado correctamente.");
            window.location.href = "index.html";
        }

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

            // Verificar si ya existe
            await setDoc(docRef, {
                uid: user.uid,
                rol,
                estado: "ACTIVO",
                creadoEn: new Date().toISOString(),
                correo: user.email,
                nombre: user.displayName || ""
            }, { merge: true });

            alert("✅ Registro completado con Google.");
            window.location.href = rol === "TECNICO" ? "tecnico.html" : "index.html";

        } catch (error) {
            alert("❌ " + error.message);
            googleBtn.disabled = false;
            googleBtn.innerText = "Registrarse con Google";
        }
    });
}
