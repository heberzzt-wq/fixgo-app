import { db } from './firebase-node-adapter.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Utilidad interna para asegurar que los IDs y paths sean strings planos.
 */
const toPathString = (val) => {
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object') {
        return val.id || val.operation_id || val.tenantId || val.uid || String(val);
    }
    return String(val || "");
};

// Colecciones: Asegura que el path sea siempre un string
export const collection = (path) => db.collection(toPathString(path));

// Documentos: Sanitiza tanto el path como el ID antes de la construcción
export const doc = (path, id) => {
    const safePath = toPathString(path);
    if (!id) return db.doc(safePath);
    
    const safeId = toPathString(id);
    return db.doc(`${safePath}/${safeId}`);
};

export const addDoc = (colRef, data) => colRef.add(data);
export const updateDoc = (docRef, data) => docRef.update(data);
export const getDoc = (docRef) => docRef.get();
export const getDocs = (queryRef) => queryRef.get();
export const runTransaction = (updateFn) => db.runTransaction(updateFn);
export const writeBatch = () => db.batch();
export const serverTimestamp = () => FieldValue.serverTimestamp();
export const increment = (val) => FieldValue.increment(val);

export const query = (colRef, ...constraints) => {
    let q = colRef;
    constraints.forEach(c => q = q.where(c.field, c.op, c.value));
    return q;
};

export const where = (field, op, value) => ({ field, op, value });