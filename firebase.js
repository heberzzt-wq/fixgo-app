/**
 * ======================================================
 * GESTIAPREMIUM 2026 - FIREBASE CONFIGURATION v5.4
 * Arquitectura: COLECCIÓN UNIFICADA (Sin Fallbacks Legacy)
 * ======================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
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
    serverTimestamp,
    limit,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuración de credenciales
const firebaseConfig = {
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0", 
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.firebasestorage.app",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
};

// Inicialización de servicios
const firebaseApp = initializeApp(firebaseConfig);

// ======================================================
// BLINDAJE 1000% - App Check con reCAPTCHA v3
// ======================================================
// self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // Descomentar para localhost

const appCheck = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider('6LcEZG4sAAAAAKQQ60dgYGVzXO-Q-ZPPMB9gKNkh'),
    isTokenAutoRefreshEnabled: true
});

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

/**
 * OBSERVADOR DE SESIÓN INTELIGENTE (OPTIMIZADO V2.0)
 * Consulta ÚNICAMENTE la colección maestra unificada para reducir costos de lectura.
 */
function observarAuth(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            callback(null);
            return;
        }

        try {
            // 🔥 Búsqueda directa y exclusiva en la colección unificada 'users'
            const snap = await getDoc(doc(db, "users", user.uid));
            
            if (snap.exists()) {
                const data = snap.data();
                const finalUser = { ...user, ...data };
                callback(finalUser);
            } else {
                console.warn("⚠️ Usuario autenticado pero sin perfil en la DB maestra 'users'.");
                callback(user); 
            }
        } catch (e) {
            console.error("❌ Error recuperando perfil unificado:", e);
            callback(user);
        }
    });
}

/**
 * REGISTRO BLINDADO (SINGLE SOURCE OF TRUTH)
 * Crea el usuario en Auth y guarda sus datos en la colección 'users'.
 */
async function registrarUsuario(email, password, rol, nombre) {
    try {
        // 1. Crear usuario en Firebase Authentication
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;
        
        // 2. Preparar el objeto de perfil
        const perfil = {
            uid: uid,
            email: email,
            rol: rol,
            nombre: nombre || "Usuario Nuevo",
            creadoEn: serverTimestamp()
        };

        // 3. Guardado ÚNICO en la colección MAESTRA 'users'
        // Se eliminaron las escrituras redundantes a colecciones legacy para ahorrar costos y evitar fragmentación
        await setDoc(doc(db, "users", uid), perfil);

        // 4. Actualizar nombre visual en Auth
        await updateProfile(cred.user, { displayName: nombre });
        
        return cred.user;
    } catch (error) {
        throw error;
    }
}

// EXPORTACIÓN DE FUNCIONES Y VARIABLES
export {
    auth, 
    db,
    storage, 
    appCheck,
    observarAuth,
    registrarUsuario,
    signOut,
    signInWithEmailAndPassword,
    onAuthStateChanged, 
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
    serverTimestamp,
    limit,
    deleteDoc 
};
