import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, updateDoc, getDoc, collection, onSnapshot, query, where, addDoc, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0", 
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "1005526685116",
    appId: "1:1005526685116:web:62f1a823ff8761da85c7b9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Función universal de monitoreo de sesión
function observarAuth(callback) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Buscar rol en las colecciones
            let data = null;
            const colecciones = ["usuarios", "tecnicos", "clientes", "admins"];
            
            for (const col of colecciones) {
                const snap = await getDoc(doc(db, col, user.uid));
                if (snap.exists()) {
                    data = snap.data();
                    break;
                }
            }
            callback({ ...user, ...data });
        } else {
            callback(null);
        }
    });
}

export { auth, db, observingAuth: observarAuth, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, doc, setDoc, updateDoc, getDoc, collection, onSnapshot, query, where, addDoc, orderBy, serverTimestamp };
