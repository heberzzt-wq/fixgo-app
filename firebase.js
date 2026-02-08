import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, getDoc, collection, onSnapshot, query, where, addDoc, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ✅ NUEVA API KEY ACTUALIZADA
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

// Función universal de monitoreo de sesión
function observarAuth(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            let data = null;
            // Busca datos extra del usuario en las colecciones
            const colecciones = ["usuarios", "tecnicos", "clientes", "admins"];
            for (const col of colecciones) {
                try {
                    const snap = await getDoc(doc(db, col, user.uid));
                    if (snap.exists()) {
                        data = snap.data();
                        break;
                    }
                } catch(e) { console.log("Buscando perfil..."); }
            }
            callback({ ...user, ...data });
        } else {
            callback(null);
        }
    });
}

// Función de Registro Maestra
async function registrarUsuario(email, password, rol, datosExtra) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    const baseData = {
        uid, email, rol, 
        creadoEn: serverTimestamp(),
        ...datosExtra
    };

    // Guardar en colección maestra y específica
    await setDoc(doc(db, "usuarios", uid), baseData);
    
    if(rol === "tecnico") {
        await setDoc(doc(db, "tecnicos", uid), { ...baseData, disponible: false, documentosOK: false });
    } else {
        await setDoc(doc(db, "clientes", uid), { ...baseData });
    }
    
    return cred.user;
}

// ✅ EXPORTACIÓN CORREGIDA (Sin dos puntos ':')
export { 
    auth, 
    db, 
    observarAuth, // Exportamos directo sin renombrar para evitar líos
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
