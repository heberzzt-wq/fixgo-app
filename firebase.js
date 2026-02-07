/**
 * ======================================================
 * FIXGO CORE - FIREBASE CONFIGURATION v3.0 (BLINDADO)
 * Solución: Registro Atómico (Evita que "bote" al usuario)
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
    signInWithPopup,
    updateProfile 
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
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0", // Tu API Key correcta
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9",
    measurementId: "G-MXNHXSY9TG"
};

// Inicialización
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

/**
 * OBSERVADOR DE SESIÓN (MODIFICADO)
 * Carga el perfil completo antes de confirmar la sesión
 */
function observarAuth(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            callback(null);
            return;
        }

        // Determinar colección basada en rol (si lo sabemos, si no buscamos en ambas)
        // Por defecto, buscamos en 'usuarios' que es el índice central
        try {
            const userRef = doc(db, "usuarios", user.uid);
            const snap = await getDoc(userRef);

            if (snap.exists()) {
                // Fusionamos datos de Auth con datos de Firestore
                const fullUser = { ...user, ...snap.data() };
                callback(fullUser);
            } else {
                // Si no hay perfil, devolvemos el usuario básico para que app-tecnico lo repare
                callback(user); 
            }
        } catch (e) {
            console.error("Error Auth:", e);
            callback(user);
        }
    });
}

/**
 * REGISTRO UNIVERSAL (LA SOLUCIÓN AL "REBOTE")
 * Escribe en múltiples colecciones para asegurar que el perfil exista
 */
async function registrarUsuario(email, password, rol, datosExtra = {}) {
    try {
        // 1. Crear usuario en Auth
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;

        // 2. Preparar datos del perfil
        const perfilBase = {
            uid: uid,
            email: email,
            rol: rol, // 'cliente' | 'tecnico'
            nombre: datosExtra.nombre || "Usuario Nuevo",
            creadoEn: serverTimestamp(),
            validado: false
        };

        // 3. Escribir en colección CENTRAL 'usuarios' (Indispensable)
        await setDoc(doc(db, "usuarios", uid), perfilBase);

        // 4. Escribir en colección ESPECÍFICA según el rol
        if (rol === 'tecnico') {
            await setDoc(doc(db, "tecnicos", uid), {
                ...perfilBase,
                nivel: "Bronce",
                disponible: false,
                wallet: 0
            });
        } else if (rol === 'cliente') {
            await setDoc(doc(db, "clientes", uid), {
                ...perfilBase,
                direccion: "",
                pedidos: 0
            });
        }

        // 5. Actualizar DisplayName en Auth (Para que se vea bonito rápido)
        await updateProfile(cred.user, {
            displayName: datosExtra.nombre || "Usuario"
        });

        return cred.user;

    } catch (error) {
        console.error("Error en Registro:", error);
        throw error;
    }
}

// Exportación
export {
    auth, db,
    observarAuth,
    registrarUsuario, // <--- Esta es la función clave
    signOut,
    signInWithEmailAndPassword,
    doc, setDoc, updateDoc, getDoc, collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp
};
