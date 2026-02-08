import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, getDoc, collection, onSnapshot, query, where, addDoc, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TU NUEVA API KEY (Asegúrate de haber hecho el PASO 1 en la consola)
const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k", 
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// === FUNCIÓN CRÍTICA DE SESIÓN ===
// Esta función revisa si existes en 'usuarios', 'tecnicos' o 'clientes'
function observarAuth(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            let data = null;
            const colecciones = ["usuarios", "tecnicos", "clientes", "admins"];
            
            // Buscamos tu rol en todas las colecciones posibles
            for (const col of colecciones) {
                try {
                    const snap = await getDoc(doc(db, col, user.uid));
                    if (snap.exists()) {
                        data = snap.data();
                        break; // ¡Te encontramos! Dejamos de buscar
                    }
                } catch(e) { console.error("Buscando...", e); }
            }
            
            // Devolvemos el usuario con sus datos combinados
            callback({ ...user, ...data });
        } else {
            callback(null); // No hay usuario
        }
    });
}

// === FUNCIÓN DE REGISTRO ===
async function registrarUsuario(email, password, rol, datosExtra) {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;
        
        const perfil = {
            uid, email, rol, 
            creadoEn: serverTimestamp(),
            ...datosExtra
        };

        // Guardar copia maestra
        await setDoc(doc(db, "usuarios", uid), perfil);
        
        // Guardar copia específica según rol
        if(rol === "tecnico") {
            await setDoc(doc(db, "tecnicos", uid), { 
                ...perfil, 
                disponible: false, 
                documentosOK: false,
                terminosAceptados: false 
            });
        } else {
            await setDoc(doc(db, "clientes", uid), { 
                ...perfil,
                terminosAceptados: false
            });
        }
        return cred.user;
    } catch (e) {
        throw e; // Lanzar error para que lo vea el formulario
    }
}

// EXPORTACIÓN FINAL (Sin errores de sintaxis)
export { 
    auth, 
    db, 
    observarAuth, 
    registrarUsuario,
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile, 
    doc, 
    setDoc, 
    updateDoc, 
    getDoc, 
    collection, 
    onSnapshot, 
    query, 
    where, 
    addDoc, 
    orderBy, 
    serverTimestamp 
};
