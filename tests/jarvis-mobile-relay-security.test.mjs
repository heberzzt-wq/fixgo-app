import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JARVIS_PRIVATE_RELAY,validateJarvisRelayRequest} from '../gestia-core/jarvis/jarvis.semantic.transport.js';
import {JARVIS_MOBILE_READONLY_ROUTES,validateMobileRelayReadOperation,
 mobileRelayNeedsFreshOwnerToken,safeMobileReadUrl} from '../modules/terminal/jarvis-mobile-relay-policy.js';
const missionId='general-11111111-2222-4333-8444-555555555555';
const requestId='11111111-2222-4333-8444-555555555555';
const owner=JARVIS_PRIVATE_RELAY.ownerUid;
const ownerRequest=(route,payload)=>({
 schemaVersion:1,ownerUid:owner,requestId,route,releaseId:'mobile-release-fixture',
 body:JSON.stringify(payload),state:'QUEUED',createdAt:Date.now()-15,expiresAt:Date.now()+60000
});
const restricted=(route,payload)=>validateJarvisRelayRequest(ownerRequest(route,payload),{
 requestId,releaseId:'mobile-release-fixture'});
const direct={instruction:'Research HVAC maintenance using three sources',tools:[
 {name:'web.research',inputSchema:{type:'object'},requiresApproval:false,mutates:false},
 {name:'browser.inspect',inputSchema:{type:'object'},requiresApproval:false,mutates:false}],
 observations:[],missionState:{phase:'DIRECT_READ_ONLY_ACTION',pilotKind:'general-v1'}};
test('owner-only mobile route matrix excludes mutations and preserves actual Firestore rules',()=>{
 const rules=readFileSync(new URL('../security/firestore-console-snapshot-2026-07-30.rules.txt',import.meta.url),'utf8');
 const relays=rules.slice(rules.indexOf('match /jarvis_private_relay/{ownerUid}'));
 assert.ok(relays.includes('request.auth.uid == ownerUid'));
 assert.ok(relays.includes('isRelayWorker'));
 assert.ok(relays.includes('data.state == \'QUEUED\''));
 for(const route of JARVIS_MOBILE_READONLY_ROUTES){
  assert.ok(JARVIS_PRIVATE_RELAY.routes.includes(route));
  assert.ok(relays.includes("'"+route+"'"),route);
 }
 for(const route of ['/write/authorize','/repo/write','/media/library','/platform/query','/shutdown'])
  assert.ok(!JARVIS_PRIVATE_RELAY.routes.includes(route),route);
 assert.equal(JARVIS_PRIVATE_RELAY.maxBytes,384*1024);
});
test('mobile direct inference carries only whitelisted read-only tools and owner scope',()=>{
 const result=restricted('/semantic/plan',direct);
 assert.equal(result.route,'/semantic/plan');
 assert.equal(result.payload.tools.length,2);
 assert.equal(mobileRelayNeedsFreshOwnerToken(result.route,result.payload),true);
 assert.equal(restricted('/semantic/plan',{input:'Existing owner relay CURRENT_TURN',missionState:{phase:'CURRENT_TURN'}}).route,'/semantic/plan',
  'legacy authorized CURRENT_TURN relay remains supported without granting direct Qwen privilege');
 for(const variant of [
  {...direct,tools:[{name:'document.create',mutates:true}]},
  {...direct,tools:[{name:'repo.read'}]},
  {...direct,tools:[{name:'browser.inspect',requiresApproval:true}]},
  {...direct,tools:[{name:'web.research',mutates:true}]},
  {...direct,tools:[{name:'platform.query'}]},
  {...direct,missionState:{...direct.missionState,pilotKind:'unknown'}},
  {...direct,advertisingEvidence:{}},
  {...direct,idToken:'must-not-persist'},
  {...direct,tools:[],privateKey:'must-not-persist'}
 ])assert.throws(()=>restricted('/semantic/plan',variant),/JARVIS_MOBILE_RELAY_/);
});
test('remote HTML reads are HTTPS-only and never permit private host forms or screenshots',()=>{
 for(const url of ['http://example.com','http://127.0.0.1:3344','https://localhost','https://10.0.0.1/',
  'https://example.local','https://user:pass@example.com/','https://example.com:4433'])
  assert.equal(safeMobileReadUrl(url),false,url);
 assert.equal(safeMobileReadUrl('https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist'),true);
 const args={action:'inspect',url:'https://www.energystar.gov/saveathome/heating-cooling/maintenance-checklist'};
 assert.equal(restricted('/browser',args).route,'/browser');
 for(const variant of [{...args,action:'screenshot'}, {...args,output:'.jarvis-artifacts/unsafe.png'},
  {...args,url:'http://127.0.0.1:3344/health'}])
  assert.throws(()=>restricted('/browser',variant),/JARVIS_MOBILE_RELAY_/);
});
test('research and isolated evidence enforce bounds and no credentials in Firestore',()=>{
 assert.equal(restricted('/research',{query:'filter cleaning maintenance'}).route,'/research');
 assert.equal(restricted('/qwen-pilot/preflight',{clientFingerprint:'a'.repeat(64)}).route,'/qwen-pilot/preflight');
 assert.equal(restricted('/qwen-isolated/evidence',{missionId}).route,'/qwen-isolated/evidence');
 assert.equal(mobileRelayNeedsFreshOwnerToken('/qwen-isolated/evidence',{missionId}),true);
 for(const item of [
  ['/research',{query:'x'}],
  ['/research',{query:'valid query',secret:'unknown field'}],
  ['/research',{query:'valid query',seedUrl:'http://localhost'}],
  ['/qwen-pilot/preflight',{clientFingerprint:'bad'}],
  ['/qwen-isolated/verify',{missionId:'wrong'}],
  ['/browser',{action:'open',url:'https://example.com'}]
 ])assert.throws(()=>restricted(item[0],item[1]),/JARVIS_MOBILE_RELAY_/);
 for(const route of ['/research','/browser','/qwen-pilot/preflight'])
  assert.equal(mobileRelayNeedsFreshOwnerToken(route,{}),false);
});
