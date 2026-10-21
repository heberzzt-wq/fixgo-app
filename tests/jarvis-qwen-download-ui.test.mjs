import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedDownloadRows,validMissionId} from '../modules/terminal/qwen-download-ui.js';
import {readFileSync} from 'node:fs';
const id='general-a42201f8-18c0-40f3-a6e4-e2e861c4bad2';
const resume='resume-6e3c6983-7cce-40e7-89de-861174e76903';
const path='.jarvis-artifacts/qwen-general/'+id+'/recovery-test.docx';
const sha='a'.repeat(64);
const row=(name,args,observation)=>({name,args,ok:true,observation:{ok:true,...observation}});
const proof=[
 row('document.create',{format:'docx',output:path},{status:'DOCUMENT_CREATED',output:path,artifact:{file:path,sha256:sha},bytes:300}),
 row('artifact.read',{output:path},{status:'ARTIFACT_READ',output:path,sha256:sha,bytes:300}),
 row('media.library',{action:'export',output:path},{status:'MATERIAL_EXPORTED_VERIFIED',sha256:sha,experimental:true})
];
test('verified resume missions expose exact physically read and exported files',()=>{
 assert.equal(validMissionId(resume),true);
 assert.equal(validMissionId(id),true);
 assert.equal(validMissionId('bad-'+resume),false);
 const docs=verifiedDownloadRows({status:'SUCCESS',reason:'VERIFIED_COMPLETE',receipts:proof});
 assert.deepEqual(docs,[{output:path,sha256:sha,bytes:300,format:'docx'}]);
});
test('download panel never surfaces partial, unexported, foreign or hash-mismatched receipts',()=>{
 assert.deepEqual(verifiedDownloadRows({status:'PARTIAL',reason:'VERIFIED_COMPLETE',receipts:proof}),[]);
 assert.deepEqual(verifiedDownloadRows({status:'SUCCESS',reason:'VERIFIED_COMPLETE',receipts:proof.slice(0,2)}),[]);
 const altered=structuredClone(proof);altered[1].observation.sha256='b'.repeat(64);
 assert.deepEqual(verifiedDownloadRows({status:'SUCCESS',reason:'VERIFIED_COMPLETE',receipts:altered}),[]);
 const foreign=structuredClone(proof);
 for(const r of foreign) {if(r.args?.output)r.args.output='../private.docx';if(r.observation?.output)r.observation.output='../private.docx';}
 assert.deepEqual(verifiedDownloadRows({status:'SUCCESS',reason:'VERIFIED_COMPLETE',receipts:foreign}),[]);
});
test('terminal renders buttons for live and resumed delivery and restores verified latest mission',()=>{
 const html=readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
 assert.match(html,/appendMissionDownloadCard/);
 assert.match(html,/restoreLatestMissionDownloadCard/);
 assert.match(html,/jarvis-download-button/);
 assert.ok(!html.includes("coreResult?.missionId?.startsWith('general-')"));
});