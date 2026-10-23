import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {
 createIsolatedEvidenceVerifyHandler,verifyControlledPreviewPayload
} from '../jarvis-isolated-evidence-verify.js';
import {inspectArchivedIsolatedEvidence} from '../jarvis-isolated-evidence-readback.js';
const root=new URL('../',import.meta.url);
const projectRoot=decodeURIComponent(root.pathname).replace(/^\/([A-Z]:)/,'$1').replaceAll('/','\\');
const fixture='tests/fixtures/v142-rebate-preview.js';
const original=fs.readFileSync(new URL('../'+fixture,import.meta.url),'utf8');
const digest=s=>createHash('sha256').update(s).digest('hex');
const search='return Number((amount-rebate).toFixed(2));';
const replacement="if(rebate>amount)throw Error('REBATE_EXCEEDS_AMOUNT');\n  "+search;
const patched=original.replace(search,replacement);
const validId=()=> 'general-'+randomUUID();
const make=missionId=>({
 status:'SUCCESS',reason:'VERIFIED_COMPLETE',certification:{ok:true},
 receipts:[
  {name:'repo.read',args:{file:fixture},ok:true,observation:{
   verifiedRead:{file:fixture,content:original}}},
  {name:'tests.run',args:{command:'check:syntax'},ok:true,
   observation:{status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}},
  {name:'repo.prepareWrite',args:{file:fixture,search,replace:replacement,matchCount:1,operation:'replace'},
   ok:true,observation:{
    status:'WRITE_PREPARED',file:fixture,written:false,verified:false,requiresApproval:true,
    fingerprint:'a'.repeat(64),caseId:missionId,objectiveId:'QWEN_PREVIEW_'+missionId,
    snapshotSha256:digest(original),expectedSha256:digest(patched)}}
 ]
});
const reply=()=>({
 statusCode:200,headers:{},payload:null,
 status(value){this.statusCode=value;return this},
 set(name,value){this.headers[name]=value;return this},
 json(payload){this.payload=payload;return this}
});

test('scoped genuine-looking prepared fixture is bound to real original bytes and two SHA hashes',()=>{
 const missionId=validId(),record=make(missionId);
 const out=verifyControlledPreviewPayload({root:projectRoot,missionId,record});
 assert.equal(out.sourceSha256,digest(original));
 assert.equal(out.expectedSha256,digest(patched));
 assert.equal(out.fingerprint,'a'.repeat(64));
 assert.ok(out.serialized.includes('WRITE_PREPARED'));
});

test('arbitrary source, forged SHA, mutation receipts and cross-mission IDs fail before any process',()=>{
 let tamperIndex=0;
 for(const tamper of [
  d=>d.status='PARTIAL',
  d=>d.certification.ok=false,
  d=>d.receipts[2].args.file='functions/index.js',
  d=>d.receipts[2].observation.snapshotSha256='b'.repeat(64),
  d=>d.receipts[2].observation.expectedSha256='c'.repeat(64),
  d=>d.receipts[2].observation.caseId=validId(),
  d=>d.receipts[2].observation.written=true,
  d=>d.receipts.push({name:'repo.write',ok:true}),
  d=>d.receipts[0].observation.verifiedRead.content='tampered',
  d=>d.receipts.push(structuredClone(d.receipts[2])),
  d=>d.receipts.push({name:'tests.run',ok:true,args:{command:'shell evil'}})
 ]){
  const missionId=validId(),record=make(missionId);
  tamper(record);
  assert.throws(()=>verifyControlledPreviewPayload({root:projectRoot,missionId,record}),'tamper index '+tamperIndex);
  tamperIndex++;
 }
});

test('untrusted HTTP bodies and missing owner authorization never start Docker',async()=>{
 let calls=0;
 const handler=createIsolatedEvidenceVerifyHandler({root:projectRoot,
  authorize:async(req,res)=>{res.status(401).json({ok:false});return false},
  execute:async()=>{calls++}});
 const denied=reply();await handler({body:{missionId:validId(),record:make(validId())}},denied);
 assert.equal(denied.statusCode,401);assert.equal(calls,0);
 const allowed=createIsolatedEvidenceVerifyHandler({root:projectRoot,
  authorize:async()=>true,execute:async()=>{calls++}});
 const invalid=reply();await allowed({body:{missionId:validId(),record:null}},invalid);
 assert.equal(invalid.statusCode,400);assert.equal(calls,0);
 const extra=reply();await allowed({body:{missionId:validId(),record:{},shell:'powershell.exe'}},extra);
 assert.equal(extra.statusCode,400);assert.equal(calls,0);
});

test('real host binds verification endpoint to local authenticated owner and never exposes production-write authority',()=>{
 const bridge=fs.readFileSync(new URL('../jarvis-fs-bridge.js',import.meta.url),'utf8');
 const panel=fs.readFileSync(new URL('../modules/terminal/qwen-code-preview-download.js',import.meta.url),'utf8');
 assert.match(bridge,/if\(qwenEnabled\)app\.post\('\/qwen-isolated\/verify',createIsolatedEvidenceVerifyHandler\(/);
 assert.match(bridge,/verifyIdToken:verifyBrowserIdToken,ownerUid:workstationRelay\.ownerUid/);
 assert.match(panel,/requestJson\('\/qwen-isolated\/verify'/);
 assert.match(panel,/verifiedHostIsolatedProof\(preview,observed\)/);
 assert.doesNotMatch(panel,/JarvisLocalBridge\.write\(/);
});

test('actual pinned Docker process archives before/after evidence without applying patch',
 {skip:process.env.JARVIS_NS1_PHYSICAL_DOCKER!=='1',timeout:60000},async()=>{
 const missionId=validId(),record=make(missionId),handler=createIsolatedEvidenceVerifyHandler({
  root:projectRoot,authorize:async()=>true
 });
 const res=reply();
 await handler({body:{missionId,record}},res);
 assert.equal(res.statusCode,200,JSON.stringify(res.payload));
 assert.equal(res.payload.status,'ISOLATED_FIXTURE_BEFORE_AFTER_VERIFIED');
 assert.equal(res.payload.patchApplied,false);
 assert.equal(res.payload.productionRepairCertified,false);
 assert.equal(res.payload.before.failed,1);assert.equal(res.payload.after.failed,0);
 assert.equal(res.payload.fromArchive,false);
 assert.equal(fs.readFileSync(new URL('../'+fixture,import.meta.url),'utf8'),original);
 const archived=inspectArchivedIsolatedEvidence({root:projectRoot,missionId});
 assert.equal(archived.status,'ISOLATED_FIXTURE_BEFORE_AFTER_VERIFIED');
 const retry=reply();
 await handler({body:{missionId,record}},retry);
 assert.equal(retry.statusCode,200);assert.equal(retry.payload.fromArchive,true);
 console.log('[NS1-10-AUTHENTICATED-VERIFY] host executed pinned Docker and archived RED-GREEN proof; no repo mutation');
});

test('only one isolated Docker verification may run at once, even for different mission IDs',async()=>{
 let starts=0,release;
 const blocked=new Promise(resolve=>{release=resolve});
 const handler=createIsolatedEvidenceVerifyHandler({
  root:projectRoot,authorize:async()=>true,
  execute:async()=>{starts++;await blocked;throw Error('CONTROLLED_SIMULATED_FAILURE')}
 });
 const missionA=validId(),missionB=validId(),resA=reply(),resB=reply();
 const running=handler({body:{missionId:missionA,record:make(missionA)}},resA);
 await new Promise(resolve=>setImmediate(resolve));
 await handler({body:{missionId:missionB,record:make(missionB)}},resB);
 assert.equal(resB.statusCode,409);
 assert.equal(resB.payload.status,'ISOLATED_VERIFICATION_ALREADY_RUNNING');
 assert.equal(starts,1);
 release();
 await running;
 assert.equal(resA.statusCode,503);
 assert.equal(resA.payload.productionRepairCertified,false);
});
