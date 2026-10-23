import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {simpleJarvisGreeting,jarvisExternalEducationQuery,scopeJarvisToolsForQuestion} from '../gestia-core/jarvis/jarvis.current-turn-scope.js';

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
