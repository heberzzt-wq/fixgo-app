import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 JARVIS_ERROR_CATALOG,JARVIS_ERROR_CATALOG_VERSION,diagnoseJarvisError,jarvisErrorPublicMessage
} from '../gestia-core/jarvis/jarvis.error-catalog.js';
import {semanticFailurePresentation} from '../gestia-core/jarvis/jarvis.semantic.transport.js';

test('codes are stable, unique, and contain a human action',()=>{
 assert.match(JARVIS_ERROR_CATALOG_VERSION,/v142/);
 const codes=JARVIS_ERROR_CATALOG.map(x=>x.code);
 assert.equal(new Set(codes).size,codes.length);
 assert.ok(codes.length>=20);
 assert.ok(codes.every(x=>/^JAR-\d{3}$/.test(x)));
 assert.ok(JARVIS_ERROR_CATALOG.every(x=>x.title&&x.cause&&x.action&&x.signatures.length));
});
test('real incident signatures map to their owner-friendly fixed codes',()=>{
 const scenarios=[
  ['JARVIS_RELAY_WORKSTATION_UNAVAILABLE','JAR-201'],
  ['JARVIS_RELAY_LEASE_HELD','JAR-202'],
  ['JARVIS_RELAY_LOCAL_RELEASE_MISMATCH','JAR-203'],
  ['JARVIS_RELAY_RESPONSE_TOO_LARGE','JAR-204'],
  ['JARVIS_RELAY_RESULT_UNCONFIRMED_NO_REPLAY','JAR-205'],
  ['JARVIS_RELAY_OWNER_REQUIRED','JAR-206'],
  ['JARVIS_RELAY_REQUEST_EXPIRED','JAR-207'],
  ['PUBLIC_HTML_ACCESS_DENIED','JAR-301'],
  ['BROWSER_COMMAND_FAILED','JAR-302'],
  ['ENOTEMPTY','JAR-303'],
  ['REPEATED_TOOL_CALL','JAR-401'],
  ['PLANNER_UNAVAILABLE','JAR-402'],
  ['SEMANTIC_AUTHENTICATED_PROVIDER_SEMANTIC_GROUNDED_ARGUMENTS_REQUIRED','JAR-403'],
  ['LOCAL_SEMANTIC_PLAN_REQUIRED','JAR-404'],
  ['PLANNER_RECOVERY_EXHAUSTED','JAR-405'],
  ['EVIDENCE_SEGMENTATION_REQUIRED','JAR-501'],
  ['ENGINEERING_SOURCE_BOUND_REPORT_REQUIRED','JAR-502'],
  ['THREE_OPENED_CITED_URLS_REQUIRED','JAR-502'],
  ['SOURCE_QUOTATIONS_AND_TITLES_REQUIRED','JAR-502'],
  ['UNSUPPORTED_REPORT_ASSERTIONS','JAR-502'],
  ['RESEARCH_PROCEDURE_STEPS_REQUIRED','JAR-503'],
  ['RESEARCH_PROCEDURE_WARNINGS_REQUIRED','JAR-503']
 ];
 for(const [input,code] of scenarios){
  const diagnostic=diagnoseJarvisError(input);
  assert.equal(diagnostic.code,code,input);
  assert.equal(diagnostic.certified,false);
  assert.ok(diagnostic.action.length>30);
 }
});
test('technical metadata is bounded, user inputs and tokens are never echoed in the public card',()=>{
 const d=diagnoseJarvisError({code:'JARVIS_RELAY_WORKSTATION_UNAVAILABLE',
  message:'token=secret-should-not-appear '+ 'Z'.repeat(2000)},{traceId:'M'.repeat(300),phase:'CURRENT_TURN'});
 assert.equal(d.code,'JAR-201');
 assert.equal(d.traceId.length,80);
 assert.doesNotMatch(JSON.stringify(d),/secret-should-not-appear/);
 const unknown=diagnoseJarvisError('api_key=hidden-secret plus unknown diagnostic');
 assert.equal(unknown.code,'JAR-900');
 assert.equal(unknown.technicalCode,'UNKNOWN');
 assert.doesNotMatch(JSON.stringify(unknown),/hidden-secret/);
});
test('presentation retains familiar titles and adds code, action and technical identifier',()=>{
 const unavailable=semanticFailurePresentation('JARVIS_RELAY_WORKSTATION_UNAVAILABLE');
 assert.equal(unavailable.title,'La laptop no está enlazada');
 assert.equal(unavailable.code,'JAR-201');
 assert.match(unavailable.action,/Terminal local/);
 const tooLarge=semanticFailurePresentation('JARVIS_RELAY_RESPONSE_TOO_LARGE');
 assert.equal(tooLarge.code,'JAR-204');
 const partial=jarvisErrorPublicMessage('PUBLIC_HTML_ACCESS_DENIED');
 assert.match(partial,/JAR-301/);
 assert.match(partial,/Error técnico: PUBLIC_HTML_ACCESS_DENIED/);
});
test('terminal and research-pilot show the code without claiming that partial is success',()=>{
 const page=readFileSync('gestia-terminal.html','utf8');
 const pilot=readFileSync('modules/terminal/qwen-general-pilot.js','utf8');
 assert.match(page,/Código de falla: \$\{failurePresentation\.code/);
 assert.match(page,/Qué revisar: \$\{failurePresentation\.action/);
 assert.match(pilot,/failureCode=ok\?null:diagnoseJarvisError\(reason\)/);
 assert.match(pilot,/Código de falla: \$\{failureCode\.code\}/);
 assert.match(pilot,/No se declara VERIFIED_COMPLETE/);
});
