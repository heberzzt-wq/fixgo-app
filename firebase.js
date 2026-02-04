// firebase.js - CONFIGURACIÓN CENTRAL FIXGO
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, updateDoc, getDoc, collection, query, 
    where, onSnapshot, orderBy, limit, addDoc, getDocs, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0",
  authDomain: "fixgo-44e4d.firebaseapp.com",
  projectId: "fixgo-44e4d",
  storageBucket: "fixgo-44e4d.appspot.com",
  messagingSenderId: "1005526685116",
  appId: "1:1005526685116:web:62f1a823ff8761da85c7b9",
  measurementId: "G-MXNHXSY9TG"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

export { 
    auth, db, googleProvider, onAuthStateChanged, signOut, 
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, 
    doc, setDoc, updateDoc, getDoc, collection, query, where, 
    onSnapshot, orderBy, limit, addDoc, serverTimestamp, getDocs
};
