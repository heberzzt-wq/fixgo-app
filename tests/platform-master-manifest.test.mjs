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

test('latest handoff preserves candidate SHA, web drift, receipts and next-chat recovery without upgrading production',()=>{
 const handoff=data.latestHandoff,verified=data.latestVerifiedCandidate;
 assert.equal(data.snapshotDate,'2026-10-22');
 assert.equal(handoff.verifiedCandidateSha,'3caa2f3899aab488f90edef7535beac55f6ca96e');
 assert.equal(handoff.deployment.status,'BLOCKED_NOT_DEPLOYED');
 assert.notEqual(handoff.deployment.publishedSha,handoff.verifiedCandidateSha);
 assert.equal(verified.ci.passed,1692);
 assert.equal(verified.ci.failed,0);
 assert.equal(verified.ci.skipped,1);
 assert.equal(verified.hostingPreview.uploadFiles,269);
 assert.equal(verified.hostingPreview.brokenImports,0);
 assert.ok(handoff.completedActions.some(action=>action.includes('12 NS1')));
 assert.ok(handoff.nextSteps.some(step=>step.includes('autorizada')));
 assert.ok(handoff.receipts.some(file=>file.endsWith('Jarvis-V142-certificacion-3caa2f38-20261022.zip')));
 assert.equal(data.governance.productionCertified,false);
 const text=renderManifest(data);
 assert.match(text,/LEE ESTO PRIMERO/);
 assert.match(text,/1692 PASS/);
 assert.match(text,/BLOCKED_NOT_DEPLOYED/);
 assert.match(text,/ultimo.json/);
});

test('founder labor and project start remain costs of opportunity, not paid salary or guaranteed asset price',()=>{
 const p=data.projectHistory, l=p?.ownerLabor;
 assert.match(p.startedApprox,/febrero de 2026/);
 assert.match(p.initialCollaboration,/Gemini/);
 assert.equal(l.hoursPerWeek,84);
 assert.deepEqual(l.estimatedHoursRange,[2856,2916]);
 assert.equal(l.actualPaidSalaryVerified,false);
 assert.equal(l.hourlyRateIsKnown,false);
 assert.equal(l.scenariosMXN.find(s=>s.hourlyRateMXN===300).referenceMXN,864000);
 assert.match(renderManifest(data),/864,000|856,800/);
 const bad=structuredClone(data);bad.projectHistory.ownerLabor.actualPaidSalaryVerified=true;
 assert.equal(validateManifest(bad).ok,false);
});

test('owner strategy keeps ADJUNTO internal-only and never confuses vision with delivered capability',()=>{
 const s=data.productStrategy;
 assert.equal(s.brand,'ADJUNTO');
 assert.match(s.businessModel,/No vende suscripciones/);
 assert.match(s.deployment,/Qwen3\.5:9b/);
 assert.match(s.notClaimed,/Vision/);
 assert.match(s.commercialBoundary,/no compra ni opera/);
 assert.match(renderManifest(data),/Decision estrategica del propietario/);
 const bad=structuredClone(data);bad.productStrategy.deployment='Hosted external model';
 assert.equal(validateManifest(bad).ok,false);
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
