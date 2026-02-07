/**
 * ======================================================
 * FIXGO CORE - FIREBASE CONFIGURATION v2.0
 * Blueprint Verified: 2026-02-06
 * ======================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    GoogleAuthProvider, 
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { 
    getFirestore, 
    doc, 
    setDoc, 
    updateDoc, 
    getDoc, 
    collection, 
    query, 
    where, 
    onSnapshot, 
    orderBy, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0",
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9",
    measurementId: "G-MXNHXSY9TG"
};

// Inicialización de Servicios
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

/**
 * OBSERVADOR DE SESIÓN (MODIFICADO PARA FIXGO)
 * Corrige el error de sincronización de perfiles
 */
function observarAuth(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            console.log("FixGo Auth: Sin sesión activa.");
            callback(null);
            return;
        }

        try {
            // Buscamos el perfil extendido en la colección 'usuarios'
            const userRef = doc(db, "usuarios", user.uid);
            const snap = await getDoc(userRef);

            if (snap.exists()) {
                const fullUserData = { ...user, ...snap.data() };
                console.log("FixGo Auth: Perfil cargado para", fullUserData.rol);
                callback(fullUserData);
            } else {
                console.warn("FixGo Auth: UID existe pero no tiene documento en Firestore.");
                callback(user); // Retornamos el user básico para permitir registro de perfil
            }
        } catch (error) {
            console.error("FixGo Auth Error:", error);
            callback(null);
        }
    });
}

/**
 * MOTOR DE REGISTRO UNIVERSAL
 * Crea la cuenta en Auth y el perfil en Firestore de un solo golpe
 */
async function registrarUsuario(email, password, rol, datosExtra = {}) {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const userRef = doc(db, "usuarios", cred.user.uid);
        
        const perfilPerfilado = {
            uid: cred.user.uid,
            email: email,
            rol: rol, // 'cliente' | 'tecnico'
            validado: false,
            creadoEn: serverTimestamp(),
            actualizadoEn: serverTimestamp(),
            ...datosExtra,
            ...(rol === 'tecnico' && {
                nivel: "Bronce",
                wallet: 0,
                disponible: false,
                servicios: 0
            })
        };

        await setDoc(userRef, perfilPerfilado);
        return cred.user;
    } catch (error) {
        console.error("Error en Registro FixGo:", error.message);
        throw error;
    }
}

// Exportación de módulos y funciones
export {
    auth, db,
    observarAuth,
    registrarUsuario,
    signOut,
    signInWithEmailAndPassword,
    doc, setDoc, updateDoc, getDoc, collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp
};
