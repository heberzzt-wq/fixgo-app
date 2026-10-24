// Twenty independent V142 mission-engine probes with physical repository reads.
// Scripted decisions isolate runtime/authorization/recovery; not 20 Qwen
// inferences and not authenticated Firebase browser missions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runQwenAuthorizedCycle} from '../jarvis-qwen-direct-cycle.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const entries=[
 ['Planner semántico','functions/jarvis-semantic-planner.js','runJarvisSemanticPlanner'],
 ['Orquestación de misiones','gestia-core/jarvis/jarvis.mission.orchestrator.js','runJarvisMission'],
 ['Perímetro de localhost','jarvis-local-intrusion-guard.js','evaluateJarvisWebPerimeter'],
 ['Versiones del piloto','jarvis-qwen-pilot-version.js','createPilotVersionGate'],
 ['Registro de herramientas','gestia-core/tools.runtime.js','JarvisToolRuntime'],
 ['Bootstrap de Terminal','modules/terminal/nexo-bootstrap.js','JARVIS_TERMINAL_BOOTSTRAP_VERSION'],
 ['Publicación web de prueba','scripts/publish-v142-webtest.mjs','WEBTEST'],
 ['Salud del Bridge','jarvis-workstation-health.js','createWorkstationAuthorization'],
 ['Solicitudes B2C','functions/b2c-service-workflow.js','exports'],
 ['Liquidación B2C','functions/b2c-service-settlement.js','exports'],
 ['Bridge del sistema','jarvis-fs-bridge.js','createJarvisFsBridgeApp'],
 ['Política local Qwen','gestia-core/jarvis/jarvis.local.policy.js','JARVIS_LOCAL_MODEL'],
 ['Autorreparación de código','gestia-core/jarvis/jarvis.autopatch.engine.js','repair'],
 ['Composición de respuestas','gestia-core/jarvis/jarvis.conversation.composer.js','compose'],
 ['Autorización de escritura','functions/repo-write-auth.js','authorization'],
 ['Diario de manifiesto','scripts/platform-manifest-daily-v142.mjs','manifest']
];
const schema={type:'object',properties:{file:{type:'string'}},required:['file'],additionalProperties:false};
const tool={name:'repo.read',description:'Read exact physically authorized repository source',investigationReadOnly:true,mutates:false,inputSchema:schema};
const safePath=file=>{
 if(typeof file!=='string'||file.includes('\\')||file.startsWith('/')||file.split('/').includes('..'))return null;
 const absolute=resolve(root,file), rel=relative(root,absolute);
 if(rel.startsWith('..')||isAbsolute(rel)||!existsSync(absolute))return null;
 const real=realpathSync(absolute),realRel=relative(root,real);
 return realRel.startsWith('..')||isAbsolute(realRel)?null:real;
};
for(const [i,[area,file,anchor]] of entries.entries()){
 test('MISIÓN '+String(i+1).padStart(2,'0')+' · '+area,async()=>{
  let selections=0,reads=0;
  const result=await runQwenAuthorizedCycle({
   instruction:'Verifica el código existente para '+area+' con evidencia física, sin alterar archivos.',
   catalog:[tool],maximumSteps:3,stepLimit:3,
   selectNextAction:async()=>++selections===1?{toolCall:{name:'repo.read',args:{file}}}:{finish:true,report:'Fuente local inspeccionada; sin mutaciones'},
   authorize:async({call})=>({ok:call.name==='repo.read'&&Boolean(safePath(call.args.file))}),
   execute:async call=>{
    reads++; const bytes=readFileSync(safePath(call.args.file));const text=bytes.toString('utf8');
    return {ok:true,status:'PHYSICAL_SOURCE_READ',source:'REAL_LOCAL_REPOSITORY',file:call.args.file,
     sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
     anchorPresent:text.toLowerCase().includes(anchor.toLowerCase())};
   },
   verifyCompletion:async({receipts})=>({ok:receipts.length===1 &&
      receipts[0].ok===true && receipts[0].observation?.source==='REAL_LOCAL_REPOSITORY' &&
      receipts[0].observation?.anchorPresent===true &&
      /^[0-9a-f]{64}$/.test(receipts[0].observation.sha256),reason:'VERIFIED_SOURCE'})
  });
  assert.equal(reads,1);
  assert.equal(result.status,'SUCCESS',JSON.stringify({reason:result.reason,file,proof:result.receipts[0]?.observation}));
  assert.equal(result.reason,'VERIFIED_COMPLETE');
 });
}
test('MISIÓN 17 · Escritura financiera sin autorización se rechaza',async()=>{
 let executed=0;
 const write={name:'repo.write',mutates:true,inputSchema:{type:'object',properties:{file:{type:'string'},content:{type:'string'}},required:['file','content']}};
 const r=await runQwenAuthorizedCycle({
  instruction:'Intenta mutar dinero sin aprobación',
  catalog:[write],maximumSteps:2,stepLimit:2,
  selectNextAction:async()=>({toolCall:{name:'repo.write',args:{file:'functions/b2c-service-settlement.js',content:'unsafe'}}}),
  authorize:async()=>({ok:false,reason:'OWNER_WRITE_APPROVAL_REQUIRED'}),
  execute:async()=>{executed++;throw Error('SHOULD_NOT_RUN');},
  verifyCompletion:async()=>({ok:false})
 });
 assert.equal(executed,0);assert.equal(r.status,'PARTIAL');assert.equal(r.reason,'INDEPENDENT_AUTHORIZATION_DENIED');
});
test('MISIÓN 18 · Traversal al exterior del repositorio bloqueado',async()=>{
 let executed=0;
 const r=await runQwenAuthorizedCycle({
  instruction:'Prueba acceso a ruta superior',
  catalog:[tool],maximumSteps:2,
  selectNextAction:async()=>({toolCall:{name:'repo.read',args:{file:'../secrets.env'}}}),
  authorize:async({call})=>({ok:Boolean(safePath(call.args.file)),reason:'REPO_ROOT_REQUIRED'}),
  execute:async()=>{executed++;},verifyCompletion:async()=>({ok:false})
 });
 assert.equal(executed,0);assert.equal(r.status,'PARTIAL');assert.equal(r.reason,'INDEPENDENT_AUTHORIZATION_DENIED');
});
test('MISIÓN 19 · Repetición de lectura idéntica no se ejecuta dos veces',async()=>{
 let count=0;
 const file='jarvis-workstation-health.js';
 const r=await runQwenAuthorizedCycle({
  instruction:'Comprueba que no se repite la misma lectura',catalog:[tool],maximumSteps:3,stepLimit:3,
  selectNextAction:async()=>({toolCall:{name:'repo.read',args:{file}}}),
  authorize:async()=>({ok:true}),
  execute:async()=>{count++;return {ok:true,status:'READ_OK'};},
  verifyCompletion:async()=>({ok:false})
 });
 assert.equal(count,1);assert.equal(r.status,'PARTIAL');assert.equal(r.reason,'REPEATED_TOOL_CALL');
});
test('MISIÓN 20 · Archivo inexistente no se presenta como evidencia',async()=>{
 let executed=0;
 const r=await runQwenAuthorizedCycle({
  instruction:'Comprueba que la ausencia de fuente no equivale a un resultado cero',
  catalog:[tool],maximumSteps:2,
  selectNextAction:async()=>({toolCall:{name:'repo.read',args:{file:'no-existe-prueba-jarvis-xyz.mjs'}}}),
  authorize:async({call})=>({ok:Boolean(safePath(call.args.file)),reason:'SOURCE_NOT_FOUND'}),
  execute:async()=>{executed++;return {ok:true,status:'READ_OK'};},
  verifyCompletion:async()=>({ok:false})
 });
 assert.equal(executed,0);assert.equal(r.status,'PARTIAL');assert.equal(r.reason,'INDEPENDENT_AUTHORIZATION_DENIED');
});
