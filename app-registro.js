// app-registro.js
import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { setDoc, doc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const formCliente = document.getElementById("formCliente");

formCliente.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = formCliente.email.value;
    const pass = formCliente.password.value;

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "usuarios", cred.user.uid), {
            email,
            rol: "cliente",
            fechaRegistro: new Date()
        });
        console.log("Cliente registrado:", cred.user.uid);
    } catch (error) {
        console.error("Error registro cliente:", error);
    }
});
