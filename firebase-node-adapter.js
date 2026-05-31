import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./config/firebase-service-account.json');

const app = initializeApp({
  credential: cert(serviceAccount)
});

export const db = getFirestore(app);

// AQUÍ ESTÁ EL DICCIONARIO PARA QUE NO TRUENE TU CÓDIGO
export const collection = (db, path) => db.collection(path);
export const doc = (db, path, id) => id ? db.doc(path + '/' + id) : db.doc(path);
export const getDoc = (docRef) => docRef.get();
export const getDocs = (query) => query.get();
export const addDoc = (collectionRef, data) => collectionRef.add(data);
export const updateDoc = (docRef, data) => docRef.update(data);
export const deleteDoc = (docRef) => docRef.delete();
export const serverTimestamp = () => require('firebase-admin/firestore').FieldValue.serverTimestamp();
export const increment = (val) => require('firebase-admin/firestore').FieldValue.increment(val);
// Las funciones query y where son complejas de traducir, así que las importaremos distinto.