// firebase.js - Módulo Centralizado FixGo
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    GoogleAuthProvider, 
    signInWithPopup 
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
    limit, 
    addDoc, 
    getDocs, // Aseguramos que getDocs esté aquí para el admin
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k",
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "36531388043",
    appId: "1:36531388043:web:573f00199f7d4668744093"
};

// INICIALIZACIÓN ÚNICA (Línea 36 corregida)
const firebaseApp = initializeApp(firebaseConfig); 
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

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
    getDocs,
    serverTimestamp 
};
