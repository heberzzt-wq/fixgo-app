// Only exports a completed, read-only engineering preview from the user's
// authenticated local IndexedDB. No repo writes, approvals or Docker execution.
import {validMissionId} from './qwen-download-ui.js';
import {JARVIS_PRIVATE_RELAY} from '../../gestia-core/jarvis/jarvis.semantic.transport.js';
const HASH=/^[a-f0-9]{64}$/i;
const FIXTURE=/^tests\/fixtures\/[a-zA-Z0-9_-]+\.(?:js|mjs)$/;
const forbidden=new Set(['repo.write','repo.authorizeWrite','repo.safePatchApply','git.push','deploy']);
const digest=async content=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))),b=>b.toString(16).padStart(2,'0')).join('');

export async function verifiedCodePreviewRecord(record,missionId){
 if(!validMissionId(missionId)||!missionId.startsWith('general-')||
    record?.status!=='SUCCESS'||record?.reason!=='VERIFIED_COMPLETE'||
    record?.certification?.ok!==true||!Array.isArray(record.receipts))return null;
 const receipts=record.receipts;
 if(receipts.some(r=>forbidden.has(r?.name)))return null;
 const previews=receipts.filter(r=>r?.name==='repo.prepareWrite');
 if(previews.length!==1)return null;
 const patch=previews[0],args=patch.args||{},o=patch.observation||{};
 if(patch.ok!==true||o.ok!==true||o.status!=='WRITE_PREPARED'||
    o.written!==false||o.verified!==false||o.requiresApproval!==true||
    o.caseId!==missionId||o.objectiveId!=='QWEN_PREVIEW_'+missionId||
    !FIXTURE.test(args.file||'')||o.file!==args.file||
    args.operation!=='replace'||args.matchCount!==1||
    !HASH.test(o.fingerprint||'')||!HASH.test(o.snapshotSha256||'')||
    !HASH.test(o.expectedSha256||'')||
    o.snapshotSha256===o.expectedSha256||
    typeof args.search!=='string'||!args.search||
    typeof args.replace!=='string'||!args.replace||
    args.search===args.replace)return null;
 const read=receipts.find(r=>r?.name==='repo.read'&&r.ok===true&&
    r.args?.file===args.file&&r.observation?.verifiedRead?.file===args.file&&
    typeof r.observation.verifiedRead.content==='string');
 if(!read)return null;
 const original=read.observation.verifiedRead.content;
 if(original.split(args.search).length!==2)return null;
 const proposed=original.replace(args.search,args.replace);
 if(await digest(original)!==o.snapshotSha256||await digest(proposed)!==o.expectedSha256)return null;
 const tests=receipts.findIndex(r=>r?.name==='tests.run'&&r.ok===true&&
    r.args?.command==='check:syntax'&&r.observation?.status==='PASSED'&&
    r.observation?.testsPassed===true&&r.observation?.exitCode===0);
 if(tests<0||tests>=receipts.indexOf(patch))return null;
 return {missionId,file:args.file,sha256:o.snapshotSha256,preparedSha256:o.expectedSha256,
    fingerprint:o.fingerprint,testsBeforeOnly:true,written:false,
    requiresHumanApproval:true};
}

export function verifiedHostIsolatedProof(preview,proof){
 return proof?.ok===true&&proof?.status==='ISOLATED_FIXTURE_BEFORE_AFTER_VERIFIED'&&
    proof.missionId===preview?.missionId&&proof.sourceFile===preview?.file&&
    proof.sourceSha256===preview?.sha256&&proof.expectedSha256===preview?.preparedSha256&&
    proof.fingerprint===preview?.fingerprint&&
    proof.before?.passed===3&&proof.before?.failed===1&&proof.after?.passed===4&&proof.after?.failed===0&&
    proof.sourceRepoUnchanged===true&&proof.patchApplied===false&&
    proof.productionRepairCertified===false&&proof.humanApprovalStillRequired===true&&
    proof.scope==='controlled-fixture-only';
}
export function appendCodePreviewReceiptCard(host,{missionId,url,file,isolatedProof=false}={}){
 if(!host||!validMissionId(missionId)||!FIXTURE.test(file||'')||
    typeof url!=='string'||!url.startsWith('blob:'+location.origin+'/'))return null;
 host.querySelectorAll('[data-jarvis-code-preview]').forEach(n=>n.remove());
 const section=document.createElement('section');
 section.className='jarvis-download-panel';
 section.dataset.jarvisCodePreview=missionId;
 const heading=document.createElement('strong');
 heading.textContent='Parche preparado para revisión — NO aplicado';
 const detail=document.createElement('span');
 detail.textContent=missionId+' · '+file;
 const disclaimer=document.createElement('small');
 disclaimer.textContent=isolatedProof?
  'Docker: verificación física local 3/4 antes y 4/4 después. Archivo original intacto. Solo caso ficticio; el parche NO está aplicado ni autorizado para producción.':
  'Solo se ejecutaron pruebas del código original. Falta comprobar el parche en aislamiento antes/después. No es autorización para escribir ni publicar.';
 const link=document.createElement('a');
 link.className='jarvis-download-button';
 link.href=url;
 link.download=missionId+'-prepared-patch.json';
 link.textContent='Descargar expediente de parche (JSON)';
 section.append(heading,detail,link,disclaimer);
 host.append(section);
 return section;
}

export async function restoreLatestCodePreviewReceiptCard({host,auth,bridge}={}){
 if(!host||!auth?.currentUser||!globalThis.indexedDB)return null;
 const identity=auth.currentUser;
 if(identity.uid!==JARVIS_PRIVATE_RELAY.ownerUid||typeof identity.getIdToken!=='function')return null;
 const candidate=await new Promise((resolve,reject)=>{
  const req=indexedDB.open('jarvis-qwen-general-evidence',1);
  req.onerror=()=>reject(Error('CODE_PREVIEW_STORE_UNAVAILABLE'));
  req.onsuccess=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains('missions')){db.close();resolve(null);return;}
   const tx=db.transaction('missions','readonly'),cursor=tx.objectStore('missions').openCursor();
   let latest=null;
   cursor.onsuccess=()=>{
    const it=cursor.result;if(!it)return;
    const row=it.value,receipts=row.record?.receipts;
    if(validMissionId(row.missionId)&&row.record?.status==='SUCCESS'&&
       row.record?.reason==='VERIFIED_COMPLETE'&&
       receipts?.some(r=>r.name==='repo.prepareWrite')&&
       (!latest||String(row.createdAt||'')>String(latest.createdAt||'')))latest=row;
    it.continue();
   };
   tx.oncomplete=()=>{db.close();resolve(latest);};
   tx.onerror=()=>{db.close();reject(Error('CODE_PREVIEW_STORE_READ_FAILED'));};
  };
 });
 if(!candidate||auth.currentUser!==identity)return null;
 const serialized=JSON.stringify(candidate.record);
 const actual=await digest(serialized);
 if(actual!==candidate.sha256)return null;
 const preview=await verifiedCodePreviewRecord(candidate.record,candidate.missionId);
 if(!preview||auth.currentUser!==identity)return null;
 let proof=null;
 if(typeof bridge?.requestJson==='function'){
  try{
   const idToken=await identity.getIdToken();
   if(auth.currentUser!==identity)return null;
   const observed=await bridge.requestJson('/qwen-isolated/evidence',
       {missionId:candidate.missionId},{idToken,timeoutMs:12000});
   if(verifiedHostIsolatedProof(preview,observed))proof=observed;
  }catch{/* No host archive or invalid authorization: keep truthful pending status. */}
  // Once a source-bound, read-only patch preview is independently verified,
  // the authenticated host can run its fixed fixture in pinned Docker.
  // This never applies the patch, changes repository files or grants approval.
  if(!proof&&preview.file==='tests/fixtures/v142-rebate-preview.js'){
   try{
    const idToken=await identity.getIdToken();
    if(auth.currentUser!==identity)return null;
    const observed=await bridge.requestJson('/qwen-isolated/verify',
      {missionId:candidate.missionId,record:candidate.record},
      {idToken,timeoutMs:120000});
    if(verifiedHostIsolatedProof(preview,observed))proof=observed;
   }catch{/* Docker unavailable or verification rejected: retain explicit pending status. */}
  }
 }
 if(auth.currentUser!==identity)return null;
 const url=URL.createObjectURL(new Blob([serialized],{type:'application/json'}));
 return appendCodePreviewReceiptCard(host,{missionId:candidate.missionId,
    url,file:preview.file,isolatedProof:!!proof});
}
