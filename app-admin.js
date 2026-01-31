// app-admin.js
import { app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut, signInWithPopup, googleProvider } from "./firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

// 🔐 Verificación de sesión y rol
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // No hay sesión
        window.location.href = "login.html";
        return;
    }

    try {
        // Verificar si es admin
        const adminRef = doc(db, "admins", user.uid);
        const adminSnap = await getDoc(adminRef);

        if (!adminSnap.exists() || adminSnap.data().rol !== "ADMIN") {
            alert("❌ Acceso denegado. Solo administradores.");
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }

        // Mostrar info del admin
        const data = adminSnap.data();
        document.getElementById("nombreAdmin").innerText = data.nombre || "Administrador";

        // Puedes cargar datos adicionales aquí, por ejemplo lista de técnicos y clientes
        cargarTecnicos();
        cargarClientes();

    } catch (error) {
        console.error("Error verificando rol admin:", error);
        alert("❌ Error en la verificación de sesión.");
        await signOut(auth);
        window.location.href = "login.html";
    }
});

// ===== Funciones de botones =====
window.verTecnicos = async () => {
    const coleccion = "tecnicos";
    const snapshot = await getDocs(collection(db, coleccion));
    const tecnicos = snapshot.docs.map(doc => doc.data());
    console.log("Técnicos:", tecnicos);
    alert(`📋 ${tecnicos.length} técnicos encontrados. Revisa la consola para detalles.`);
};

window.verClientes = async () => {
    const coleccion = "clientes";
    const snapshot = await getDocs(collection(db, coleccion));
    const clientes = snapshot.docs.map(doc => doc.data());
    console.log("Clientes:", clientes);
    alert(`👥 ${clientes.length} clientes encontrados. Revisa la consola para detalles.`);
};

window.verServicios = () => {
    alert("🛠 Función de servicios pendiente de implementar.");
};

// ===== Función de carga inicial =====
async function cargarTecnicos() {
    // Aquí puedes implementar lógica adicional para sincronizar datos de técnicos
}

async function cargarClientes() {
    // Aquí puedes implementar lógica adicional para sincronizar datos de clientes
}
