import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById('registroForm');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.innerText = "OBTENIENDO GPS...";
    btn.disabled = true;

    const inputs = form.querySelectorAll('input');
    const nombre = inputs[0].value;
    const cedula = inputs[1].value;
    const vehiculo = inputs[2].value;
    const placas = inputs[3].value;
    const correo = inputs[4].value;
    const contraseña = inputs[5].value;
    const confirmarContraseña = inputs[6].value;

    // Validación de confirmación de contraseña
    if (contraseña !== confirmarContraseña) {
        alert("⚠️ Las contraseñas no coinciden");
        btn.innerText = "ENVIAR SOLICITUD DE ALTA";
        btn.disabled = false;
        return;
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
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
                    ultimaConexion: new Date().toISOString(),
                    estado: "ACTIVO"
                });

                alert("✅ Registrado con éxito en tu ubicación actual.");
                window.location.href = "index.html";

            } catch (error) {
                alert("Error: " + error.message);
                btn.innerText = "ENVIAR SOLICITUD DE ALTA";
                btn.disabled = false;
            }

        }, (error) => {
            alert("⚠️ Por favor activa el GPS para registrarte.");
            btn.innerText = "ENVIAR SOLICITUD DE ALTA";
            btn.disabled = false;
        });
    } else {
        alert("Tu navegador no soporta GPS.");
        btn.innerText = "ENVIAR SOLICITUD DE ALTA";
        btn.disabled = false;
    }
});

