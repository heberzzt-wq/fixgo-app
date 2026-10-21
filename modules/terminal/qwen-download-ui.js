// Download UX for authenticated local Jarvis mission artifacts.
// An artifact is a browser download only after a user clicks its link.
const MISSION=/^(?:general|resume)-[a-f0-9-]{36}$/i;
const SHA=/^[a-f0-9]{64}$/i;
const OUTPUT=/^\.jarvis-artifacts\/qwen-general\/general-[a-f0-9-]{36}\/[a-zA-Z0-9._-]+\.(?:docx|pdf|xlsx|pptx|txt|md|csv|json)$/i;
const types={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',md:'text/markdown',csv:'text/csv',json:'application/json'};
const friendly={pdf:'Descargar PDF',docx:'Descargar Word',xlsx:'Descargar Excel',pptx:'Descargar presentación',txt:'Descargar texto',md:'Descargar Markdown',csv:'Descargar CSV',json:'Descargar JSON'};
export const validMissionId=id=>MISSION.test(String(id||''));
const extension=output=>String(output).split('.').at(-1)?.toLowerCase();
const exactSha=o=>o?.sha256||(o?.artifact?.file===o?.output?o.artifact.sha256:null);

export function verifiedDownloadRows(record){
 if(record?.status!=='SUCCESS'||record?.reason!=='VERIFIED_COMPLETE'||!Array.isArray(record.receipts))return [];
 const ok=record.receipts.filter(r=>r?.ok===true&&r.observation?.ok===true);
 const created=ok.filter(r=>r.name==='document.create'&&OUTPUT.test(r.observation?.output)&&r.observation?.output===r.args?.output);
 const result=new Map();
 for(const r of created){
  const output=r.observation.output,sha=exactSha(r.observation),ext=extension(output);
  if(!SHA.test(sha||'')||!types[ext])continue;
  const read=ok.find(x=>x.name==='artifact.read'&&x.observation?.output===output&&x.args?.output===output&&
      x.observation.sha256===sha&&Number(x.observation.bytes)>32);
  const exported=ok.some(x=>x.name==='media.library'&&x.args?.action==='export'&&x.args.output===output&&x.observation?.sha256===sha);
  if(!read||!exported)continue;
  result.set(output,{output,sha256:sha,bytes:read.observation.bytes,format:ext});
 }
 return [...result.values()];
}

export function appendMissionDownloadCard(host,{missionId,downloads=[],evidenceUrl=null,restored=false}={}){
 if(!host||!validMissionId(missionId))return null;
 const urls=downloads.filter(x=>OUTPUT.test(x.output)&&SHA.test(x.sha256||'')&&typeof x.downloadUrl==='string'&&x.downloadUrl.startsWith('blob:'+location.origin+'/'));
 if(!urls.length)return null;
 host.querySelectorAll('[data-jarvis-download-panel]').forEach(n=>n.remove());
 const panel=document.createElement('section');
 panel.className='jarvis-download-panel';
 panel.dataset.jarvisDownloadPanel=missionId;
 const top=document.createElement('div');top.className='jarvis-download-heading';
 const heading=document.createElement('strong');heading.textContent=restored?'Última entrega verificada':'Archivos listos para descargar';
 const detail=document.createElement('span');detail.textContent='Selecciona un archivo. Chrome lo descargará en tu carpeta habitual de Descargas.';
 top.append(heading,detail);panel.append(top);
 const links=document.createElement('div');links.className='jarvis-download-links';
 for(const data of urls){
  const a=document.createElement('a');
  a.href=data.downloadUrl;
  a.download=data.output.split('/').at(-1);
  a.className='jarvis-download-button';
  a.setAttribute('aria-label',(friendly[extension(data.output)]||'Descargar archivo')+': '+a.download);
  const icon=document.createElement('i');icon.className='fa-solid fa-download';icon.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.textContent=(friendly[extension(data.output)]||'Descargar archivo')+' (.'+extension(data.output)+')';
  a.append(icon,label);links.append(a);
 }
 panel.append(links);
 if(typeof evidenceUrl==='string'&&evidenceUrl.startsWith('blob:'+location.origin+'/')){
  const evidence=document.createElement('a');evidence.className='jarvis-download-evidence';evidence.href=evidenceUrl;
  evidence.download=missionId+'.json';evidence.textContent='Descargar recibo de verificación (JSON)';panel.append(evidence);
 }
 const note=document.createElement('small');note.textContent='Los originales permanecen en el expediente de Jarvis; no es necesario buscarlos en sus carpetas internas.';
 panel.append(note);host.append(panel);
 return panel;
}

export async function latestVerifiedRecord(){
 if(!globalThis.indexedDB)return null;
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open('jarvis-qwen-general-evidence',1);
  req.onerror=()=>reject(Error('DOWNLOAD_EVIDENCE_STORE_UNAVAILABLE'));
  req.onsuccess=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains('missions')){db.close();resolve(null);return;}
   const tx=db.transaction('missions','readonly'),cursor=tx.objectStore('missions').openCursor();
   let latest=null;
   cursor.onsuccess=()=>{
    const row=cursor.result;
    if(!row)return;
    const current=row.value;
    if(validMissionId(current?.missionId)&&verifiedDownloadRows(current.record).length&&
       (!latest||String(current.createdAt||'')>String(latest.createdAt||'')))latest=current;
    row.continue();
   };
   tx.oncomplete=()=>{db.close();resolve(latest);};
   tx.onerror=()=>{db.close();reject(Error('DOWNLOAD_EVIDENCE_READ_FAILED'));};
  };
 });
}

export async function restoreLatestMissionDownloadCard({host,auth,bridge}){
 if(!host||!auth?.currentUser?.getIdToken||typeof bridge?.requestJson!=='function')return null;
 const user=auth.currentUser,record=await latestVerifiedRecord();
 if(!record||auth.currentUser!==user)return null;
 const bytes=new TextEncoder().encode(JSON.stringify(record.record));
 const storedHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 if(storedHash!==record.sha256)return null;
 const token=await user.getIdToken();
 if(auth.currentUser!==user)return null;
 const downloadRows=verifiedDownloadRows(record.record),downloads=[];
 for(const entry of downloadRows){
  let observed;
  try{observed=await bridge.requestJson('/artifact/read',{output:entry.output},{idToken:token,timeoutMs:20000});}
  catch{continue;}
  if(auth.currentUser!==user)return null;
  if(observed?.ok!==true||observed.output!==entry.output||observed.sha256!==entry.sha256||
     observed.bytes!==entry.bytes||typeof observed.dataBase64!=='string')continue;
  try{
   const binary=Uint8Array.from(atob(observed.dataBase64),c=>c.charCodeAt(0));
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',binary)),n=>n.toString(16).padStart(2,'0')).join('');
   if(binary.length!==entry.bytes||digest!==entry.sha256)continue;
   downloads.push({...entry,downloadUrl:URL.createObjectURL(new Blob([binary],{type:types[entry.format]}))});
  }catch{}
 }
 if(!downloads.length)return null;
 return appendMissionDownloadCard(host,{missionId:record.missionId,downloads,restored:true});
}

// Failed missions need user-visible, verifiable evidence too, even when no
// physical deliverable was produced. Never treat a failure panel as success.
export async function restoreLatestMissionFailureCard(host){
 if(!host||!globalThis.indexedDB)return null;
 const candidate=await new Promise((resolve,reject)=>{
  const open=indexedDB.open('jarvis-qwen-general-evidence',1);
  open.onerror=()=>reject(Error('FAILED_MISSION_STORE_UNAVAILABLE'));
  open.onsuccess=()=>{
   const db=open.result;
   if(!db.objectStoreNames.contains('missions')){db.close();resolve(null);return;}
   let latest=null;
   const tx=db.transaction('missions','readonly');
   const cursor=tx.objectStore('missions').openCursor();
   cursor.onsuccess=()=>{
    const item=cursor.result;if(!item)return;
    const entry=item.value;
    if(validMissionId(entry?.missionId)&&entry.record?.status==='PARTIAL'&&
       (!latest||String(entry.createdAt||'')>String(latest.createdAt||'')))latest=entry;
    item.continue();
   };
   tx.oncomplete=()=>{db.close();resolve(latest);};
   tx.onerror=()=>{db.close();reject(Error('FAILED_MISSION_RECORD_READ_FAILED'));};
  };
 });
 if(!candidate)return null;
 const serialized=JSON.stringify(candidate.record);
 const bytes=new TextEncoder().encode(serialized);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(digest!==candidate.sha256)return null;
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/json'}));
 host.querySelectorAll('[data-jarvis-failure-evidence]').forEach(x=>x.remove());
 const panel=document.createElement('section');
 panel.className='jarvis-download-panel';
 panel.dataset.jarvisFailureEvidence=candidate.missionId;
 const heading=document.createElement('strong');heading.textContent='Última misión parcial: evidencia disponible';
 const reason=document.createElement('span');reason.textContent='Causa: '+String(candidate.record.reason||candidate.record.failureCode||'SIN_CERTIFICAR');
 const link=document.createElement('a');link.className='jarvis-download-button';
 link.textContent='Descargar diagnóstico de la misión (JSON)';
 link.href=url;link.download=candidate.missionId+'.json';
 const note=document.createElement('small');note.textContent='Este expediente sirve para investigar el fallo. No significa que la misión haya terminado.';
 panel.append(heading,reason,link,note);host.append(panel);
 return panel;
}
