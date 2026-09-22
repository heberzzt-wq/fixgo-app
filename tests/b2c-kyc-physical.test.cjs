const test = require('node:test');
const assert = require('node:assert/strict');
const { createApproveTechnicianHandler, createReturnTechnicianHandler } = require('../functions/b2c-technician-approval');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
function harness() {
    const objects = new Map();
    const url = kind => `https://firebasestorage.googleapis.com/v0/b/test-bucket/o/${encodeURIComponent(`expedientes/tech/${kind}/current.png`)}?alt=media&token=fake`;
    for (const kind of ['foto_perfil', 'ine', 'ine_reverso', 'selfie_liveness_left', 'selfie_liveness_right', 'csf']) objects.set(`expedientes/tech/${kind}/current.png`, { size: '128', contentType: 'image/png', generation: '1', metageneration: '1', md5Hash: 'hash' });
    const profile = { rol: 'tecnico', tipo_cuenta: 'B2C', estado: 'pendiente_revision', status: 'pendiente_revision', disponible: false, kyc: { estado: 'pendiente_revision', aprobado: false, identity_required: true, identity_verified: false, identity_version: 'b2c-bank-identity-v1' }, foto_perfil: url('foto_perfil'), documentos: { ine: url('ine'), ine_reverso: url('ine_reverso'), selfie_liveness_left: url('selfie_liveness_left'), selfie_liveness_right: url('selfie_liveness_right'), csf: url('csf'), certificados: [] }, vehiculo: { tipo: 'peaton' }, datos_bancarios: { banco: 'test', clabe: '012345678901234567' }, skills: ['fix'] };
    const users = new Map([['tech', profile], ['admin', { rol: 'admin' }], ['other', { rol: 'tecnico' }]]);
    let writes = 0;
    const ref = id => ({ id, async get() { return { exists: users.has(id), data: () => structuredClone(users.get(id)) }; } });
    let chain = Promise.resolve();
    const db = { collection: () => ({ doc: ref }), runTransaction: callback => {
        const work = chain.then(async () => {
            const updates = []; const result = await callback({ get: r => r.get(), update: (r, value) => updates.push([r.id, value]) });
            for (const [id, patch] of updates) { writes++; const target = users.get(id); for (const [path, value] of Object.entries(patch)) { const parts = path.split('.'); let cursor = target; for (const p of parts.slice(0, -1)) cursor = cursor[p] ||= {}; cursor[parts.at(-1)] = value; } }
            return result;
        }); chain = work.catch(() => {}); return work;
    } };
    const bucket = { name: 'test-bucket', file: path => ({ getMetadata: async () => { if (!objects.has(path)) throw new Error('404'); return [objects.get(path)]; } }) };
    const dependencies = { db, bucket, functions: { https: { HttpsError } }, admin: { firestore: { FieldValue: { serverTimestamp: () => 'now' } } } };
    const handler = createApproveTechnicianHandler(dependencies);
    const returnHandler = createReturnTechnicianHandler(dependencies);
    const returnDocs = (actor = 'admin', documents = ['ine']) => returnHandler({ technicianId: 'tech', reason: 'Identificación no legible', documents }, { auth: { uid: actor, token: {} } });
    const approve = actor => handler({ technicianId: 'tech' }, { auth: { uid: actor || 'admin', token: {} } });
    return { profile, objects, users, approve, returnDocs, writes: () => writes };
}
test('approval requires physically existing owner files; bare strings and foreign URLs fail', async () => {
    for (const invalid of ['fake-document', 'https://example.test/ine.png', 'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/expedientes%2Fother%2Fine.png?alt=media']) {
        const h = harness(); h.profile.documentos.ine = invalid;
        await assert.rejects(h.approve(), { code: 'failed-precondition' }); assert.equal(h.writes(), 0);
    }
    const h = harness(); h.objects.delete('expedientes/tech/ine/current.png');
    await assert.rejects(h.approve(), { code: 'failed-precondition' });
});
test('approval rejects empty, oversized, unsupported MIME and changed generation', async () => {
    for (const patch of [{ size: '0' }, { size: String(11 * 1024 * 1024) }, { contentType: 'text/html' }]) {
        const h = harness(); Object.assign(h.objects.get('expedientes/tech/ine/current.png'), patch); await assert.rejects(h.approve(), { code: 'failed-precondition' });
    }
    const h = harness(); h.profile.kyc.evidencias = { ine: { storage_path: 'expedientes/tech/ine/current.png', generation: 'old' } };
    await assert.rejects(h.approve(), { code: 'failed-precondition' });
});
test('contradictory state and suspended profile cannot be normalized into approval', async () => {
    for (const patch of [{ estado: 'suspendido' }, { status: 'activo' }, { suspendido: true }]) {
        const h = harness(); Object.assign(h.profile, patch); await assert.rejects(h.approve(), { code: 'failed-precondition' });
    }
});
test('concurrent retries approve once and pin Storage generations without availability', async () => {
    const h = harness(); const results = await Promise.all([h.approve(), h.approve()]);
    assert.equal(h.writes(), 1); assert.equal(results.filter(r => r.alreadyApproved).length, 1);
    assert.equal(h.profile.kyc.evidencias.ine.generation, '1');
    assert.equal(h.profile.kyc.evidencias.ine_reverso.generation, '1');
    assert.equal(h.profile.kyc.evidencias.selfie_liveness_left.generation, '1');
    assert.equal(h.profile.kyc.evidencias.selfie_liveness_right.generation, '1');
    assert.equal(h.profile.kyc.identity_verified, true);
    assert.equal(h.profile.kyc.identity_verification_method, 'manual_admin_review_v1');
    assert.equal(h.profile.disponible, false);
});
test('non-admin and self approval cannot activate technician', async () => {
    const h = harness(); await assert.rejects(h.approve('other'), { code: 'permission-denied' }); await assert.rejects(h.approve('tech'), { code: 'permission-denied' });
});

test('administrative return preserves documents, rejects non-admin and requires new review before approval', async () => {
    const h = harness(); const url = h.profile.documentos.ine;
    await assert.rejects(h.returnDocs('other'), { code: 'permission-denied' });
    await assert.rejects(h.returnDocs('admin', ['wallet']), { code: 'invalid-argument' });
    await h.returnDocs(); assert.equal(h.profile.estado, 'rechazado'); assert.equal(h.profile.documentos.ine, url);
    assert.deepEqual(h.profile.kyc.faltantes, ['ine']); assert.equal(h.profile.kyc.aprobado, false);
    await assert.rejects(h.approve(), { code: 'failed-precondition' });
    h.profile.estado = h.profile.status = h.profile.kyc.estado = 'pendiente_revision';
    await h.approve(); assert.equal(h.profile.estado, 'activo');
    await assert.rejects(h.returnDocs(), { code: 'failed-precondition' });
});


test('new banking KYC cannot approve without INE reverse and liveness captures', async () => {
    for (const kind of ['ine_reverso', 'selfie_liveness_left', 'selfie_liveness_right']) {
        const h = harness();
        h.profile.documentos[kind] = null;
        await assert.rejects(h.approve(), { code: 'failed-precondition' });
        assert.equal(h.writes(), 0);
    }
});

test('biometric evidence must remain image-only', async () => {
    for (const kind of ['ine_reverso', 'selfie_liveness_left', 'selfie_liveness_right']) {
        const h = harness();
        Object.assign(h.objects.get(`expedientes/tech/${kind}/current.png`), { contentType: 'application/pdf' });
        await assert.rejects(h.approve(), { code: 'failed-precondition' });
    }
});
