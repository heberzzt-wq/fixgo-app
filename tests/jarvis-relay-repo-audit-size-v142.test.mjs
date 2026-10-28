import test from 'node:test';
import assert from 'node:assert/strict';
import {boundMobileRelayRepoAuditGraph} from '../modules/terminal/jarvis-mobile-relay-policy.js';

const encoder=new TextEncoder();
const raw={
 ok:true,status:'REPO_GRAPH_READY',version:'v142',
 repositoryTarget:{kind:'local',commit:'a'.repeat(40)},
 summary:{filesScanned:2500,modules:112,duplicateEndpoints:1},
 nodes:Object.fromEntries(Array.from({length:2500},(_,i)=>
  ['modules/area_'+i+'/file-'+i+'.js',{imports:Array(80).fill('module.js'),sourceExcerpt:'S'.repeat(300)}])),
 duplicateEndpoints:[{route:'/api/test',files:['a.js','b.js']}]
};
test('oversized audit graph becomes complete source-path projection, not 384KB error',()=>{
 const before=Object.keys(raw.nodes).length;
 const bounded=boundMobileRelayRepoAuditGraph('/repo/graph',{source:'repo_audit_live_graph_v8'},raw);
 assert.equal(bounded.ok,true);
 assert.equal(bounded.summary.filesScanned,2500);
 assert.equal(bounded.relayProjection.complete,true);
 assert.equal(Object.keys(bounded.nodes).length,1000);
 assert.equal(bounded.duplicateEndpoints.length,1);
 assert.equal(raw.nodes['modules/area_0/file-0.js'].sourceExcerpt.length,300);
 assert.equal(Object.keys(raw.nodes).length,before,'full local graph unchanged');
 assert.ok(encoder.encode(JSON.stringify({...bounded,relay:{requestId:'x'.repeat(36)}})).length<384*1024);
 assert.doesNotMatch(JSON.stringify(bounded),/S{50}/,'raw graph body must stay local');
});
test('non-audit graph and non-repository responses keep their exact object',()=>{
 assert.equal(boundMobileRelayRepoAuditGraph('/repo/graph',{source:'repo_scan_live'},raw),raw);
 assert.equal(boundMobileRelayRepoAuditGraph('/semantic/plan',{source:'repo_audit_live_graph_v8'},raw),raw);
});
test('insufficient byte budget fails closed instead of claiming complete inventory',()=>{
 const long={...raw,duplicateEndpoints:[{file:'a',content:'X'.repeat(5000)}]};
 const projected=boundMobileRelayRepoAuditGraph('/repo/graph',
  {source:'repo_audit_live_graph_v8'},long,{maxBytes:8000});
 assert.equal(projected.ok,false);
 assert.equal(projected.relayProjection.complete,false);
 assert.equal(projected.status,'REPO_AUDIT_RELAY_EVIDENCE_PARTIAL');
 assert.ok(encoder.encode(JSON.stringify(projected)).length<8000);
});

test('private relay uses the bounded repository audit response before Firestore',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync('modules/terminal/nexo-bootstrap.js','utf8');
 assert.match(source,/boundMobileRelayRepoAuditGraph\(approved\.route, localPayload, value, \{maxBytes:policy\.maxBytes\}\)/);
 assert.ok(source.indexOf('boundMobileRelayRepoAuditGraph(approved.route')<source.indexOf('JARVIS_RELAY_RESPONSE_TOO_LARGE'));
});
