import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildDailyReport,renderDailyReport,REPORT_DIR,REPO_ROOT}
 from '../scripts/platform-manifest-daily-v142.mjs';

const data=JSON.parse(readFileSync(new URL('../docs/platform-master-manifest-v142.json',import.meta.url),'utf8'));
const HEAD='a'.repeat(40),past='b'.repeat(40);
const day=new Date('2026-10-22T04:30:00.000Z');
const report=()=>buildDailyReport({manifest:data,head:HEAD,
 previous:{repo:{head:past}},filesChanged:['functions/index.js',
  'jarvis-platform-self-healing.js','security/storage-hardening-candidate.rules.txt'],
 dirty:false,services:{5000:true,3344:true,3345:true,11434:true},
 tests:{status:'DIRECTED_SUITE_PASSED',passed:13,failed:0},date:day});

test('daily inventory enumerates all 57 real fronts while distinguishing code changes from readiness',()=>{
 const result=report();
 assert.equal(result.dateLocal,'2026-10-21');
 assert.equal(result.platform.total,57);
 assert.equal(result.platform.domainCounts.B2C,16);
 assert.equal(result.platform.domainCounts.B2B,9);
 assert.equal(result.platform.domainCounts.JARVIS,18);
 assert.equal(result.platform.domainCounts.SEGURIDAD,7);
 assert.equal(result.platform.domainCounts.OPERACIONES,7);
 assert.equal(result.platform.p0,33);
 assert.ok(result.platform.workstreamsTouched.includes('B2C-11'));
 assert.ok(result.platform.workstreamsTouched.includes('JARVIS-11'));
 assert.equal(result.governance.noAutomatedOwnerLockout,true);
 assert.equal(result.governance.noAutoDeploy,true);
 assert.equal(result.governance.productionCertified,false);
 assert.equal(result.evidence.updatedStatusesAutomatically,false);
 assert.ok(result.warnings.includes('PUBLIC_RELEASE_NOT_RECHECKED'));
});
test('daily report never promotes unverified production statuses or exposes credentials',()=>{
 const md=renderDailyReport(report(),data);
 for(const section of ['B2C','B2B','JARVIS','SEGURIDAD','OPERACIONES',
  'P0 aún pendientes','Regla de protección al propietario']){
  assert.ok(md.includes(section),section);
 }
 assert.ok(md.includes('NO certifica producción'));
 assert.ok(md.includes('Nunca bloquear IP'));
 assert.ok(!md.includes('PRIVATE_TOKEN'));
 assert.ok(!md.includes('AUTO_DEPLOY_STARTED'));
});
test('daily snapshots belong outside official checkout so bridge Git authority remains intact',()=>{
 const destination=resolve(REPORT_DIR),repo=resolve(REPO_ROOT);
 assert.ok(!destination.toLowerCase().startsWith(repo.toLowerCase()));
 assert.ok(!destination.toLowerCase().startsWith(resolve(repo,'.git').toLowerCase()));
});
test('invalid or incomplete inventory can never become an updated daily status report',()=>{
 const bad=structuredClone(data);bad.governance.noAutomatedOwnerLockout=false;
 assert.throws(()=>buildDailyReport({manifest:bad,head:HEAD,date:day}),/MANIFEST_INVALID/);
 assert.throws(()=>buildDailyReport({manifest:data,head:'forged',date:day}),/HEAD_INVALID/);
});
