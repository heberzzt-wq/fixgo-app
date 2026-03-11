/**
 * ======================================================
 * FIXGO CORE - GESTIAPREMIUM v5.18 (TRAFFIC CONTROL)
 * ======================================================
 * Integración: B2B SaaS + Marketplace + App Check
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

// 1. Configuración de credenciales (Mantenemos tus llaves originales)
const firebaseConfig = {
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0", 
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.firebasestorage.app",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
};

// 2. Inicialización de servicios
const firebaseApp = initializeApp(firebaseConfig);

// MODO DEBUG para App Check
self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

const appCheck = initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider('6LcEZG4sAAAAAKQQ60dgYGVzXO-Q-ZPPMB9gKNkh'),
    isTokenAutoRefreshEnabled: true 
});

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

/**
 * 🔥 ENRUTADOR DE TRÁFICO INTELIGENTE (B2B vs MARKETPLACE)
 * Esta función decide a qué página mandar al usuario apenas entra.
 */
export function verificarYRedireccionar(user) {
    if (!user) return;
    if (typeof window === "undefined") return; 

    const role = user.rol;
    const subType = user.sub_type || 'marketplace'; 
    const path = window.location.pathname;

    console.log(`🚦 Enrutador: Rol=${role}, Tipo=${subType}, Path=${path}`);

    if (role === 'tecnico') {
        if (subType === 'saas') {
            if (!path.includes('tecnico-b2b.html')) window.location.href = 'tecnico-b2b.html';
        } else {
            if (!path.includes('panel-tecnico.html')) window.location.href = 'panel-tecnico.html';
        }
    } else if (role === 'cliente' || role === 'client') {
        if (subType === 'saas') {
            if (!path.includes('dashboard-b2b.html')) window.location.href = 'dashboard-b2b.html';
        } else {
            // Marketplace Residencial
            if (!path.includes('index.html') && !path.includes('dashboard-client.html') && path !== '/') {
                window.location.href = 'index.html';
            }
        }
    }
}

/**
 * 🧠 OBSERVADOR DE SESIÓN INTELIGENTE
 * Verifica quién eres y te inyecta en el enrutador automáticamente.
 */
export function observarAuth(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            callback(null);
            return;
        }

        try {
            // Busqueda en cascada (Users -> Tecnicos -> Clientes -> Admins)
            let snap = await getDoc(doc(db, "users", user.uid));
            if (!snap.exists()) snap = await getDoc(doc(db, "tecnicos", user.uid));
            if (!snap.exists()) snap = await getDoc(doc(db, "clientes", user.uid));
            if (!snap.exists()) snap = await getDoc(doc(db, "admins", user.uid));

            if (snap.exists()) {
                const data = snap.data();
                const finalUser = { ...user, ...data };
                
                // 🚀 REDIRECCIÓN AUTOMÁTICA SEGÚN ROL Y TIPO
                verificarYRedireccionar(finalUser);
                
                callback(finalUser);
            } else {
                console.warn("Usuario sin perfil en DB.");
                callback(user); 
            }
        } catch (e) {
            console.error("Error en observarAuth:", e);
            callback(user);
        }
    });
}

/**
 * 📝 REGISTRO BLINDADO v5.18
 * Soporta registro con sub_type para diferenciar B2B de Marketplace.
 */
export async function registrarUsuario(email, password, rol, nombre, subType = 'marketplace') {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;
        
        const perfil = {
            uid: uid,
            email: email,
            rol: rol,
            sub_type: subType, // 'saas' o 'marketplace'
            nombre: nombre || "Usuario Nuevo",
            creadoEn: serverTimestamp()
        };

        await setDoc(doc(db, "users", uid), perfil);

        // Copia de respaldo según rol
        if (rol === 'tecnico') {
            await setDoc(doc(db, "tecnicos", uid), { ...perfil, disponible: false });
        } else {
            await setDoc(doc(db, "clientes", uid), { ...perfil, pedidos: 0 });
        }

        await updateProfile(cred.user, { displayName: nombre });
        return cred.user;
    } catch (error) {
        throw error;
    }
}

// 📦 EXPORTACIÓN MAESTRA
export {
    auth, db, storage, appCheck,
    signOut, signInWithEmailAndPassword, onAuthStateChanged,
    doc, setDoc, updateDoc, getDoc, collection, onSnapshot,
    query, where, addDoc, orderBy, serverTimestamp, limit, deleteDoc
};
