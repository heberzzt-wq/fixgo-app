import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs'; // Importamos el sistema de archivos para lectura segura

// Leemos la llave directamente desde la ruta absoluta en tu Escritorio
// Esto garantiza que el archivo no necesita vivir dentro del repositorio
const serviceAccountPath = 'C:\\Users\\heber\\Desktop\\firebase-keys\\firebase-service-account.json';
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

const app = initializeApp({
  credential: cert(serviceAccount)
});

export const db = getFirestore(app);

// DICCIONARIO DE COMPATIBILIDAD
export const collection = (db, path) => db.collection(path);
export const doc = (db, path, id) => id ? db.doc(path + '/' + id) : db.doc(path);
export const getDoc = (docRef) => docRef.get();
export const getDocs = (query) => query.get();
export const addDoc = (collectionRef, data) => collectionRef.add(data);
export const updateDoc = (docRef, data) => docRef.update(data);
export const deleteDoc = (docRef) => docRef.delete();

// Usamos importaciones dinámicas para FieldValue dentro de las funciones para mantener la compatibilidad
export const serverTimestamp = () => {
    const { FieldValue } = require('firebase-admin/firestore');
    return FieldValue.serverTimestamp();
};

export const increment = (val) => {
    const { FieldValue } = require('firebase-admin/firestore');
    return FieldValue.increment(val);
};

// Nota: query y where se manejan a través del shim, no es necesario exportarlos aquí.