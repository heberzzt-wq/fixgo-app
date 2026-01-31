import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { app } from "./firebase-config.js"; // 👈 CLAVE

const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById('registroForm');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('submitBtn');
    btn.innerText = "OBTENIENDO GPS...";
    btn.disabled = true;

    const inputs = form.querySelectorAll('input');

    const nombre = inputs[0].value.trim();
    const cedula = inputs[1].value.trim();
    const vehiculo = inputs[2].value.trim();
    const placas = inputs[3].value.trim();
    const correo = inputs[4].value.trim();
    const contraseña = inputs[5].value;
    const confirmarContraseña = inputs[6].value;

    if (contraseña !== confirmarContraseña) {
        alert("⚠️ Las contraseñas no coinciden");
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
                const userCredential = await createUserWithEmailAndPassword(
                    auth,
                    correo,
                    contraseña
                );

                const uid = userCredential.user.uid;

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
        () => {
            alert("⚠️ Activa el GPS para continuar.");
            btn.innerText = "ENVIAR SOLICITUD DE ALTA";
            btn.disabled = false;
        }
    );
});

