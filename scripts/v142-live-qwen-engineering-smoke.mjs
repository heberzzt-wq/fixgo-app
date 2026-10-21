// Reproducible, read-only acceptance: real local model and actual repository tests.
// This is NOT an authenticated browser mission, a Firebase Emulator run or a release.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';
import {createLocalQwenActionSelector} from '../jarvis-qwen-local-action.js';
import {compactVerifiedEngineeringSource} from '../modules/terminal/qwen-engineering-source-excerpt.js';
import {verifyGeneralMission,generalObjectives,summarizeGeneralEvidence} from '../modules/terminal/qwen-general-evidence.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const instruction='Audita el codigo de requestPayout en FixGo B2C, identifica el handler efectivo, informa validacion de importes y el alcance real de las pruebas ejecutadas. Solo diagnostico: no repares, no publiques ni declares cobertura de emulador no ejecutada.';
const tests=spawnSync(process.execPath,['--test','tests/hotfix-legacy.test.mjs','tests/secure-financial-entry.test.mjs'],{cwd:root,encoding:'utf8',timeout:60000});
const output=(tests.stdout||'')+'\n'+(tests.stderr||'');
if(tests.status!==0||!/tests 12\b/.test(output)||!/pass 12\b/.test(output)||!/fail 0\b/.test(output)){
 console.error('[LIVE_SMOKE_TESTS_FAILED]',tests.status,output.slice(-2200));process.exit(1);
}
console.log('[LIVE_SMOKE] Physical pilot:security PASS 12/12');
const files=['functions/legacy-security-hotfix.js','functions/index.js','functions/b2c-service-marketplace.js'];
const receipts=[
 {name:'repo.grep',ok:true,args:{term:'requestPayout'},observation:{ok:true,matches:[{file:'functions/legacy-security-hotfix.js'},{file:'functions/index.js'}]}},
 ...files.map(file=>({name:'repo.read',ok:true,args:{file},observation:{ok:true,verifiedRead:{file,content:fs.readFileSync(path.join(root,file),'utf8'),startLine:1}}})),
 {name:'tests.run',ok:true,args:{command:'pilot:security'},observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0,testCount:12,runCommand:'node --test tests/hotfix-legacy.test.mjs tests/secure-financial-entry.test.mjs'}}
];
const compact=o=>o.verifiedRead?{ok:true,status:'COMPLETED',verifiedRead:compactVerifiedEngineeringSource(o.verifiedRead)}:
 {ok:o.ok,status:o.status,matches:o.matches?.slice(0,5),testsPassed:o.testsPassed,objectiveSatisfied:o.objectiveSatisfied,exitCode:o.exitCode,testCount:o.testCount,runCommand:o.runCommand};
const objectives=generalObjectives(instruction);
const source=compactVerifiedEngineeringSource(receipts[2].observation.verifiedRead);
console.log('[LIVE_SMOKE] Canonical source excerpt',source.shownLines,'of',source.sourceLines,'lines; mentions final export',source.sourceExcerpt.includes('createRequestB2cWithdrawalHandler'));
const selector=createLocalQwenActionSelector({maxOutputTokens:1250,requestTimeoutMs:180000,onInference:u=>console.log('[LIVE_SMOKE] Model inference',JSON.stringify({promptTokens:u.promptTokens,outputTokens:u.outputTokens,durationMs:u.durationMs}))});
const result=await runQwenAuthorizedCycle({
 instruction,initialReceipts:receipts,requireFinalReport:true,repairIncomplete:true,
 maximumSteps:5,stepLimit:5,catalog:[{name:'repo.read',inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file']}}],
 catalogForEvidence:()=>[],compactObservation:compact,
 summarizeEvidence:r=>summarizeGeneralEvidence(r,objectives,instruction),
 selectNextAction:selector,authorize:async()=>({ok:false}),execute:async()=>{throw Error('NO_TOOL_REEXECUTION_ALLOWED')},
 verifyCompletion:args=>verifyGeneralMission({...args,instruction,objectives}),
 onProgress:stage=>console.log('[LIVE_SMOKE] phase',stage.phase)
});
console.log('[LIVE_SMOKE] RESULT',JSON.stringify({status:result.status,reason:result.reason,modelDecisions:result.modelDecisions,receiptCount:result.receipts.length,certification:result.certification?.objectives,report:result.report,draftReports:result.decisions.map(d=>d.report).filter(Boolean).map(r=>r.slice(0,1800)),failedReports:result.missionLedger?.certificationFailures?.map(f=>f.objectives)}));
if(result.status!=='SUCCESS')process.exitCode=2;
