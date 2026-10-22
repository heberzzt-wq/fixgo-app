import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateManifest,renderManifest} from '../scripts/platform-master-manifest-v142.mjs';
const data=JSON.parse(readFileSync(new URL('../docs/platform-master-manifest-v142.json',import.meta.url),'utf8'));

test('all B2C/B2B/Jarvis/security/operations rows have real source paths and criteria',()=>{
 const proof=validateManifest(data);
 assert.equal(proof.ok,true,JSON.stringify(proof.errors));
 assert.equal(proof.total,57);
 assert.equal(proof.counts.B2C,16);
 assert.equal(proof.counts.B2B,9);
 assert.equal(proof.counts.JARVIS,18);
 assert.equal(proof.counts.SEGURIDAD,7);
 assert.equal(proof.counts.OPERACIONES,7);
 assert.equal(proof.p0,33);
 for(const row of data.workstreams){
  assert.ok(row.id&&row.title&&row.gap&&row.acceptance);
  assert.ok(row.anchors.length>=1);
 }
});

test('manifest never claims historical local tests equal a production launch certificate',()=>{
 assert.equal(data.governance.productionCertified,false);
 assert.equal(data.governance.launchReadyB2C,false);
 assert.equal(data.governance.launchReadyB2B,false);
 assert.equal(data.governance.fullProfessionalJarvisCertified,false);
 assert.equal(data.governance.noAutomatedOwnerLockout,true);
 assert.equal(data.governance.noAutoFinancialWrites,true);
 assert.equal(data.governance.noAutoDeploy,true);
 assert.equal(data.productionEvidence.publicRuntimeBranch,'v94-media-v4n-negative-claims');
 assert.notEqual(data.productionEvidence.publicManifestSha,data.auditedBaselineSha);
 assert.equal(data.testObservations.find(x=>x.suite==='B2B dirigida').passed,31);
 assert.equal(data.testObservations.find(x=>x.suite==='B2C dirigida').passed,63);
});

test('unknown scope, missing real file, forged status and missing lockout requirement invalidate the manifest',()=>{
 const clone=()=>structuredClone(data);
 const missing=clone();missing.workstreams[0].anchors=['faked/never-existed.js'];
 assert.equal(validateManifest(missing).ok,false);
 const status=clone();status.workstreams[0].status='NASA_CERTIFIED';
 assert.equal(validateManifest(status).ok,false);
 const unsafe=clone();unsafe.workstreams[0].anchors=['../secrets.env'];
 assert.equal(validateManifest(unsafe).ok,false);
 const duplicate=clone();duplicate.workstreams[1].id=duplicate.workstreams[0].id;
 assert.equal(validateManifest(duplicate).ok,false);
 const access=clone();access.governance.noAutomatedOwnerLockout=false;
 assert.equal(validateManifest(access).ok,false);
 const short=clone();short.workstreams=short.workstreams.slice(0,8);
 assert.equal(validateManifest(short).ok,false);
});

test('published Markdown is deterministically generated and contains all 57 fronts',()=>{
 const actual=readFileSync(new URL('../docs/platform-master-manifest-v142.md',import.meta.url),'utf8');
 assert.equal(actual,renderManifest(data));
 assert.match(actual,/33 prioridades P0/);
 assert.match(actual,/HTTP 200/);
 assert.match(actual,/No-lockout|no-lockout/i);
 assert.match(actual,/B2C-11/);
 assert.match(actual,/JARVIS-14/);
 assert.match(actual,/SEC-03/);
 assert.match(actual,/OPS-01/);
 assert.match(actual,/No equivale|NO una certificación/i);
});

test('root agent entrypoint locates the canonical manifest without granting implicit authority',()=>{
 const text=readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');
 assert.match(text,/docs\/platform-master-manifest-v142\.md/);
 assert.match(text,/docs\/platform-master-manifest-v142\.json/);
 assert.match(text,/no bloquear ni revocar autom[aá]ticamente/i);
 assert.match(text,/no ejecutar cobros, retiros/i);
 assert.match(text,/node scripts\/platform-master-manifest-v142\.mjs --check/);
});
