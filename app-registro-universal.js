// app-registro-universal.js
import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { setDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Registro universal para clientes y técnicos
const formRegistro = document.getElementById("formRegistro");

formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = formRegistro.email.value;
    const pass = formRegistro.password.value;
    const rol = formRegistro.rol.value;

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "usuarios", cred.user.uid), {
            email,
            rol,
            fechaRegistro: new Date()
        });
        console.log("Usuario registrado:", cred.user.uid);
    } catch (error) {
        console.error("Error registro:", error);
    }
});
