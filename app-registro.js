import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById("registroForm");
const btn = document.getElementById("submitBtn");

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    btn.innerText = "OBTENIENDO GPS...";
    btn.disabled = true;

    // Acceder a los inputs por ID para mayor seguridad
    const nombre = document.getElementById("nombre").value.trim();
    const cedula = document.getElementById("cedula").value.trim();
    const vehiculo = document.getElementById("vehiculo").value.trim();
    const placas = document.getElementById("placas").value.trim();
    const correo = document.getElementById("correo").value.trim();
    const contraseña = document.getElementById("contraseña").value;
    const confirmarContraseña = document.getElementById("confirmarContraseña").value;

    // Validación de contraseñas
    if (contraseña !== confirmarContraseña) {
        alert("⚠️ Las contraseñas no coinciden");
        btn.innerText = "ENVIAR SOLICITUD DE ALTA";
        btn.disabled = false;
        return;
    }

    // Validación mínima de longitud
    if (contraseña.length < 8) {
        alert("⚠️ La contraseña debe tener al menos 8 caracteres");
        btn.innerText = "ENVIAR SOLICITUD DE ALTA";
        btn.disabled = false;
        return;
    }

    if (!navigator.geolocation) {
        alert("❌ Tu navegador no soporta GPS.");
        btn.innerText = "ENVIAR SOLICITUD DE ALTA";
        btn.disabled = false;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            try {
                // Crear usuario en Firebase Auth
                const userCredential = await createUserWithEmailAndPassword(auth, correo, contraseña);
                const uid = userCredential.user.uid;

                // Guardar datos adicionales en Firestore
                await addDoc(collection(db, "tecnicos"), {
                    uid,
                    nombre,
                    cedula,
                    vehiculo,
                    placas,
                    lat,
                    lng,
                    rol: "TECNICO",
                    estado: "ACTIVO",
                    creadoEn: new Date().toISOString()
                });

                alert("✅ Registro completado correctamente.");
                window.location.href = "index.html";

            } catch (error) {
                alert("❌ Error: " + error.message);
                btn.innerText = "ENVIAR SOLICITUD DE ALTA";
                btn.disabled = false;
            }
        },
        (error) => {
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    alert("⚠️ Por favor permite el acceso a tu ubicación.");
                    break;
                case error.POSITION_UNAVAILABLE:
                    alert("⚠️ Ubicación no disponible.");
                    break;
                case error.TIMEOUT:
                    alert("⚠️ Tiempo de espera agotado para obtener tu ubicación.");
                    break;
                default:
                    alert("⚠️ Error desconocido al obtener ubicación.");
            }
            btn.innerText = "ENVIAR SOLICITUD DE ALTA";
            btn.disabled = false;
        }
    );
});

