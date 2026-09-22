const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../panel-tecnico.js'), 'utf8');
const begin = source.indexOf('    let expedienteUploadBusy = false;');
const end = source.indexOf('    const qWallet', begin);
const profile = { vehiculo: { tipo: 'peaton' }, documentos: {} };
let failKind = 'ine';
const uploads = [];
let fields = {};
const context = {
  window: {}, user: { uid: 'owner' }, perfilTecnicoActual: profile,
  document: { getElementById: id => fields[id] || null },
  alert: () => {}, console: { error: () => {} }, db: {}, storage: {},
  TECHNICIAN_KYC_STATES: { DOCUMENTS_PENDING: 'documentos_pendientes', PENDING_REVIEW: 'pendiente_revision' },
  serverTimestamp: () => 'now', doc: (...args) => args, getDoc: async () => ({ data: () => profile }),
  updateDoc: async (_, patch) => {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let target = profile;
      for (const part of parts.slice(0, -1)) target = target[part] ||= {};
      target[parts.at(-1)] = value;
    }
  },
  storagePathForTechnicianDocument: (_, kind) => kind,
  ref: (_, path) => path,
  uploadBytes: async kind => { uploads.push(kind); if (kind === failKind) throw new Error('offline'); },
  getDownloadURL: async kind => `https://storage.test/${kind}`,
  arrayUnion: value => [value],
  buildTechnicianReviewPatch: current => ({ estado: current.foto_perfil && current.documentos.ine && current.documentos.csf ? 'pendiente_revision' : 'documentos_pendientes' })
};
vm.createContext(context);
vm.runInContext(source.slice(begin, end), context);
function resetForm() {
  fields = { btnCompletarDocs: {} };
  if (!profile.foto_perfil) fields.compFoto = { files: [{ name: 'selfie.png' }] };
  if (!profile.documentos.ine) fields.compINE = { files: [{ name: 'ine.png' }] };
  if (!profile.documentos.csf) fields.compCSF = { files: [{ name: 'csf.pdf' }] };
}
(async () => {
  resetForm();
  await context.window.completarDocumentosTecnico('owner');
  assert.equal(profile.foto_perfil, 'https://storage.test/foto_perfil');
  assert.equal(profile.kyc.uploads.foto_perfil.estado, 'confirmado');
  assert.equal(profile.kyc.uploads.ine.estado, 'upload_failed');
  assert.equal(profile.documentos.csf, undefined);
  failKind = null; resetForm();
  await context.window.completarDocumentosTecnico('owner');
  assert.deepEqual(uploads, ['foto_perfil', 'ine', 'ine', 'csf']);
  assert.equal(profile.estado, 'pendiente_revision');
  assert.equal(profile.documentos.csf, 'https://storage.test/csf');
  const legacyStart = source.indexOf('        document.getElementById("btnSubirEvidencia").onclick = async () => {');
  const legacyEnd = source.indexOf('        setTimeout(() => {', legacyStart);
  fields.btnSubirEvidencia = {};
  const before = JSON.stringify(profile);
  vm.runInContext(source.slice(legacyStart, legacyEnd), context);
  await fields.btnSubirEvidencia.onclick();
  assert.equal(JSON.stringify(profile), before);
  assert.ok(!source.includes('transaction.set(transRef'));
  assert.ok(!source.includes('saldo_virtual: nuevoSaldo'));
  console.log('B2C PANEL RECOVERY: PASS — confirmed upload survives failure, retry skips it, legacy financial close fails closed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
