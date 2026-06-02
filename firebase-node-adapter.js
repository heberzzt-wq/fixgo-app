import { db } from './firebase-node-adapter.js';
import { FieldValue } from 'firebase-admin/firestore';

export const collection = (path) => db.collection(path);
export const doc = (path, id) => id ? db.doc(`${path}/${id}`) : db.doc(path);
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