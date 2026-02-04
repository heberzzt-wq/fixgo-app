import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k", // Asegúrate que esta sea la de fixgo-44e4d
    authDomain: "fixgo-44e4d.firebaseapp.com",
    projectId: "fixgo-44e4d",
    storageBucket: "fixgo-44e4d.appspot.com",
    messagingSenderId: "36531388043", // Revisa este dato en tu consola
    appId: "1:36531388043:web:573f00199f7d4668744093" // Revisa este dato en tu consola
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { GoogleAuthProvider, doc, onSnapshot, collection, query, where };
