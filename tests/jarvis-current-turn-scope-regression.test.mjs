import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runInNewContext} from 'node:vm';
import {simpleJarvisGreeting,jarvisExternalEducationQuery,jarvisRepositoryEvidenceRequest,scopeJarvisToolsForQuestion} from '../gestia-core/jarvis/jarvis.current-turn-scope.js';

const defs=['conversation.respond','web.research','browser.inspect','repo.audit','repo.read','platform.query']
 .map(name=>({name,mutates:false,requiresApproval:false}));
const uveg='busca informacion de la uveg de guanajuato y dime la ingenieria de sistemas que modulos lleva';
test('greetings bypass planning only if message is exactly a greeting',()=>{
 assert.match(simpleJarvisGreeting('Buenos días!!!'),/ayudo/);
 assert.equal(simpleJarvisGreeting('buenos dias, lee mi codigo'),null);
 assert.equal(simpleJarvisGreeting('hola, investiga UVEG'),null);
});
test('real external education question cannot access private repository tools',()=>{
 assert.equal(jarvisExternalEducationQuery(uveg),true);
 assert.deepEqual(scopeJarvisToolsForQuestion(defs,uveg).map(t=>t.name),
  ['conversation.respond','web.research','browser.inspect']);
});
test('real code auditing request retains private source tools',()=>{
 const task='Audita mi repositorio fixgo y lee jarvis-upload-bridge.js';
 assert.equal(jarvisExternalEducationQuery(task),false);
 assert.deepEqual(scopeJarvisToolsForQuestion(defs,task),defs);
});
test('mixed code and university research must not be silently stripped',()=>{
 const task='Audita en GitHub el codigo fuente de mi proyecto UVEG';
 assert.equal(jarvisExternalEducationQuery(task),false);
 assert.deepEqual(scopeJarvisToolsForQuestion(defs,task),defs);
});
test('private tools cannot be reintroduced after the initial model decision',()=>{
 const source=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
 assert.match(source,/const registeredCurrentTurnTools\s*=\s*scopeJarvisToolsForQuestion\(/);
 assert.match(source,/const registeredMissionTools\s*=\s*scopeJarvisToolsForQuestion\(/);
 assert.match(source,/EXACT_GREETING_FAST_PATH/);
});

test('Firebase Terminal offers cancel for every active mission, not localhost only',()=>{
 const html=fs.readFileSync(new URL('../gestia-terminal.html',import.meta.url),'utf8');
 assert.match(html,/localMissionAbortController=new AbortController\(\)/);
 assert.match(html,/stopMissionButton\.hidden=false/);
 assert.match(html,/stopMissionButton\.disabled=false/);
 assert.match(html,/addEventListener\('pagehide'/);
 assert.doesNotMatch(html,/localMissionAbortController=localPilotActive\?/);
});
test('live semantic planner transport aborts the actual fetch when the owner stops', async t=>{
 const {__test:planner}=await import('../gestia-core/jarvis/jarvis.multifunction.planner.js');
 const old=globalThis.JarvisLocalBridge;
 const controller=new AbortController();
 let observedSignal=null;
 globalThis.JarvisLocalBridge={requestJson:async(_route,_payload,options)=>{
   observedSignal=options.signal;
   return await new Promise((_resolve,reject)=>{
     options.signal?.addEventListener('abort',()=>reject(new Error('USER_REQUESTED_STOP')),{once:true});
   });
 }};
 t.after(()=>{globalThis.JarvisLocalBridge=old;});
 const pending=planner.callSemanticPlanner('busca UVEG',[{name:'web.research'}],{phase:'CURRENT_TURN'},controller.signal);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(observedSignal,controller.signal);
 controller.abort('USER_REQUESTED_STOP');
 await assert.rejects(pending,/USER_REQUESTED_STOP/);
});
test('normal Terminal passes its mission signal to the Qwen planner and orchestrator',()=>{
 const core=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
 const planner=fs.readFileSync(new URL('../gestia-core/jarvis/jarvis.multifunction.planner.js',import.meta.url),'utf8');
 assert.match(core,/missionAbortSignal:\s*state\.missionAbortSignal/);
 assert.match(core,/signal:\s*context\.missionAbortSignal/);
 assert.match(planner,/context\.missionAbortSignal \|\| null/);
 assert.match(planner,/\.\.\.\(signal \? \{signal\} : \{\}\)/);
});

test('real user Git-change audit requires actual Git evidence instead of chat',()=>{
 const request='Revisa los últimos cambios realizados por GPT en el repositorio oficial V142. Identifica los archivos modificados, explica las reparaciones realizadas, las pruebas aprobadas y lo que todavía falta. Utiliza evidencia real de Git y no realices modificaciones.';
 const tools=[{name:'conversation.respond',mutates:false},{name:'repo.gitStatus',mutates:false},
  {name:'repo.gitDiff',mutates:false},{name:'repo.search',mutates:false},
  {name:'repo.read',mutates:false},{name:'repo.gitCommit',mutates:true,requiresApproval:true},
  {name:'system.health',mutates:false},{name:'repo.audit',mutates:false}];
 assert.equal(jarvisRepositoryEvidenceRequest(request),true);
 assert.deepEqual(scopeJarvisToolsForQuestion(tools,request).map(t=>t.name),
  ['repo.gitStatus','repo.gitDiff','repo.search','repo.read']);
});
test('conceptual Git conversation does not get forced into repository operations',()=>{
 for(const q of ['¿Qué es Git y para qué sirve?', 'Explícame Git sin revisar archivos', '¿Qué hace un commit?',
  'Buenas tardes', 'Busca información de UVEG Guanajuato y dime sus módulos']){
  assert.equal(jarvisRepositoryEvidenceRequest(q),false,q);
 }
 assert.deepEqual(scopeJarvisToolsForQuestion(defs,'¿Qué es Git y para qué sirve?'),defs);
});
test('tool-only Git scope never widens into writes or other tenants',()=>{
 const q='Checa el estado actual del repositorio y dime qué archivos modificaste';
 const tools=[{name:'repo.gitStatus',mutates:false},{name:'repo.gitDiff',mutates:false},
  {name:'repo.gitCommitPlan',mutates:false},{name:'repo.gitCommit',mutates:true},
  {name:'repo.read',mutates:false,requiresApproval:true},{name:'repo.search',mutates:false},
  {name:'conversation.respond',mutates:false}];
 assert.deepEqual(scopeJarvisToolsForQuestion(tools,q).map(t=>t.name),
  ['repo.gitStatus','repo.gitDiff','repo.search']);
});

test('light current-turn planner delegates a real Git request to read-only Qwen tools, not CASUAL_NOOP',async()=>{
 const source=fs.readFileSync(new URL('../gestia-core/gestia-core.js',import.meta.url),'utf8');
 const start=source.indexOf('    async analizarIntencionLigera(');
 const end=source.indexOf('    // Helper de seguridad para identificar planes Read-Only',start);
 assert.ok(start>0 && end>start);
 const tools=[{name:'conversation.respond',mutates:false},{name:'repo.gitStatus',mutates:false},
  {name:'repo.gitDiff',mutates:false},{name:'repo.search',mutates:false},
  {name:'repo.gitCommit',mutates:true,requiresApproval:true}];
 const seen=[];
 const analyze=runInNewContext('({'+source.slice(start,end)+'}).analizarIntencionLigera',{
  simpleJarvisGreeting,scopeJarvisToolsForQuestion,jarvisRepositoryEvidenceRequest,
  JarvisSemanticMemory:{recall:async()=>null},auth:{currentUser:{uid:'fixture'}},
  globalThis:{JarvisToolRuntime:{list:()=>tools}},
  compactJarvisSemanticMemoryForPlanner:()=>null,
  buildJarvisMultifunctionToolCalls:async(instruction,context)=>{
   seen.push({instruction,context});
   return [{name:'repo.gitStatus',args:{},approved:false}];
  },
  isSemanticTimeout:()=>false,isPermanentSemanticPlannerFailure:()=>false
 });
 const q='Revisa los últimos cambios realizados por GPT en el repositorio oficial V142. Identifica archivos modificados y pruebas aprobadas con evidencia real de Git. No modifiques nada.';
 const plan=await analyze(q,{tenantId:'uxmal39'});
 assert.equal(plan.mode,'BRAIN_DELEGATED');
 assert.equal(plan.useRepoTools,true);
 assert.equal(seen.length,1);
 assert.equal(seen[0].context.missionState.conversationalGate,false);
 assert.equal(seen[0].context.missionState.writeAllowed,false);
 assert.deepEqual(Array.from(seen[0].context.toolCatalog,x=>x.name),
  ['repo.gitStatus','repo.gitDiff','repo.search']);
 assert.ok(!seen[0].context.toolCatalog.some(x=>x.mutates===true));
 assert.equal(plan.toolCalls[0].name,'repo.gitStatus');
});

test('Git status and diff remain investigative so a multi-source mission is not prematurely closed',async()=>{
 const {isBoundedReadOnlyMission}=await import('../gestia-core/jarvis/jarvis.multifunction.planner.js');
 const runtime=fs.readFileSync(new URL('../gestia-core/tools.runtime.js',import.meta.url),'utf8');
 for(const [name,receipt] of [['repo.gitStatus','REPO_GIT_STATUS_RESULT_V7'],
  ['repo.gitDiff','REPO_GIT_DIFF_RESULT_V7']]){
  const at=runtime.indexOf('"'+name+'"');
  const begin=runtime.lastIndexOf('JarvisToolRuntime.register({',at);
  const end=runtime.indexOf('    execute:',at);
  const declaration=runtime.slice(begin,end);
  assert.ok(declaration.includes('investigationReadOnly: true'),name);
  const schema={name,mutates:false,requiresApproval:false,investigationReadOnly:true};
  assert.equal(isBoundedReadOnlyMission([{name,args:{}}],[schema]),false,
   name+' must allow subsequent physical source inspection');
  assert.ok(declaration.includes(receipt),name);
 }
});
