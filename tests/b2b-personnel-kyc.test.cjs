const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createB2bPersonnelKycHandlers } = require('../functions/b2b-personnel-kyc');
const { createAdminNocActionHandler } = require('../functions/b2c-platform-authority');
const { createApproveTechnicianHandler } = require('../functions/b2c-technician-approval');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
function harness() {
    const profiles = new Map([
        ['worker', { rol: 'tecnico', tipo_cuenta: 'B2B', edificioId: 'TenantCase', estado: 'documentos_pendientes', status: 'documentos_pendientes' }],
        ['manager', { rol: 'admin_b2b', tipo_cuenta: 'B2B', edificioId: 'TenantCase', estado: 'activo', status: 'activo' }],
        ['other-manager', { rol: 'admin_b2b', tipo_cuenta: 'B2B', edificioId: 'other', estado: 'activo', status: 'activo' }],
        ['master', { rol: 'admin' }]
    ]);
    const objects = new Map();
    const ref = id => ({ id, get: async () => ({ exists: profiles.has(id), data: () => structuredClone(profiles.get(id)) }) });
    function patch(target, data) {
        const current = profiles.get(target.id);
        for (const [path, value] of Object.entries(data)) {
            const keys = path.split('.'); let node = current;
            for (const key of keys.slice(0, -1)) node = node[key] ||= {};
            node[keys.at(-1)] = value;
        }
    }
    const db = { collection: () => ({ doc: ref }), runTransaction: async fn => {
        const writes = []; const result = await fn({ get: target => target.get(), update: (target, data) => writes.push(() => patch(target, data)), set: (target, data) => writes.push(() => patch(target, data)) });
        writes.forEach(write => write()); return result;
    } };
    const dependencies = { admin: { firestore: { FieldValue: { serverTimestamp: () => 'NOW' } } }, db, functions: { https: { HttpsError } }, bucket: { name: 'test-bucket', file: path => ({ getMetadata: async () => { if (!objects.has(path)) throw new Error('404'); return [objects.get(path)]; } }) } };
    const handlers = createB2bPersonnelKycHandlers(dependencies);
    const context = uid => ({ auth: { uid, token: {} } });
    async function upload(kind) {
        const path = `expedientes/worker/b2b/${kind}/123_uuid.jpg`;
        objects.set(path, { contentType: 'image/jpeg', size: 512, generation: '1', metadata: { firebaseStorageDownloadTokens: 'token' } });
        await handlers.submitB2bPersonnelKyc({ action: 'save_document', kind, path }, context('worker'));
        return path;
    }
    const submit = () => handlers.submitB2bPersonnelKyc({ action: 'submit' }, context('worker'));
    const review = (actor = 'manager', decision = 'approve', reason) => handlers.reviewB2bPersonnelKyc({ personnelId: 'worker', decision, reason }, context(actor));
    return { profiles, objects, handlers, dependencies, context, upload, submit, review };
}
test('saved uploads survive resume; review requires both real files; same tenant approval enables personnel', async () => {
    const h = harness(); await h.upload('ine');
    assert.ok(h.profiles.get('worker').documentos.ine.startsWith('https://firebasestorage.googleapis.com/'));
    await assert.rejects(h.submit(), { code: 'failed-precondition' });
    assert.equal(h.profiles.get('worker').estado, 'documentos_pendientes');
    await h.upload('foto_perfil'); await h.submit();
    assert.equal(h.profiles.get('worker').status, 'pendiente_revision');
    await h.review(); assert.equal(h.profiles.get('worker').estado, 'activo');
    assert.equal(h.profiles.get('worker').kyc.aprobado, true);
    assert.equal(h.profiles.get('worker').disponible, false);
});
test('review rejects different tenant, suspended manager and ordinary worker', async () => {
    const h = harness(); await h.upload('ine'); await h.upload('foto_perfil'); await h.submit();
    await assert.rejects(h.review('other-manager'), { code: 'permission-denied' });
    h.profiles.get('manager').suspendido = true;
    await assert.rejects(h.review(), { code: 'permission-denied' });
    await assert.rejects(h.review('worker'), { code: 'invalid-argument' });
    assert.equal(h.profiles.get('worker').estado, 'pendiente_revision');
});
test('missing and swapped Storage objects cannot become approved', async () => {
    const h = harness(); const path = await h.upload('ine'); await h.upload('foto_perfil'); await h.submit();
    h.objects.get(path).generation = '2';
    await assert.rejects(h.review(), { code: 'failed-precondition' });
    h.objects.delete(path); await assert.rejects(h.review(), { code: 'failed-precondition' });
});
test('foreign path, absent bytes and oversized upload rejected without profile mutation', async () => {
    const h = harness();
    for (const path of ['expedientes/other/b2b/ine/123_uuid.jpg', 'expedientes/worker/b2b/ine/123_uuid.jpg']) {
        await assert.rejects(h.handlers.submitB2bPersonnelKyc({ action: 'save_document', kind: 'ine', path }, h.context('worker')));
    }
    const path = await h.upload('ine'); h.objects.get(path).size = 11 * 1024 * 1024;
    await assert.rejects(h.handlers.submitB2bPersonnelKyc({ action: 'save_document', kind: 'ine', path }, h.context('worker')), { code: 'failed-precondition' });
});
test('review freezes document submissions and returning allows corrections with auditable reason', async () => {
    const h = harness(); await h.upload('ine'); await h.upload('foto_perfil'); await h.submit();
    await assert.rejects(h.upload('ine'), { code: 'failed-precondition' });
    await assert.rejects(h.review('manager', 'return', ''), { code: 'invalid-argument' });
    await h.review('manager', 'return', 'Identificación no legible');
    assert.equal(h.profiles.get('worker').estado, 'documentos_pendientes');
    assert.equal(h.profiles.get('worker').kyc.aprobado, false);
    await h.upload('ine'); await h.submit(); await h.review();
});
test('restore cannot approve pending or incomplete B2B personnel', async () => {
    const h = harness(); const restore = createAdminNocActionHandler(h.dependencies);
    await assert.rejects(restore({ action: 'restore_technician', technicianId: 'worker' }, h.context('master')), { code: 'failed-precondition' });
    await h.upload('ine'); await h.upload('foto_perfil'); await h.submit();
    await assert.rejects(restore({ action: 'restore_technician', technicianId: 'worker' }, h.context('master')), { code: 'failed-precondition' });
    await h.review(); Object.assign(h.profiles.get('worker'), { estado: 'suspendido', status: 'suspendido', suspendido: true });
    await restore({ action: 'restore_technician', technicianId: 'worker' }, h.context('master'));
    assert.equal(h.profiles.get('worker').estado, 'activo'); assert.equal(h.profiles.get('worker').suspendido, false);
});
test('B2C approval cannot bypass B2B tenant approval', async () => {
    const h = harness(); const approve = createApproveTechnicianHandler(h.dependencies);
    await assert.rejects(approve({ technicianId: 'worker' }, h.context('master')), { code: 'failed-precondition' });
});
