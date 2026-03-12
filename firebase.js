/**
 * ======================================================
 * FIXGO CORE - GESTIAPREMIUM v5.18 (TRAFFIC CONTROL)
 * ======================================================
 * Integración: B2B SaaS + Marketplace + App Check
 * REPARACIÓN: Anti-Bucle de Redirección + Admin Bypass
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

// 1. Configuración de credenciales (Llaves Originales)
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

// 🛡️ MODO DEBUG INTELIGENTE
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
 * Optimizado para prevenir bucles de redirección.
 */
export function verificarYRedireccionar(user) {
    if (!user || typeof window === "undefined") return;

    const path = window.location.pathname;
    // FIX: Extraemos la página limpia sin parámetros (?v=1) ni hashes (#)
    const currentPage = path.split('/').pop().split('?')[0].split('#')[0] || 'index.html';

    // Normalización de roles y tipos
    let role = (user.rol || user.role || "").toLowerCase();
    const subType = (user.sub_type || user.subtype || 'marketplace').toLowerCase();

    // ⚡ PARCHE DE IDENTIDAD ADMIN (Bypass Maestro)
    if (user.email && user.email.toLowerCase() === "hebertoh-m@hotmail.com") {
        role = "admin";
    }

    console.log(`🚦 ENRUTADOR V5.18 REPARADO: Rol='${role}', Tipo='${subType}', Path='${currentPage}'`);

    // PRIORIDAD 1: ADMIN
    if (role === 'admin') {
        if (currentPage !== 'admin.html') {
            console.log("🛡️ Acceso Admin Detectado -> Redirigiendo a Panel Maestro");
            window.location.href = 'admin.html';
        }
        return;
    }

    // PRIORIDAD 2: TÉCNICOS
    if (role === 'tecnico') {
        const targetTecnico = (subType === 'saas') ? 'tecnico-b2b.html' : 'tecnico.html';
        if (currentPage !== targetTecnico) {
            window.location.href = targetTecnico;
        }
        return;
    }

    // PRIORIDAD 3: CLIENTES
    if (role === 'cliente' || role === 'client') {
        if (subType === 'saas') {
            if (currentPage !== 'dashboard-b2b.html') { 
                window.location.href = 'cliente.html';
            }
        } else { // Marketplace
            // Si el usuario ya está logueado como cliente, evitamos que esté en login.html
            // Pero permitimos que navegue en index o dashboard-client
            const forbiddenPages = ['login.html', 'registro.html'];
            if (forbiddenPages.includes(currentPage)) {
                window.location.href = 'cliente.html';
            }
        }
        return;
    }
}

/**
 * 🧠 OBSERVADOR DE SESIÓN INTELIGENTE
 * Inyecta datos de Firestore y valida el Bypass de Admin.
 */
export function observarAuth(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            callback(null);
            return;
        }

        try {
            // 1. Consulta Maestra a 'users'
            let snap = await getDoc(doc(db, "users", user.uid));
            
            // ♻️ AUTO-MIGRACIÓN SILENCIOSA
            if (!snap.exists()) {
                let legacySnap = await getDoc(doc(db, "tecnicos", user.uid));
                if (!legacySnap.exists()) legacySnap = await getDoc(doc(db, "clientes", user.uid));
                if (!legacySnap.exists()) legacySnap = await getDoc(doc(db, "admins", user.uid));

                if (legacySnap.exists()) {
                    console.log("♻️ Migrando perfil Legacy...");
                    await setDoc(doc(db, "users", user.uid), legacySnap.data(), { merge: true });
                    snap = await getDoc(doc(db, "users", user.uid));
                }
            }

            if (snap.exists()) {
                const data = snap.data();
                // Merge de datos: Prioridad a Firestore sobre el objeto Auth básico
                const finalUser = { ...user, ...data };
                
                // ✅ VALIDACIÓN FINAL DE ADMIN ANTES DEL ENRUTADO
                if (finalUser.email && finalUser.email.toLowerCase() === "hebertoh-m@hotmail.com") {
                    finalUser.rol = "admin";
                }

                console.log("💎 Perfil Identificado:", finalUser.rol);
                
                // 🚀 LANZAMIENTO DEL ENRUTADOR
                verificarYRedireccionar(finalUser);
                
                callback(finalUser);
            } else {
                console.warn("⚠️ Usuario autenticado sin documento en Firestore.");
                callback(user); 
            }
        } catch (e) {
            console.error("❌ Error Crítico en observarAuth:", e);
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
        return snap.docs[0].data();
    } catch (e) {
        console.error("Error validando clave B2B:", e);
        return null;
    }
}

/**
 * 📝 REGISTRO BLINDADO v5.18
 */
export async function registrarUsuario(email, password, rol, nombre, subType = 'marketplace', empresaId = null) {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;
        
        const perfil = {
            uid: uid,
            email: email.toLowerCase(),
            rol: rol,
            sub_type: subType,
            nombre: nombre || "Usuario Nuevo",
            creadoEn: serverTimestamp(),
            empresa_id: empresaId || null
        };

        await setDoc(doc(db, "users", uid), perfil);

        // Réplicas de seguridad legacy
        if (rol === 'tecnico') {
            await setDoc(doc(db, "tecnicos", uid), { ...perfil, disponible: false });
        } else {
            await setDoc(doc(db, "clientes", uid), { ...perfil, pedidos: 0 });
        }

        await updateProfile(cred.user, { displayName: nombre });
        return cred.user;
    } catch (error) {
        console.error("Error en Registro:", error);
        throw error;
    }
}

// 📦 EXPORTACIÓN MAESTRA (Consistencia de V5.18)
export {
    auth, db, storage, appCheck,
    signOut, signInWithEmailAndPassword, onAuthStateChanged,
    doc, setDoc, updateDoc, getDoc, collection, onSnapshot, getDocs,
    query, where, addDoc, orderBy, serverTimestamp, limit, deleteDoc
};
