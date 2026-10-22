import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {verifiedCodePreviewRecord} from '../modules/terminal/qwen-code-preview-download.js';

const id='general-38f6031b-b7cc-4ead-b056-43d349e9fa3a';
const file='tests/fixtures/v142-rebate-preview.js';
const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
const search='return Number((amount-rebate).toFixed(2));';
const replace="if(rebate>amount)throw Error('REBATE_EXCEEDS_AMOUNT');\n  "+search;
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
const original=hash(source),patched=hash(source.replace(search,replace));

function record(){
 return {status:'SUCCESS',reason:'VERIFIED_COMPLETE',certification:{ok:true},
   receipts:[
    {name:'repo.read',args:{file},ok:true,observation:{
      ok:true,verifiedRead:{file,content:source}}},
    {name:'tests.run',args:{command:'check:syntax'},ok:true,observation:{
      ok:true,status:'PASSED',testsPassed:true,exitCode:0}},
    {name:'repo.prepareWrite',args:{file,operation:'replace',search,replace,matchCount:1},
     ok:true,observation:{ok:true,status:'WRITE_PREPARED',file,
       written:false,verified:false,requiresApproval:true,
       caseId:id,objectiveId:'QWEN_PREVIEW_'+id,
       fingerprint:'a'.repeat(64),snapshotSha256:original,expectedSha256:patched}}
   ]
 };
}
test('successful review-only code mission can export exact source-bound prepared patch evidence',async()=>{
 const result=await verifiedCodePreviewRecord(record(),id);
 assert.equal(result?.file,file);
 assert.equal(result?.sha256,original);
 assert.equal(result?.preparedSha256,patched);
 assert.equal(result?.written,false);
 assert.equal(result?.requiresHumanApproval,true);
 assert.equal(result?.testsBeforeOnly,true);
});
test('partial, fabricated or cross-mission claims never yield a downloadable code receipt',async()=>{
 for(const edited of [
  x=>x.status='PARTIAL',
  x=>x.reason='STEP_LIMIT_REACHED',
  x=>x.certification.ok=false,
  x=>x.receipts[2].observation.caseId='general-deadbeef-dead-beef-dead-deadbeefdead',
  x=>x.receipts[2].observation.expectedSha256='b'.repeat(64),
  x=>x.receipts[2].observation.written=true,
  x=>x.receipts[2].observation.requiresApproval=false,
  x=>x.receipts[0].observation.verifiedRead.content='tampered',
  x=>x.receipts[2].args.matchCount=2,
  x=>x.receipts.push({name:'repo.write',ok:false}),
  x=>x.receipts[2].args.file='functions/index.js'
 ]){
  const example=record();edited(example);
  assert.equal(await verifiedCodePreviewRecord(example,id),null);
 }
 assert.equal(await verifiedCodePreviewRecord(record(),'../../other'),null);
});
test('Terminal restores code preview across reloads and offers a non-mutating download',()=>{
 const html=readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../modules/terminal/qwen-code-preview-download.js',import.meta.url),'utf8');
 assert.match(html,/restoreLatestCodePreviewReceiptCard/);
 assert.match(html,/code-preview-evidence-20261021-v1/);
 assert.match(ui,/Parche preparado para revisión — NO aplicado/);
 assert.match(ui,/Falta comprobar el parche en aislamiento antes\/después/);
 assert.ok(!ui.includes("window.JarvisLocalBridge.write"));
});
