import { 
    auth, db, 
    createUserWithEmailAndPassword, 
    setDoc, doc, 
    serverTimestamp 
} from "./firebase.js";

const getEl = (id) => document.getElementById(id);

// --- LÓGICA DE REGISTRO UNIFICADO ---
const formRegistro = getEl("formRegistroUniversal");

if (formRegistro) {
    formRegistro.onsubmit = async (e) => {
        e.preventDefault();

        const email = getEl("regEmail").value;
        const pass = getEl("regPass").value;
        const nombre = getEl("regNombre").value;
        const tipoUsuario = getEl("regTipo").value; // 'cliente' o 'tecnico'

        if (!email || !pass || !nombre) {
            return alert("Por favor, rellena todos los campos.");
        }

        try {
            // 1. Crear usuario en Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            // 2. Crear el perfil en la colección correcta según el ROL
            // Esto evita que un técnico aparezca en la lista de clientes
            const coleccion = tipoUsuario === "tecnico" ? "tecnicos" : "clientes";
            
            const datosPerfil = {
                uid: user.uid,
                nombre: nombre,
                email: email,
                rol: tipoUsuario,
                fechaRegistro: serverTimestamp(),
                online: true
            };

            // Si es técnico, añadimos campos específicos de su trabajo
            if (tipoUsuario === "tecnico") {
                datosPerfil.estado = "DISPONIBLE";
                datosPerfil.vehiculo = "Por definir";
                datosPerfil.placas = "---";
                datosPerfil.estrellas = 5;
            }

            await setDoc(doc(db, coleccion, user.uid), datosPerfil);

            alert(`¡Registro exitoso como ${tipoUsuario}!`);
            
            // 3. Redirección inteligente
            if (tipoUsuario === "tecnico") {
                window.location.href = "área-tecnico.html";
            } else {
                window.location.href = "índice.html";
            }

        } catch (error) {
            console.error("Error en registro:", error);
            alert("Error al registrar: " + error.message);
        }
    };
}
