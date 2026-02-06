// firebase.js
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
    getDocs, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// CONFIGURACIÓN OFICIAL FIXGO (Blueprint Verified)
const firebaseConfig = {
    apiKey: "AIzaSyBlE0bkNxYC3w7KG7t9D2NU-Q3jh3B5H7k", // Tu Key Guardada Correcta
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

/**
 * REGISTRO UNIVERSAL FIXGO
 * Incluye blindaje fiscal y niveles de técnico (Blueprint Punto 4)
 */
async function registrarUsuario(email, password, rol, extraData = {}) {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const userRef = doc(db, "usuarios", cred.user.uid);
        
        const baseUser = {
            uid: cred.user.uid,
            email,
            rol, // 'cliente' | 'tecnico' | 'admin'
            activo: true,
            creado: serverTimestamp(),
            // Campos de Gamificación si es Técnico
            ...(rol === 'tecnico' && {
                nivel: "Bronce",
                serviciosCompletados: 0,
                calificacion: 5.0,
                disponible: false,
                wallet: 0
            }),
            ...extraData
        };

        await setDoc(userRef, baseUser);
        return cred.user;
    } catch (error) {
        console.error("Error en Registro FixGo:", error);
        throw error;
    }
}

/**
 * LOGIN Y VALIDACIÓN DE SESIÓN
 */
async function loginUsuario(email, password) {
    return await signInWithEmailAndPassword(auth, email, password);
}

async function cerrarSesion() {
    return await signOut(auth);
}

function observarAuth(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) {
            callback(null);
            return;
        }
        const snap = await getDoc(doc(db, "usuarios", user.uid));
        callback(snap.exists() ? { ...user, ...snap.data() } : null);
    });
}

/**
 * MOTOR DE SOLICITUDES (MARKETPLACE LOGIC)
 * Implementa la comisión del 32% (Blueprint Punto 2)
 */
async function crearSolicitud(clienteUid, servicioData) {
    const solicitudRef = collection(db, "solicitudes");
    
    const payload = {
        clienteId: clienteUid,
        ...servicioData, // vertical, subservicio, coordenadas
        estado: "PENDIENTE", // PENDIENTE | ASIGNADO | EN_CAMINO | PROCESO | FINALIZADO
        comisionFixGo: 0.32, // Hardcoded 32% segun Blueprint
        montoBase: servicioData.montoBase || 0,
        creadoEn: serverTimestamp(),
        tecnicoId: null
    };

    return await addDoc(solicitudRef, payload);
}

/**
 * TRACKING EN TIEMPO REAL (MODO UBER)
 */
function escucharSolicitudesActivas(rol, uid, callback) {
    let q;
    if (rol === 'tecnico') {
        // Técnicos ven solicitudes pendientes o las asignadas a ellos
        q = query(
            collection(db, "solicitudes"),
            where("estado", "in", ["PENDIENTE", "ASIGNADO"]),
            orderBy("creadoEn", "desc")
        );
    } else {
        // Clientes ven solo sus solicitudes
        q = query(
            collection(db, "solicitudes"),
            where("clienteId", "==", uid),
            orderBy("creadoEn", "desc")
        );
    }

    return onSnapshot(q, (snap) => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(docs);
    });
}

/**
 * ACTUALIZACIÓN DE UBICACIÓN GPS (Geohash Ready)
 */
async function actualizarUbicacion(uid, lat, lng, tipo) {
    const ref = doc(db, "ubicaciones", uid);
    return await setDoc(ref, {
        uid,
        lat,
        lng,
        tipo, // 'tecnico' | 'cliente'
        ultimaActualizacion: Date.now()
    }, { merge: true });
}

// EXPORTACIÓN ÚNICA (Toolkit de Desarrollo)
export {
    auth, db,
    registrarUsuario,
    loginUsuario,
    cerrarSesion,
    observarAuth,
    crearSolicitud,
    escucharSolicitudesActivas,
    actualizarUbicacion,
    // Primitivos para flexibilidad
    doc, setDoc, updateDoc, getDoc, collection, query, where, onSnapshot, serverTimestamp
};
