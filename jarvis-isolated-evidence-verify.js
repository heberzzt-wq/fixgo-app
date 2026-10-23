// Owner-authenticated, fixture-only physical before/after verification.
// This is not a generic model-code execution API or a production write tool.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
 CONTROLLED_FIXTURE,verifyPreparedFixture
} from './scripts/jarvis-isolated-patch-probe.mjs';
import {inspectArchivedIsolatedEvidence} from './jarvis-isolated-evidence-readback.js';
import {terminateOwnedProcessTree} from './jarvis-run-command-cancellation.js';

const MISSION=/^general-[a-f0-9-]{36}$/i;
const MAX_RECEIPT_BYTES=250000;
const projectRoot=path.dirname(fileURLToPath(import.meta.url));
const executable=path.join(projectRoot,'scripts','jarvis-isolated-patch-probe.mjs');
const SAFE_NAMES=new Set(['repo.grep','repo.read','tests.run','repo.prepareWrite']);
const exception=message=>Object.assign(new Error(message),{code:message});

export function verifyControlledPreviewPayload({missionId,record,root=projectRoot}={}){
 if(!MISSION.test(String(missionId||''))||!record||
    record.status!=='SUCCESS'||record.reason!=='VERIFIED_COMPLETE'||
    record.certification?.ok!==true||!Array.isArray(record.receipts)||
    record.receipts.length<3||record.receipts.length>16)
    throw exception('ISOLATED_PREVIEW_SCOPE_INVALID');
 const serialized=JSON.stringify(record);
 if(Buffer.byteLength(serialized,'utf8')>MAX_RECEIPT_BYTES||
    record.receipts.some(r=>!SAFE_NAMES.has(r?.name)||
      r.name==='tests.run'&&r.args?.command!=='check:syntax')||
    record.receipts.filter(r=>r?.name==='repo.prepareWrite').length!==1)
    throw exception('ISOLATED_PREVIEW_SCOPE_INVALID');
 const prepared=record.receipts.find(r=>r.name==='repo.prepareWrite');
 if(prepared?.observation?.caseId!==missionId||
    prepared?.observation?.objectiveId!=='QWEN_PREVIEW_'+missionId||
    prepared?.observation?.requiresApproval!==true||
    prepared?.observation?.written!==false)
    throw exception('ISOLATED_PREVIEW_MISSION_MISMATCH');
 const originalPath=path.resolve(root,...CONTROLLED_FIXTURE.split('/'));
 const resolvedRoot=path.resolve(root);
 if(!originalPath.startsWith(resolvedRoot+path.sep)||
    fs.lstatSync(originalPath).isSymbolicLink())
    throw exception('ISOLATED_ORIGINAL_PATH_INVALID');
 const actual=fs.readFileSync(originalPath,'utf8');
 const proof=verifyPreparedFixture(actual,record);
 return {
  missionId,record,serialized,
  fingerprint:prepared.observation.fingerprint,
  sourceSha256:proof.sourceSha256,
  expectedSha256:proof.expectedSha256
 };
}

function matchingArchive({root,request}){
 const archived=inspectArchivedIsolatedEvidence({root,missionId:request.missionId});
 return archived?.ok===true&&archived.sourceSha256===request.sourceSha256&&
   archived.expectedSha256===request.expectedSha256&&
   archived.fingerprint===request.fingerprint?archived:null;
}

export async function executeControlledIsolation({root=projectRoot,serialized,
 timeoutMs=120000,spawnImpl=spawn,signal,terminate=terminateOwnedProcessTree}={}){
 if(signal?.aborted)throw exception('ISOLATED_VERIFICATION_CANCELLED');
 if(typeof serialized!=='string'||Buffer.byteLength(serialized,'utf8')>MAX_RECEIPT_BYTES)
  throw exception('ISOLATED_PREVIEW_SIZE_INVALID');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-ns1-authenticated-'));
 const receipt=path.join(folder,'prepared.json');
 try{
  fs.writeFileSync(receipt,serialized,{encoding:'utf8',mode:0o600,flag:'wx'});
  return await new Promise((resolve,reject)=>{
   // The executable and CLI parameters are HOST-OWNED constants. The model
   // cannot supply a command, test file, cwd, Docker image or write target.
   let child;
   try{
    child=spawnImpl(process.execPath,[executable,'--receipt',receipt,'--save-report'],
     {cwd:root,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
   }catch(error){reject(error);return}
   let stdout='',stderr='',ended=false,expired=false,cancelled=false;
   const retain=(old,chunk)=>String(old+String(chunk)).slice(-25000);
   const cleanup=()=>signal?.removeEventListener('abort',onAbort);
   const onAbort=()=>{
    if(ended||cancelled)return;
    cancelled=true;
    terminate(child);
   };
   signal?.addEventListener('abort',onAbort,{once:true});
   if(signal?.aborted)onAbort();
   const timer=setTimeout(()=>{
    expired=true;
    terminate(child);
   },Math.min(120000,Math.max(1000,timeoutMs)));
   child.stdout?.on('data',chunk=>{stdout=retain(stdout,chunk)});
   child.stderr?.on('data',chunk=>{stderr=retain(stderr,chunk)});
   child.once('error',error=>{
    if(ended)return;ended=true;clearTimeout(timer);cleanup();
    reject(cancelled?exception('ISOLATED_VERIFICATION_CANCELLED'):error);
   });
   child.once('close',code=>{
    if(ended)return;ended=true;clearTimeout(timer);cleanup();
    if(cancelled||signal?.aborted)return reject(exception('ISOLATED_VERIFICATION_CANCELLED'));
    if(expired)return reject(exception('ISOLATED_CONTAINER_TIMEOUT'));
    if(code!==0||!stdout.includes('ISOLATED_PHYSICAL_EVIDENCE_ARCHIVED=')||
       !/ISOLATED_EVIDENCE_SHA256=[a-f0-9]{64}/i.test(stdout))
     return reject(exception('ISOLATED_EXECUTION_NOT_VERIFIED'));
    resolve({ok:true,status:'ISOLATED_DOCKER_EXECUTED'});
   });
  });
 }finally{
  fs.rmSync(folder,{recursive:true,force:true});
 }
}

export function createIsolatedEvidenceVerifyHandler({
 root=projectRoot,authorize,execute=executeControlledIsolation
}={}){
 if(typeof authorize!=='function')throw exception('ISOLATED_EVIDENCE_AUTH_REQUIRED');
 let busy=false;
 return async(req,res)=>{
  if(!await authorize(req,res))return;
  res.set('Cache-Control','no-store');
  const body=req.body;
  if(!body||Object.keys(body).sort().join(',')!=='missionId,record'){
   return res.status(400).json({ok:false,status:'ISOLATED_PREVIEW_REQUEST_INVALID'});
  }
  let verified;
  try{verified=verifyControlledPreviewPayload({...body,root})}
  catch{return res.status(400).json({ok:false,status:'ISOLATED_PREVIEW_SCOPE_INVALID'})}
  const existing=matchingArchive({root,request:verified});
  if(existing)return res.json({...existing,fromArchive:true});
  if(busy)return res.status(409).json({ok:false,status:'ISOLATED_VERIFICATION_ALREADY_RUNNING'});
  busy=true;
  const controller=new AbortController();
  const onAbort=()=>controller.abort();
  const onClose=()=>{
   // A normal completed response emits "close"; only an abandoned request
   // should cancel Docker and its owned CLI/Node process tree.
   if(res.writableEnded!==true)controller.abort();
  };
  req.once?.('aborted',onAbort);
  res.once?.('close',onClose);
  if(req.aborted===true||(res.destroyed===true&&res.writableEnded!==true))
   controller.abort();
  try{
   if(controller.signal.aborted)throw exception('ISOLATED_VERIFICATION_CANCELLED');
   await execute({root,serialized:verified.serialized,
    missionId:verified.missionId,signal:controller.signal});
   if(controller.signal.aborted||res.destroyed===true)return;
   const final=matchingArchive({root,request:verified});
   if(!final)throw exception('ISOLATED_ARCHIVE_NOT_VERIFIED');
   return res.json({...final,fromArchive:false});
  }catch(error){
   if(controller.signal.aborted||res.destroyed===true)return;
   const status=error?.code||'ISOLATED_EXECUTION_NOT_VERIFIED';
   return res.status(503).json({ok:false,status,productionRepairCertified:false});
  }finally{
   req.removeListener?.('aborted',onAbort);
   res.removeListener?.('close',onClose);
   busy=false;
  }
 };
}
