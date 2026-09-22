import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);
test('KYC actual emulator objects, partial upload, concurrent approval, generation replacement', { skip: !enabled }, async () => {
    // Network calls are impossible unless BOTH emulator destinations were explicitly supplied.
    for (const value of [process.env.FIRESTORE_EMULATOR_HOST, process.env.FIREBASE_STORAGE_EMULATOR_HOST]) assert.match(value, /^(127\.0\.0\.1|localhost):\d+$/);
    const admin = require('firebase-admin');
    const { createApproveTechnicianHandler, createReturnTechnicianHandler } = require('../functions/b2c-technician-approval');
    const projectId = 'fixgo-b2c-rules-test';
    const app = admin.initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, `kyc-physical-${Date.now()}`);
    const db = app.firestore(); const bucket = app.storage().bucket();
    const uid = `kyc-tech-${Date.now()}`; const actor = `kyc-admin-${Date.now()}`;
    class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
    const dependencies = { admin, db, bucket, functions: { https: { HttpsError } } };
    const approve = createApproveTechnicianHandler(dependencies); const returnDocs = createReturnTechnicianHandler(dependencies);
    const context = { auth: { uid: actor, token: {} } };
    const files = ['foto_perfil', 'ine', 'csf'].map(kind => `expedientes/${uid}/${kind}/current.png`);
    const url = path => `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`;
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1cAAAAASUVORK5CYII=', 'base64');
    try {
        await db.doc(`users/${actor}`).set({ rol: 'admin' });
        await db.doc(`users/${uid}`).set({ rol: 'tecnico', tipo_cuenta: 'B2C', estado: 'pendiente_revision', status: 'pendiente_revision', disponible: false,
            kyc: { estado: 'pendiente_revision', aprobado: false }, foto_perfil: url(files[0]), documentos: { ine: url(files[1]), csf: url(files[2]) },
            vehiculo: { tipo: 'peaton' }, datos_bancarios: { banco: 'fixture', clabe: '012345678901234567' }, skills: ['fix'] });
        await bucket.file(files[0]).save(bytes, { contentType: 'image/png' });
        await assert.rejects(approve({ technicianId: uid }, context), { code: 'failed-precondition' });
        assert.equal((await db.doc(`users/${uid}`).get()).data().estado, 'pendiente_revision');
        await returnDocs({ technicianId: uid, reason: 'Faltan documentos persistidos', documents: ['ine', 'csf'] }, context);
        assert.equal((await db.doc(`users/${uid}`).get()).data().estado, 'rechazado');
        for (const path of files.slice(1)) await bucket.file(path).save(bytes, { contentType: 'image/png' });
        await db.doc(`users/${uid}`).update({ estado: 'pendiente_revision', status: 'pendiente_revision', 'kyc.estado': 'pendiente_revision' });
        const result = await Promise.all([approve({ technicianId: uid }, context), approve({ technicianId: uid }, context)]);
        assert.equal(result.filter(item => item.alreadyApproved === true).length, 1);
        const profile = (await db.doc(`users/${uid}`).get()).data();
        assert.equal(profile.kyc.evidencias.ine.generation, (await bucket.file(files[1]).getMetadata())[0].generation);
        assert.equal(profile.disponible, false);
        await bucket.file(files[1]).save(Buffer.concat([bytes, Buffer.from('changed')]), { contentType: 'image/png' });
        await assert.rejects(approve({ technicianId: uid }, context), { code: 'failed-precondition' });
    } finally {
        await Promise.all([db.doc(`users/${uid}`).delete(), db.doc(`users/${actor}`).delete(), ...files.map(path => bucket.file(path).delete({ ignoreNotFound: true }))]);
        await app.delete();
    }
});
