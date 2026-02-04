// firebase.js - Módulo Centralizado de FixGo

// Importar módulos de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    GoogleAuthProvider, // Falta una coma aquí
    signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js"; // Cambié a firebase-auth.js de firebase-app.js porque los métodos de autenticación no están en firebase-app.js.
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
const firebaseConfig = { // Cambié el nombre de firebasejs a firebaseConfig
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k",
    authDomain: "fixgo-f1665.firebaseapp.com",
    projectId: "fixgo-f1665",
    storageBucket: "fixgo-f1665.appspot.com",
    messagingSenderId: "36531388043",
    appId: "1:36531388043:web:573f00199f7d4668744093"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig); // Cambié de firebase.js a firebaseConfig

// Inicializar servicios de Firebase
const auth = getAuth(app);
const db = getFirestore(app);

// Crear una instancia del proveedor de autenticación de Google
const googleProvider = new GoogleAuthProvider(); // Almacenando la instancia del proveedor

// Exportar funciones y servicios centrales
export { 
    auth, 
    db, 
    googleProvider as GoogleAuthProvider, // Cambié la exportación para usar la instancia
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
