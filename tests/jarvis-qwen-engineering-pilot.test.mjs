import test from 'node:test';
import assert from 'node:assert/strict';
import {generalObjectives} from '../modules/terminal/qwen-general-evidence.js';
import {generalToolCatalog,prioritizeGeneralCodeCatalog} from '../modules/terminal/qwen-general-pilot.js';
import {createGeneralToolPolicy} from '../jarvis-qwen-general-policy.js';
const mission='general-a1111111-2222-4333-8444-555555555555';
const instruction='Audita y corrige el código del repositorio requestPayout, demuestra bug y corre pruebas; sin aplicar cambios reales.';
const objectives=generalObjectives(instruction);
const location={protocol:'http:',hostname:'127.0.0.1',port:'5000',search:'?qwenPilot=general-v1'};
const policy=createGeneralToolPolicy({location,missionId:mission,objectives,instruction});
const tools=['repo.grep','repo.search','repo.read','repo.diagnose','repo.prepareWrite','tests.run','repo.write','repo.authorizeWrite'].map(name=>({
 name,mutates:name==='repo.write'||name==='repo.authorizeWrite',requiresApproval:name==='repo.write'||name==='repo.authorizeWrite',
 userArtifact:false,inputSchema:{type:'object',properties:{term:{type:'string'},file:{type:'string'},search:{type:'string'},replace:{type:'string'},matchCount:{type:'integer'},command:{type:'string'}},required:[]}
}));
test('engineering is recognized and allowed only for read, analyze, test and prepare',()=>{
 assert.equal(objectives.code,true);
 assert.equal(policy.accept(tools.find(t=>t.name==='repo.grep')),true);
 assert.equal(policy.accept(tools.find(t=>t.name==='repo.read')),true);
 assert.equal(policy.accept(tools.find(t=>t.name==='tests.run')),true);
 assert.equal(policy.accept(tools.find(t=>t.name==='repo.prepareWrite')),true);
 assert.equal(policy.accept(tools.find(t=>t.name==='repo.write')),false);
 assert.equal(policy.accept(tools.find(t=>t.name==='repo.authorizeWrite')),false);
});
test('engineering routes to real grep then observed file then tests',()=>{
 const cat=generalToolCatalog({list:()=>tools},policy,objectives,instruction);
 assert.equal(prioritizeGeneralCodeCatalog(cat,[],instruction)[0].inputSchema.properties.term.const,'requestPayout');
 const repo='functions/index.js',grep={name:'repo.grep',ok:true,args:{term:'requestPayout'},observation:{ok:true,matches:[{file:repo,line:1030},{file:'tests/hotfix-legacy.test.mjs',line:9}]}};
 const first=prioritizeGeneralCodeCatalog(cat,[grep],instruction);
 assert.equal(first[0].name,'repo.read');
 assert.ok(first[0].inputSchema.properties.file.enum.includes(repo));
 const read=[repo,'tests/hotfix-legacy.test.mjs'].map(file=>({name:'repo.read',ok:true,args:{file},observation:{ok:true,verifiedRead:{file,content:'source'}}}));
 const run=prioritizeGeneralCodeCatalog(cat,[grep,...read],instruction);
 assert.equal(run[0].name,'tests.run');
 assert.equal(run[0].inputSchema.properties.command.const,'pilot:security');
 const tested={name:'tests.run',ok:true,args:{command:'pilot:security'},observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}};
 assert.deepEqual(prioritizeGeneralCodeCatalog(cat,[grep,...read,tested],instruction),[]);
});
test('prepare patch requires exact read content and cannot self-authorize',()=>{
 const file='functions/index.js',search='if (amount < 0)',source={name:'repo.read',ok:true,args:{file},observation:{ok:true,verifiedRead:{file,content:search+';'}}};
 const call={name:'repo.prepareWrite',args:{file,search,replace:'if (amount <= 0)',matchCount:1,operation:'replace'}};
 assert.equal(policy.authorize(call,[source]).ok,true);
 assert.equal(policy.authorize({...call,args:{...call.args,matchCount:0}},[source]).ok,false);
 assert.equal(policy.authorize({...call,args:{...call.args,approved:true}},[source]).ok,false);
 assert.equal(policy.authorize({...call,args:{...call.args,file:'../outside.js'}},[source]).ok,false);
 assert.equal(policy.authorize({...call,args:{...call.args,operation:'create'}},[source]).ok,false);
});

test('the actual payout code mission never becomes an unrelated medical/web or Firestore census task',()=>{
 const request='MISIÓN CRÍTICA DE INGENIERÍA DE SOFTWARE. Investiga la causa raíz de requestPayout en FixGo B2C. Prepara un parche y ejecuta tests; no modificar producción ni pagar usuarios.';
 const got=generalObjectives(request);
 assert.equal(got.code,true);
 assert.equal(got.research,false,'repository investigation is not web research');
 assert.equal(got.records,false,'FixGo B2C mentioned in a code request is not a Firestore census');
 assert.equal(got.prohibited,false);
 const research=generalObjectives('Investiga mantenimiento preventivo del aire acondicionado y entrega DOCX y PDF; no modificar código');
 assert.equal(research.code,false,'negative constraints never become a coding task');
 assert.equal(research.research,true);
});
test('independent code auditor never certifies only grep, reads and a failing suite as complete',async()=>{
 const {verifyGeneralMission,summarizeGeneralEvidence}=await import('../modules/terminal/qwen-general-evidence.js');
 const instruction='Corrige el bug de requestPayout en el repositorio B2C, prepara un parche y ejecuta pruebas.';
 const objectives=generalObjectives(instruction);
 const records=[
  {name:'repo.grep',ok:true,args:{term:'requestPayout'},observation:{ok:true,matches:[{file:'functions/index.js'}]}},
  {name:'repo.read',ok:true,args:{file:'functions/index.js'},observation:{ok:true,verifiedRead:{file:'functions/index.js',content:'export function requestPayout(){}'}}},
  {name:'tests.run',ok:true,args:{command:'test'},observation:{ok:true,status:'TESTS_NOT_PASSING',testsPassed:false,objectiveSatisfied:false,exitCode:1}}
 ];
 const report=await verifyGeneralMission({instruction,receipts:records,proposedReport:'done',objectives});
 assert.equal(report.ok,false);
 assert.ok(report.objectives.some(x=>x.reason==='CODE_TESTS_PASSING_REQUIRED'));
 assert.ok(report.objectives.some(x=>x.reason==='ISOLATED_CODE_REPAIR_NOT_IMPLEMENTED'));
 assert.equal(report.objectives.some(x=>x.reason==='THREE_OPENED_CITED_URLS_REQUIRED'),false);
 assert.equal(report.objectives.some(x=>x.reason==='CURRENT_COMPLETE_AUTHORIZED_TECHNICIAN_COUNT_REQUIRED'),false);
 const missing=summarizeGeneralEvidence(records,objectives,instruction).deliveryGaps;
 assert.ok(missing.some(x=>x.reason==='CODE_TESTS_PASSING_REQUIRED'));
});
test('a completed tests.run process with failing assertions is never a successful tool result',async()=>{
 const {runQwenAuthorizedCycle}=await import('../jarvis-qwen-direct-cycle.js');
 const tool={name:'tests.run',inputSchema:{type:'object',properties:{command:{type:'string',const:'test'}},required:['command']}};
 const actual=await runQwenAuthorizedCycle({
  instruction:'Run tests on a safe sample',catalog:[tool],maximumSteps:6,stepLimit:6,
  selectNextAction:async()=>({toolCall:{name:'tests.run',args:{command:'test'}}}),
  authorize:async()=>({ok:true}),
  execute:async()=>({ok:true,status:'TESTS_NOT_PASSING',testsPassed:false,objectiveSatisfied:false,exitCode:1}),
  verifyCompletion:async()=>({ok:true})
 });
 assert.equal(actual.status,'PARTIAL');
 assert.equal(actual.reason,'CODE_TESTS_NOT_PASSING');
 assert.equal(actual.receipts.length,1);
 assert.equal(actual.receipts[0].ok,false);
});


test('pilot security test runner passes through the browser and exact bridge allowlists',async()=>{
 const fs=await import('node:fs');
 const vm=await import('node:vm');
 const command='node --test tests/hotfix-legacy.test.mjs tests/secure-financial-entry.test.mjs';
 const client=fs.readFileSync(new URL('../gestia-core/tools.runtime.js',import.meta.url),'utf8');
 const server=fs.readFileSync(new URL('../jarvis-fs-bridge.js',import.meta.url),'utf8');
 const start=client.indexOf('window.JarvisLocalBridge.runCommand ||= async function');
 const end=client.indexOf('\n};',start)+3;
 assert.ok(start>0&&end>start);
 const calls=[];
 const window={JarvisLocalBridge:{requestJson:async(url,body)=>{
  calls.push({url,body});return {ok:true,exitCode:0,status:'PASSED'};
 }}};
 vm.runInNewContext(client.slice(start,end),{window,Set,Number});
 const good=await window.JarvisLocalBridge.runCommand({command});
 assert.equal(good.ok,true);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/run');
 assert.equal(calls[0].body.command,command);
 for(const bad of [command+' && echo unsafe','npm run foo','node -e "process.exit(0)"']){
  const fail=await window.JarvisLocalBridge.runCommand({command:bad});
  assert.equal(fail.ok,false);
  assert.equal(fail.status,'COMMAND_NOT_ALLOWED');
 }
 assert.equal(calls.length,1,'no unlisted or composite command gets through browser');
 const serverStart=server.indexOf('app.post("/run"');
 const serverEnd=server.indexOf('const safeCwd',serverStart);
 assert.ok(serverStart>0&&serverEnd>serverStart);
 const gate=server.slice(serverStart,serverEnd);
 assert.ok(gate.includes('"'+command+'"'),'backend allows only this literal command');
 assert.match(gate,/allowedCommands\.has\(command\)/);
});
test('tests.run maps pilot:security to that fixed command and never claims failed assertions passed',async()=>{
 const fs=await import('node:fs');
 const vm=await import('node:vm');
 const s=fs.readFileSync(new URL('../gestia-core/tools.runtime.js',import.meta.url),'utf8');
 const idx=s.indexOf('name: "tests.run"');
 const start=s.lastIndexOf('JarvisToolRuntime.register({',idx);
 const end=s.indexOf('\n});',idx)+4;
 let tool,command;
 vm.runInNewContext(s.slice(start,end),{
  JarvisToolRuntime:{register:def=>{tool=def}},
  window:{JarvisLocalBridge:{runCommand:async body=>{
   command=body.command;return {ok:true,exitCode:0,status:'PASSED',stdout:'12 tests passed'};
  }}},Set,Number
 });
 const success=await tool.execute({command:'pilot:security'});
 assert.equal(command,'node --test tests/hotfix-legacy.test.mjs tests/secure-financial-entry.test.mjs');
 assert.equal(success.testsPassed,true);
 assert.equal(success.objectiveSatisfied,true);
});

test('negative patch instructions do not require code modifications',async()=>{
 const {codeRepairRequested,codeConcurrencyRequested,verifyGeneralMission}=await import('../modules/terminal/qwen-general-evidence.js');
 assert.equal(codeRepairRequested('Audita requestPayout y no inventes un parche.'),false);
 assert.equal(codeRepairRequested('No debes generar un parche. Solo diagnostica código.'),false);
 assert.equal(codeRepairRequested('Corrige requestPayout y entrega un parche verificable.'),true);
 assert.equal(codeRepairRequested('Prepara un parche exacto para revisión.'),true);
 assert.equal(codeConcurrencyRequested('Revisa solicitudes duplicadas e idempotencia bajo concurrencia.'),true);
 assert.equal(codeConcurrencyRequested('Audita la validación de importes.'),false);
 const instruction='Audita requestPayout y no inventes un parche; distingue duplicados, idempotencia y concurrencia de una suite unitaria.';
 const receipts=[
  {name:'repo.grep',ok:true,args:{term:'requestPayout'},observation:{ok:true,matches:[{file:'functions/secure-entry.js'}]}},
  {name:'repo.read',ok:true,args:{file:'functions/secure-entry.js'},observation:{ok:true,verifiedRead:{file:'functions/secure-entry.js',content:'function solicitarRetiro(){}'}}},
  {name:'tests.run',ok:true,args:{command:'pilot:security'},observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}}
 ];
 const result=await verifyGeneralMission({instruction,receipts,proposedReport:'Summary of observed code',objectives:generalObjectives(instruction)});
 assert.equal(result.ok,false);
 assert.equal(result.objectives.some(x=>x.reason==='CODE_PATCH_PREVIEW_REQUIRED'),false);
 assert.equal(result.objectives.some(x=>x.reason==='CODE_CONCURRENCY_EMULATOR_EVIDENCE_REQUIRED'),true);
 const emulated=[...receipts,{name:'tests.run',ok:true,args:{command:'v142:security-emulator'},observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}}];
 const report='Auditoría de requestPayout: leí functions/secure-entry.js, donde se ubica solicitarRetiro. Las pruebas tests.run de seguridad unitaria pasaron en el escenario simulado; la ejecución de Firebase Emulator sobre el conjunto de concurrencia e idempotencia también tiene un recibo PASS en esta prueba controlada; se verifica el alcance de validación de monto negativo. Se distingue esa cobertura del código no inspeccionado.';
 const ungrounded=await verifyGeneralMission({instruction,receipts:emulated,proposedReport:'Summary of observed code',objectives:generalObjectives(instruction)});
 assert.equal(ungrounded.ok,false,'a generic finish cannot certify a complex code audit');
 const done=await verifyGeneralMission({instruction,receipts:emulated,proposedReport:report,objectives:generalObjectives(instruction)});
 assert.equal(done.ok,true);
});

test('concurrent payout audit runs the scoped emulator after unit tests and does not loop',()=>{
 const instruction='Audita requestPayout, duplicados e idempotencia con concurrencia. No inventes un parche.';
 const catalog=generalToolCatalog({list:()=>tools},policy,{...objectives,code:true},instruction);
 const grep={name:'repo.grep',ok:true,args:{term:'requestPayout'},observation:{ok:true,matches:[{file:'functions/index.js'},{file:'tests/hotfix-legacy.test.mjs'}]}};
 const reads=['functions/index.js','tests/hotfix-legacy.test.mjs'].map(file=>({
  name:'repo.read',ok:true,args:{file},observation:{ok:true,verifiedRead:{file,content:'source'}}
 }));
 const baseline={name:'tests.run',ok:true,args:{command:'pilot:security'},observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}};
 const next=prioritizeGeneralCodeCatalog(catalog,[grep,...reads,baseline],instruction);
 assert.equal(next.length,1);
 assert.equal(next[0].name,'tests.run');
 assert.equal(next[0].inputSchema.properties.command.const,'v142:security-emulator');
 const emulator={name:'tests.run',ok:true,args:{command:'v142:security-emulator'},observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}};
 assert.deepEqual(prioritizeGeneralCodeCatalog(catalog,[grep,...reads,baseline,emulator],instruction),[]);
});

test('V142 Firestore emulation launcher binds only the fixed project, tests and user-owned Java',async()=>{
 const {emulatorLaunchPlan,FIRESTORE_TEST_PROJECT,FIRESTORE_TEST_COMMAND}=await import('../scripts/v142-payout-emulator.mjs');
 const home='C:\\Users\\demo';
 const plan=emulatorLaunchPlan({home,win:true,env:{PATH:'sentinel-path'},
  exists:path=>path.endsWith('firebase.js')||path.endsWith('java.exe'),node:'node-test'});
 assert.equal(plan.ok,true);
 assert.equal(plan.command,'node-test');
 assert.deepEqual(plan.args.slice(1),['emulators:exec','--project',FIRESTORE_TEST_PROJECT,
   '--only','firestore',FIRESTORE_TEST_COMMAND]);
 assert.match(plan.env.JAVA_HOME,/temurin-jre-21$/);
 assert.equal(plan.shell,false);
 assert.equal(plan.env.CI,'true');
 assert.equal(plan.env.GOOGLE_CLOUD_PROJECT,'fixgo-b2c-rules-test');
 assert.ok(plan.env.PATH.endsWith('sentinel-path'));
 const missing=emulatorLaunchPlan({home,win:true,env:{PATH:'base'},exists:()=>false});
 assert.equal(missing.ok,false);
 assert.equal(missing.reason,'FIREBASE_CLI_NOT_INSTALLED');
});

test('preview-only bugfix preparation uses exact read-backed fixture and never authorizes writing',async()=>{
 const {codePreviewOnlyRequested,verifiedPreparedCodePreview,verifyGeneralMission}=await import('../modules/terminal/qwen-general-evidence.js');
 const instruction='Prepara un parche exacto para el codigo tests/fixtures/v142-rebate-preview.js: applyRebate(10,20) no debe producir un importe negativo. Solo para revision humana, sin aplicar ni modificar el repositorio. Lee el archivo, corre pruebas de sintaxis y explica lo no demostrado.';
 assert.equal(codePreviewOnlyRequested(instruction),true);
 assert.equal(codePreviewOnlyRequested('Corrige el codigo en produccion y ejecuta pruebas antes y despues.'),false);
 assert.equal(codePreviewOnlyRequested('Prepara un parche y ejecuta pruebas antes y despues sin aplicar.'),false);
 const goals=generalObjectives(instruction);
 assert.equal(goals.code,true);
 const catalog=generalToolCatalog({list:()=>tools},policy,goals,instruction);
 const file='tests/fixtures/v142-rebate-preview.js',source=(await import('node:fs')).readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const grep={name:'repo.grep',ok:true,args:{term:'applyRebate'},observation:{ok:true,matches:[{file}]}};
 const read={name:'repo.read',ok:true,args:{file},observation:{ok:true,verifiedRead:{file,content:source}}};
 const tested={name:'tests.run',ok:true,args:{command:'check:syntax'},observation:{ok:true,status:'PASSED',testsPassed:true,objectiveSatisfied:true,exitCode:0}};
 const option=prioritizeGeneralCodeCatalog(catalog,[grep,read,tested],instruction);
 assert.equal(option.length,1);assert.equal(option[0].name,'repo.prepareWrite');
 assert.deepEqual(option[0].inputSchema.properties.file.enum,[file]);
 const prepared={name:'repo.prepareWrite',ok:true,args:{file,search:'amount-rebate',replace:'Math.max(0,amount-rebate)',matchCount:1,operation:'replace'},
  observation:{ok:true,status:'WRITE_PREPARED',file,written:false,fingerprint:'a'.repeat(64),snapshotSha256:'b'.repeat(64),expectedSha256:'c'.repeat(64)}};
 assert.equal(policy.authorize(prepared,[read]).ok,true);
 const fixturePolicy=createGeneralToolPolicy({location,missionId:mission,objectives:goals,instruction});
 assert.equal(fixturePolicy.authorize(prepared,[read]).ok,true);
 assert.equal(fixturePolicy.authorize({...prepared,args:{...prepared.args,file:'functions/index.js'}},[read]).reason,'CODE_PREVIEW_TEST_FIXTURE_SCOPE_ONLY');
 const witness=verifiedPreparedCodePreview([grep,read,tested,prepared]);
 assert.equal(witness?.written,false);
 assert.equal(witness?.requiresHumanApproval,true);
 assert.equal(prioritizeGeneralCodeCatalog(catalog,[grep,read,tested,prepared],instruction).length,0);
 const report='Auditoria de codigo tests/fixtures/v142-rebate-preview.js: applyRebate acepta un rebate superior al importe y puede producir un resultado negativo. Ejecute la suite check:syntax satisfactoriamente, pero una prueba sintactica no verifica el comportamiento financiero ni la seguridad. Se preparo un parche exacto para revision humana sin escribir codigo ni ejecutarlo; quedan pendientes pruebas funcionales aisladas antes y despues.';
 const result=await verifyGeneralMission({instruction,receipts:[grep,read,tested,prepared],proposedReport:report,objectives:goals});
 assert.equal(result.ok,true,JSON.stringify(result.objectives));
 assert.equal((await verifyGeneralMission({instruction,receipts:[grep,read,tested],proposedReport:report,objectives:goals})).ok,false);
 assert.equal(verifiedPreparedCodePreview([grep,read,tested,prepared,{name:'repo.write',ok:true}]),null);
});

test('only the host mission stamps write-preparation provenance, never the model',async()=>{
 const {trustedCodePreviewContext}=await import('../modules/terminal/qwen-general-pilot.js');
 const instruction='Prepara un parche exacto para el codigo tests/fixtures/v142-rebate-preview.js, solo para revision humana sin aplicar.';
 const expected={objectiveId:'QWEN_PREVIEW_'+mission,caseId:mission};
 assert.deepEqual(trustedCodePreviewContext(mission,instruction),expected);
 assert.deepEqual(trustedCodePreviewContext('../outside',instruction),{});
 assert.deepEqual(trustedCodePreviewContext(mission,'Corrige el codigo y ejecuta pruebas antes y despues.'),{});
 assert.ok(!Object.hasOwn(expected,'writeAllowed')&&!Object.hasOwn(expected,'approved'));
});
