import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generalPilotPreflightTransportReason,runQwenGeneralPilot} from '../modules/terminal/qwen-general-pilot.js';

test('mobile preflight distinguishes failure modes without leaking the exception',()=>{
 const cases=[
  [new Error('JARVIS_RELAY_WORKSTATION_UNAVAILABLE'),'JARVIS_RELAY_WORKSTATION_UNAVAILABLE'],
  [new Error('JARVIS_RELAY_LOCAL_RELEASE_MISMATCH'),'JARVIS_RELAY_LOCAL_RELEASE_MISMATCH'],
  [new Error('permission-denied'), 'JARVIS_RELAY_PERMISSION_DENIED'],
  [new Error('FirebaseError: unauthenticated'), 'JARVIS_RELAY_AUTH_REQUIRED'],
  [new Error('Failed to fetch'), 'JARVIS_RELAY_NETWORK_UNAVAILABLE'],
  [new Error('Bearer do-not-expose-secret'), 'JARVIS_RELAY_PREFLIGHT_UNKNOWN']
 ];
 for(const [error,expected] of cases)assert.equal(generalPilotPreflightTransportReason(error),expected);
});

test('real pilot preflight surfaces the safe mobile transport blocker, not the old generic code',async()=>{
 const warnings=[],originalWarn=console.warn;
 console.warn=(...args)=>warnings.push(args);
 try{
  await assert.rejects(runQwenGeneralPilot({
   instruction:'Investiga el mantenimiento de filtros de aire acondicionado residencial. Busca tres fuentes independientes. No modifiques archivos.',
   bridge:{requestJson:async()=>{throw Error('JARVIS_RELAY_WORKSTATION_UNAVAILABLE');}}
  }),/QWEN_PILOT_PREFLIGHT_FAILED:JARVIS_RELAY_WORKSTATION_UNAVAILABLE/);
 }finally{console.warn=originalWarn;}
 assert.equal(warnings.length,1);
 assert.equal(warnings[0][1],'JARVIS_RELAY_WORKSTATION_UNAVAILABLE');
});

test('public mobile cannot turn itself into a localhost workstation when the owner broker is absent',()=>{
 const bootstrap=readFileSync(new URL('../modules/terminal/nexo-bootstrap.js',import.meta.url),'utf8');
 const start=bootstrap.indexOf('if (code !== "JARVIS_RELAY_WORKSTATION_UNAVAILABLE") throw error;');
 const takeover=bootstrap.indexOf('await bridge.enablePrivateRelay();',start);
 assert.ok(start>0 && takeover>start);
 const guarded=bootstrap.slice(start,takeover);
 assert.match(guarded,/if \(publicOrigin\)/);
 assert.match(guarded,/return client.requestJson\(route, payload/);
 assert.doesNotMatch(guarded,/return direct\(/);
});

test('startup bridge ensure checks the public loopback supervisor contract, not owner-token health',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const ensure=pkg.scripts['bridge:ensure'];
 assert.ok(ensure.includes("path:'/health'"));
 assert.ok(!ensure.includes('/workstation/health'));
 assert.ok(ensure.includes('json?.supervisor?.bridgeVersion'));
 assert.ok(ensure.includes('json?.supervisor?.workerStarted'));
});
