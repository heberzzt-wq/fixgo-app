// Narrow, authenticated remote read-only extension of the existing Firestore relay.
// This file does not start a worker, deploy rules, or authorize production writes.
const permittedTools=new Set(['web.research','browser.inspect']);
const mobilePaths=new Set(['/semantic/plan','/research','/browser','/qwen-pilot/preflight',
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
export function mobileRelayNeedsFreshOwnerToken(route,payload){
 return route==='/semantic/plan'&&payload?.missionState?.phase==='DIRECT_READ_ONLY_ACTION'||
  ['/qwen-isolated/evidence','/qwen-isolated/verify'].includes(route);
}
