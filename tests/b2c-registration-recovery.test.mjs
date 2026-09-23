import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../gestia-core/contracts/b2c-platform-contract.js';
const contract = globalThis.GestiaB2CPlatformContract;
const source = fs.readFileSync(new URL('../firebase.js', import.meta.url), 'utf8');
const registration = source.slice(source.indexOf('export async function registrarUsuario'), source.indexOf('// 📦 EXPORTS MAESTROS')).replace('export async', 'async');
function harness() {
    const profiles = new Map(); let creates = 0; let failWrite = true;
    const auth = { currentUser: null };
    const scope = { auth, db: {}, console: { log() {}, error() {} }, doc: (_, __, uid) => uid,
        getDoc: async uid => ({ exists: () => profiles.has(uid), data: () => profiles.get(uid) }),
        createUserWithEmailAndPassword: async (_, email) => { creates++; auth.currentUser = { uid: 'owner', email }; return { user: auth.currentUser }; },
        createTechnicianRegistrationProfile: ({ uid, email }) => ({ uid, email, rol: 'tecnico', tipo_cuenta: 'B2C', estado: 'documentos_pendientes', status: 'documentos_pendientes', kyc: { aprobado: false }, disponible: false }),
        serverTimestamp: () => 'now', updateProfile: async () => {},
        setDoc: async (uid, profile) => { if (failWrite) throw new Error('network'); profiles.set(uid, structuredClone(profile)); }
    };
    vm.runInNewContext(registration + '\nglobalThis.register=registrarUsuario;', scope);
    return { profiles, auth, creates: () => creates, online: () => { failWrite = false; }, register: rol => scope.register('owner@example.test', 'fixture', rol || 'tecnico', 'fixture') };
}
test('Auth created before Firestore outage resumes same authenticated owner without duplicate account', async () => {
    const h = harness(); await assert.rejects(h.register(), /network/); assert.equal(h.creates(), 1); assert.equal(h.profiles.size, 0);
    h.online(); await h.register(); assert.equal(h.creates(), 1); assert.equal(h.profiles.get('owner').kyc.aprobado, false);
    h.profiles.get('owner').wallet = 42; await h.register(); assert.equal(h.profiles.get('owner').wallet, 42);
    await assert.rejects(h.register('cliente'), /REGISTRATION_EXISTING_PROFILE_MISMATCH/);
});
test('actual technician panel exposes resubmit after final-write failure and replaces only requested files', () => {
    const panel = fs.readFileSync(new URL('../panel-tecnico.js', import.meta.url), 'utf8');
    const segment = panel.slice(panel.indexOf('        const ineUrl = perfilCanonico.estado'), panel.indexOf('        if (faltaInfo) {'));
    const base = { rol: 'tecnico', estado: 'documentos_pendientes', status: 'documentos_pendientes', foto_perfil: 'photo', documentos: { ine: 'ine', csf: 'csf' }, datos_bancarios: { banco: 'bank', clabe: '012345678901234567' }, vehiculo: { tipo: 'peaton' }, kyc: { estado: 'documentos_pendientes', aprobado: false } };
    function view(profile) {
        const kycResult = contract.technicianKycRequirements(profile);
        return vm.runInNewContext(segment + '\n({faltaInfo,ineUrl,csfUrl,fotoUrl})', {
            perfilCanonico: kycResult.profile,
            kycResult,
            inspectMexicanClabe: contract.inspectMexicanClabe,
            TECHNICIAN_KYC_STATES: contract.TECHNICIAN_STATES
        });
    }
    assert.equal(view(base).faltaInfo, true);
    const rejected = { ...base, estado: 'rechazado', status: 'rechazado', kyc: { estado: 'rechazado', aprobado: false, faltantes: ['ine'] } };
    const ui = view(rejected); assert.equal(ui.faltaInfo, true); assert.equal(ui.ineUrl, null); assert.equal(ui.csfUrl, 'csf');
});
test('identity photo widgets block approved replacements and admin routes review back to technician', async () => {
    const panel = fs.readFileSync(new URL('../panel-admin.js', import.meta.url), 'utf8');
    const code = panel.slice(panel.indexOf(' window.adminCambiarFotoTecnico ='), panel.indexOf(' // 🔥 EXPEDIENTES'));
    let profile = { estado: 'activo', kyc: { aprobado: true } }; const messages = []; const returned = [];
    const scope = { window: { devolverExpedienteTecnico: (...args) => returned.push(args) }, db: {}, doc: () => 'tech', getDoc: async () => ({ data: () => profile }), alert: message => messages.push(message) };
    vm.runInNewContext(code, scope); await scope.window.adminCambiarFotoTecnico('tech');
    assert.equal(returned.length, 0); assert.match(messages[0], /protegida/);
    profile = { estado: 'pendiente_revision', kyc: { aprobado: false } }; await scope.window.adminCambiarFotoTecnico('tech');
    assert.deepEqual(returned, [['tech', 'foto_perfil']]);
    const tech = fs.readFileSync(new URL('../panel-tecnico.js', import.meta.url), 'utf8');
    const photo = tech.slice(tech.indexOf('    window.cambiarFotoPerfil ='), tech.indexOf('    window.cambiarLogoFactura ='));
    let uploads = 0; let writes = 0;
    const techScope = { window: {}, user: { uid: 'tech' }, db: {}, doc: () => 'tech', getDoc: async () => ({ data: () => ({ estado: 'activo', status: 'activo', kyc: { aprobado: true } }) }), alert() {}, uploadBytes() { uploads++; }, updateDoc() { writes++; }, document: { createElement() { throw Error('must not prompt upload'); } } };
    vm.runInNewContext(photo, techScope); await techScope.window.cambiarFotoPerfil('tech');
    assert.equal(uploads, 0); assert.equal(writes, 0);
});


test('customer identity upload failure resumes the same authenticated B2C account', () => {
    const registration = fs.readFileSync(new URL('../app-registro.js', import.meta.url), 'utf8');
    const customer = fs.readFileSync(new URL('../panel-cliente.js', import.meta.url), 'utf8');
    const customerHtml = fs.readFileSync(new URL('../cliente.html', import.meta.url), 'utf8');

    assert.match(customer, /identityEvidenceComplete/);
    assert.match(customer, /REANUDAR CAPTURA DE IDENTIDAD/);
    assert.match(customer, /startCustomerIdentityRecovery/);
    assert.match(customer, /persistCustomerIdentityRecovery/);
    assert.match(customer, /clientIdentityModal/);
    assert.match(customer, /storagePathForTechnicianDocument/);
    assert.match(customer, /login\.html\?resume=cliente-identity/);
    assert.doesNotMatch(customer, /registro\.html\?resume=cliente-identity/);
    assert.match(customerHtml, /id="clientIdentityModal"/);

    // Registration remains a fallback recovery surface only after explicit reauthentication.
    assert.match(registration, /clienteIdentityResumeRequested/);
    assert.match(registration, /clienteIdentityResumeProfile/);
    assert.match(registration, /resumeExistingCustomer/);
    assert.match(registration, /__SESSION_REUSE_ONLY__/);
    assert.match(registration, /kycState:\s*"identidad_pendiente"/);
    assert.match(registration, /REANUDAR IDENTIDAD EN ESTA CUENTA/);
    assert.match(registration, /auth\.currentUser\?\.uid === clienteIdentityResumeProfile\.uid/);
});


test('release gate keeps customer KYC recovery inside the authenticated client panel', () => {
    const customer = fs.readFileSync(new URL('../panel-cliente.js', import.meta.url), 'utf8');
    const customerHtml = fs.readFileSync(new URL('../cliente.html', import.meta.url), 'utf8');
    assert.match(customer, /startCustomerIdentityRecovery/);
    assert.match(customer, /persistCustomerIdentityRecovery/);
    assert.doesNotMatch(customer, /registro\.html\?resume=cliente-identity/);
    assert.match(customerHtml, /id="clientIdentityModal"/);
    assert.match(customerHtml, /client-identity-camera\[data-frame="document"\] video/);
});
