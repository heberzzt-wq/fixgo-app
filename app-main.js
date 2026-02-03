// app-main.js
import { auth } from "./firebase.js";

// Observador de estado de autenticación
auth.onAuthStateChanged(user => {
    if (user) {
        console.log("Usuario logueado:", user.uid);
        // Redireccionar según rol si aplica
    } else {
        console.log("No hay usuario logueado");
        // Redireccionar a login
    }
});
