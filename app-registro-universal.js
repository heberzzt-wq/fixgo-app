// app-registro-universal.js
import { 
    auth, 
    db, 
    googleProvider, 
    createUserWithEmailAndPassword, 
    signInWithPopup 
} from "./firebase-auth.js"; // Cambiado para que coincida con tu archivo central

import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Detectar formulario
const form = document.querySelector("form");
if (!form) throw new Error("Formulario no encontrado");

const rol = form.dataset.rol || "CLIENTE";

// Campos definidos según tu lógica
const camposTecnico = ["nombre", "cedula", "vehiculo", "placas", "correo", "contraseña", "confirmarContraseña"];
const camposCliente = ["nombre", "telefono", "direccion", "correo"];
const campos = rol === "TECNICO" ? camposTecnico : camposCliente;

const submitBtn = document.getElementById("submitBtn");
const googleBtn = document.getElementById("loginGoogle");

// Registro normal (Email/Password)
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = "Registrando...";

    try {
        const data = {};
        campos.forEach(c => {
            const i = form.querySelector(`[name="${c}"]`);
            if (i) data[c] = i.value.trim();
        });

        if (rol === "TECNICO" && data.contraseña !== data.confirmarContraseña) {
            throw new Error("Las contraseñas no coinciden");
        }

        const cred = await createUserWithEmailAndPassword(
            auth,
            data.correo,
            data.contraseña || "TempPass123!"
        );

        const user = cred.user;
        const firestoreData = {
            uid: user.uid,
            rol,
            estado: "ACTIVO",
            creadoEn: new Date().toISOString(),
            nombre: data.nombre || "",
            correo: data.correo || ""
        };

        // Si es técnico, añadimos los campos específicos
        if (rol === "TECNICO") {
            firestoreData.cedula = data.cedula || "";
            firestoreData.vehiculo = data.vehiculo || "";
            firestoreData.placas = data.placas || "";
        }

        // Geolocalización opcional para técnicos
        if (rol === "TECNICO" && navigator.geolocation) {
            try {
                const pos = await new Promise((res, rej) =>
                    navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 })
                );
                firestoreData.lat = pos.coords.latitude;
                firestoreData.lng = pos.coords.longitude;
            } catch (geoErr) {
                console.warn("No se pudo obtener ubicación inicial:", geoErr);
            }
        }

        const col = rol === "TECNICO" ? "tecnicos" : "clientes";
        await setDoc(doc(db, col, user.uid), firestoreData);

        alert("✅ Registro exitoso");
        window.location.href = rol === "TECNICO" ? "area-tecnico.html" : "index.html";

    } catch (e) {
        alert("❌ " + e.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "ENVIAR";
    }
});

// Registro/Login Google corregido
if (googleBtn) {
    googleBtn.addEventListener("click", async () => {
        try {
            const res = await signInWithPopup(auth, googleProvider);
            const user = res.user;
            const col = rol === "TECNICO" ? "tecnicos" : "clientes";
            
            // Verificar si el usuario ya existe en Firestore para no sobreescribir datos importantes
            const docRef = doc(db, col, user.uid);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                // Si es nuevo, creamos el perfil básico
                await setDoc(docRef, {
                    uid: user.uid,
                    rol,
                    estado: "ACTIVO",
                    creadoEn: new Date().toISOString(),
                    nombre: user.displayName || "",
                    correo: user.email || ""
                });
                
                // Si es técnico y entra por Google por primera vez, 
                // le avisamos que debe completar su perfil luego
                if (rol === "TECNICO") {
                    alert("Bienvenido. Por favor completa tus datos de vehículo en tu perfil.");
                }
            }

            window.location.href = rol === "TECNICO" ? "area-tecnico.html" : "index.html";
        } catch (e) {
            console.error("Error Google:", e);
            alert("❌ " + e.message);
        }
    });
}
