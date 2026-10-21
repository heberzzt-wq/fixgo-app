// Durable continuation of locally recorded, independently re-checked Qwen receipts.
const SHA=/^[a-f0-9]{64}$/i;
const MISSION=/^(?:general|resume)-[a-f0-9-]{36}$/i;
const GENERAL=/^general-[a-f0-9-]{36}$/i;
export function originalResumedMissionId(text){
 const match=String(text||'').match(/^CONTINUAR_MISION:\s*resume-[a-f0-9-]{36}\s*\r?\nORIGEN_MISION:\s*(general-[a-f0-9-]{36})\s*(?:\r?\n|$)/i);
 return match&&GENERAL.test(match[1])?match[1]:null;
}
const hash=async input=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input))),n=>n.toString(16).padStart(2,'0')).join('');
export function resumedMissionId(text){
 const match=String(text||'').match(/^CONTINUAR_MISION:\s*((?:general|resume)-[a-f0-9-]{36})\s*(?:\r?\n|$)/i);
 return match&&MISSION.test(match[1])?match[1]:null;
}
export async function readSavedMission(missionId){
 if(!MISSION.test(missionId)||!globalThis.indexedDB)throw Error('QWEN_RESUME_LOCAL_STORE_REQUIRED');
 const record=await new Promise((resolve,reject)=>{
  const open=indexedDB.open('jarvis-qwen-general-evidence',1);
  open.onerror=()=>reject(Error('QWEN_RESUME_STORE_OPEN_FAILED'));
  open.onsuccess=()=>{
   const db=open.result,tx=db.transaction('missions','readonly'),req=tx.objectStore('missions').get(missionId);
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('QWEN_RESUME_RECORD_READ_FAILED'));
   tx.oncomplete=()=>db.close();tx.onerror=()=>{db.close();reject(Error('QWEN_RESUME_RECORD_READ_FAILED'));};
  };
 });
 if(record?.missionId!==missionId||!record.record||!SHA.test(record.sha256||'')||
    await hash(JSON.stringify(record.record))!==record.sha256||!Array.isArray(record.record.receipts)||
    record.record.status!=='PARTIAL')throw Error('QWEN_RESUME_RECORD_UNVERIFIED');
 return record;
}
// document.create returns its SHA in artifact.sha256 (not at the observation root).
// Accept this only when that ledger artifact names the exact produced output.
const produced=receipt=>{
 const files=receipt.name==='image.adapt'?receipt.observation?.outputs||[]:
  ['page.create','browser.screenshot','speech.synthesize','reel.create','document.create'].includes(receipt.name)?[receipt.observation]:[];
 return files.map(p=>({...p,sha256:p?.sha256||
   (p?.artifact?.file===p?.output&&SHA.test(p.artifact.sha256||'')?p.artifact.sha256:undefined)}));
};
const pathAllowed=(output,missionId)=>typeof output==='string'&&(
 output.startsWith('.jarvis-artifacts/images/'+missionId+'-')||
 output.startsWith('.jarvis-artifacts/qwen-general/'+missionId+'/')||
 output.startsWith('.jarvis-artifacts/audio/'+missionId+'-')
 )&&!output.includes('..');
export async function verifiedResumeReceipts(record,missionId,bridge,auth,signal,artifactMissionId=missionId,requireTimedSpeech=false){
 if(!GENERAL.test(artifactMissionId)||!MISSION.test(missionId))throw Error('QWEN_RESUME_ORIGIN_SCOPE_INVALID');
 if(!record||record.missionId!==missionId||!Array.isArray(record.record?.receipts))throw Error('QWEN_RESUME_RECORD_UNVERIFIED');
 const user=auth?.currentUser;
 if(!user?.getIdToken)throw Error('QWEN_RESUME_SESSION_REQUIRED');
 const token=await user.getIdToken();
 if(auth.currentUser!==user)throw Error('QWEN_RESUME_SESSION_CHANGED');
 const original=record.record.receipts;
 const ok=original.filter(r=>r?.ok===true&&r.observation?.ok===true);
 const producedFiles=ok.flatMap(r=>produced(r));
 if(!producedFiles.length||producedFiles.some(p=>!p?.output||!SHA.test(p.sha256||'')||!pathAllowed(p.output,artifactMissionId)))throw Error('QWEN_RESUME_ARTIFACT_SOURCE_MISMATCH');
 const wanted=[...new Map(producedFiles.map(p=>[p.output,p.sha256])).entries()];
 if(wanted.length!==producedFiles.length)throw Error('QWEN_RESUME_ARTIFACT_DUPLICATE');
 if(!wanted.length||!ok.some(r=>r.name==='advertising.research')||!ok.some(r=>r.observation.advertisingSemanticReview?.verified===true)||!ok.some(r=>r.name==='image.adapt'&&r.observation.creativeSemanticReview?.verified===true))throw Error('QWEN_RESUME_RECEIPT_SCOPE_INVALID');
 const verified=new Map();
 for(const [output,sha] of wanted){
  signal?.throwIfAborted();
  let read;try{read=await bridge.requestJson('/artifact/read',{output},{idToken:token,signal,timeoutMs:20000});}
  catch{throw Error('QWEN_RESUME_PHYSICAL_READ_FAILED');}
  if(auth.currentUser!==user)throw Error('QWEN_RESUME_SESSION_CHANGED');
  if(read?.ok!==true||read.output!==output||read.sha256!==sha||read.artifact?.sha256!==sha)
   throw Error('QWEN_RESUME_PHYSICAL_SHA_MISMATCH');
  verified.set(output,sha);
 }
 if(ok.some(r=>r.name==='image.adapt'&&!(r.observation.outputs||[]).every(p=>verified.get(p.output)===p.sha256)))throw Error('QWEN_RESUME_IMAGE_BINDING_INVALID');
 const resumed=ok.filter(r=>{
  if(r.name==='media.library'&&r.args?.action==='export')return verified.has(r.args.output)&&r.observation.sha256===verified.get(r.args.output);
  if(r.name==='artifact.read')return verified.has(r.observation.output)&&r.observation.sha256===verified.get(r.observation.output);
  if(r.name==='media.analyze'){
   const sha=verified.get(r.observation.output);
   if(!sha)return false;
   if(r.observation.status==='LOCAL_VIDEO_REVIEW_VERIFIED')
    return r.observation.sourceSha256===sha&&r.observation.visualPassed===true&&
     r.observation.audioEvidence?.nonSilent===true&&
     Array.isArray(r.observation.frames)&&r.observation.frames.length===3&&
     r.observation.frames.every(frame=>frame.visualPassed===true);
   return r.observation.imageSha256===sha&&r.observation.visualPassed===true;
  }
  return true;
 });
 if(!requireTimedSpeech)return structuredClone(resumed);
 // Previous 8-second, unsynchronized WAV remains in the immutable evidence
 // record but is superseded for this 30-second reel continuation.
 const obsolete=new Set(resumed.filter(r=>r.name==='speech.synthesize'&&r.observation.sceneTimed!==true)
  .map(r=>r.observation.output));
 return structuredClone(resumed.filter(r=>!(r.name==='speech.synthesize'&&obsolete.has(r.observation.output))&&
  !(r.name==='artifact.read'&&obsolete.has(r.observation.output))&&
  !(r.name==='media.library'&&r.args?.action==='export'&&obsolete.has(r.args.output))));
}


// Research-only continuation. Never replay database reads, advertising decisions,
// platform mutations or unverified artifacts from a saved browser record.
export async function verifiedResearchResumeReceipts(record,missionId,bridge,auth,signal,instruction='',artifactMissionId=missionId){
 const reason=record?.record?.reason;
 const retryable=['STEP_LIMIT_REACHED','LOCAL_QWEN_ACTION_INCOMPLETE'].includes(reason)||
   reason==='MODEL_UNAVAILABLE'&&record?.record?.failureCode==='LOCAL_QWEN_ACTION_INCOMPLETE';
 if(!MISSION.test(missionId)||!GENERAL.test(artifactMissionId)||record?.missionId!==missionId||record.record?.status!=='PARTIAL'||
    !retryable||!Array.isArray(record.record.receipts))
   throw Error('QWEN_RESEARCH_RESUME_SCOPE_INVALID');
 const allowed=new Set(['web.research','browser.inspect','document.create','artifact.read','media.library']);
 const receipts=record.record.receipts;
 if(!receipts.length||receipts.some(r=>r?.ok!==true||r.observation?.ok!==true||!allowed.has(r.name)))
   throw Error('QWEN_RESEARCH_RESUME_RECEIPTS_INVALID');
 const searches=receipts.filter(r=>r.name==='web.research');
 const urls=new Set(searches.flatMap(r=>(r.observation?.sources||[]).map(s=>s.url)));
 if(!searches.length||!urls.size||receipts.some(r=>r.name==='browser.inspect'&&
    (!urls.has(r.args?.url)||r.args.url!==r.observation?.url||
     typeof r.observation.dom!=='string'||r.observation.dom.length===0)))
   throw Error('QWEN_RESEARCH_RESUME_SOURCE_MISMATCH');
 const user=auth?.currentUser;
 if(!user?.getIdToken)throw Error('QWEN_RESEARCH_RESUME_SESSION_REQUIRED');
 const token=await user.getIdToken();
 if(auth.currentUser!==user)throw Error('QWEN_RESEARCH_RESUME_SESSION_CHANGED');
 const {researchOfficeContent}=await import('./qwen-general-evidence.js?pilot=research-evidence-20261021-v3');
 const expected=researchOfficeContent(receipts,instruction);
 const goodDocs=new Map();
 for(const r of receipts.filter(r=>r.name==='document.create')){
  const o=r.observation,output=o?.output,sha=o?.artifact?.file===output?o.artifact.sha256:null;
  if(!expected||r.args?.content!==expected||!pathAllowed(output,artifactMissionId)||
     !SHA.test(sha||'')||!['docx','pdf'].includes(r.args?.format))continue;
  if(r.args.format==='docx'&&o.documentValidation?.ok!==true)continue;
  if(r.args.format==='pdf'&&!(o.pdfContentProof?.verified===true&&o.pdfContentProof.sourceSha256===sha))continue;
  signal?.throwIfAborted();
  let read;
  try{read=await bridge.requestJson('/artifact/read',{output},{idToken:token,signal,timeoutMs:20000});}
  catch{throw Error('QWEN_RESEARCH_RESUME_PHYSICAL_READ_FAILED');}
  if(auth.currentUser!==user)throw Error('QWEN_RESEARCH_RESUME_SESSION_CHANGED');
  if(read?.ok!==true||read.output!==output||read.sha256!==sha||read.artifact?.sha256!==sha)
    throw Error('QWEN_RESEARCH_RESUME_PHYSICAL_SHA_MISMATCH');
  goodDocs.set(output,sha);
 }
 return structuredClone(receipts.filter(r=>{
  if(['web.research','browser.inspect'].includes(r.name))return true;
  const output=r.observation?.output||r.args?.output;
  if(!goodDocs.has(output))return false;
  const sha=goodDocs.get(output);
  if(r.name==='document.create')return r.observation?.artifact?.sha256===sha;
  if(r.name==='artifact.read')return r.observation?.sha256===sha&&r.observation?.bytes>32&&typeof r.observation?.dataBase64==='string';
  if(r.name==='media.library')return r.args?.action==='export'&&r.observation?.sha256===sha&&r.observation?.experimental===true;
  return false;
 }));
}
