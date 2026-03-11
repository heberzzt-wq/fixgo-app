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
    deleteDoc,
    getDocs 
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

// 🛡️ MODO DEBUG INTELIGENTE (Auto-detecta Localhost vs Producción)
// Si estás en un entorno local, activa el modo de depuración de App Check.
// Esto imprimirá el token de depuración en la consola del navegador.
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

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

    // Normalizamos el rol a minúsculas para evitar errores (Admin vs admin)
    const role = (user.rol || user.role || "").toLowerCase(); 
    const subType = user.sub_type || 'marketplace';
    const path = window.location.pathname;

    console.log(`🚦 ENRUTADOR V5.18: Rol=${role}, Tipo=${subType}, Path=${path}`);

    // 1. PRIORIDAD MÁXIMA: Si eres ADMIN, vas al NOC directamente
    if (role === 'admin') {
        if (!path.includes('admin.html')) {
            window.location.href = 'admin.html';
        }
        return; 
    }

    // 2. Lógica para TÉCNICOS
    if (role === 'tecnico') {
        if (subType === 'saas') {
            if (!path.includes('tecnico-b2b.html')) window.location.href = 'tecnico-b2b.html';
        } else {
            if (!path.includes('panel-tecnico.html')) window.location.href = 'panel-tecnico.html';
        }
    } 
    // 3. Lógica para CLIENTES (Jonathan/Jorge)
    else if (role === 'cliente' || role === 'client') {
        if (subType === 'saas') {
            if (!path.includes('dashboard-b2b.html')) window.location.href = 'dashboard-b2b.html';
        } else {
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
            // 1. Buscamos en la colección MAESTRA 'users'
            let snap = await getDoc(doc(db, "users", user.uid));
            
            // ♻️ AUTO-MIGRACIÓN SILENCIOSA (Legacy -> Users)
            if (!snap.exists()) {
                // Si no está en 'users', buscamos en colecciones viejas y migramos
                let legacySnap = await getDoc(doc(db, "tecnicos", user.uid));
                if (!legacySnap.exists()) legacySnap = await getDoc(doc(db, "clientes", user.uid));
                if (!legacySnap.exists()) legacySnap = await getDoc(doc(db, "admins", user.uid));

                if (legacySnap.exists()) {
                    console.log("♻️ Migrando perfil Legacy a estructura V5.18...");
                    const legacyData = legacySnap.data();
                    // Creamos el documento en 'users' con los datos viejos
                    await setDoc(doc(db, "users", user.uid), legacyData, { merge: true });
                    // Refrescamos el snap para usarlo abajo
                    snap = await getDoc(doc(db, "users", user.uid));
                }
            }

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
 * 🔐 VALIDACIÓN DE CLAVE CORPORATIVA (B2B SaaS)
 */
export async function validarClaveB2B(clave) {
    if (!clave) return null;
    try {
        const q = query(collection(db, "b2b_keys"), where("key", "==", clave), limit(1));
        const snap = await getDocs(q);
        if (snap.empty) return null;
        return snap.docs[0].data(); // Retorna { empresa_id: "xyz", nombre: "Empresa", ... }
    } catch (e) {
        console.error("Error validando clave B2B:", e);
        return null;
    }
}

/**
 * 📝 REGISTRO BLINDADO v5.18
 * Soporta registro con sub_type para diferenciar B2B de Marketplace.
 */
export async function registrarUsuario(email, password, rol, nombre, subType = 'marketplace', empresaId = null) {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;
        
        const perfil = {
            uid: uid,
            email: email,
            rol: rol,
            sub_type: subType, // 'saas' o 'marketplace'
            nombre: nombre || "Usuario Nuevo",
            creadoEn: serverTimestamp(),
            empresa_id: empresaId || null // Vinculación B2B
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
    doc, setDoc, updateDoc, getDoc, collection, onSnapshot, getDocs,
    query, where, addDoc, orderBy, serverTimestamp, limit, deleteDoc
};
