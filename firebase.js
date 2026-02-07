/**
 * ======================================================
 * FIXGO CORE - FIREBASE CONFIGURATION v4.0 (BUSCADOR TOTAL)
 * Solución: Busca el perfil en TODAS las colecciones
 * ======================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { 
    getFirestore, 
    doc, 
    setDoc, 
    updateDoc, 
    getDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0", // Tu API Key desbloqueada
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

/**
 * OBSERVADOR DE SESIÓN INTELIGENTE
 * Busca tu rol debajo de las piedras si es necesario.
 */
function observarAuth(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            callback(null);
            return;
        }

        try {
            // ESTRATEGIA DE BÚSQUEDA EN CASCADA
            // 1. Buscamos en la colección central 'usuarios'
            let snap = await getDoc(doc(db, "usuarios", user.uid));
            
            // 2. Si no está, buscamos en 'tecnicos'
            if (!snap.exists()) {
                console.log("Buscando en técnicos...");
                snap = await getDoc(doc(db, "tecnicos", user.uid));
            }

            // 3. Si no está, buscamos en 'clientes'
            if (!snap.exists()) {
                console.log("Buscando en clientes...");
                snap = await getDoc(doc(db, "clientes", user.uid));
            }

            // 4. Si no está, buscamos en 'admins'
            if (!snap.exists()) {
                console.log("Buscando en admins...");
                snap = await getDoc(doc(db, "admins", user.uid));
            }

            if (snap.exists()) {
                // ¡LO ENCONTRAMOS! Combinamos datos
                const data = snap.data();
                const finalUser = { ...user, ...data };
                console.log("✅ Usuario identificado como:", finalUser.rol);
                callback(finalUser);
            } else {
                console.warn("⚠️ Usuario sin perfil en DB.");
                callback(user); 
            }

        } catch (e) {
            console.error("Error recuperando perfil:", e);
            callback(user);
        }
    });
}

/**
 * REGISTRO BLINDADO
 */
async function registrarUsuario(email, password, rol, nombre) {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;
        
        const perfil = {
            uid: uid,
            email: email,
            rol: rol,
            nombre: nombre || "Usuario Nuevo",
            creadoEn: serverTimestamp()
        };

        await setDoc(doc(db, "usuarios", uid), perfil);

        if (rol === 'tecnico') {
            await setDoc(doc(db, "tecnicos", uid), { ...perfil, disponible: false });
        } else {
            await setDoc(doc(db, "clientes", uid), { ...perfil, pedidos: 0 });
        }

        await updateProfile(cred.user, { displayName: nombre });
        return cred.user;
    } catch (error) {
        console.error("Error registro:", error);
        throw error;
    }
}

export {
    auth, db,
    observarAuth,
    registrarUsuario,
    signOut,
    signInWithEmailAndPassword,
    doc, setDoc, updateDoc, getDoc, serverTimestamp
};
