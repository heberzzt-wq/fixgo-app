import {
    auth,
    db,
    googleProvider,
    createUserWithEmailAndPassword,
    signInWithPopup,
    doc,
    setDoc,
    getDoc
} from "./firebase.js";

// Detectar formulario
const form = document.querySelector("form");
if (!form) throw new Error("Formulario no encontrado");

const rol = form.dataset.rol || "CLIENTE";
const submitBtn = document.getElementById("submitBtn");
const googleBtn = document.getElementById("loginGoogle");

// Campos
const camposTecnico = ["nombre", "cedula", "vehiculo", "placas", "correo", "contraseña", "confirmarContraseña"];
const camposCliente = ["nombre", "telefono", "direccion", "correo"];
const campos = rol === "TECNICO" ? camposTecnico : camposCliente;

// Registro Email
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = "Registrando...";

    try {
        const data = {};
        campos.forEach(c => {
            const input = form.querySelector(`[name="${c}"]`);
            if (input) data[c] = input.value.trim();
        });

        if (rol === "TECNICO" && data.contraseña !== data.confirmarContraseña) {
            throw new Error("Las contraseñas no coinciden");
        }

        const cred = await createUserWithEmailAndPassword(
            auth,
            data.correo,
            data.contraseña || "FixGo123!"
        );

        const user = cred.user;
        const col = rol === "TECNICO" ? "tecnicos" : "clientes";

        await setDoc(doc(db, col, user.uid), {
            uid: user.uid,
            rol,
            nombre: data.nombre || "",
            correo: data.correo,
            creadoEn: new Date().toISOString()
        });

        window.location.href = rol === "TECNICO" ? "area-tecnico.html" : "index.html";

    } catch (err) {
        alert("❌ " + err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "ENVIAR";
    }
});

// Registro Google
googleBtn?.addEventListener("click", async () => {
    try {
        const res = await signInWithPopup(auth, googleProvider);
        const user = res.user;
        const col = rol === "TECNICO" ? "tecnicos" : "clientes";

        const ref = doc(db, col, user.uid);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            await setDoc(ref, {
                uid: user.uid,
                rol,
                nombre: user.displayName || "",
                correo: user.email,
                creadoEn: new Date().toISOString()
            });
        }

        window.location.href = rol === "TECNICO" ? "area-tecnico.html" : "index.html";
    } catch (err) {
        alert("❌ " + err.message);
    }
});
