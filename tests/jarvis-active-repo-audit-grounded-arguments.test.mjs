import test from 'node:test';
import assert from 'node:assert/strict';
import planner from '../functions/jarvis-semantic-planner.js';

const activeAudit={name:'repo.audit',description:'Inventario estructural del repositorio activo autorizado',
 investigationReadOnly:true,mutates:false,requiresApproval:false,
 evidenceKinds:['repository_inventory'],inputSchema:{type:'object',
 properties:{target:{type:'string'},refresh:{type:'boolean'}},
 required:[],additionalProperties:false}};

test('Qwen-selected active repo.audit uses its schema-defined empty arguments',async()=>{
 let modelCalls=0;
 const result=await planner.runJarvisSemanticPlanner({
  input:'Ejecuta repo.audit sobre el repositorio activo, únicamente en modo lectura. Entrega el total y diez rutas.',
  catalog:[activeAudit],missionState:{phase:'GROUNDED_ARGUMENT_COMPLETION',
    toolName:'repo.audit',completedTasks:[],blockedTasks:[]},
  ai:{models:{generateContent:async()=>{modelCalls++;throw Error('UNNECESSARY_ARGUMENT_GENERATION');}}}
 });
 assert.deepEqual(result.toolCalls.map(t=>({name:t.name,args:t.args})),[{name:'repo.audit',args:{}}]);
 assert.equal(result.missionComplete,false);
 assert.equal(modelCalls,0);
 assert.equal(result.planKind,'GROUNDED_ARGUMENT_COMPLETION');
 assert.match(result.provider,/host-schema-default/);
});

test('named or external repository still requires semantic grounded arguments',async()=>{
 for(const input of [
  'Ejecuta repo.audit sobre otro repositorio activo',
  'Ejecuta repo.audit sobre repositorio activo https://example.org/other.git',
  'Ejecuta repo.audit sobre repositorio activo C:\\\\temp\\\\other'
 ]) {
  let calls=0;
  const plan=await planner.runJarvisSemanticPlanner({input,catalog:[activeAudit],
   missionState:{phase:'GROUNDED_ARGUMENT_COMPLETION',completedTasks:[],blockedTasks:[]},
   ai:{models:{generateContent:async()=>{
    calls++;
    return {text:JSON.stringify({toolCalls:[{name:'repo.audit',args:{target:'verified-other-repo'}}],missionComplete:false})};
   }}}});
  assert.equal(calls,1,input);
  assert.equal(plan.toolCalls[0].args.target,'verified-other-repo');
 }
});

test('required arguments and different tools never inherit the active-repo shortcut',async()=>{
 for (const tool of [
  {...activeAudit,inputSchema:{...activeAudit.inputSchema,required:['target']}},
  {...activeAudit,name:'repo.write'}
 ]) {
  let calls=0;
  await planner.runJarvisSemanticPlanner({input:'Audita el repositorio activo',
   catalog:[tool],missionState:{phase:'GROUNDED_ARGUMENT_COMPLETION'},
   ai:{models:{generateContent:async()=>{calls++;
    return {text:JSON.stringify({toolCalls:[{name:tool.name,args:{target:'verified-source'}}],missionComplete:false})};
   }}}});
  assert.equal(calls,1);
 }
});
