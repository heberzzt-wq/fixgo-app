const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../functions/b2c-platform-contract');
const { createMigrateTechnicianProfileHandler } = require('../functions/b2c-platform-authority');
const base = () => ({ rol: 'tecnico', tipo_cuenta: 'B2C', estado: 'documentos_pendientes', status: 'documentos_pendientes', kyc: { estado: 'documentos_pendientes', aprobado: false }, disponible: false, fotoPerfil: 'legacy-photo', logistica: { vehiculo: 'peaton' }, documentos: { ine: 'ine', csf: 'csf' }, datos_bancarios: { banco: 'fixture', clabe: '012345678901234567' }, skills: ['fix'], wallet: 42, comision_asignada: 0.24 });
test('migration preserves canonical photo, never invents approval, vehicle, money or performance', () => {
    const raw = base(); const result = contract.technicianMigration(raw);
    assert.equal(result.canonical.foto_perfil, raw.fotoPerfil); assert.equal(result.canonical.kyc.aprobado, false);
    for (const field of ['wallet', 'comision_asignada', 'reputacion', 'nivel', 'servicios_completados']) assert.equal(Object.hasOwn(result.canonical, field), false);
    const noVehicle = base(); delete noVehicle.logistica;
    assert.equal(contract.technicianMigration(noVehicle).canonical.vehiculo.tipo, '');
});
test('legacy approval and contradictory states cannot grant marketplace authority through migration', () => {
    for (const raw of [
        { ...base(), estado: 'activo', status: 'activo', kyc: undefined, verificado: true, aprobadoEn: 'legacy' },
        { ...base(), estado: 'suspendido', status: 'suspendido', kyc: { estado: 'activo', aprobado: true } },
        { ...base(), tipo_cuenta: 'B2B' }
    ]) { const migration = contract.technicianMigration(raw); assert.equal(migration.classification, 'requires_review'); assert.equal(contract.technicianEligibility(raw).ok, false); }
});
function harness(raw) {
    const users = new Map([['tech', raw], ['admin', { rol: 'admin' }]]); let writes = 0; let transactions = 0;
    const ref = id => ({ id, get: async () => ({ exists: users.has(id), data: () => structuredClone(users.get(id)) }) });
    const db = { collection: () => ({ doc: ref }), runTransaction: async callback => {
        transactions++; return callback({ get: r => r.get(), set: (r, value) => { writes++; users.set(r.id, { ...users.get(r.id), ...value }); } });
    } };
    class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
    const migrate = createMigrateTechnicianProfileHandler({ db, functions: { https: { HttpsError } }, admin: { firestore: { FieldValue: { serverTimestamp: () => 'now' } } } });
    return { users, writes: () => writes, transactions: () => transactions, migrate: data => migrate({ technicianId: 'tech', ...data }, { auth: { uid: 'admin', token: {} } }) };
}
test('migration is transactional and retry no-op; preserves source aliases and protected values', async () => {
    const h = harness(base()); const before = structuredClone(h.users.get('tech'));
    assert.equal((await h.migrate({ apply: true })).applied, true);
    assert.equal((await h.migrate({ apply: true })).unchanged, true); assert.equal(h.writes(), 1); assert.equal(h.transactions(), 2);
    for (const field of ['wallet', 'comision_asignada', 'fotoPerfil', 'logistica', 'disponible']) assert.deepEqual(h.users.get('tech')[field], before[field]);
});
test('reviewConfirmed cannot bypass ambiguous legacy approval', async () => {
    const h = harness({ ...base(), estado: 'activo', status: 'activo', kyc: undefined, verificado: true });
    await assert.rejects(h.migrate({ apply: true, reviewConfirmed: true }), { code: 'failed-precondition' }); assert.equal(h.writes(), 0);
});
const fs = require('node:fs');
const vm = require('node:vm');
async function runCli(raw, argv = [], typed = {}) {
    const source = fs.readFileSync(require('node:path').join(__dirname, '../scripts/migrate-b2c-technician.mjs'), 'utf8');
    const encode = value => value === null || value === undefined ? { nullValue: null } : typeof value === 'boolean' ? { booleanValue: value } : typeof value === 'string' ? { stringValue: value } : typeof value === 'number' ? { integerValue: String(value) } : Array.isArray(value) ? { arrayValue: { values: value.map(encode) } } : { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, val]) => [key, encode(val)])) } };
    const document = { fields: { ...encode(raw).mapValue.fields, ...typed }, updateTime: '2026-09-21T00:00:00Z' };
    const requests = [];
    const scope = { contract, URLSearchParams, process: { env: { FIREBASE_ACCESS_TOKEN: 'fixture-not-a-secret' }, argv: ['node', 'script', '--technician=test-tech-1', '--apply', ...argv], stdout: { write() {} }, exit() { throw new Error('NOOP_EXIT'); } },
        fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => document }; } };
    try { await vm.runInNewContext('(async()=>{' + source.slice(source.indexOf('function option')) + '})()', scope); } catch (error) { if (error.message !== 'NOOP_EXIT') throw error; }
    return requests;
}
test('CLI uses update-time precondition, retains timestamp types and never masks legacy deletions', async () => {
    const raw = base(); raw.estado = raw.status = raw.kyc.estado = 'activo'; raw.kyc.aprobado = true; raw.kyc.aprobado_at = '2026-01-01T00:00:00Z';
    const typed = { kyc: { mapValue: { fields: { estado: { stringValue: 'activo' }, aprobado: { booleanValue: true }, aprobado_at: { timestampValue: raw.kyc.aprobado_at } } } } };
    const requests = await runCli(raw, [], typed); assert.equal(requests.length, 2);
    const patch = requests[1]; assert.equal(patch.options.method, 'PATCH');
    assert.equal(new URL(patch.url).searchParams.get('currentDocument.updateTime'), '2026-09-21T00:00:00Z');
    assert.equal(new URL(patch.url).searchParams.getAll('updateMask.fieldPaths').includes('fotoPerfil'), false);
    assert.equal(JSON.parse(patch.options.body).fields.kyc.mapValue.fields.aprobado_at.timestampValue, raw.kyc.aprobado_at);
});
test('CLI refuses requires_review even when caller selects that classification', async () => {
    const raw = { ...base(), estado: 'activo', status: 'activo', kyc: undefined, verificado: true };
    await assert.rejects(runCli(raw, ['--expected-classification=requires_review']), /MIGRATION_HUMAN_REVIEW_REQUIRED/);
});
