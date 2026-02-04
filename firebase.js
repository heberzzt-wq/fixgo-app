// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, updateDoc, getDoc, 
    collection, query, where, onSnapshot, orderBy, 
    limit, addDoc, serverTimestamp, 
    getDocs // <--- AGREGA ESTO AQUÍ
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ... (tu config de firebaseConfig) ...

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { 
    auth, db, GoogleAuthProvider, onAuthStateChanged, signOut, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, 
    doc, setDoc, updateDoc, getDoc, collection, query, where, 
    onSnapshot, orderBy, limit, addDoc, serverTimestamp,
    getDocs // <--- Y AGREGA ESTO AQUÍ TAMBIÉN
};
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k",
    authDomain: "fixgo-f1665.firebaseapp.com",
    projectId: "fixgo-f1665",
    storageBucket: "fixgo-f1665.appspot.com",
    messagingSenderId: "36531388043",
    appId: "1:36531388043:web:573f00199f7d4668744093"
};

// Inicializar
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Exportación corregida: Exportamos la CLASE GoogleAuthProvider, no una instancia.
export { 
    auth, 
    db, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInWithPopup, 
    doc, 
    setDoc, 
    updateDoc, 
    getDoc, 
    collection, 
    query, 
    where, 
    onSnapshot, 
    orderBy, 
    limit, 
    addDoc, 
    serverTimestamp 
};
