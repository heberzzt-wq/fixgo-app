import { 
    auth, db, 
    createUserWithEmailAndPassword, 
    setDoc, doc, 
    serverTimestamp 
} from "./firebase.js";

// Función para obtener elementos de forma segura
const getEl = (id) => document.getElementById(id);

// --- LÓGICA DE REGISTRO ---
const registroForm = document.getElementById("registroForm");

if (registroForm) {
    registroForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        // 1. Extraer datos del formulario (usando el atributo name de tu HTML)
        const formData = new FormData(registroForm);
        const email = formData.get("correo");
        const pass = formData.get("contraseña");
        const confirmPass = formData.get("confirmarContraseña");
        const nombre = formData.get("nombre");
        const rol = registroForm.getAttribute("data-rol") || "CLIENTE"; // TECNICO o CLIENTE

        // 2. Validaciones básicas
        if (pass !== confirmPass) {
            return alert("Las contraseñas no coinciden.");
        }

        const btn = document.getElementById("submitBtn");
        btn.innerText = "PROCESANDO ALTA...";
        btn.disabled = true;

        try {
            // 3. Crear usuario en Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            // 4. Preparar datos según el ROL
            const coleccion = rol === "TECNICO" ? "tecnicos" : "clientes";
            
            let datosPerfil = {
                uid: user.uid,
                nombre: nombre,
                email: email,
                rol: rol,
                fechaRegistro: serverTimestamp(),
                online: true
            };

            // Si es Técnico, guardamos los campos adicionales de tu HTML
            if (rol === "TECNICO") {
                datosPerfil.cedula = formData.get("cedula");
                datosPerfil.vehiculo = formData.get("vehiculo");
                datosPerfil.placas = formData.get("placas");
                datosPerfil.estado = "DISPONIBLE"; // Estado inicial
            } else {
                // Si es cliente, campos adicionales de cliente
                datosPerfil.telefono = formData.get("telefono") || "";
                datosPerfil.direccion = formData.get("direccion") || "";
            }

            // 5. Guardar en Firestore
            await setDoc(doc(db, coleccion, user.uid), datosPerfil);

            alert(`¡Registro exitoso como ${rol}!`);
            
            // 6. Redirección
            window.location.href = (rol === "TECNICO") ? "area-tecnico.html" : "index.html";

        } catch (error) {
            console.error("Error en registro:", error);
            let mensaje = "Error al registrar.";
            if (error.code === "auth/email-already-in-use") mensaje = "Este correo ya está registrado.";
            if (error.code === "auth/weak-password") mensaje = "La contraseña es muy débil.";
            alert(mensaje);
        } finally {
            btn.innerText = "ENVIAR SOLICITUD DE ALTA";
            btn.disabled = false;
        }
    });
}
