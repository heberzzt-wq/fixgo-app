import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./firebase-service-account.json');

const app = initializeApp({
  credential: cert(serviceAccount)
});

export const db = getFirestore(app);

// AQUÍ ESTÁ EL TRADUCTOR (El adaptador)
export const addDoc = (collectionRef, data) => collectionRef.add(data);
export const updateDoc = (docRef, data) => docRef.update(data);
export const getDoc = (docRef) => docRef.get();
export const deleteDoc = (docRef) => docRef.delete();
export const getDocs = (query) => query.get();