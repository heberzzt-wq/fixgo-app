// Exact real-Qwen reproduction of the owner's browser mission with physical read/test receipts.
// Not an authenticated browser session or release; no mutation or external AI provider.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';
import {createLocalQwenActionSelector} from '../jarvis-qwen-local-action.js';
import {compactVerifiedEngineeringSource} from '../modules/terminal/qwen-engineering-source-excerpt.js';
import {generalObjectives,codeRepairRequested,verifyGeneralMission,summarizeGeneralEvidence,engineeringReportIssues} from '../modules/terminal/qwen-general-evidence.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const instruction='Jarvis, identifica en el repositorio local dónde se implementa createPilotVersionGate, explica cómo valida las versiones del navegador y del bridge, y entrega un diagnóstico citando los archivos utilizados. No modifiques ningún archivo.';
if(codeRepairRequested(instruction))throw Error('READ_ONLY_MISSION_WRONGLY_REQUIRES_CODE_PATCH');
const test=spawnSync(process.execPath,['--test','tests/jarvis-qwen-pilot-version.test.mjs'],{
 cwd:root,encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
const out=(test.stdout||'')+'\n'+(test.stderr||'');
if(test.status!==0||!/pass 4\b/.test(out)||!/fail 0\b/.test(out))
 throw Error('REAL_PILOT_VERSION_TESTS_FAILED:'+out.slice(-1800));
console.log('[NS1_READONLY_TESTS] real tests PASS 4/4');
const files=['jarvis-qwen-pilot-version.js','tests/jarvis-qwen-pilot-version.test.mjs'];
const receipts=[
 {name:'repo.grep',ok:true,args:{term:'createPilotVersionGate'},observation:{ok:true,matches:[{file:files[0],line:54},{file:files[1],line:7}]}},
 ...files.map(file=>({name:'repo.read',ok:true,args:{file},observation:{ok:true,verifiedRead:{
  file,content:fs.readFileSync(path.join(root,file),'utf8'),startLine:1}}})),
 {name:'tests.run',ok:true,args:{command:'node --test tests/jarvis-qwen-pilot-version.test.mjs'},observation:{
  ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0,testCount:4,
  runCommand:'node --test tests/jarvis-qwen-pilot-version.test.mjs'}}
];
const compact=o=>o.verifiedRead?{ok:true,status:'COMPLETED',
 verifiedRead:compactVerifiedEngineeringSource(o.verifiedRead)}:
 {ok:o.ok,status:o.status,matches:o.matches?.slice(0,5),testsPassed:o.testsPassed,
 objectiveSatisfied:o.objectiveSatisfied,exitCode:o.exitCode,testCount:o.testCount,runCommand:o.runCommand};
const objectives=generalObjectives(instruction);
const selector=createLocalQwenActionSelector({maxOutputTokens:1350,requestTimeoutMs:180000,
 onInference:u=>console.log('[NS1_READONLY_INFERENCE]',JSON.stringify({promptTokens:u.promptTokens,outputTokens:u.outputTokens,durationMs:u.durationMs}))});
const result=await runQwenAuthorizedCycle({
 instruction,initialReceipts:receipts,requireFinalReport:true,repairIncomplete:true,
 maximumSteps:5,stepLimit:5,catalog:[{name:'repo.read',inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}}],
 catalogForEvidence:()=>[],compactObservation:compact,
 summarizeEvidence:r=>summarizeGeneralEvidence(r,objectives,instruction),
 selectNextAction:selector,authorize:async()=>({ok:false}),execute:async()=>{throw Error('READ_ONLY_NO_TOOL_REEXECUTION')},
 verifyCompletion:args=>verifyGeneralMission({...args,instruction,objectives}),
 onProgress:stage=>console.log('[NS1_READONLY_PHASE]',stage.phase)
});
const drafts=result.decisions.map(d=>d.report).filter(Boolean);
const issues=drafts.map(report=>engineeringReportIssues(report,receipts,instruction));
console.log('[NS1_READONLY_FINAL]',JSON.stringify({status:result.status,reason:result.reason,
 modelDecisions:result.modelDecisions,certification:result.certification?.objectives,
 report:result.report,draftReports:drafts,issues}));
if(result.status!=='SUCCESS')process.exitCode=2;
