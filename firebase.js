/**
 * ======================================================
 * FIXGO CORE - FIREBASE CONFIGURATION v5.1 (CORREGIDO USERS)
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
 * OBSERVADOR DE SESIÓN INTELIGENTE
 */
function observarAuth(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            callback(null);
            return;
        }

        try {
            // CORRECCIÓN AQUÍ: Cambiamos 'usuarios' por 'users' para coincidir con tu DB real
            // 1. Buscamos en la colección MAESTRA 'users'
            let snap = await getDoc(doc(db, "users", user.uid));
            
            // 2. Si no está ahí (raro), buscamos en 'tecnicos'
            if (!snap.exists()) snap = await getDoc(doc(db, "tecnicos", user.uid));

            // 3. Si no está, buscamos en 'clientes'
            if (!snap.exists()) snap = await getDoc(doc(db, "clientes", user.uid));

            // 4. Si no está, buscamos en 'admins'
            if (!snap.exists()) snap = await getDoc(doc(db, "admins", user.uid));

            if (snap.exists()) {
                const data = snap.data();
                // Combinamos la info de Auth con la info de la Base de Datos
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

        // CORRECCIÓN AQUÍ TAMBIÉN: Guardamos en 'users' para mantener consistencia
        await setDoc(doc(db, "users", uid), perfil);

        // Además creamos el documento específico de rol
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

// EXPORTAMOS TODO
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
