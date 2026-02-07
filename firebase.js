/**
 * ======================================================
 * FIXGO CORE - FIREBASE CONFIGURATION v5.1 (Fixed)
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
    collection, 
    onSnapshot, 
    query, 
    where, 
    addDoc, 
    orderBy, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0", 
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
 * OBSERVADOR DE SESIÓN ROBUSTO
 */
function observarAuth(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            callback(null);
            return;
        }
        try {
            // Buscamos primero en la colección maestra 'usuarios'
            let snap = await getDoc(doc(db, "usuarios", user.uid));
            
            // Si no está ahí (caso raro), buscamos en específicos
            if (!snap.exists()) snap = await getDoc(doc(db, "tecnicos", user.uid));
            if (!snap.exists()) snap = await getDoc(doc(db, "clientes", user.uid));

            if (snap.exists()) {
                const data = snap.data();
                const finalUser = { ...user, ...data };
                callback(finalUser);
            } else {
                // Usuario existe en Auth pero no en BD (Registro incompleto)
                callback(user); 
            }
        } catch (e) {
            console.error("Error recuperando perfil:", e);
            callback(user);
        }
    });
}

/**
 * REGISTRO UNIFICADO (Soporta datos extra)
 */
async function registrarUsuario(email, password, rol, datosExtra = {}) {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;
        
        // Objeto base
        const perfilBase = {
            uid: uid,
            email: email,
            rol: rol,
            creadoEn: serverTimestamp(),
            ...datosExtra // Aquí fusionamos nombre, telefono, etc.
        };

        // 1. Guardar en colección maestra 'usuarios'
        await setDoc(doc(db, "usuarios", uid), perfilBase);

        // 2. Guardar en colección específica para búsquedas rápidas
        if (rol === 'tecnico') {
            await setDoc(doc(db, "tecnicos", uid), { 
                ...perfilBase, 
                disponible: false,
                nivel: "Bronce",
                wallet: 0,
                estado: "offline"
            });
        } else {
            await setDoc(doc(db, "clientes", uid), { 
                ...perfilBase, 
                pedidos: 0 
            });
        }

        // Actualizar perfil interno de Auth
        if (datosExtra.nombre) {
            await updateProfile(cred.user, { displayName: datosExtra.nombre });
        }
        
        return cred.user;
    } catch (error) {
        throw error;
    }
}

export {
    auth, db,
    observarAuth,
    registrarUsuario,
    signOut,
    signInWithEmailAndPassword,
    doc, setDoc, updateDoc, getDoc, 
    collection, onSnapshot, query, where, addDoc, orderBy, 
    serverTimestamp
};
