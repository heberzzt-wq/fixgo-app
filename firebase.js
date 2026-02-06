// firebase.js
// ===============================
// FIXGO - FIREBASE CORE 2026
// Unico archivo Firebase del sistema
// ===============================

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

// ===============================
// CONFIGURACION REAL FIXGO
// ===============================
const firebaseConfig = {
  apiKey: "AIzaSyCmZRLFPWnJFMYvcYXhwQ-CyNU5rz3z9V0",
  authDomain: "fixgo-44e4d.firebaseapp.com",
  projectId: "fixgo-44e4d",
  storageBucket: "fixgo-44e4d.appspot.com",
  messagingSenderId: "1005526685116",
  appId: "1:1005526685116:web:62f1a823ff8761da85c7b9",
  measurementId: "G-MXNHXSY9TG"
};

// ===============================
// INIT APP
// ===============================
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// ===============================
// AUTH HELPERS
// ===============================

async function registrarUsuario(email, password, rol, extraData = {}) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  await setDoc(doc(db, "usuarios", cred.user.uid), {
    uid: cred.user.uid,
    email,
    rol,                    // cliente | tecnico | admin
    activo: true,
    creado: serverTimestamp(),
    ...extraData
  });

  return cred.user;
}

async function loginUsuario(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}

async function loginGoogle(rol = "cliente") {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      rol,
      activo: true,
      creado: serverTimestamp()
    });
  }

  return user;
}

async function cerrarSesion() {
  await signOut(auth);
}

function observarAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }

    const snap = await getDoc(doc(db, "usuarios", user.uid));
    callback(snap.exists() ? snap.data() : null);
  });
}

// ===============================
// SOLICITUDES (CLIENTE → TECNICO)
// ===============================

async function crearSolicitud(data) {
  return await addDoc(collection(db, "solicitudes"), {
    ...data,
    estado: "pendiente",
    creado: serverTimestamp()
  });
}

function escucharSolicitudesPorTecnico(uidTecnico, callback) {
  const q = query(
    collection(db, "solicitudes"),
    where("tecnicoAsignado", "==", uidTecnico),
    orderBy("creado", "desc"),
    limit(20)
  );

  return onSnapshot(q, (snap) => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(data);
  });
}

async function actualizarEstadoSolicitud(id, estado) {
  await updateDoc(doc(db, "solicitudes", id), {
    estado,
    actualizado: serverTimestamp()
  });
}

// ===============================
// UBICACION (CLIENTE / TECNICO)
// ===============================

async function actualizarUbicacion(uid, tipo, lat, lng) {
  await setDoc(
    doc(db, "ubicaciones", uid),
    {
      uid,
      tipo, // cliente | tecnico
      lat,
      lng,
      actualizado: Date.now()
    },
    { merge: true }
  );
}

// ===============================
// EXPORT UNICO DEL SISTEMA
// ===============================
export {
  // base
  auth,
  db,

  // auth raw
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,

  // helpers fixgo
  registrarUsuario,
  loginUsuario,
  loginGoogle,
  cerrarSesion,
  observarAuth,

  // firestore raw
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
  serverTimestamp,

  // fixgo core
  crearSolicitud,
  escucharSolicitudesPorTecnico,
  actualizarEstadoSolicitud,
  actualizarUbicacion
};
