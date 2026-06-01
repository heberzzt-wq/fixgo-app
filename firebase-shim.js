import { db } from './firebase-node-adapter.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Convierte cualquier valor a segmento seguro de path.
 */
const toPathString = (val) => {

    if (typeof val === 'string')
        return val;

    if (val && typeof val === 'object') {

        return (
            val.id ||
            val.operation_id ||
            val.tenantId ||
            val.uid ||
            ''
        );
    }

    return String(val || '');
};

/* =====================================================
   COLLECTION SHIM
   Soporta:
   collection("users")
   collection(db,"users")
   collection(db,"tenants",tenantId,"tasks")
===================================================== */

export const collection = (...segments) => {

    if (!segments.length)
        throw new Error('collection(): path requerido');

    // Ignora db si viene como primer parámetro
    if (
        segments[0] &&
        typeof segments[0] === 'object' &&
        typeof segments[0].collection === 'function'
    ) {
        segments.shift();
    }

    const path = segments
        .map(toPathString)
        .filter(Boolean)
        .join('/');

    return db.collection(path);
};

/* =====================================================
   DOC SHIM
   Soporta:
   doc("users", uid)
   doc(db,"users",uid)
   doc(db,"tenants",tenantId,"tasks",taskId)
===================================================== */

export const doc = (...segments) => {

    if (!segments.length)
        throw new Error('doc(): path requerido');

    // Ignora db si viene como primer parámetro
    if (
        segments[0] &&
        typeof segments[0] === 'object' &&
        typeof segments[0].doc === 'function'
    ) {
        segments.shift();
    }

    const path = segments
        .map(toPathString)
        .filter(Boolean)
        .join('/');

    return db.doc(path);
};

/* =====================================================
   FIRESTORE HELPERS
===================================================== */

export const addDoc = (colRef, data) =>
    colRef.add(data);

export const updateDoc = (docRef, data) =>
    docRef.update(data);

export const getDoc = (docRef) =>
    docRef.get();

export const getDocs = (queryRef) =>
    queryRef.get();

export const runTransaction = (updateFn) =>
    db.runTransaction(updateFn);

export const writeBatch = () =>
    db.batch();

export const serverTimestamp = () =>
    FieldValue.serverTimestamp();

export const increment = (val) =>
    FieldValue.increment(val);

/* =====================================================
   QUERY COMPAT
===================================================== */

export const query = (colRef, ...constraints) => {

    let q = colRef;

    constraints.forEach(c => {
        q = q.where(
            c.field,
            c.op,
            c.value
        );
    });

    return q;
};

export const where = (field, op, value) => ({
    field,
    op,
    value
});

export const doc = (...segments) => {

    console.log(
        "🔥 DOC CALL:",
        JSON.stringify(segments, null, 2)
    );

    if (
        segments[0] &&
        typeof segments[0] === "object" &&
        typeof segments[0].doc === "function"
    ) {
        segments.shift();
    }

    const cleanSegments = segments
        .map(toPathString);

    console.log(
        "🔥 CLEAN SEGMENTS:",
        cleanSegments
    );

    const path = cleanSegments
        .filter(Boolean)
        .join("/");

    console.log(
        "🔥 FINAL PATH:",
        path
    );

    return db.doc(path);
};