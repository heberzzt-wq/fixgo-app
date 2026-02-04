// firebase.js - Módulo Centralizado de FixGo

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    GoogleAuthProvider, 
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
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
    limit, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Configuración de Firebase
const firebasejs = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k",
    authDomain: "fixgo-f1665.firebaseapp.com",
    projectId: "fixgo-f1665",
    storageBucket: "fixgo-f1665.appspot.com",
    messagingSenderId: "36531388043",
    appId: "1:36531388043:web:573f00199f7d4668744093"
};

// Inicializar Firebase
const app = initializeApp(firebase.js);

// Inicializar servicios de Firebase
const auth = getAuth(app);
const db = getFirestore(app);
GoogleAuthProvider();

// Exportar funciones y servicios centrales
export { 
    auth, 
    db, 
    googleAuthProvider, 
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
