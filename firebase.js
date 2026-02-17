/**
 * ======================================================
 * FIXGO CORE - FIREBASE CONFIGURATION v5.2 (BLINDADO)
 * ======================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
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

// Configuración de credenciales
const firebaseConfig = {
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0", 
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
};

// Inicialización de servicios
const firebaseApp = initializeApp(firebaseConfig);

// ======================================================
// BLINDAJE 1000% - App Check con reCAPTCHA v3
// ======================================================
const appCheck = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider('TU_CLAVE_PUBLICA_RECAPTCHA_V3'),
    isTokenAutoRefreshEnabled: true // Refresco automático para no interrumpir la sesión
});

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

/**
 * OBSERVADOR DE SESIÓN INTELIGENTE
 * Verifica el estado del usuario y busca su rol en la base de datos.
 */
function observarAuth(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            callback(null);
            return;
        }

        try {
            // 1. Buscamos primero en la colección MAESTRA 'users' (Inglés)
            // Esta es la colección unificada donde deben estar Admins, Clientes y Técnicos.
            let snap = await getDoc(doc(db, "users", user.uid));
            
            // 2. Fallback: Si no está en 'users', buscamos en 'tecnicos'
            if (!snap.exists()) {
                snap = await getDoc(doc(db, "tecnicos", user.uid));
            }

            // 3. Fallback: Si no está, buscamos en 'clientes'
            if (!snap.exists()) {
                snap = await getDoc(doc(db, "clientes", user.uid));
            }

            // 4. Fallback: Si no está, buscamos en 'admins' (legacy)
            if (!snap.exists()) {
                snap = await getDoc(doc(db, "admins", user.uid));
            }

            if (snap.exists()) {
                const data = snap.data();
                // Combinamos la info de Auth con la info encontrada en la Base de Datos
                const finalUser = { ...user, ...data };
                callback(finalUser);
            } else {
                console.warn("Usuario autenticado pero sin perfil en DB (users/tecnicos/clientes).");
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

        // 3. Guardar en la colección MAESTRA 'users' (Inglés)
        await setDoc(doc(db, "users", uid), perfil);

        // 4. Guardar copia en colección específica (Respaldo por seguridad)
        if (rol === 'tecnico') {
            await setDoc(doc(db, "tecnicos", uid), { ...perfil, disponible: false });
        } else {
            await setDoc(doc(db, "clientes", uid), { ...perfil, pedidos: 0 });
        }

        // 5. Actualizar nombre visual en Auth
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
    appCheck,
    observarAuth,
    registrarUsuario,
    signOut,
    signInWithEmailAndPassword,
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
