// Narrow, authenticated remote read-only extension of the existing Firestore relay.
// This file does not start a worker, deploy rules, or authorize production writes.
const permittedTools=new Set(['web.research','browser.inspect']);
// These are inert receipt-origin labels emitted by the existing repo.read tool.
// They are never authorization and must not be forwarded as bridge instructions.
const permittedRepoReadSources=new Set(['jarvis_repo_read_v7','jarvis_repo_read_structure_v1']);
const mobilePaths=new Set(['/semantic/plan','/research','/browser','/read','/qwen-pilot/preflight',
 '/qwen-isolated/evidence','/qwen-isolated/verify']);
export const JARVIS_MOBILE_READONLY_ROUTES=Object.freeze([...mobilePaths]);
const forbiddenFields=/^(?:authorization|idToken|firebaseToken|firebaseIdToken|serviceAccount|privateKey|credential|password)$/i;

function cleanBody(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))return false;
 const body=JSON.stringify(payload);
 if(body.length>250000)return false;
 let unsafe=false;
 const visit=(v,depth)=>{
  if(depth>12){unsafe=true;return;}
  if(v&&typeof v==='object')for(const [key,value] of Object.entries(v)){
   if(forbiddenFields.test(key)){unsafe=true;return;}
   visit(value,depth+1);
  }
 };
 visit(payload,0);
 return !unsafe;
}
export function safeMobileReadUrl(raw){
 try{
  const u=new URL(String(raw||'')),hostname=u.hostname.replace(/\.$/,'').toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||
   !hostname.includes('.')||hostname.length>253||hostname.startsWith('[')||
   /^\d+\.\d+\.\d+\.\d+$/.test(hostname)||
   /(?:^|\.)(?:localhost|local|internal|invalid|home|test|lan)$/.test(hostname))return false;
  return true;
 }catch{return false;}
}
export function validateMobileRelayReadOperation(route,payload={}){
 if(!mobilePaths.has(route)||!cleanBody(payload))throw Error('JARVIS_MOBILE_RELAY_REQUEST_DENIED');
 if(route==='/semantic/plan'){
  if(payload?.missionState?.phase!=='DIRECT_READ_ONLY_ACTION'||
   payload.missionState.pilotKind!=='general-v1'||
   payload.visualOutput||payload.advertisingEvidence||
   !Array.isArray(payload.tools)||payload.tools.length>4||
   !payload.tools.every(t=>t&&permittedTools.has(t.name)&&t.requiresApproval!==true&&t.mutates!==true)||
   typeof payload.instruction!=='string'||payload.instruction.length>12000||
   !Array.isArray(payload.observations)||payload.observations.length>12)
   throw Error('JARVIS_MOBILE_RELAY_READ_ONLY_REQUIRED');
 }
 if(route==='/read'){
  const source=payload.file??payload.path;
  const text=String(source||'').replaceAll('\\','/');
  if(typeof source!=='string'||!text.trim()||text.length>400||
   text.startsWith('/')||/^[A-Za-z]:\//.test(text)||
   text.split('/').some(part=>part==='..'||part==='.'||!part)||
   /(?:^|\/)(?:\.git|\.env(?:\.|$)|[^/]*firebase-adminsdk[^/]*|serviceAccountKey\.json|[^/]*\.(?:pem|key|p12|pfx))(?:\/|$)/i.test(text)||
   Object.keys(payload).some(k=>!['file','path','maxBytes','startLine','fromLine','endLine','toLine','source'].includes(k))||
   (Object.hasOwn(payload,'source')&&!permittedRepoReadSources.has(payload.source))||
   ['startLine','fromLine','endLine','toLine','maxBytes'].some(k=>payload[k]!==undefined&&
     (!Number.isSafeInteger(Number(payload[k]))||Number(payload[k])<1||Number(payload[k])>500000)))
   throw Error('JARVIS_MOBILE_RELAY_REPO_READ_SCOPE_INVALID');
 }
 if(route==='/browser'){
  if(payload.action!=='inspect'||!safeMobileReadUrl(payload.url)||
   Object.keys(payload).some(key=>!['action','url','timeoutMs'].includes(key)))
   throw Error('JARVIS_MOBILE_RELAY_BROWSER_INSPECTION_ONLY');
 }
 if(route==='/research'){
  if(typeof payload.query!=='string'||payload.query.length<5||payload.query.length>600||
   payload.seedUrl&&!safeMobileReadUrl(payload.seedUrl)||
   Object.keys(payload).some(key=>!['query','timeoutMs','allowedDomain','exactEntity','seedUrl'].includes(key)))
   throw Error('JARVIS_MOBILE_RELAY_RESEARCH_ONLY');
 }
 if(route==='/qwen-pilot/preflight'){
  if(!/^[a-f0-9]{64}$/i.test(String(payload.clientFingerprint||'')))
   throw Error('JARVIS_MOBILE_RELAY_PREFLIGHT_REQUIRED');
 }
 if(route==='/qwen-isolated/evidence'||route==='/qwen-isolated/verify'){
  if(!/^general-[a-f0-9-]{36}$/i.test(String(payload.missionId||'')))
   throw Error('JARVIS_MOBILE_RELAY_MISSION_SCOPE_REQUIRED');
 }
 return {route,payload};
}
// In the mobile transport, the 8k-token Qwen gets bounded source pages.
// Every page preserves its exact original line numbers and partial flag on the
// Bridge. Full repository content never goes into one Firestore response.
export function boundedMobileRelayReadPayload(payload={}){
 validateMobileRelayReadOperation('/read',payload);
 const requested=String(payload.file??payload.path).replaceAll('\\','/');
 const start=Number(payload.startLine??payload.fromLine??1);
 const desiredEnd=Number(payload.endLine??payload.toLine??(start+119));
 return {file:requested,startLine:start,endLine:Math.max(start,Math.min(desiredEnd,start+119)),
   maxBytes:Math.min(18000,Number(payload.maxBytes??18000))};
}
// Response projection for a specific read-only inventory request. The full
// AST graph stays on the workstation. The mobile repo.audit tool only consumes
// summary, node PATHS and duplicateEndpoints; it never reads node bodies.
// Any required evidence that cannot fit is explicitly failed, not certified.
export function boundMobileRelayRepoAuditGraph(route,payload,value,{maxBytes=384*1024}={}){
 if(route!=='/repo/graph'||payload?.source!=='repo_audit_live_graph_v8'||value?.ok!==true)
   return value;
 const paths=Object.keys(value.nodes||{}).slice(0,1000);
 const duplicates=Array.isArray(value.duplicateEndpoints)?value.duplicateEndpoints:[];
 const budget=Math.max(1024,Math.min(maxBytes,384*1024)-4096);
 const encodedSize=x=>new TextEncoder().encode(JSON.stringify(x)).length;
 const report={ok:true,status:value.status||'REPO_GRAPH_READY',summary:value.summary,
   repositoryTarget:value.repositoryTarget,cache:value.cache,version:value.version,
   nodes:{},duplicateEndpoints:[],
   relayProjection:{kind:'REPO_AUDIT_PATHS_ONLY',originalNodeCount:Object.keys(value.nodes||{}).length,
      requestedPathCount:paths.length,deliveredPathCount:0,
      requestedDuplicateCount:duplicates.length,deliveredDuplicateCount:0,
      complete:true}};
 for(const file of paths){
   report.nodes[file]={};
   if(encodedSize(report)>budget){delete report.nodes[file];break;}
   report.relayProjection.deliveredPathCount++;
 }
 for(const item of duplicates){
   report.duplicateEndpoints.push(item);
   if(encodedSize(report)>budget){report.duplicateEndpoints.pop();break;}
   report.relayProjection.deliveredDuplicateCount++;
 }
 const complete=report.relayProjection.deliveredPathCount===paths.length &&
   report.relayProjection.deliveredDuplicateCount===duplicates.length;
 report.relayProjection.complete=complete;
 if(!complete){
   report.ok=false;
   report.status='REPO_AUDIT_RELAY_EVIDENCE_PARTIAL';
   report.error='REPO_AUDIT_RELAY_EVIDENCE_PARTIAL';
 }
 return report;
}

export function mobileRelayNeedsFreshOwnerToken(route,payload){
 return route==='/semantic/plan'&&payload?.missionState?.phase==='DIRECT_READ_ONLY_ACTION'||
  ['/qwen-isolated/evidence','/qwen-isolated/verify'].includes(route);
}
